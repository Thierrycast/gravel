/**
 * Leitura de boleto pelo padrão FEBRABAN — linha digitável ou código de barras.
 *
 * Dois formatos:
 * - **Bancário** (cobrança): linha de 47 dígitos, barras de 44 começando pelo
 *   código do banco. Traz valor e fator de vencimento.
 * - **Convênio/arrecadação** (conta de consumo, tributo): linha de 48 dígitos,
 *   barras de 44 começando por "8". Traz valor; o vencimento não tem posição
 *   padronizada, então quem cadastra informa.
 *
 * Os dígitos verificadores são conferidos: código digitado errado é recusado
 * em vez de virar uma conta com valor ou data inventados.
 */

export type BoletoKind = "BANK" | "CONVENIO"

export type ParsedBoleto = {
  kind: BoletoKind
  /** 44 dígitos — forma canônica, usada para não cadastrar o mesmo boleto duas vezes. */
  barcode: string
  /** Linha digitável (47 ou 48 dígitos, sem formatação). */
  digitableLine: string
  /** Em reais. `null` quando o boleto não traz valor (valor a definir). */
  amount: number | null
  /** Vencimento (meia-noite local). `null` no convênio ou com fator zerado. */
  dueDate: Date | null
  /** Código do banco (bancário) ou segmento (convênio). */
  issuer: string
}

export type BoletoParseResult = { ok: true; boleto: ParsedBoleto } | { ok: false; error: string }

function mod10(digits: string): number {
  let sum = 0
  let weight = 2
  for (let i = digits.length - 1; i >= 0; i--) {
    let product = Number(digits[i]) * weight
    if (product > 9) product = Math.floor(product / 10) + (product % 10)
    sum += product
    weight = weight === 2 ? 1 : 2
  }
  const rest = sum % 10
  return rest === 0 ? 0 : 10 - rest
}

/** Módulo 11 do DV geral do boleto bancário (pesos 2 a 9; 0, 10 e 11 viram 1). */
function mod11Bank(digits: string): number {
  let sum = 0
  let weight = 2
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * weight
    weight = weight === 9 ? 2 : weight + 1
  }
  const dv = 11 - (sum % 11)
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv
}

/** Módulo 11 do convênio (pesos 2 a 9; resto 0 ou 1 vira 0, resto 10 vira 1). */
function mod11Convenio(digits: string): number {
  let sum = 0
  let weight = 2
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * weight
    weight = weight === 9 ? 2 : weight + 1
  }
  const rest = sum % 11
  if (rest === 0 || rest === 1) return 0
  if (rest === 10) return 1
  return 11 - rest
}

const DAY_MS = 24 * 60 * 60 * 1000
const FACTOR_BASE_1 = Date.UTC(1997, 9, 7)
/** O fator chegou a 9999 em 21/02/2025 e recomeçou em 1000 no dia seguinte. */
const FACTOR_BASE_2 = Date.UTC(2025, 1, 22)

/**
 * Fator de vencimento → data. Como o fator reiniciou, o mesmo número aponta
 * para duas datas com ~27 anos de distância; vale a mais próxima de `now`.
 */
export function dueDateFromFactor(factor: number, now: Date = new Date()): Date | null {
  if (!Number.isInteger(factor) || factor <= 0) return null
  const candidates = [FACTOR_BASE_1 + factor * DAY_MS]
  if (factor >= 1000) candidates.push(FACTOR_BASE_2 + (factor - 1000) * DAY_MS)
  const best = candidates.reduce((left, right) =>
    Math.abs(right - now.getTime()) < Math.abs(left - now.getTime()) ? right : left,
  )
  const utc = new Date(best)
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
}

function centsToAmount(cents: string): number | null {
  const value = Number(cents) / 100
  return value > 0 ? value : null
}

function parseBankBarcode(barcode: string, digitableLine: string, now: Date): BoletoParseResult {
  const generalDv = Number(barcode[4])
  if (mod11Bank(barcode.slice(0, 4) + barcode.slice(5)) !== generalDv) {
    return { ok: false, error: "Dígito verificador geral não confere. Confira o código." }
  }
  return {
    ok: true,
    boleto: {
      kind: "BANK",
      barcode,
      digitableLine,
      amount: centsToAmount(barcode.slice(9, 19)),
      dueDate: dueDateFromFactor(Number(barcode.slice(5, 9)), now),
      issuer: barcode.slice(0, 3),
    },
  }
}

