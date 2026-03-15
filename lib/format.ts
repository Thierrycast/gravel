const currencyFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const currencyCompactFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
})

const percentFmt = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
})

const dateFullFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
})

const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
})

export function formatCurrency(value: number): string {
  return currencyFmt.format(value)
}

export function formatCurrencyCompact(value: number): string {
  return currencyCompactFmt.format(value)
}

export function formatPercent(value: number): string {
  return percentFmt.format(value / 100)
}

export function formatDate(date: string | Date): string {
  return dateFmt.format(new Date(date))
}

export function formatDateFull(date: string | Date): string {
  return dateFullFmt.format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return dateTimeFmt.format(new Date(date))
}

export function daysUntil(date: string | Date): number {
  const target = new Date(date)
  const now = new Date()
  target.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export function daysUntilLabel(date: string | Date): string {
  const days = daysUntil(date)
  if (days === 0) return "Hoje"
  if (days === 1) return "Amanhã"
  if (days < 0) return `${Math.abs(days)} dias atrás`
  return `Em ${days} dias`
}
