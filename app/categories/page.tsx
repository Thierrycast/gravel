"use client"

import { useState, useMemo } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { PieChart, Pie, Cell } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { useApi } from "@/hooks/use-api"
import { formatCurrency, formatPercent } from "@/lib/format"

interface Category {
  id: string
  name: string
  parentId: string | null
}

interface CategoriesResponse {
  results: Category[]
}

interface SpendingCategory {
  category: string
  categoryId: string
  total: number
  percentage: number
  transactionCount: number
}

interface SpendingResponse {
  summary: {
    total: number
  }
  results: SpendingCategory[]
}

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

const HSL_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
]

function getMonthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="mx-auto h-[200px] w-[200px] rounded-full" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 py-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-2 flex-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function CategoriesPage() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date())

  const monthParam = useMemo(() => getMonthParam(currentMonth), [currentMonth])

  const { data: spending, loading: spendingLoading } =
    useApi<SpendingResponse>("/api/domain/metrics/spending/categories", {
      month: monthParam,
    })

  const { loading: categoriesLoading } = useApi<CategoriesResponse>(
    "/api/domain/categories"
  )

  const loading = spendingLoading || categoriesLoading

  const sortedCategories = useMemo(() => {
    if (!spending?.results) return []
    return [...spending.results].sort((a, b) => b.total - a.total)
  }, [spending])

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {}
    sortedCategories.forEach((cat, i) => {
      config[cat.category] = {
        label: cat.category,
        color: HSL_COLORS[i % HSL_COLORS.length],
      }
    })
    return config
  }, [sortedCategories])

  const pieData = useMemo(() => {
    return sortedCategories.map((cat, i) => ({
      name: cat.category,
      value: cat.total,
      fill: HSL_COLORS[i % HSL_COLORS.length],
    }))
  }, [sortedCategories])

  function goToPreviousMonth() {
    setCurrentMonth((prev) => {
      const next = new Date(prev)
      next.setMonth(next.getMonth() - 1)
      return next
    })
  }

  function goToNextMonth() {
    setCurrentMonth((prev) => {
      const next = new Date(prev)
      next.setMonth(next.getMonth() + 1)
      return next
    })
  }

  if (loading) return <LoadingSkeleton />

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categorias</h1>
          <p className="text-muted-foreground">
            Distribuição dos gastos por categoria.
          </p>
        </div>

        {/* Month Selector */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[160px] text-center text-sm font-medium capitalize">
            {formatMonthLabel(currentMonth)}
          </span>
          <Button variant="outline" size="icon" onClick={goToNextMonth}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Donut Chart Card */}
        <Card>
          <CardHeader>
            <CardDescription>Distribuição de Gastos</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(spending?.summary?.total ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={chartConfig}
              className="mx-auto aspect-square h-[220px]"
            >
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCurrency(value as number)}
                    />
                  }
                />
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${entry.name}`}
                      fill={HSL_COLORS[index % HSL_COLORS.length]}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {sortedCategories.slice(0, 5).map((cat, i) => (
                <div key={cat.categoryId} className="flex items-center gap-1.5">
                  <div
                    className="size-2.5 rounded-full"
                    style={{
                      backgroundColor: HSL_COLORS[i % HSL_COLORS.length],
                    }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {cat.category}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Categories Table */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Detalhamento por Categoria</CardTitle>
            <CardDescription>
              {sortedCategories.length} categorias neste período
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-center">Transações</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Progresso
                  </TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCategories.map((cat, i) => (
                  <TableRow key={cat.categoryId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="size-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              HSL_COLORS[i % HSL_COLORS.length],
                          }}
                        />
                        <span className="font-medium">{cat.category}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {cat.transactionCount}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Progress value={cat.percentage} className="h-1.5" />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(cat.total)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatPercent(cat.percentage)}
                    </TableCell>
                  </TableRow>
                ))}
                {sortedCategories.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Nenhum gasto registrado neste período.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
