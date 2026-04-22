"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, Building2, CreditCard, Landmark, Wallet } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { formatCurrency, formatPercent } from "@/lib/format"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PageError } from "@/components/page-error"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"

import {
  type Account,
  type AccountsResponse,
  type AllocationResponse,
  type AllocationResult,
} from "@/lib/types/api"

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function getTypeLabel(kind: string): string {
  const labels: Record<string, string> = {
    BANK: "Conta Bancária",
    CARD: "Cartão de Crédito",
    CREDIT: "Cartão de Crédito",
    SAVINGS: "Poupança",
    CHECKING: "Conta Corrente",
    INVESTMENT: "Investimento",
  }
  return labels[kind] || kind
}

function getTypeIcon(kind: string) {
  if (kind === "CARD" || kind === "CREDIT") return CreditCard
  if (kind === "SAVINGS") return Landmark
  return Wallet
}

function AccountCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-6 w-28" />
      </CardContent>
    </Card>
  )
}

export default function AccountsPage() {
  const { data: accountsData, loading: accountsLoading, error: accountsError, refetch: refetchAccounts } =
    useApi<AccountsResponse>("/api/domain/accounts")
  const { data: allocationData, loading: allocationLoading, error: allocationError, refetch: refetchAllocation } =
    useApi<AllocationResponse>("/api/domain/metrics/accounts/allocation")

  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const loading = accountsLoading || allocationLoading

  if (accountsError || allocationError) {
    return (
      <PageError
        message="Erro ao carregar contas e saldos"
        refetch={() => {
          refetchAccounts()
          refetchAllocation()
        }}
      />
    )
  }

  const accounts = accountsData?.results ?? []
  const creditAccounts = accounts.filter((a) => a.kind === "CARD" || a.kind === "CREDIT")
  const bankAccounts = accounts.filter((a) => a.kind !== "CARD" && a.kind !== "CREDIT")

  const totalCredit = allocationData?.summary.byKind.CREDIT ?? 0
  const totalBank = allocationData?.summary.byKind.BANK ?? 0

  const allocationMap = new Map(
    (allocationData?.results ?? []).map((r) => [r.accountId, r])
  )

  function handleAccountClick(account: Account) {
    setSelectedAccount(account)
    setSheetOpen(true)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contas</h1>
          <p className="text-muted-foreground">
            Bancos, carteiras e saldos atuais
          </p>
        </div>
        <Button asChild>
          <Link href="/connect">
            <Plus data-icon="inline-start" />
            Adicionar Conta
          </Link>
        </Button>
      </div>

      {/* Summary Cards */}
      {!loading && allocationData && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Patrimônio Total</CardDescription>
              <CardTitle className="text-2xl">
                {formatCurrency(allocationData.summary.totalBalance)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Contas Bancárias</CardDescription>
              <CardTitle className="text-2xl">
                {formatCurrency(totalBank)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Cartões de Crédito</CardDescription>
              <CardTitle className="text-2xl text-destructive">
                {formatCurrency(totalCredit)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {loading && (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-32" />
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Credit Cards Section */}
      {(creditAccounts.length > 0 || loading) && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="size-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">Cartões de Crédito</h2>
            {!loading && (
              <Badge variant="secondary">{creditAccounts.length}</Badge>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {loading
              ? Array.from({ length: 2 }).map((_, i) => (
                  <AccountCardSkeleton key={i} />
                ))
              : creditAccounts.map((account) => {
                  const allocation = allocationMap.get(account.id)
                  return (
                    <Card
                      key={account.id}
                      className="cursor-pointer transition-shadow hover:shadow-md"
                      onClick={() => handleAccountClick(account)}
                    >
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {getInitials(account.institution || account.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {account.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {account.institution}
                            </div>
                          </div>
                          <Badge variant="secondary" className="shrink-0">
                            {getTypeLabel(account.subtype || account.kind)}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-muted-foreground">
                              Fatura Atual
                            </span>
                            <span className="font-semibold text-destructive">
                              {formatCurrency(Math.abs(account.balance))}
                            </span>
                          </div>
                          <Progress
                            value={
                              allocation
                                ? Math.min(allocation.percentage, 100)
                                : 0
                            }
                          />
                          {allocation && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {formatPercent(allocation.percentage)} do total
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
          </div>

          {!loading && creditAccounts.length > 0 && (
            <div className="mt-3 text-right text-sm text-muted-foreground">
              Total: <span className="font-medium text-destructive">{formatCurrency(totalCredit)}</span>
            </div>
          )}
        </div>
      )}

      {/* Bank Accounts Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="size-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Contas Bancárias</h2>
          {!loading && (
            <Badge variant="secondary">{bankAccounts.length}</Badge>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <AccountCardSkeleton key={i} />
              ))
            : bankAccounts.map((account) => {
                const allocation = allocationMap.get(account.id)
                return (
                  <Card
                    key={account.id}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => handleAccountClick(account)}
                  >
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>
                            {getInitials(account.institution || account.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {account.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {account.institution}
                          </div>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {getTypeLabel(account.subtype || account.kind)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Saldo
                        </span>
                        <span className="text-lg font-semibold">
                          {formatCurrency(account.balance)}
                        </span>
                      </div>
                      {allocation && (
                        <div className="text-xs text-muted-foreground mt-1 text-right">
                          {formatPercent(allocation.percentage)} do patrimônio
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
        </div>

        {!loading && bankAccounts.length > 0 && (
          <div className="mt-3 text-right text-sm text-muted-foreground">
            Total: <span className="font-medium">{formatCurrency(totalBank)}</span>
          </div>
        )}
      </div>

      {/* Empty State */}
      {!loading && accounts.length === 0 && (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center text-center">
            <Building2 className="size-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhuma conta conectada</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Conecte suas contas bancárias para começar a acompanhar suas finanças.
            </p>
            <Button asChild>
              <Link href="/connect">
                <Plus data-icon="inline-start" />
                Adicionar Conta
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Account Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selectedAccount?.name}</SheetTitle>
            <SheetDescription>
              {selectedAccount?.institution}
            </SheetDescription>
          </SheetHeader>
          {selectedAccount && (
            <div className="flex flex-col gap-4 px-4 pb-4">
              <div className="flex items-center gap-3">
                <Avatar size="lg">
                  <AvatarFallback>
                    {getInitials(
                      selectedAccount.institution || selectedAccount.name
                    )}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">{selectedAccount.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {selectedAccount.institution}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Tipo</span>
                  <Badge variant="outline">
                    {getTypeLabel(selectedAccount.subtype || selectedAccount.kind)}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Saldo</span>
                  <span
                    className={`font-semibold ${
                      selectedAccount.kind === "CARD" || selectedAccount.kind === "CREDIT"
                        ? "text-destructive"
                        : ""
                    }`}
                  >
                    {formatCurrency(
                      selectedAccount.kind === "CARD" || selectedAccount.kind === "CREDIT"
                        ? Math.abs(selectedAccount.balance)
                        : selectedAccount.balance
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Moeda</span>
                  <span className="text-sm">{selectedAccount.currencyCode}</span>
                </div>
                {selectedAccount.number && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Número
                    </span>
                    <span className="text-sm font-mono">
                      ****{selectedAccount.number.slice(-4)}
                    </span>
                  </div>
                )}
              </div>

              <Separator />

              {(() => {
                const allocation = allocationMap.get(selectedAccount.id)
                if (!allocation) return null
                return (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      Alocação no Patrimônio
                    </div>
                    <Progress value={Math.min(allocation.percentage, 100)} />
                    <div className="text-xs text-muted-foreground">
                      {formatPercent(allocation.percentage)} do total (
                      {formatCurrency(allocation.balance)})
                    </div>
                  </div>
                )
              })()}

              <Button variant="outline" asChild className="mt-2">
                <Link
                  href={`/transactions?accountName=${encodeURIComponent(selectedAccount.name)}`}
                >
                  Ver Transações
                </Link>
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
