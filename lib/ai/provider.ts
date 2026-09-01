import Anthropic from "@anthropic-ai/sdk"

export type AiProviderKind = "anthropic" | "openai-compatible"

export type AiProviderConfig = {
  kind: AiProviderKind
  model: string
  baseUrl?: string | null
  apiKey: string
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 60_000

function providerHttpError(provider: string, status: number) {
  if (status === 401 || status === 403) return new Error(`Credencial inválida no provider ${provider}.`)
  if (status === 429) return new Error(`Limite de requisições atingido no provider ${provider}.`)
  if (status >= 500) return new Error(`Provider ${provider} temporariamente indisponível.`)
  return new Error(`Provider ${provider} respondeu HTTP ${status}.`)
}

function normalizedText(value: unknown, provider: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Provider ${provider} respondeu sem conteúdo.`)
  }
  return value.trim()
}

export async function generateAiText(
  config: AiProviderConfig,
  prompt: string,
  fetchImpl: typeof fetch = fetch
) {
  const timeoutSignal = AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  if (config.kind === "anthropic") {
    const client = new Anthropic({ apiKey: config.apiKey })
    const response = await client.messages.create(
      {
        model: config.model,
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: timeoutSignal }
    )
    return normalizedText(
      response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join(""),
      "Anthropic"
    )
  }

  const baseUrl = (config.baseUrl || "http://127.0.0.1:8080/v1").replace(/\/$/, "")
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
      // Explícito de propósito. A OpenAI assume não-streaming quando o campo
      // falta; nem todo endpoint compatível faz o mesmo — o gateway do lab
      // transmite por padrão, e a resposta SSE chega aqui como "JSON inválido".
      stream: false,
    }),
    signal: timeoutSignal,
  })
  if (!response.ok) throw providerHttpError("OpenAI-compatible", response.status)

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error("Provider OpenAI-compatible respondeu JSON inválido.")
  }
  const content = (body as { choices?: Array<{ message?: { content?: unknown } }> })
    .choices?.[0]?.message?.content
  return normalizedText(content, "OpenAI-compatible")
}
