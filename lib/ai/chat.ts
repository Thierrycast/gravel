/**
 * Laço de conversa do chat, com ferramentas.
 *
 * Duas coisas que este arquivo garante, e que são o motivo dele existir em vez
 * de a rota falar direto com o provedor:
 *
 * 1. **Nada sai sem passar pelo guard.** Mensagem do usuário, resultado de
 *    ferramenta e prompt de sistema são limpos por `redactText` /
 *    `sanitizeToolResult` antes de virarem corpo de requisição. O relatório de
 *    tudo que foi mascarado sobe junto com a resposta, para a tela poder dizer
 *    o que saiu.
 * 2. **O laço tem fim.** Modelo que pede ferramenta em círculo é comum; sem
 *    teto, cada pergunta viraria uma conta aberta no provedor.
 */
import Anthropic from "@anthropic-ai/sdk"

import {
  CHAT_TOOL_SCHEMAS,
  runChatTool,
  type ChatToolSchema,
} from "@/lib/ai/chat-tools"
import {
  buildOutboundAudit,
  redactText,
  sanitizeToolResult,
  type OutboundAudit,
  type RedactionReport,
} from "@/lib/ai/guard"
import type { AiProviderKind } from "@/lib/ai/provider"

export const MAX_TOOL_ROUNDS = 4
const MAX_OUTPUT_TOKENS = 1_200
const DEFAULT_TIMEOUT_MS = 90_000

export const CHAT_SYSTEM_PROMPT = [
  "Você é o assistente do Gravel, o app de finanças pessoais do usuário.",
  "Responda em português do Brasil, direto, sem enrolação e sem repetir a pergunta.",
  "Use as ferramentas para buscar número real. Nunca invente valor, data ou saldo:",
  "se a ferramenta não trouxe o dado, diga que não tem o dado.",
  "Valor em reais no formato R$ 1.234,56.",
  "Você não executa mudança nenhuma: as ferramentas desta versão são só de leitura.",
  "Se o usuário pedir para criar, editar ou pagar algo, explique que ainda não dá e",
  "diga em que tela ele faz isso.",
  "Identificadores (número de conta, CPF, e-mail) chegam mascarados de propósito;",
  "não peça esses dados nem tente reconstruí-los.",
  "Todo número que você escrever tem de existir, literal, em algum campo devolvido",
  "pela ferramenta. É proibido somar, subtrair, arredondar ou estimar valor: se a",
  "ferramenta traz `resposta_pronta` ou um campo de total, use o texto/valor como está.",
  "Inventar ou recalcular dinheiro é o pior erro possível aqui.",
].join(" ")

export type ChatRole = "user" | "assistant"

export type ChatTurn = {
  role: ChatRole
  content: string
}

export type ChatToolCallTrace = {
  name: string
  args: Record<string, unknown>
  ok: boolean
}

export type ChatRunResult = {
  text: string
  toolCalls: ChatToolCallTrace[]
  audits: OutboundAudit[]
  redactions: RedactionReport
  rounds: number
}

export type ChatProviderConfig = {
  kind: AiProviderKind
  model: string
  baseUrl?: string | null
  apiKey: string
  timeoutMs?: number
}

function mergeReports(target: RedactionReport, source: RedactionReport) {
  for (const [kind, count] of Object.entries(source)) {
    const key = kind as keyof RedactionReport
    target[key] = (target[key] ?? 0) + (count ?? 0)
  }
}

function parseToolArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>
  if (typeof raw !== "string" || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Roda a ferramenta e devolve o resultado já limpo pelo guard. */
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  redactions: RedactionReport,
  trace: ChatToolCallTrace[],
) {
  const raw = await runChatTool(name, args)
  const sanitized = sanitizeToolResult(raw)
  mergeReports(redactions, sanitized.redactions)
  const failed =
    typeof raw === "object" && raw !== null && "erro" in (raw as Record<string, unknown>)
  trace.push({ name, args, ok: !failed })
  return JSON.stringify(sanitized.value)
}

function openAiTools(schemas: ChatToolSchema[]) {
  return schemas.map((schema) => ({
    type: "function" as const,
    function: {
      name: schema.name,
      description: schema.description,
      parameters: schema.parameters,
    },
  }))
}

type OpenAiMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_calls?: Array<{
    id: string
    type: "function"
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

async function runOpenAiCompatible(
  config: ChatProviderConfig,
  turns: ChatTurn[],
  redactions: RedactionReport,
  fetchImpl: typeof fetch,
): Promise<ChatRunResult> {
  const baseUrl = (config.baseUrl || "http://127.0.0.1:8080/v1").replace(/\/$/, "")
  const messages: OpenAiMessage[] = [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    ...turns.map((turn) => ({ role: turn.role, content: turn.content })),
  ]
  const toolCalls: ChatToolCallTrace[] = []
  const audits: OutboundAudit[] = []

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const isLastRound = round === MAX_TOOL_ROUNDS
    const body = {
      model: config.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages,
      // Na última rodada as ferramentas saem da mesa: o modelo tem de fechar a
      // resposta com o que já colheu, em vez de pedir a sétima consulta.
      ...(isLastRound
        ? {}
        : { tools: openAiTools(CHAT_TOOL_SCHEMAS), tool_choice: "auto" as const }),
      stream: false,
    }
    audits.push(
      buildOutboundAudit({
        provider: "openai-compatible",
        model: config.model,
        payload: body,
        redactions,
        toolNames: toolCalls.map((call) => call.name),
      }),
    )

    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new Error(`O provedor respondeu HTTP ${response.status}.`)
    }

    let payload: {
      choices?: Array<{
        message?: {
          content?: string | null
          tool_calls?: Array<{
            id: string
            function?: { name?: string; arguments?: string }
          }>
        }
      }>
    }
    try {
      payload = await response.json()
    } catch {
      throw new Error("O provedor respondeu algo que não é JSON.")
    }

    const message = payload.choices?.[0]?.message
    const requested = message?.tool_calls ?? []

    if (requested.length === 0 || isLastRound) {
      const text = (message?.content ?? "").trim()
      return {
        text: text || "O modelo respondeu vazio.",
        toolCalls,
        audits,
        redactions,
        rounds: round + 1,
      }
    }

    messages.push({
      role: "assistant",
      content: message?.content ?? null,
      tool_calls: requested.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.function?.name ?? "",
          arguments: call.function?.arguments ?? "{}",
        },
      })),
    })

    for (const call of requested) {
      const name = call.function?.name ?? ""
      const args = parseToolArgs(call.function?.arguments)
      const content = await executeTool(name, args, redactions, toolCalls)
      messages.push({ role: "tool", tool_call_id: call.id, content })
    }
  }

  throw new Error("O laço de ferramentas terminou sem resposta.")
}

async function runAnthropic(
  config: ChatProviderConfig,
  turns: ChatTurn[],
  redactions: RedactionReport,
): Promise<ChatRunResult> {
  const client = new Anthropic({ apiKey: config.apiKey })
  const messages: Anthropic.MessageParam[] = turns.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }))
  const tools: Anthropic.Tool[] = CHAT_TOOL_SCHEMAS.map((schema) => ({
    name: schema.name,
    description: schema.description,
    input_schema: schema.parameters as Anthropic.Tool.InputSchema,
  }))
  const toolCalls: ChatToolCallTrace[] = []
  const audits: OutboundAudit[] = []

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const isLastRound = round === MAX_TOOL_ROUNDS
    const request: Anthropic.MessageCreateParams = {
      model: config.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: CHAT_SYSTEM_PROMPT,
      messages,
      ...(isLastRound ? {} : { tools }),
    }
    audits.push(
      buildOutboundAudit({
        provider: "anthropic",
        model: config.model,
        payload: request,
        redactions,
        toolNames: toolCalls.map((call) => call.name),
      }),
    )

    const response = await client.messages.create(request, {
      signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    )
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim()

    if (toolUses.length === 0 || isLastRound) {
      return {
        text: text || "O modelo respondeu vazio.",
        toolCalls,
        audits,
        redactions,
        rounds: round + 1,
      }
    }

    messages.push({ role: "assistant", content: response.content })
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const use of toolUses) {
      const content = await executeTool(
        use.name,
        parseToolArgs(use.input),
        redactions,
        toolCalls,
      )
      results.push({ type: "tool_result", tool_use_id: use.id, content })
    }
    messages.push({ role: "user", content: results })
  }

  throw new Error("O laço de ferramentas terminou sem resposta.")
}

/**
 * Executa uma conversa até a resposta final.
 *
 * A mensagem do usuário é mascarada antes de sair: ele pode colar um número de
 * conta ou um CPF sem pensar, e isso não precisa chegar ao provedor para a
 * pergunta ser respondida.
 */
export async function runChat(
  config: ChatProviderConfig,
  turns: ChatTurn[],
  fetchImpl: typeof fetch = fetch,
): Promise<ChatRunResult> {
  const redactions: RedactionReport = {}
  const cleanTurns = turns.map((turn) => {
    const result = redactText(turn.content)
    mergeReports(redactions, result.redactions)
    return { role: turn.role, content: result.text }
  })

  if (config.kind === "anthropic") {
    return runAnthropic(config, cleanTurns, redactions)
  }
  return runOpenAiCompatible(config, cleanTurns, redactions, fetchImpl)
}
