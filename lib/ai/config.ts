/**
 * De onde sai provedor, modelo e chave da IA.
 *
 * Extraído do `/api/briefing`, que resolvia isso inline: com o chat, dois
 * lugares passariam a ler `dashboardConfigJson` e o cofre de segredos, e a
 * primeira divergência entre eles seria um bug do tipo "o briefing usa um
 * modelo e o chat usa outro".
 */
import type { AiProviderKind } from "@/lib/ai/provider"
import { prisma } from "@/lib/prisma"
import { getManagedSecretValue } from "@/lib/server/secret-store"

export type ResolvedAiConfig = {
  kind: AiProviderKind
  model: string
  baseUrl: string | null
  apiKey: string
}

/**
 * Fallback de modelo quando nada está salvo em /settings.
 *
 * Mantidos idênticos aos que o `/api/briefing` usava antes desta extração:
 * mudar o padrão aqui mudaria silenciosamente o modelo do briefing dele.
 */
function fallbackModelFor(kind: AiProviderKind) {
  return (
    process.env.AI_MODEL?.trim() ||
    (kind === "anthropic" ? "claude-haiku-4-5-20251001" : "local-default")
  )
}

export async function resolveAiConfig(): Promise<
  { ok: true; config: ResolvedAiConfig } | { ok: false; reason: "api_key_missing" }
> {
  const settings = await prisma.userSetting.findUnique({ where: { id: "default" } })
  const managedSecret = await getManagedSecretValue("AI_API_KEY")
  const apiKey = managedSecret.value || settings?.anthropicApiKey

  let aiConfig: { provider?: AiProviderKind; baseUrl?: string; model?: string } = {}
  try {
    aiConfig = JSON.parse(settings?.dashboardConfigJson || "{}").ai || {}
  } catch {
    // Config corrompida cai no padrão em vez de derrubar a rota.
  }

  if (!apiKey) return { ok: false, reason: "api_key_missing" }

  // O que está salvo em /settings sempre vence; depois vem o ambiente, para o
  // provedor padrão do lab (OmniRoute) não ficar fixo em código.
  const envProvider =
    process.env.AI_PROVIDER === "openai-compatible" ? "openai-compatible" : undefined
  const kind: AiProviderKind = aiConfig.provider || envProvider || "anthropic"

  return {
    ok: true,
    config: {
      kind,
      model: aiConfig.model || fallbackModelFor(kind),
      baseUrl: aiConfig.baseUrl || process.env.AI_BASE_URL?.trim() || null,
      apiKey,
    },
  }
}
