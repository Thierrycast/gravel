"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  Receipt,
} from "lucide-react"
import { useApi } from "@/hooks/use-api"
import {
  formatCurrency,
  formatDate,
  formatDateFull,
  daysUntil,
  daysUntilLabel,
} from "@/lib/format"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface Bill {
  id: string
  accountName: string
  dueDate: string
  totalAmount: number
  minimumPayment: number
  status: string
  closingDate: string
}

interface BillsSummary {
  totalOpen: number
  totalOverdue: number
  totalPaid: number
  counts: {
    total: number
    open: number
    overdue: number
    paid: number
  }
  upcoming: Bill[]
}

interface BillsResponse {
  results: Bill[]
}

interface BillsSummaryResponse {
  summary: BillsSummary
}

function getStatusConfig(status: string, dueDate: string) {
  const days = daysUntil(dueDate)

  if (status === "PAID") {
    return {
      label: "Paga",
      variant: "default" as const,
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      icon: CheckCircle2,
    }
  }
  if (status === "OVERDUE" || days < 0) {
    return {
      label: "Vencida",
      variant: "destructive" as const,
      className: "",
      icon: AlertCircle,
    }
  }
  if (status === "CLOSED" || days <= 0) {
    return {
      label: "Fechada",
      variant: "default" as const,
      className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      icon: CheckCircle2,
    }
  }
  if (days <= 7) {
    return {
      label: "Vence em breve",
      variant: "default" as const,
      className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      icon: Clock,
    }
  }
  return {
    label: "Aberta",
    variant: "outline" as const,
    className: "",
    icon: Calendar,
  }
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]

function BillCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-5 w-24" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-6 w-28" />
      </CardContent>
    </Card>
  )
}

