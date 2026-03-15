"use client"

import { useState, useCallback } from "react"
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Plug,
  Bitcoin,
  Wallet,
  ArrowLeftRight,
  Receipt,
  Landmark,
  Repeat,
  Database,
} from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { formatDateTime } from "@/lib/format"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table"

interface SyncRun {
  id: string
  provider: string
  scope: string
  resource: string
  status: string
  trigger: string
  summaryJson: string | null
  errorMessage: string | null
  startedAt: string
  finishedAt: string | null
}

interface PluggyItem {
  id: string
  pluggyItemId: string
  connectorName: string | null
  status: string | null
}

interface SyncStatusResponse {
  results: {
    providers: {
      pluggy: {
        lastRun: SyncRun | null
        recentRuns: SyncRun[]
        connectedItems: number
        items: PluggyItem[]
      }
      binance: {
        lastRun: SyncRun | null
        recentRuns: SyncRun[]
      }
    }
    domainCounts: {
      accounts: number
      transactions: number
      bills: number
      investments: number
      crypto: number
      recurring: number
    }
    recentRuns: SyncRun[]
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `ha ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `ha ${hours}h`
  const days = Math.floor(hours / 24)
  return `ha ${days}d`
}

function duration(start: string, end: string | null): string {
  if (!end) return "-"
  const diff = new Date(end).getTime() - new Date(start).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remainSecs = secs % 60
  return `${mins}m ${remainSecs}s`
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase()
  if (s === "RUNNING") {
    return (
      <Badge variant="outline" className="text-yellow-600 border-yellow-400">
        <Loader2 className="size-3 mr-1 animate-spin" />
        Executando
      </Badge>
    )
  }
  if (s === "SUCCESS") {
    return (
      <Badge variant="outline" className="text-emerald-600 border-emerald-400">
        <CheckCircle2 className="size-3 mr-1" />
        Sucesso
      </Badge>
    )
  }
  if (s === "ERROR") {
    return (
      <Badge variant="destructive">
        <XCircle className="size-3 mr-1" />
        Erro
      </Badge>
    )
  }
  return <Badge variant="secondary">{status}</Badge>
}

function ProviderBadge({ provider }: { provider: string }) {
  if (provider === "PLUGGY") {
    return (
      <Badge variant="outline">
        <Plug className="size-3 mr-1" />
        Pluggy
      </Badge>
    )
  }
  if (provider === "BINANCE") {
    return (
      <Badge variant="outline">
        <Bitcoin className="size-3 mr-1" />
        Binance
      </Badge>
    )
  }
  return <Badge variant="secondary">{provider}</Badge>
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-32" />
      <Skeleton className="h-64" />
    </div>
  )
}

const DOMAIN_ITEMS = [
  { key: "accounts" as const, label: "Contas", icon: Wallet },
  { key: "transactions" as const, label: "Transacoes", icon: ArrowLeftRight },
  { key: "bills" as const, label: "Faturas", icon: Receipt },
  { key: "investments" as const, label: "Investimentos", icon: Landmark },
  { key: "crypto" as const, label: "Crypto", icon: Bitcoin },
  { key: "recurring" as const, label: "Recorrencias", icon: Repeat },
]

export default function SyncPage() {
  const { data, loading, refetch } =
    useApi<SyncStatusResponse>("/api/sync/status")
  const [syncing, setSyncing] = useState(false)

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      const res = await fetch("/api/admin/sync/full", { method: "POST" })
      if (!res.ok) throw new Error("Falha ao iniciar sincronizacao")
      // Wait a bit then refetch status
      setTimeout(() => {
        refetch()
        setSyncing(false)
      }, 2000)
    } catch {
      setSyncing(false)
    }
  }, [refetch])

  if (loading) return <LoadingSkeleton />

  const providers = data?.results?.providers
  const domainCounts = data?.results?.domainCounts
  const recentRuns = data?.results?.recentRuns ?? []

  const pluggy = providers?.pluggy
  const binance = providers?.binance

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sincronizacao</h1>
          <p className="text-muted-foreground">
            Status das conexoes e sincronizacoes de dados
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="size-4 mr-2" />
          )}
          Sincronizar
        </Button>
      </div>

      {/* Provider Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Pluggy */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plug className="size-5 text-muted-foreground" />
                <CardTitle>Pluggy</CardTitle>
              </div>
              {pluggy?.lastRun && <StatusBadge status={pluggy.lastRun.status} />}
            </div>
            <CardDescription>Open Banking - Contas e investimentos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Ultima sincronizacao</span>
              <span className="font-medium">
                {pluggy?.lastRun
                  ? timeAgo(pluggy.lastRun.startedAt)
                  : "Nunca"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Itens conectados</span>
              <Badge variant="secondary">{pluggy?.connectedItems ?? 0}</Badge>
            </div>
            {pluggy?.items && pluggy.items.length > 0 && (
              <>
                <Separator />
                <div className="space-y-1.5">
                  {pluggy.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-muted-foreground">
                        {item.connectorName ?? item.pluggyItemId}
                      </span>
                      <Badge
                        variant={
                          item.status === "UPDATED" ? "default" : "secondary"
                        }
                        className="text-xs"
                      >
                        {item.status ?? "N/A"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Binance */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bitcoin className="size-5 text-muted-foreground" />
                <CardTitle>Binance</CardTitle>
              </div>
              {binance?.lastRun && (
                <StatusBadge status={binance.lastRun.status} />
              )}
            </div>
            <CardDescription>Exchange - Criptoativos e trades</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Ultima sincronizacao</span>
              <span className="font-medium">
                {binance?.lastRun
                  ? timeAgo(binance.lastRun.startedAt)
                  : "Nunca"}
              </span>
            </div>
            {binance?.lastRun?.errorMessage && (
              <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                {binance.lastRun.errorMessage}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Domain Counts */}
      {domainCounts && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="size-5 text-muted-foreground" />
              <CardTitle>Dados Sincronizados</CardTitle>
            </div>
            <CardDescription>
              Total de registros por dominio
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {DOMAIN_ITEMS.map(({ key, label, icon: Icon }) => (
                <div
                  key={key}
                  className="flex flex-col items-center gap-1.5 rounded-lg border p-3"
                >
                  <Icon className="size-5 text-muted-foreground" />
                  <span className="text-2xl font-bold">
                    {domainCounts[key].toLocaleString("pt-BR")}
                  </span>
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Sync Runs */}
      <Card>
        <CardHeader>
          <CardTitle>Execucoes Recentes</CardTitle>
          <CardDescription>
            Ultimas sincronizacoes realizadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Recurso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead>Duracao</TableHead>
                <TableHead>Erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentRuns.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground"
                  >
                    Nenhuma execucao encontrada.
                  </TableCell>
                </TableRow>
              )}
              {recentRuns.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <ProviderBadge provider={run.provider} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {run.resource}
                    {run.scope && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({run.scope})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {run.trigger}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDateTime(run.startedAt)}
                  </TableCell>
                  <TableCell className="text-sm font-mono">
                    {duration(run.startedAt, run.finishedAt)}
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    {run.errorMessage ? (
                      <span
                        className="text-xs text-destructive truncate block"
                        title={run.errorMessage}
                      >
                        {run.errorMessage}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
