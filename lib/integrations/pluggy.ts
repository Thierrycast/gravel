const defaultBaseUrl = "https://api.pluggy.ai"
const defaultApiKeyTtlSeconds = 2 * 60 * 60

function getEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing env var: ${name}`)
  }
  return value
}

function getBaseUrl() {
  return process.env.PLUGGY_API_BASE ?? defaultBaseUrl
}

function getHeaderName() {
  return process.env.PLUGGY_API_KEY_HEADER ?? "X-API-KEY"
}

function getAuthPath() {
  return process.env.PLUGGY_AUTH_PATH ?? "/auth"
}

function getConnectTokenPath() {
  return process.env.PLUGGY_CONNECT_TOKEN_PATH ?? "/connect_token"
}

function getApiKeyTtlSeconds() {
  const raw = process.env.PLUGGY_API_KEY_TTL_SECONDS
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

async function pluggyRequest(path: string, options: PluggyRequestOptions = {}) {
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

async function handlePluggyResponse(response: Response) {
  if (response.ok) {
    return response.json()
  }

  const error = await response.json().catch(() => ({}))
  const message = typeof error?.message === "string" ? error.message : ""

  switch (response.status) {
    case 400:
      throw new Error(message || "Requisicao invalida ao Pluggy")
    case 401:
      throw new Error("Api key invalida ou expirada")
    case 403:
      throw new Error("Acesso negado pelo Pluggy")
    case 404:
      throw new Error(message || "Recurso nao encontrado no Pluggy")
    case 429: {
      const retryAfter = response.headers.get("Retry-After")
      throw new Error(
        `Rate limit do Pluggy. Tente novamente em ${retryAfter ?? "alguns"}s`
      )
    }
    default:
      throw new Error(`Erro Pluggy: ${response.status} ${message}`.trim())
  }
}

export async function fetchItem(itemId: string) {
  return pluggyRequest(`/items/${itemId}`)
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

export async function createConnectToken(apiKey?: string) {
  const key = apiKey ?? (await getApiKey())
  const response = await fetch(`${getBaseUrl()}${getConnectTokenPath()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [getHeaderName()]: key,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Pluggy connect token error: ${response.status} ${text}`)
  }

  return response.json()
}
