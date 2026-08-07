const defaultBaseUrl = "https://api.pluggy.ai"
const defaultApiKeyTtlSeconds = 2 * 60 * 60

function getEnv(name: string): string | undefined {
  return process.env[name]
}

function getBaseUrl() {
  return getEnv("PLUGGY_API_BASE") ?? defaultBaseUrl
}

function getHeaderName() {
  return getEnv("PLUGGY_API_KEY_HEADER") ?? "X-API-KEY"
}

function getAuthPath() {
  return getEnv("PLUGGY_AUTH_PATH") ?? "/auth"
}

function getConnectTokenPath() {
  return getEnv("PLUGGY_CONNECT_TOKEN_PATH") ?? "/connect_token"
}

function getApiKeyTtlSeconds() {
  const raw = getEnv("PLUGGY_API_KEY_TTL_SECONDS")
  if (!raw) return defaultApiKeyTtlSeconds
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : defaultApiKeyTtlSeconds
}

type ApiKeyResponse = {
  apiKey?: string
  token?: string
  expiresAt?: string
  expiresIn?: number
}

type ApiKeyCache = {
  apiKey: string
  expiresAt: number
}

declare global {
  var pluggyApiKeyCache: ApiKeyCache | undefined
}

function readApiKeyCache() {
  return globalThis.pluggyApiKeyCache
}

function writeApiKeyCache(entry: ApiKeyCache) {
  globalThis.pluggyApiKeyCache = entry
}

function clearApiKeyCache() {
  globalThis.pluggyApiKeyCache = undefined
}

function isCacheValid(entry?: ApiKeyCache) {
  if (!entry) return false
  return Date.now() < entry.expiresAt
}

function normalizeApiKeyResponse(data: ApiKeyResponse) {
  const apiKey = data.apiKey ?? data.token
  if (!apiKey) return null

  let expiresAt: number | null = null
  if (data.expiresAt) {
    const parsed = Date.parse(data.expiresAt)
    if (!Number.isNaN(parsed)) {
      expiresAt = parsed
    }
  }
  if (!expiresAt && data.expiresIn && Number.isFinite(data.expiresIn)) {
    expiresAt = Date.now() + data.expiresIn * 1000
  }
  if (!expiresAt) {
    expiresAt = Date.now() + getApiKeyTtlSeconds() * 1000
  }

  return { apiKey, expiresAt }
}

export async function createApiKey() {
  const clientId = getEnv("PLUGGY_CLIENT_ID")
  const clientSecret = getEnv("PLUGGY_CLIENT_SECRET")

  if (!clientId || !clientSecret) {
    throw new Error("Pluggy não configurado. Verifique as credenciais no arquivo .env")
  }

  const response = await fetch(`${getBaseUrl()}${getAuthPath()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clientId,
      clientSecret,
    }),
    cache: "no-store",
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Pluggy auth error: ${response.status} ${text}`)
  }

  return response.json()
}

export async function getApiKey() {
  const cached = readApiKeyCache()
  if (cached && isCacheValid(cached)) {
    return cached.apiKey
  }

  const payload = (await createApiKey()) as ApiKeyResponse
  const normalized = normalizeApiKeyResponse(payload)

  if (!normalized) {
    throw new Error("Pluggy auth retornou payload invalido")
  }

  writeApiKeyCache(normalized)
  return normalized.apiKey
}

type PluggyRequestOptions = {
  method?: string
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  apiKey?: string
}

async function _pluggyRequest(path: string, options: PluggyRequestOptions = {}) {
  const apiKey = options.apiKey ?? (await getApiKey())
  const url = new URL(`${getBaseUrl()}${path}`)

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined) continue
      url.searchParams.set(key, String(value))
    }
  }

  const response = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      [getHeaderName()]: apiKey,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  })

  if (response.status === 401) {
    clearApiKeyCache()
    const retryKey = await getApiKey()
    const retryResponse = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        [getHeaderName()]: retryKey,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    })

    return handlePluggyResponse(retryResponse)
  }

  return handlePluggyResponse(response)
}

/**
 * Erro tipado do Pluggy. Preserva o status HTTP, o `code` da API (ex.:
 * BALANCE_CONSENT_ERROR) e o `Retry-After` para o chamador tratar cada caso
 * (MFA, consentimento, rate limit) sem depender de regex na mensagem.
 */