function bankBarcodeToLine(barcode: string): string {
  const free = barcode.slice(19)
  const f1 = barcode.slice(0, 4) + free.slice(0, 5)
  const f2 = free.slice(5, 15)
  const f3 = free.slice(15, 25)
  return `${f1}${mod10(f1)}${f2}${mod10(f2)}${f3}${mod10(f3)}${barcode[4]}${barcode.slice(5, 19)}`
}

function parseBankLine(line: string, now: Date): BoletoParseResult {
  const fields = [line.slice(0, 9), line.slice(10, 20), line.slice(21, 31)]
  const dvs = [Number(line[9]), Number(line[20]), Number(line[31])]
  for (let i = 0; i < 3; i++) {
    if (mod10(fields[i]) !== dvs[i]) {
      return { ok: false, error: `Dígito do ${i + 1}º campo não confere. Confira o código.` }
    }
  }
  const barcode =
    line.slice(0, 4) + line[32] + line.slice(33, 47) + line.slice(4, 9) + line.slice(10, 20) + line.slice(21, 31)
  return parseBankBarcode(barcode, line, now)
}

function convenioCheck(valueType: string): ((digits: string) => number) | null {
  if (valueType === "6" || valueType === "7") return mod10
  if (valueType === "8" || valueType === "9") return mod11Convenio
  return null
}

function parseConvenioBarcode(barcode: string, digitableLine: string): BoletoParseResult {
  const check = convenioCheck(barcode[2])
  if (!check) return { ok: false, error: "Tipo de valor do convênio desconhecido." }
  if (check(barcode.slice(0, 3) + barcode.slice(4)) !== Number(barcode[3])) {
    return { ok: false, error: "Dígito verificador geral não confere. Confira o código." }
  }
  // Tipos 6 e 8 trazem o valor efetivo; 7 e 9, um valor de referência.
  const effective = barcode[2] === "6" || barcode[2] === "8"
  return {
    ok: true,
    boleto: {
      kind: "CONVENIO",
      barcode,
      digitableLine,
      amount: effective ? centsToAmount(barcode.slice(4, 15)) : null,
      dueDate: null,
      issuer: barcode[1],
    },
  }
}

function convenioBarcodeToLine(barcode: string): string | null {
  const check = convenioCheck(barcode[2])
  if (!check) return null
  let line = ""
  for (let i = 0; i < 4; i++) {
    const block = barcode.slice(i * 11, i * 11 + 11)
    line += block + check(block)
  }
  return line
}

function parseConvenioLine(line: string): BoletoParseResult {
  const check = convenioCheck(line[2])
  if (!check) return { ok: false, error: "Tipo de valor do convênio desconhecido." }
  let barcode = ""
  for (let i = 0; i < 4; i++) {
    const block = line.slice(i * 12, i * 12 + 11)
    if (check(block) !== Number(line[i * 12 + 11])) {
      return { ok: false, error: `Dígito do ${i + 1}º bloco não confere. Confira o código.` }
    }
    barcode += block
  }
  return parseConvenioBarcode(barcode, line)
}

/** Aceita linha digitável ou código de barras, com ou sem pontos e espaços. */
export function parseBoleto(input: string, now: Date = new Date()): BoletoParseResult {
  const digits = input.replace(/\D/g, "")
  if (digits.length === 47) return parseBankLine(digits, now)
  if (digits.length === 48) return parseConvenioLine(digits)
  if (digits.length === 44) {
    if (digits[0] === "8") {
      const line = convenioBarcodeToLine(digits)
      return line ? parseConvenioBarcode(digits, line) : { ok: false, error: "Tipo de valor do convênio desconhecido." }
    }
    return parseBankBarcode(digits, bankBarcodeToLine(digits), now)
  }
  return {
    ok: false,
    error: "Código precisa ter 47 dígitos (boleto), 48 (conta de consumo/tributo) ou 44 (código de barras).",
  }
}

/**
 * Procura uma linha digitável num texto qualquer (o texto extraído de um PDF
 * de boleto). Devolve o primeiro candidato que passa na validação.
 */
export function findBoletoInText(text: string, now: Date = new Date()): ParsedBoleto | null {
  const candidates = text.match(/[\d][\d .\-]{42,70}[\d]/g) ?? []
  for (const candidate of candidates) {
    const result = parseBoleto(candidate, now)
    if (result.ok) return result.boleto
  }
  return null
}
