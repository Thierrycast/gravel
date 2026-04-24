import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

const BCB_BASE_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs"

type BcbPoint = {
  data: string // dd/MM/yyyy
  valor: string
}

/**
 * Fetches macro data from BCB (SGS) and persists it locally (Task 5.1).
 */
export async function syncMacroSeries(seriesCode: number, seriesName: string) {
  const url = `${BCB_BASE_URL}.${seriesCode}/dados?formato=json`
  
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch BCB series ${seriesCode}: ${response.statusText}`)
  }

  const data = (await response.json()) as BcbPoint[]
  console.log(`[BCB Sync] Fetched ${data.length} points for ${seriesName}`)

  // We process in chunks to avoid database locking/memory issues with huge series
  const points = data.map(p => {
    const [day, month, year] = p.data.split("/")
    return {
      series: seriesName,
      date: new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))),
      value: new Prisma.Decimal(p.valor)
    }
  })

  // Upsert points (using series + date unique constraint)
  for (const point of points) {
    await prisma.macroSeriesPoint.upsert({
      where: {
        series_date: {
          series: point.series,
          date: point.date
        }
      },
      create: point,
      update: { value: point.value }
    })
  }
}

export async function syncDefaultMacroData() {
  await Promise.all([
    syncMacroSeries(12, "CDI"),
    syncMacroSeries(433, "IPCA")
  ])
}
