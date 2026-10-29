import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { parseBoleto } from "@/lib/domain/boleto"

/**
 * Contas a pagar a partir de boletos.
 *
 * O Open Finance só mostra o boleto depois de pago. Cadastrar o boleto serve
 * para lembrar do vencimento e pôr o valor na projeção; quando a saída de mesmo
 * valor aparece no banco perto do vencimento, a conta é dada como paga sozinha
 * e ligada à transação. Nada aqui cria lançamento.
 */

const DAY_MS = 24 * 60 * 60 * 1000
/** Pagamento antecipado costuma vir até ~2 semanas antes; atrasado, alguns dias depois. */
const MATCH_DAYS_BEFORE = 15
const MATCH_DAYS_AFTER = 10

export type PayableStatus = "PENDING" | "PAID" | "CANCELLED"

type MatchablePayable = { id: string; amount: number; dueDate: Date }
type MatchableOutflow = { id: string; amount: number; occurredAt: Date }

/**
 * Liga cada conta pendente à saída que a quitou: mesmo valor ao centavo, dentro
 * da janela do vencimento, sem reaproveitar transação. Com mais de uma
 * candidata, vence a mais próxima do vencimento. Contas de vencimento mais
 * cedo escolhem primeiro, para duas contas de mesmo valor não disputarem a
 * mesma saída de forma arbitrária.
 */
export function matchPayablesToOutflows(
  payables: MatchablePayable[],
  outflows: MatchableOutflow[],
  usedTransactionIds: Set<string> = new Set(),
): Array<{ payableId: string; transactionId: string; paidAt: Date }> {
  const used = new Set(usedTransactionIds)
  const matches: Array<{ payableId: string; transactionId: string; paidAt: Date }> = []
  const ordered = [...payables].sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())

  for (const payable of ordered) {
    const cents = Math.round(payable.amount * 100)
    const from = payable.dueDate.getTime() - MATCH_DAYS_BEFORE * DAY_MS
    const to = payable.dueDate.getTime() + (MATCH_DAYS_AFTER + 1) * DAY_MS
    let best: MatchableOutflow | null = null
    for (const outflow of outflows) {
      if (used.has(outflow.id)) continue
      if (Math.round(Math.abs(outflow.amount) * 100) !== cents) continue
      const time = outflow.occurredAt.getTime()
      if (time < from || time > to) continue
      if (
        !best ||
        Math.abs(time - payable.dueDate.getTime()) < Math.abs(best.occurredAt.getTime() - payable.dueDate.getTime())
      ) {
        best = outflow
      }
    }
    if (best) {
      used.add(best.id)
      matches.push({ payableId: payable.id, transactionId: best.id, paidAt: best.occurredAt })
    }
  }
  return matches
}

/** Procura a quitação das contas pendentes nas saídas que o Open Finance trouxe. */
export async function reconcilePayables() {
  const pending = await prisma.payable.findMany({ where: { status: "PENDING" } })
  if (pending.length === 0) return { matched: 0 }

  const earliest = Math.min(...pending.map((payable) => payable.dueDate.getTime())) - MATCH_DAYS_BEFORE * DAY_MS
  const latest = Math.max(...pending.map((payable) => payable.dueDate.getTime())) + (MATCH_DAYS_AFTER + 1) * DAY_MS
  const [outflows, linked] = await Promise.all([
    prisma.domainTransaction.findMany({
      where: {
        direction: "OUTFLOW",
        ignored: false,
        // Só o que já aconteceu: o Open Finance lista parcelas futuras de
        // cartão, e uma delas com o mesmo valor daria o boleto como pago antes
        // da hora.
        occurredAt: { gte: new Date(earliest), lte: new Date(Math.min(latest, Date.now())) },
      },
      select: { id: true, amount: true, occurredAt: true },
    }),
    prisma.payable.findMany({
      where: { paidTransactionId: { not: null } },
      select: { paidTransactionId: true },
    }),
  ])

  const matches = matchPayablesToOutflows(
    pending.map((payable) => ({ id: payable.id, amount: Number(payable.amount), dueDate: payable.dueDate })),
    outflows.map((tx) => ({ id: tx.id, amount: Number(tx.amount), occurredAt: tx.occurredAt })),
    new Set(linked.map((row) => row.paidTransactionId as string)),
  )
  for (const match of matches) {
    await prisma.payable.update({
      where: { id: match.payableId },
      data: { status: "PAID", paidAt: match.paidAt, paidTransactionId: match.transactionId },
    })
  }
  return { matched: matches.length }
}

