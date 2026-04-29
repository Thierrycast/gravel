import { ensurePrismaReady, prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

const BCB_BASE_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs"
const MAX_YEARS_PER_REQUEST = 10
const UPSERT_BATCH_SIZE = 200

type BcbPoint = {
  data: string // dd/MM/yyyy
  valor: string
}

function formatBcbDate(date: Date) {
  const day = String(date.getUTCDate()).padStart(2, "0")
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const year = date.getUTCFullYear()
  return `${day}/${month}/${year}`
}

function buildDateWindows(from: Date, to: Date) {
  const windows: Array<{ from: Date; to: Date }> = []
  let currentFrom = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))

  while (currentFrom <= to) {
    const currentTo = new Date(currentFrom)
    currentTo.setUTCFullYear(currentTo.getUTCFullYear() + MAX_YEARS_PER_REQUEST)
    currentTo.setUTCDate(currentTo.getUTCDate() - 1)

    if (currentTo > to) {
      currentTo.setTime(to.getTime())
    }

    windows.push({ from: new Date(currentFrom), to: new Date(currentTo) })
    currentFrom = new Date(currentTo)
    currentFrom.setUTCDate(currentFrom.getUTCDate() + 1)
  }

  return windows
}

function parseBcbPointDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) {
    throw new Error(`Invalid BCB date format: ${value}`)
  }

  const [, rawDay, rawMonth, rawYear] = match
  const day = Number(rawDay)
  const month = Number(rawMonth)
  const year = Number(rawYear)
  const parsed = new Date(Date.UTC(year, month - 1, day))

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Invalid BCB date value: ${value}`)
  }

  return parsed
}

async function fetchMacroSeriesWindow(
  seriesCode: number,
  seriesName: string,
  from: Date,
  to: Date
) {
  const url =
    `${BCB_BASE_URL}.${seriesCode}/dados?formato=json` +
    `&dataInicial=${formatBcbDate(from)}` +
    `&dataFinal=${formatBcbDate(to)}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch BCB series ${seriesCode}: ${response.statusText}`)
  }

  const data = (await response.json()) as BcbPoint[]

  return data.map((point) => ({
    series: seriesName,
    date: parseBcbPointDate(point.data),
    value: new Prisma.Decimal(point.valor),
  }))
}

async function upsertMacroSeriesPoints(
  points: Array<{ series: string; date: Date; value: Prisma.Decimal }>
) {
  for (let index = 0; index < points.length; index += UPSERT_BATCH_SIZE) {
    const batch = points.slice(index, index + UPSERT_BATCH_SIZE)
    await prisma.$transaction(
      batch.map((point) =>
        prisma.macroSeriesPoint.upsert({
          where: {
            series_date: {
              series: point.series,
              date: point.date,
            },
          },
          create: point,
          update: { value: point.value },
        })
      )
    )
  }
}

/**
 * Fetches macro data from BCB (SGS) and persists it locally.
 */
export async function syncMacroSeries(
  seriesCode: number,
  seriesName: string,
  options?: { from?: Date; to?: Date }
) {
  await ensurePrismaReady()

  const to = options?.to ?? new Date()
  const from = options?.from ?? new Date(Date.UTC(1995, 0, 1))
  const windows = buildDateWindows(from, to)
  const points = (
    await Promise.all(
      windows.map((window) =>
        fetchMacroSeriesWindow(seriesCode, seriesName, window.from, window.to)
      )
    )
  ).flat()

  await upsertMacroSeriesPoints(points)
}

export async function syncDefaultMacroData() {
  await Promise.all([
    syncMacroSeries(12, "CDI"),
    syncMacroSeries(433, "IPCA")
  ])
}
