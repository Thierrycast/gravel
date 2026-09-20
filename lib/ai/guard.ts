/**
 * Guard de saída para provedor de IA.
 *
 * Ele pediu isso explicitamente na anotação do chat: *"vamos precisar
 * desenvolver um guard para não vazar dados sensíveis"*. O motivo é o app: o
 * Gravel é o extrato bancário dele inteiro, e todo token que sai daqui para um
 * provedor externo leva saldo, gasto e nome de estabelecimento.
 *
 * O que este módulo **não** promete: esconder as finanças dele do modelo. Não
 * dá — a pergunta "quanto gastei em setembro?" só é respondível com o número.
 * O que ele promete é o que dá para garantir sem tornar o chat inútil:
 *
 * 1. **Identificador nunca sai.** CPF/CNPJ, número de conta e cartão, chave
 *    Pix, e-mail, telefone. Valor agregado responde pergunta; identificador só
 *    serve para ligar aquele dado a uma pessoa lá fora.
 * 2. **Segredo nunca sai.** Chave de API, token, senha — nem por acidente
 *    (payload de provedor colado numa mensagem, por exemplo).
 * 3. **Payload cru de provedor nunca sai.** `payloadJson`, `metadataJson` e
 *    companhia carregam campos que ninguém auditou; ferramenta de leitura
 *    devolve campo curado, não o JSON da Pluggy.
 * 4. **Fica registrado o que saiu.** Contagem por tipo do que foi mascarado, e
 *    o tamanho enviado. Sem isso não há como responder "o que esse modelo viu".
 */

export type RedactionKind =
  | "cpf"
  | "cnpj"
  | "email"
  | "telefone"
  | "cartao"
  | "conta"
  | "chave-pix"
  | "segredo"

export type RedactionReport = Partial<Record<RedactionKind, number>>

export type GuardResult = {
  text: string
  redactions: RedactionReport
  /** Total de trechos mascarados. Zero significa que nada casou, não que é seguro. */
  redactedCount: number
}

const PLACEHOLDER: Record<RedactionKind, string> = {
  cpf: "[CPF removido]",
  cnpj: "[CNPJ removido]",
  email: "[e-mail removido]",
  telefone: "[telefone removido]",
  cartao: "[cartão removido]",
  conta: "[conta removida]",
  "chave-pix": "[chave Pix removida]",
  segredo: "[segredo removido]",
}

/**
 * A ordem importa: o mais específico primeiro.
 *
 * `cartao` antes de `conta` porque 16 dígitos também casam com "sequência
 * longa de dígitos". E segredo vem antes de tudo: uma chave `sk-...` colada
 * numa mensagem não pode ser confundida com texto comum.
 */
