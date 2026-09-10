/**
 * Limite de cartão de crédito — extração e soma.
 *
 * Pedido dele numa anotação em `/accounts`: *"poderia mostrar os limites de
 * crédito totais em cada cartão de crédito e em algum lugar até mesmo mostrar
 * uma estimativa de crédito somando os créditos"*.
 *
 * O dado sempre veio: `creditData` está no payload de `GET /accounts` e é
 * gravado cru em `PluggyPayloadSnapshot` desde o primeiro sync. O que faltava
 * era subir para o domínio.
 */

export type RawCreditData = Record<string, unknown> | null | undefined

export type NormalizedCreditData = {
  creditLimit: number | null
  availableCreditLimit: number | null
  minimumPayment: number | null
  level: string | null
  brand: string | null
  status: string | null
  isLimitFlexible: boolean | null
  balanceCloseDate: string | null
  balanceDueDate: string | null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed === "" || trimmed === "NA") return null
  return trimmed
}

/**
 * Achata `creditData` para os campos que o app usa.
 *
 * **`disaggregatedCreditLimits` é ignorado de propósito.** No payload real do
 * Nubank as linhas repetem o mesmo limite de R$ 11.300 em `CREDITO_A_VISTA`,
 * `CREDITO_PARCELADO` e ainda uma vez por cartão adicional (7208 e 7162):
 * somar aquelas linhas daria um limite quatro vezes maior que o verdadeiro.
 * O total do cartão é `creditLimit`, uma vez.
 */
export function extractCreditData(raw: RawCreditData): NormalizedCreditData | null {
  if (!raw || typeof raw !== "object") return null

  const normalized: NormalizedCreditData = {
    creditLimit: toFiniteNumber(raw.creditLimit),
    availableCreditLimit: toFiniteNumber(raw.availableCreditLimit),
    minimumPayment: toFiniteNumber(raw.minimumPayment),
    level: toTrimmedString(raw.level),
    brand: toTrimmedString(raw.brand),
    status: toTrimmedString(raw.status),
    isLimitFlexible:
      typeof raw.isLimitFlexible === "boolean" ? raw.isLimitFlexible : null,
    balanceCloseDate: toTrimmedString(raw.balanceCloseDate),
    balanceDueDate: toTrimmedString(raw.balanceDueDate),
  }

  const hasAnything = Object.values(normalized).some((value) => value !== null)
  return hasAnything ? normalized : null
}

export type CreditAccountLike = {
  id: string
  name: string
  creditLimit?: number | null
  availableCreditLimit?: number | null
  balance?: number | null
  creditDataAt?: string | Date | null
}

export type CreditLimitSummary = {
  /** Soma dos limites informados. Só entra cartão com limite > 0. */
  totalLimit: number
  /** Soma do disponível — só dos cartões que informaram limite **e** disponível. */
  totalAvailable: number
  /** Limite menos disponível, nos mesmos cartões. A conta é do banco, não nossa. */
  totalUsed: number
  /** Limite dos cartões que entraram no par limite+disponível. Base do percentual. */
  limitWithAvailable: number
  /** Quantos cartões entraram na soma do limite. */
  countedAccounts: number
  /** Cartões sem limite informado, por nome. O total mentiria se os escondesse. */
  missingLimitNames: string[]
  /** Cartões com limite mas sem disponível — ficam fora do usado. */
  missingAvailableNames: string[]
  /** O dado mais velho entre os cartões somados. */
  oldestDataAt: string | null
  /** Percentual usado (0–100) sobre `limitWithAvailable`, ou null se não dá para saber. */
  usedRatio: number | null
}

function toIsoOrNull(value: string | Date | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/**
 * Soma os limites dos cartões.
 *
 * Três decisões que mudam o número na tela:
 *
 * 1. **Cartão com limite 0 ou nulo não entra e é nomeado.** O Ourocard dele
 *    volta `creditLimit: 0` da instituição — não é "sem limite", é "o banco não
 *    informou". Contar como zero faria o total parecer completo quando não é.
 * 2. **Usado = limite − disponível.** É a conta do banco. `balance` de cartão é
 *    a fatura aberta, que não inclui parcelado futuro nem compra ainda não
 *    faturada; usar `balance` daria um "usado" menor que o real.
 * 3. **Cartão sem disponível fica fora do usado, não entra como usado=limite.**
 *    Ele continua no total de limite (o limite é conhecido), mas somar o
 *    desconhecido como se fosse limite inteiro gasto assustaria à toa. Por isso
 *    o percentual é sobre `limitWithAvailable`, e os nomes de fora aparecem.
 */
export function summarizeCreditLimits(
  accounts: CreditAccountLike[],
): CreditLimitSummary {
  let totalLimit = 0
  let totalAvailable = 0
  let limitWithAvailable = 0
  let countedAccounts = 0
  const missingLimitNames: string[] = []
  const missingAvailableNames: string[] = []
  let oldest: number | null = null
  let oldestIso: string | null = null

  for (const account of accounts) {
    const limit = toFiniteNumber(account.creditLimit)
    if (limit === null || limit <= 0) {
      missingLimitNames.push(account.name)
      continue
    }

    totalLimit += limit
    countedAccounts += 1

    const available = toFiniteNumber(account.availableCreditLimit)
    if (available === null) {
      missingAvailableNames.push(account.name)
    } else {
      totalAvailable += available
      limitWithAvailable += limit
    }

    const iso = toIsoOrNull(account.creditDataAt)
    if (iso) {
      const time = new Date(iso).getTime()
      if (oldest === null || time < oldest) {
        oldest = time
        oldestIso = iso
      }
    }
  }

  const totalUsed = limitWithAvailable - totalAvailable

  return {
    totalLimit,
    totalAvailable,
    totalUsed,
    limitWithAvailable,
    countedAccounts,
    missingLimitNames,
    missingAvailableNames,
    oldestDataAt: oldestIso,
    usedRatio:
      limitWithAvailable > 0 ? (totalUsed / limitWithAvailable) * 100 : null,
  }
}