export class PayableInputError extends Error {}

export async function createPayable(input: {
  code: string
  description: string
  /** Obrigatório quando o boleto não traz vencimento (convênio). ISO ou YYYY-MM-DD. */
  dueDate?: string | null
  /** Obrigatório quando o boleto não traz valor. */
  amount?: number | null
}) {
  const parsed = parseBoleto(input.code)
  if (!parsed.ok) throw new PayableInputError(parsed.error)
  const boleto = parsed.boleto

  const description = input.description.trim()
  if (!description) throw new PayableInputError("Dê um nome para a conta.")

  const amount = boleto.amount ?? (input.amount && input.amount > 0 ? input.amount : null)
  if (!amount) throw new PayableInputError("Este boleto não traz valor. Informe o valor.")

  let dueDate = boleto.dueDate
  if (input.dueDate) {
    const [year, month, day] = input.dueDate.slice(0, 10).split("-").map(Number)
    const informed = new Date(year, (month ?? 1) - 1, day ?? 1)
    if (Number.isNaN(informed.getTime())) throw new PayableInputError("Data de vencimento inválida.")
    // A data do código vale mais que a digitada, exceto quando o código não tem.
    dueDate = dueDate ?? informed
  }
  if (!dueDate) throw new PayableInputError("Este boleto não traz vencimento. Informe a data.")

  const existing = await prisma.payable.findUnique({ where: { barcode: boleto.barcode }, select: { id: true } })
  if (existing) throw new PayableInputError("Este boleto já está cadastrado.")

  const payable = await prisma.payable.create({
    data: {
      description,
      kind: boleto.kind,
      barcode: boleto.barcode,
      digitableLine: boleto.digitableLine,
      issuer: boleto.issuer,
      amount: new Prisma.Decimal(amount.toFixed(2)),
      dueDate,
    },
  })
  // Boleto cadastrado depois de pago já sai quitado.
  await reconcilePayables()
  return prisma.payable.findUniqueOrThrow({ where: { id: payable.id } })
}

export async function listPayables(now: Date = new Date()) {
  await reconcilePayables()
  const recentPaidSince = new Date(now.getTime() - 60 * DAY_MS)
  const rows = await prisma.payable.findMany({
    where: {
      OR: [{ status: "PENDING" }, { status: "PAID", paidAt: { gte: recentPaidSince } }],
    },
    orderBy: [{ dueDate: "asc" }],
  })
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const results = rows.map((row) => {
    const daysToDue = Math.round((row.dueDate.getTime() - today) / DAY_MS)
    return {
      id: row.id,
      description: row.description,
      kind: row.kind,
      digitableLine: row.digitableLine,
      issuer: row.issuer,
      amount: Number(row.amount),
      dueDate: row.dueDate,
      status: row.status as PayableStatus,
      paidAt: row.paidAt,
      paidTransactionId: row.paidTransactionId,
      daysToDue,
      overdue: row.status === "PENDING" && daysToDue < 0,
    }
  })
  const pending = results.filter((row) => row.status === "PENDING")
  return {
    summary: {
      pendingCount: pending.length,
      pendingAmount: Math.round(pending.reduce((sum, row) => sum + row.amount, 0) * 100) / 100,
      overdueCount: pending.filter((row) => row.overdue).length,
      dueIn7DaysCount: pending.filter((row) => row.daysToDue >= 0 && row.daysToDue <= 7).length,
    },
    results,
  }
}