export default function BillsPage() {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  const monthParam = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`

  const { data: billsData, loading: billsLoading } =
    useApi<BillsResponse>("/api/domain/bills", { month: monthParam })

  const { data: summaryData, loading: summaryLoading } =
    useApi<BillsSummaryResponse>("/api/domain/metrics/bills/summary", {
      month: monthParam,
    })

  const loading = billsLoading || summaryLoading
  const bills = billsData?.results ?? []
  const summary = summaryData?.summary

  const sortedBills = useMemo(() => {
    return [...bills].sort((a, b) => {
      const statusOrder: Record<string, number> = {
        OVERDUE: 0,
        OPEN: 1,
        CLOSED: 2,
        PAID: 3,
      }
      const aOrder = statusOrder[a.status] ?? 1
      const bOrder = statusOrder[b.status] ?? 1
      if (aOrder !== bOrder) return aOrder - bOrder
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })
  }, [bills])

  function handlePrevMonth() {
    if (selectedMonth === 0) {
      setSelectedMonth(11)
      setSelectedYear((y) => y - 1)
    } else {
      setSelectedMonth((m) => m - 1)
    }
  }

  function handleNextMonth() {
    if (selectedMonth === 11) {
      setSelectedMonth(0)
      setSelectedYear((y) => y + 1)
    } else {
      setSelectedMonth((m) => m + 1)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header with month navigation */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Faturas</h1>
          <p className="text-muted-foreground">
            Faturas de cartão e vencimentos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={handlePrevMonth}>
            <ChevronLeft />
          </Button>
          <span className="min-w-[160px] text-center font-medium">
            {monthNames[selectedMonth]} {selectedYear}
          </span>
          <Button variant="outline" size="icon-sm" onClick={handleNextMonth}>
            <ChevronRight />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} size="sm">
              <CardHeader>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-28" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Card size="sm">
            <CardHeader>
              <CardDescription>Total de Faturas</CardDescription>
              <CardTitle className="text-2xl">
                {formatCurrency(
                  summary.totalOpen + summary.totalOverdue + summary.totalPaid
                )}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <div className="flex items-center gap-1.5">
                <Clock className="size-4 text-amber-600" />
                <CardDescription>Em Aberto</CardDescription>
              </div>
              <CardTitle>
                {formatCurrency(summary.totalOpen)}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({summary.counts.open} {summary.counts.open === 1 ? "fatura" : "faturas"})
                </span>
              </CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <div className="flex items-center gap-1.5">
                <AlertCircle className="size-4 text-destructive" />
                <CardDescription>Vencidas</CardDescription>
              </div>
              <CardTitle className="text-destructive">
                {formatCurrency(summary.totalOverdue)}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({summary.counts.overdue} {summary.counts.overdue === 1 ? "fatura" : "faturas"})
                </span>
              </CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-blue-600" />
                <CardDescription>Pagas</CardDescription>
              </div>
              <CardTitle className="text-blue-600">
                {formatCurrency(summary.totalPaid)}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({summary.counts.paid} {summary.counts.paid === 1 ? "fatura" : "faturas"})
                </span>
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      ) : null}

      {/* Bills List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <BillCardSkeleton key={i} />
            ))
          : sortedBills.map((bill) => {
              const statusConfig = getStatusConfig(bill.status, bill.dueDate)
              const StatusIcon = statusConfig.icon
              const days = daysUntil(bill.dueDate)

              return (
                <Card key={bill.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>
                          {getInitials(bill.accountName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {bill.accountName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Cartão de Crédito
                        </div>
                      </div>
                      <Badge
                        variant={statusConfig.variant}
                        className={statusConfig.className}
                      >
                        <StatusIcon className="size-3 mr-0.5" />
                        {statusConfig.label}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Calendar className="size-3.5" />
                          Vencimento
                        </span>
                        <span>
                          {formatDate(bill.dueDate)}
                          {bill.status !== "PAID" && (
                            <span
                              className={`ml-1.5 text-xs ${
                                days < 0
                                  ? "text-destructive"
                                  : days <= 3
                                    ? "text-amber-600"
                                    : "text-muted-foreground"
                              }`}
                            >
                              ({daysUntilLabel(bill.dueDate)})
                            </span>
                          )}
                        </span>
                      </div>

                      {bill.closingDate && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Fechamento
                          </span>
                          <span>{formatDate(bill.closingDate)}</span>
                        </div>
                      )}

                      <Separator />

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Pagamento mínimo
                        </span>
                        <span>{formatCurrency(bill.minimumPayment)}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Valor total
                        </span>
                        <span className="text-lg font-bold">
                          {formatCurrency(bill.totalAmount)}
                        </span>
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter>
                    <Button variant="ghost" size="sm" asChild className="w-full">
                      <Link
                        href={`/transactions?accountName=${encodeURIComponent(bill.accountName)}`}
                      >
                        <Receipt className="size-4 mr-1.5" />
                        Ver transações
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              )
            })}
      </div>

      {/* Empty State */}
      {!loading && bills.length === 0 && (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center text-center">
            <CreditCard className="size-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              Nenhuma fatura encontrada
            </h3>
            <p className="text-sm text-muted-foreground">
              Não há faturas para {monthNames[selectedMonth].toLowerCase()} de{" "}
              {selectedYear}.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Bills */}
      {!loading && summary?.upcoming && summary.upcoming.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Próximos Vencimentos</h2>
          <div className="grid gap-3">
            {summary.upcoming.map((bill) => {
              const statusConfig = getStatusConfig(bill.status, bill.dueDate)
              return (
                <Card key={bill.id} size="sm">
                  <CardContent className="flex items-center gap-4">
                    <Avatar size="sm">
                      <AvatarFallback>
                        {getInitials(bill.accountName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {bill.accountName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Vence {daysUntilLabel(bill.dueDate).toLowerCase()} -{" "}
                        {formatDate(bill.dueDate)}
                      </div>
                    </div>
                    <Badge
                      variant={statusConfig.variant}
                      className={statusConfig.className}
                    >
                      {statusConfig.label}
                    </Badge>
                    <span className="font-semibold shrink-0">
                      {formatCurrency(bill.totalAmount)}
                    </span>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
