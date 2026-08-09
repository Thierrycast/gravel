import { randomBytes } from "node:crypto"

import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  type PluggyWebhook,
} from "@/lib/integrations/pluggy"

import {
  getManagedSecretValue,
  setManagedSecretValue,
} from "@/lib/server/secret-store"

import { constantTimeEquals } from "./webhook-payload"

/** Header que a Pluggy repassa em cada notificação (configurado no registro). */
export const WEBHOOK_SECRET_HEADER = "x-webhook-secret"

/**
 * Registramos `all` em vez da lista de eventos: é o único jeito de não perder
 * um evento novo que a Pluggy passe a emitir. O despachante ignora o que não
 * conhece (ver `handledPluggyEvents`).
 */
const REGISTERED_EVENT = "all"

export async function getWebhookSecret() {
  const { value } = await getManagedSecretValue("PLUGGY_WEBHOOK_SECRET")
  return value
}

/**
 * Garante um secret de webhook, gerando-o se não existir.
 *
 * Este valor não é credencial de terceiro: o app o inventa e o comunica à Pluggy
 * no `POST /webhooks`. Como as demais chaves de infraestrutura, não faz sentido
 * pedir que o usuário o digite — antes disto, um deploy novo exigia colar 64
 * caracteres hex à mão, ou os webhooks passavam a levar 401.
 */
export async function ensureWebhookSecret() {
  const existing = await getWebhookSecret()
  if (existing) return existing

  const generated = randomBytes(32).toString("hex")
  await setManagedSecretValue("PLUGGY_WEBHOOK_SECRET", generated)
  console.log("[webhook] secret gerado e guardado no cofre (primeiro registro)")
  return generated
}

/**
 * URL pública que a Pluggy chama. No lab é a sub-rota do Tailscale Funnel
 * (`https://<host-publico>/hooks/pluggy`), que o Traefik reescreve
 * para `/api/webhooks/pluggy`.
 */
export function getWebhookUrl() {
  const raw = process.env.PLUGGY_WEBHOOK_URL?.trim()
  if (!raw) return null
  return raw.replace(/\/+$/, "")
}

export { constantTimeEquals }

/**
 * O webhook registrado na Pluggy carrega o secret que ela vai mandar de volta.
 * Se divergir do nosso, todo evento levaria 401 — pior que não ter webhook,
 * porque parece configurado. Quando a Pluggy não devolve os headers, assumimos
 * que está certo (não há como saber) e deixamos o `--force` resolver.
 */
function webhookSecretMatches(webhook: PluggyWebhook, secret: string) {
  const headers = webhook.headers
  if (!headers) return true

  const provided = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === WEBHOOK_SECRET_HEADER,
  )?.[1]

  if (provided === undefined) return false
  return constantTimeEquals(provided, secret)
}

export type WebhookReconcileResult = {
  url: string
  created: PluggyWebhook | null
  kept: PluggyWebhook | null
  removed: string[]
  reason: string
}

/**
 * Garante exatamente um webhook `all` apontando para `PLUGGY_WEBHOOK_URL`, com
 * o header do secret, e remove os obsoletos da aplicação.
 *
 * O `GET /webhooks` devolve os `headers` gravados, então detectamos secret
 * divergente (rotação feita só do nosso lado) e recriamos automaticamente — sem
 * isso o webhook continuaria chegando com o segredo antigo e levando 401,
 * parando a atualização de dados em silêncio.
 */
export async function reconcilePluggyWebhook(options?: {
  force?: boolean
  /** Remove webhooks apontando para outras URLs. Padrão: true. */
  pruneForeign?: boolean
}): Promise<WebhookReconcileResult> {
  const url = getWebhookUrl()
  if (!url) {
    throw new Error(
      "PLUGGY_WEBHOOK_URL não configurada — defina a URL pública do webhook.",
    )
  }
  if (!url.startsWith("https://")) {
    throw new Error(
      `PLUGGY_WEBHOOK_URL deve ser HTTPS pública (a Pluggy rejeita http/localhost): ${url}`,
    )
  }

  const secret = await ensureWebhookSecret()

  const existing = await listWebhooks()
  const mine = existing.filter((webhook) => webhook.url === url)
  const foreign = existing.filter((webhook) => webhook.url !== url)
  const removed: string[] = []

  if (options?.pruneForeign !== false) {
    for (const webhook of foreign) {
      await deleteWebhook(webhook.id)
      removed.push(webhook.id)
    }
  }

  const usable = mine.find(
    (webhook) =>
      webhook.event === REGISTERED_EVENT &&
      !webhook.disabledAt &&
      webhookSecretMatches(webhook, secret),
  )

  // Duplicatas e webhooks de evento único para a mesma URL só geram
  // notificação repetida — mantém um e apaga o resto.
  for (const webhook of mine) {
    if (webhook.id === usable?.id && !options?.force) continue
    await deleteWebhook(webhook.id)
    removed.push(webhook.id)
  }

  if (usable && !options?.force) {
    return {
      url,
      created: null,
      kept: usable,
      removed,
      reason: "already-registered",
    }
  }

  const created = await createWebhook({
    url,
    event: REGISTERED_EVENT,
    headers: { "X-Webhook-Secret": secret },
  })

  return {
    url,
    created,
    kept: null,
    removed,
    reason: options?.force ? "recreated" : "created",
  }
}

export async function describePluggyWebhooks() {
  const url = getWebhookUrl()
  const secret = await getWebhookSecret()
  const webhooks = await listWebhooks()

  const matching = url ? webhooks.filter((webhook) => webhook.url === url) : []

  return {
    expectedUrl: url,
    secretConfigured: Boolean(secret),
    webhooks: webhooks.map((webhook) => ({
      id: webhook.id,
      url: webhook.url,
      event: webhook.event,
      disabledAt: webhook.disabledAt ?? null,
      // Nunca devolver o secret em si — só se casa com o nosso.
      secretMatches: secret ? webhookSecretMatches(webhook, secret) : null,
    })),
    matching: matching.length,
    healthy:
      Boolean(url) &&
      Boolean(secret) &&
      matching.some(
        (webhook) =>
          !webhook.disabledAt && webhookSecretMatches(webhook, secret!),
      ),
  }
}