export class PluggyApiError extends Error {
  readonly statusCode: number
  readonly code: string | null
  readonly retryAfterSeconds: number | null
  readonly body: unknown

  constructor(params: {
    statusCode: number
    message: string
    code?: string | null
    retryAfterSeconds?: number | null
    body?: unknown
  }) {
    super(params.message)
    this.name = "PluggyApiError"
    this.statusCode = params.statusCode
    this.code = params.code ?? null
    this.retryAfterSeconds = params.retryAfterSeconds ?? null
    this.body = params.body
  }

  get isRateLimit() {
    return this.statusCode === 429
  }

  get isTransient() {
    return this.statusCode >= 500 && this.statusCode < 600
  }
}

async function handlePluggyResponse(response: Response) {
  if (response.ok) {
    if (response.status === 204) return null
    const text = await response.text()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  const error = await response.json().catch(() => ({}))
  const message = typeof error?.message === "string" ? error.message : ""
  const code = typeof error?.code === "string" ? error.code : null
  const retryAfterHeader = response.headers.get("Retry-After")
  const retryAfterSeconds = retryAfterHeader
    ? Number.parseInt(retryAfterHeader, 10)
    : null

  const fallbackByStatus: Record<number, string> = {
    400: "Requisição inválida ao Pluggy",
    401: "Api key inválida ou expirada",
    403: "Acesso negado pelo Pluggy",
    404: "Recurso não encontrado no Pluggy",
    409: "Conflito ao sincronizar (item já em atualização)",
    429: `Rate limit do Pluggy${retryAfterSeconds ? `. Tente novamente em ${retryAfterSeconds}s` : ""}`,
  }

  throw new PluggyApiError({
    statusCode: response.status,
    message:
      message ||
      fallbackByStatus[response.status] ||
      `Erro Pluggy: ${response.status}`,
    code,
    retryAfterSeconds:
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds
        ? retryAfterSeconds
        : null,
    body: error,
  })
}

async function pluggyRequest(path: string, options: PluggyRequestOptions = {}) {
  let attempt = 0;
  const maxRetries = 3;

  while (true) {
    attempt++;
    try {
      return await _pluggyRequest(path, options);
    } catch (error) {
      if (attempt >= maxRetries) throw error;

      const message = error instanceof Error ? error.message : "";
      const isRateLimit =
        error instanceof PluggyApiError
          ? error.isRateLimit
          : message.includes("Rate limit do Pluggy");
      const isServerError =
        error instanceof PluggyApiError
          ? error.isTransient
          : message.includes("fetch failed") || message.includes("ECONNRESET");

      // 400/401/403/404/409 são definitivos (credencial, consentimento, MFA,
      // conflito de frequência) — não adianta repetir; devolve na hora.
      if (isRateLimit || isServerError) {
        let delayMs = Math.pow(2, attempt) * 1000;
        if (error instanceof PluggyApiError && error.retryAfterSeconds) {
          delayMs = error.retryAfterSeconds * 1000;
        }
        console.warn(
          `[Pluggy] Transient error on ${path} (attempt ${attempt}/${maxRetries}). Retrying in ${delayMs}ms. ${message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw error;
    }
  }
}

export async function fetchItem(itemId: string) {
  return pluggyRequest(`/items/${itemId}`)
}

/**
 * PATCH /items/{id} — dispara uma nova sincronização do item na instituição.
 * Com body vazio a Pluggy reusa as credenciais já armazenadas. Passar
 * `parameters` (ex.: resposta de MFA) ou `clientUserId` quando necessário.
 * Retorna o item com o novo `status`/`executionStatus` (ex.: UPDATING).
 */
export async function refreshPluggyItem(
  itemId: string,
  body?: { parameters?: Record<string, unknown>; clientUserId?: string },
) {
  return pluggyRequest(`/items/${itemId}`, {
    method: "PATCH",
    body: body && Object.keys(body).length > 0 ? body : {},
  })
}

export async function deleteItem(itemId: string) {
  return pluggyRequest(`/items/${itemId}`, { method: "DELETE" })
}

export async function fetchAccounts(params: {
  itemId: string
  page?: number
  pageSize?: number
}) {
  return pluggyRequest("/accounts", { query: params })
}

export async function fetchAccount(accountId: string) {
  return pluggyRequest(`/accounts/${accountId}`)
}

export async function fetchAccountBalance(accountId: string) {
  return pluggyRequest(`/accounts/${accountId}/balance`)
}

/**
 * @deprecated `GET /transactions` (paginado por página) foi descontinuado pela
 * Pluggy e será **removido em 2026-12-31**. Use
 * {@link fetchTransactionsByCursor} (`GET /v2/transactions`). Mantido só para
 * comparação/backfill durante a migração.
 */
export async function fetchTransactions(
  params: {
    accountId: string
    page?: number
    pageSize?: number
    from?: string
    to?: string
  }
) {
  return pluggyRequest("/transactions", {
    query: params,
  })
}

export type CursorPage<T> = {
  results: T[]
  /** Querystring pronta para a próxima página, ou null no fim. */
  next: string | null
}

/**
 * `GET /v2/transactions` — paginação por cursor, 500 registros por página
 * (tamanho fixo: a v2 rejeita `pageSize`). Filtros disponíveis:
 * `createdAtFrom` (incremental), `dateFrom`/`dateTo` (janela por data de
 * lançamento) e `ids` (máx. 500 por chamada).
 *
 * `createdAtFrom` e `dateFrom` são **mutuamente exclusivos** na API.
 * `after` vem do campo `next` da resposta anterior — pode ser a querystring
 * inteira devolvida pela Pluggy ou só o cursor; ambos são aceitos aqui.
 */
export async function fetchTransactionsByCursor(params: {
  accountId: string
  createdAtFrom?: string
  dateFrom?: string
  dateTo?: string
  ids?: string[]
  after?: string | null
}): Promise<CursorPage<Record<string, unknown>>> {
  const { ids, after, ...rest } = params
  const query: Record<string, string | undefined> = { ...rest }

  if (ids?.length) {
    if (ids.length > maxTransactionIdsPerRequest) {
      throw new Error(
        `fetchTransactionsByCursor: máximo de ${maxTransactionIdsPerRequest} ids por chamada`,
      )
    }
    query.ids = ids.join(",")
  }

  const cursor = extractCursor(after)
  if (cursor) {
    query.after = cursor
  }

  const payload = (await pluggyRequest("/v2/transactions", { query })) as {
    results?: Record<string, unknown>[]
    next?: string | null
  } | null

  return {
    results: Array.isArray(payload?.results) ? payload.results : [],
    next: payload?.next ?? null,
  }
}

export const maxTransactionIdsPerRequest = 500

/**
 * O campo `next` da v2 vem como querystring completa
 * (`?accountId=…&after=<cursor>`). Aceita também um cursor cru.
 *
 * Exportado para teste: errar aqui faz o laço de paginação repetir a primeira
 * página para sempre ou parar cedo, e nenhum dos dois dá erro visível.
 */
export function extractCursor(next?: string | null): string | null {
  if (!next) return null
  if (!next.includes("=")) return next
  const query = next.startsWith("?") ? next.slice(1) : next
  return new URLSearchParams(query).get("after")
}

/**
 * PATCH /transactions/{id} — devolve a categoria corrigida para a Pluggy, o que
 * melhora a categorização automática dos próximos lançamentos.
 */
export async function updateTransactionCategory(
  transactionId: string,
  categoryId: string,
) {
  return pluggyRequest(`/transactions/${transactionId}`, {
    method: "PATCH",
    body: { categoryId },
  })
}

export async function fetchTransaction(transactionId: string) {
  return pluggyRequest(`/transactions/${transactionId}`)
}

export async function fetchInvestments(params: {
  itemId: string
  page?: number
  pageSize?: number
}) {
  return pluggyRequest("/investments", {
    query: params,
  })
}

export async function fetchInvestment(investmentId: string) {
  return pluggyRequest(`/investments/${investmentId}`)
}

export async function fetchInvestmentTransactions(params: {
  investmentId: string
  page?: number
  pageSize?: number
}) {
  const { investmentId, ...query } = params
  return pluggyRequest(`/investments/${investmentId}/transactions`, {
    query,
  })
}

export async function fetchLoans(params: {
  itemId: string
  page?: number
  pageSize?: number
}) {
  return pluggyRequest("/loans", {
    query: params,
  })
}

export async function fetchLoan(loanId: string) {
  return pluggyRequest(`/loans/${loanId}`)
}

export async function fetchBills(params: {
  accountId: string
  page?: number
  pageSize?: number
}) {
  return pluggyRequest("/bills", {
    query: params,
  })
}

export async function fetchBill(billId: string) {
  return pluggyRequest(`/bills/${billId}`)
}

export async function fetchCategories(params?: {
  page?: number
  pageSize?: number
}) {
  return pluggyRequest("/categories", {
    query: params,
  })
}

export async function fetchMerchants(params: {
  cnpj: string
}) {
  return pluggyRequest("/merchants", {
    query: params,
  })
}

export const maxMerchantCnpjsPerRequest = 100

/**
 * `GET /merchants` aceita uma lista de CNPJs separados por vírgula — uma
 * chamada em vez de N. Devolve `foundMerchants`, `notFoundCnpjs` e
 * `invalidCnpjs`.
 */
export async function fetchMerchantsByCnpjList(cnpjs: string[]) {
  return pluggyRequest("/merchants", {
    query: { cnpj: cnpjs.join(",") },
  }) as Promise<{
    foundMerchants?: Record<string, unknown>[]
    notFoundCnpjs?: string[]
    invalidCnpjs?: string[]
  } | null>
}

/** `GET /identity?itemId=` — identidade do titular, quando o conector oferece. */
export async function fetchIdentity(itemId: string) {
  return pluggyRequest("/identity", { query: { itemId } })
}

/** `GET /consents?itemId=` — consentimentos do Open Finance e suas validades. */
export async function fetchConsents(params: {
  itemId: string
  page?: number
  pageSize?: number
}) {
  return pluggyRequest("/consents", { query: params })
}

export async function fetchConnectors(params?: {
  name?: string
  countries?: string
  types?: string
  sandbox?: boolean
}) {
  return pluggyRequest("/connectors", {
    query: params,
  })
}

export async function createConnectToken(options?: {
  apiKey?: string
  /**
   * URL de webhook por token: todos os items criados com este connect token
   * notificam nela, além do webhook global da aplicação.
   */
  webhookUrl?: string
}) {
  const key = options?.apiKey ?? (await getApiKey())
  const body = options?.webhookUrl
    ? JSON.stringify({ options: { webhookUrl: options.webhookUrl } })
    : undefined

  const response = await fetch(`${getBaseUrl()}${getConnectTokenPath()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [getHeaderName()]: key,
    },
    body,
    cache: "no-store",
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Pluggy connect token error: ${response.status} ${text}`)
  }

  return response.json()
}

// ── Webhooks ────────────────────────────────────────────────────────────────

export type PluggyWebhook = {
  id: string
  url: string
  event: string
  createdAt?: string
  updatedAt?: string
  disabledAt?: string | null
  /**
   * Headers configurados no registro. A documentação diz que não são expostos,
   * mas o `GET /webhooks` **devolve** (verificado em 2026-08-07) — o que permite
   * detectar secret divergente sem apagar e recriar às cegas.
   */
  headers?: Record<string, string> | null
}

/**
 * Eventos de dados que o Gravel sabe tratar. Registramos `all` na Pluggy (é o
 * único jeito de não perder evento novo), e esta lista documenta a cobertura
 * real do despachante em `lib/ingestion/webhook-events.ts`.
 */
export const handledPluggyEvents = [
  "item/created",
  "item/updated",
  "item/error",
  "item/deleted",
  "item/waiting_user_input",
  "item/waiting_user_action",
  "item/login_succeeded",
  "connector/status_updated",
  "transactions/created",
  "transactions/updated",
  "transactions/deleted",
] as const

export async function listWebhooks() {
  const payload = (await pluggyRequest("/webhooks")) as {
    results?: PluggyWebhook[]
  } | null
  return Array.isArray(payload?.results) ? payload.results : []
}

/**
 * `headers` só pode ser configurado via API (a Pluggy não expõe no Dashboard
 * porque pode conter segredo) e **não volta** no GET — para rotar o secret é
 * preciso apagar e recriar o webhook.
 */
export async function createWebhook(input: {
  url: string
  event: string
  headers?: Record<string, string>
}) {
  return pluggyRequest("/webhooks", {
    method: "POST",
    body: input,
  }) as Promise<PluggyWebhook>
}

export async function updateWebhook(
  webhookId: string,
  input: { url?: string; event?: string; headers?: Record<string, string> },
) {
  return pluggyRequest(`/webhooks/${webhookId}`, {
    method: "PATCH",
    body: input,
  }) as Promise<PluggyWebhook>
}

export async function deleteWebhook(webhookId: string) {
  return pluggyRequest(`/webhooks/${webhookId}`, { method: "DELETE" })
}