const PATTERNS: Array<{ kind: RedactionKind; pattern: RegExp }> = [
  // Chave de API / token: prefixos conhecidos e cadeias longas de base64/hex.
  { kind: "segredo", pattern: /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|Bearer\s+[A-Za-z0-9._-]{16,})\b/g },
  { kind: "segredo", pattern: /\b[A-Fa-f0-9]{32,}\b/g },
  // CPF com ou sem pontuação.
  { kind: "cpf", pattern: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g },
  { kind: "cnpj", pattern: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g },
  { kind: "cnpj", pattern: /\b\d{14}\b/g },
  { kind: "cpf", pattern: /\b\d{11}\b/g },
  // Cartão: 16 dígitos em blocos de 4 ou corridos.
  { kind: "cartao", pattern: /\b(?:\d{4}[ .-]){3}\d{4}\b/g },
  { kind: "cartao", pattern: /\b\d{16}\b/g },
  { kind: "email", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // Chave Pix aleatória (UUID).
  { kind: "chave-pix", pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi },
  // Telefone brasileiro com DDD, com ou sem +55.
  { kind: "telefone", pattern: /(?:\+55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g },
  // Conta/agência: sequência de 6+ dígitos com dígito verificador.
  { kind: "conta", pattern: /\b\d{5,12}-\d\b/g },
]

/**
 * Chaves que nunca vão para o provedor, em qualquer profundidade.
 *
 * Note `metadataJson`/`payloadJson`: é ali que mora o payload cru da Pluggy,
 * com campos que ninguém auditou. Ferramenta de leitura devolve campo curado.
 */
const BLOCKED_KEYS = new Set([
  "taxnumber",
  "number",
  "cardnumber",
  "payeemfn",
  "metadatajson",
  "payloadjson",
  "sourceexternalid",
  "sourceparentid",
  "externalid",
  "itemexternalid",
  "accountexternalid",
  "ciphertext",
  "authtag",
  "iv",
  "apikey",
  "api_key",
  "token",
  "accesstoken",
  "refreshtoken",
  "clientsecret",
  "secret",
  "password",
  "passwordhash",
  "email",
  "phone",
  "owner",
  "ownername",
])

const MAX_STRING_LENGTH = 2_000

/** Mascara identificador e segredo num texto livre. */
export function redactText(input: string): GuardResult {
  let text = input
  const redactions: RedactionReport = {}

  for (const { kind, pattern } of PATTERNS) {
    text = text.replace(pattern, (match) => {
      // Valor em reais não é identificador: "R$ 11300" tem de continuar legível,
      // senão o chat não consegue responder nada sobre dinheiro.
      if (/^\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?$/.test(match) && match.replace(/\D/g, "").length <= 10) {
        return match
      }
      redactions[kind] = (redactions[kind] ?? 0) + 1
      return PLACEHOLDER[kind]
    })
  }

  const redactedCount = Object.values(redactions).reduce((sum, count) => sum + count, 0)
  return { text, redactions, redactedCount }
}

function mergeReports(target: RedactionReport, source: RedactionReport) {
  for (const [kind, count] of Object.entries(source)) {
    const key = kind as RedactionKind
    target[key] = (target[key] ?? 0) + (count ?? 0)
  }
}

/**
 * Limpa o resultado de uma ferramenta antes de ele virar contexto do modelo.
 *
 * Remove chave bloqueada em qualquer profundidade, mascara identificador no
 * que sobrou e corta string gigante. Devolve também o relatório, porque é o
 * que a trilha de auditoria grava.
 */
export function sanitizeToolResult(value: unknown): {
  value: unknown
  redactions: RedactionReport
} {
  const redactions: RedactionReport = {}

  function walk(node: unknown): unknown {
    if (node === null || node === undefined) return node
    if (typeof node === "string") {
      const result = redactText(node)
      mergeReports(redactions, result.redactions)
      return result.text.length > MAX_STRING_LENGTH
        ? `${result.text.slice(0, MAX_STRING_LENGTH)}… [texto cortado]`
        : result.text
    }
    if (typeof node === "number" || typeof node === "boolean") return node
    if (node instanceof Date) return node.toISOString()
    if (Array.isArray(node)) return node.map(walk)
    if (typeof node === "object") {
      // Decimal do Prisma e outras instâncias de classe: `Object.entries` nelas
      // devolve o miolo do objeto (`s`, `e`, `d` no caso do Decimal), e o
      // modelo receberia estrutura interna em vez do número. Só objeto simples
      // é percorrido campo a campo.
      const prototype = Object.getPrototypeOf(node)
      if (prototype !== Object.prototype && prototype !== null) {
        return walk(String(node))
      }
      const output: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        if (BLOCKED_KEYS.has(key.toLowerCase())) continue
        output[key] = walk(child)
      }
      return output
    }
    // Decimal do Prisma e afins: só o valor legível interessa.
    return String(node)
  }

  return { value: walk(value), redactions }
}

export type OutboundAudit = {
  provider: string
  model: string
  /** Bytes de UTF-8 realmente enviados, depois da limpeza. */
  outboundBytes: number
  redactions: RedactionReport
  redactedCount: number
  toolNames: string[]
  createdAt: string
}

export function buildOutboundAudit(params: {
  provider: string
  model: string
  payload: unknown
  redactions: RedactionReport
  toolNames?: string[]
}): OutboundAudit {
  const redactedCount = Object.values(params.redactions).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  )
  return {
    provider: params.provider,
    model: params.model,
    outboundBytes: Buffer.byteLength(JSON.stringify(params.payload) ?? "", "utf8"),
    redactions: params.redactions,
    redactedCount,
    toolNames: params.toolNames ?? [],
    createdAt: new Date().toISOString(),
  }
}
