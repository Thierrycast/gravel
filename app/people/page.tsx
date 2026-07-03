"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Users,
  CheckCircle2,
  Clock,
  Phone,
  Calendar as CalendarIcon,
  Loader2,
  Info,
  Pencil,
  Trash2,
  X,
  HandCoins,
} from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useApi } from "@/hooks/use-api"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import { useCurrency } from "@/lib/currency-context"

type Lend = {
  id: string
  friendName: string
  friendPhone?: string | null
  amount: number
  dueDate: string
  description?: string | null
  status: "PENDING" | "PAID" | string
  domainTransactionId?: string | null
  inflowTransactionId?: string | null
  suggestedInflowTransactions?: TransactionOption[]
}

type TransactionOption = {
  id: string
  description: string
  amount: number
  date?: string | null
  occurredAt?: string | null
  direction: string
}

function getTransactionDate(transaction: TransactionOption) {
  return transaction.date ?? transaction.occurredAt ?? null
}

function formatDateSafe(
  value: string | Date | null | undefined,
  pattern: string,
) {
  if (!value) return "sem data"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "sem data"
  return format(date, pattern, { locale: ptBR })
}

export default function PeoplePage() {
  const { format: formatCurrency } = useCurrency()
  const {
    data: lends,
    refetch: refetchLends,
    loading: loadingLends,
  } = useApi<Lend[]>("/api/lends")
  const { data: transactionsData } = useApi<{ results: TransactionOption[] }>(
    "/api/domain/transactions",
    { page: "1", pageSize: "100" },
  )

  const [payingLendId, setPayingLendId] = useState<string | null>(null)
  const [selectedInflowTxId, setSelectedInflowTxId] = useState("")
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<string[]>([])
  const [editingLendId, setEditingLendId] = useState<string | null>(null)
  const [editLendForm, setEditLendForm] = useState({
    friendName: "",
    amount: "",
    description: "",
    friendPhone: "",
  })

  const outflowTransactions = useMemo(
    () =>
      transactionsData?.results?.filter((t) => t.direction === "OUTFLOW") ?? [],
    [transactionsData],
  )
  const inflowTransactions = useMemo(
    () =>
      transactionsData?.results?.filter((t) => t.direction === "INFLOW") ?? [],
    [transactionsData],
  )

  const [lendForm, setLendForm] = useState({
    friendName: "",
    friendPhone: "",
    amount: "",
    dueDate: new Date(),
    description: "",
    domainTransactionId: "",
  })

  const pendingLends = useMemo(
    () => lends?.filter((lend) => lend.status === "PENDING") ?? [],
    [lends],
  )
  const totalPending = pendingLends.reduce(
    (sum, lend) => sum + Number(lend.amount),
    0,
  )
  const peopleCount = new Set(pendingLends.map((lend) => lend.friendName)).size

  async function registerLend() {
    if (!lendForm.friendName || !lendForm.amount) {
      toast.error("Preencha nome e valor")
      return
    }
    try {
      const res = await fetch("/api/lends", {
        method: "POST",
        body: JSON.stringify(lendForm),
      })
      if (!res.ok) throw new Error()
      toast.success("Empréstimo registrado")
      setLendForm({
        friendName: "",
        friendPhone: "",
        amount: "",
        dueDate: new Date(),
        description: "",
        domainTransactionId: "",
      })
      refetchLends()
    } catch {
      toast.error("Erro ao registrar")
    }
  }

  async function handleConfirmPayment(id: string) {
    try {
      await fetch("/api/lends", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: "PAID",
          inflowTransactionId: selectedInflowTxId || null,
        }),
      })
      toast.success("Recebimento confirmado")
      setPayingLendId(null)
      setSelectedInflowTxId("")
      refetchLends()
    } catch {
      toast.error("Erro ao atualizar")
    }
  }

  async function confirmSuggestedPayment(
    lend: Lend,
    transaction: TransactionOption,
  ) {
    try {
      const res = await fetch("/api/lends", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: lend.id,
          status: "PAID",
          inflowTransactionId: transaction.id,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success("Recebimento confirmado e vinculado ao empréstimo")
      refetchLends()
    } catch {
      toast.error("Erro ao confirmar recebimento")
    }
  }

  async function deleteLend(id: string) {
    try {
      const res = await fetch(`/api/lends?id=${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Pendência removida")
      refetchLends()
    } catch {
      toast.error("Erro ao remover pendência")
    }
  }

  function startEditLend(lend: Lend) {
    setEditingLendId(lend.id)
    setEditLendForm({
      friendName: lend.friendName,
      amount: String(lend.amount),
      description: lend.description ?? "",
      friendPhone: lend.friendPhone ?? "",
    })
  }

  async function saveEditLend(id: string) {
    try {
      const res = await fetch("/api/lends", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          friendName: editLendForm.friendName,
          amount: parseFloat(editLendForm.amount),
          description: editLendForm.description || null,
          friendPhone: editLendForm.friendPhone || null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success("Pendência atualizada")
      setEditingLendId(null)
      refetchLends()
    } catch {
      toast.error("Erro ao atualizar pendência")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Pessoas
          </h1>
          <p className="text-muted-foreground">
            Empréstimos a amigos e valores a receber
          </p>
        </div>
        {pendingLends.length > 0 && (
          <div className="flex gap-4 text-sm">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">A receber</p>
              <p className="font-bold tabular-nums text-sky-500">
                {formatCurrency(totalPending)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Pessoas</p>
              <p className="font-bold tabular-nums">{peopleCount}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HandCoins className="size-5 text-sky-500" />
              Registrar empréstimo
            </CardTitle>
            <CardDescription>
              Dinheiro que você emprestou ou comprou para alguém no seu cartão.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Atrelar a uma despesa de saída (opcional)</Label>
              <Select
                value={lendForm.domainTransactionId || "__none__"}
                onValueChange={(txId) => {
                  if (txId === "__none__") {
                    setLendForm({ ...lendForm, domainTransactionId: "" })
                  } else {
                    const tx = outflowTransactions.find((t) => t.id === txId)
                    if (tx) {
                      setLendForm({
                        ...lendForm,
                        domainTransactionId: txId,
                        amount: String(Math.abs(tx.amount)),
                        description: tx.description,
                      })
                    }
                  }
                }}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Nenhuma - Criar avulsa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma - Criar avulsa</SelectItem>
                  {outflowTransactions.map((tx) => (
                    <SelectItem key={tx.id} value={tx.id}>
                      {formatCurrency(Math.abs(tx.amount))} — {tx.description} (
                      {formatDateSafe(getTransactionDate(tx), "dd/MM/yyyy")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nome da pessoa</Label>
              <Input
                placeholder="João Silva"
                value={lendForm.friendName}
                onChange={(e) =>
                  setLendForm({ ...lendForm, friendName: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={lendForm.amount}
                onChange={(e) =>
                  setLendForm({ ...lendForm, amount: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Data prevista de recebimento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {lendForm.dueDate ? (
                      formatDateSafe(lendForm.dueDate, "PPP")
                    ) : (
                      <span>Selecione uma data</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={lendForm.dueDate}
                    onSelect={(date) =>
                      setLendForm({ ...lendForm, dueDate: date || new Date() })
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Descrição / motivo</Label>
              <Input
                placeholder="Ex: Almoço, Compra Amazon"
                value={lendForm.description}
                onChange={(e) =>
                  setLendForm({ ...lendForm, description: e.target.value })
                }
              />
            </div>
            <Button className="w-full gap-2" onClick={registerLend}>
              <Users className="size-4" />
              Registrar
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Pendências</CardTitle>
            <CardDescription>
              Controle quem te deve e quando devem pagar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingLends ? (
              <div className="flex justify-center p-8">
                <Loader2 className="animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-4">
                {pendingLends.length === 0 && (
                  <EmptyState
                    icon={CheckCircle2}
                    title="Tudo em dia!"
                    description="Nenhuma pessoa devendo por enquanto."
                  />
                )}
                {pendingLends.map((lend) => {
                  const linkedTx = outflowTransactions.find(
                    (t) => t.id === lend.domainTransactionId,
                  )
                  const suggestedPayment = dismissedSuggestionIds.includes(
                    lend.id,
                  )
                    ? null
                    : (lend.suggestedInflowTransactions?.[0] ?? null)
                  return (
                    <div
                      key={lend.id}
                      className="group flex flex-col p-4 border rounded-xl bg-sky-500/5 border-sky-500/10 hover:border-sky-500/30 transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="size-10 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-500 font-bold shrink-0">
                            {lend.friendName.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold truncate">
                              {lend.friendName}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Info className="size-3 shrink-0" />{" "}
                              <span className="truncate">
                                {lend.description || "Sem descrição"}
                              </span>
                            </span>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="text-xs text-amber-600 font-mono flex items-center gap-1 uppercase tracking-tighter shrink-0">
                                <Clock className="size-3" /> Vence em{" "}
                                {formatDateSafe(lend.dueDate, "dd/MM")}
                              </span>
                              {lend.friendPhone && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                                  <Phone className="size-3" /> {lend.friendPhone}
                                </span>
                              )}
                            </div>
                            {linkedTx && (
                              <div className="mt-1.5 text-[10px] text-sky-600/80 bg-sky-500/5 px-2 py-0.5 rounded-md border border-sky-500/15 w-fit font-medium">
                                Despesa original: {linkedTx.description} (
                                {formatCurrency(Math.abs(linkedTx.amount))})
                              </div>
                            )}
                            {suggestedPayment && (
                              <div className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-2 text-xs">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="min-w-0">
                                    <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                                      Possível recebimento detectado
                                    </p>
                                    <p className="truncate text-muted-foreground">
                                      {formatCurrency(suggestedPayment.amount)} -{" "}
                                      {suggestedPayment.description} (
                                      {formatDateSafe(
                                        getTransactionDate(suggestedPayment),
                                        "dd/MM",
                                      )}
                                      )
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 gap-2">
                                    <Button
                                      size="sm"
                                      className="h-7 bg-emerald-600 text-xs hover:bg-emerald-700"
                                      onClick={() =>
                                        confirmSuggestedPayment(
                                          lend,
                                          suggestedPayment,
                                        )
                                      }
                                    >
                                      Recebi
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      onClick={() =>
                                        setDismissedSuggestionIds((current) => [
                                          ...current,
                                          lend.id,
                                        ])
                                      }
                                    >
                                      Ainda não
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 border-t pt-3 sm:border-t-0 sm:pt-0">
                          <span className="text-lg font-mono font-bold text-sky-500">
                            {formatCurrency(lend.amount)}
                          </span>
                          {payingLendId !== lend.id &&
                            editingLendId !== lend.id && (
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7 text-muted-foreground hover:text-foreground"
                                  onClick={() => startEditLend(lend)}
                                  title="Editar"
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => deleteLend(lend.id)}
                                  title="Excluir"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs"
                                  onClick={() => {
                                    setPayingLendId(lend.id)
                                    setSelectedInflowTxId("")
                                  }}
                                >
                                  Pago
                                </Button>
                              </div>
                            )}
                          {editingLendId === lend.id && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 text-muted-foreground"
                              onClick={() => setEditingLendId(null)}
                            >
                              <X className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {editingLendId === lend.id && (
                        <div className="mt-3 border-t pt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">
                                Nome
                              </Label>
                              <Input
                                className="h-7 text-xs"
                                value={editLendForm.friendName}
                                onChange={(e) =>
                                  setEditLendForm({
                                    ...editLendForm,
                                    friendName: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">
                                Valor
                              </Label>
                              <Input
                                type="number"
                                className="h-7 text-xs"
                                value={editLendForm.amount}
                                onChange={(e) =>
                                  setEditLendForm({
                                    ...editLendForm,
                                    amount: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">
                                Telefone
                              </Label>
                              <Input
                                className="h-7 text-xs"
                                value={editLendForm.friendPhone}
                                onChange={(e) =>
                                  setEditLendForm({
                                    ...editLendForm,
                                    friendPhone: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">
                                Descrição
                              </Label>
                              <Input
                                className="h-7 text-xs"
                                value={editLendForm.description}
                                onChange={(e) =>
                                  setEditLendForm({
                                    ...editLendForm,
                                    description: e.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => setEditingLendId(null)}
                            >
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => saveEditLend(lend.id)}
                            >
                              Salvar
                            </Button>
                          </div>
                        </div>
                      )}

                      {payingLendId === lend.id && (
                        <div className="mt-3 border-t pt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground font-medium">
                              Como você recebeu esse dinheiro de {lend.friendName}?
                            </Label>
                            <Select
                              value={selectedInflowTxId || "__manual__"}
                              onValueChange={(v) =>
                                setSelectedInflowTxId(v === "__manual__" ? "" : v)
                              }
                            >
                              <SelectTrigger className="text-xs h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__manual__">
                                  Marcar manualmente (sem atrelar transação)
                                </SelectItem>
                                {inflowTransactions.map((tx) => (
                                  <SelectItem key={tx.id} value={tx.id}>
                                    {formatCurrency(tx.amount)} — {tx.description}{" "}
                                    ({formatDateSafe(getTransactionDate(tx), "dd/MM/yyyy")})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => {
                                setPayingLendId(null)
                                setSelectedInflowTxId("")
                              }}
                            >
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs"
                              onClick={() => handleConfirmPayment(lend.id)}
                            >
                              Confirmar Recebimento
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                {lends?.some((lend) => lend.status === "PAID") && (
                  <>
                    <Separator className="my-6" />
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">
                      Histórico recente (pagos)
                    </h4>
                    <div className="space-y-2 opacity-70">
                      {lends
                        .filter((lend) => lend.status === "PAID")
                        .slice(0, 5)
                        .map((lend) => {
                          const linkedInflowTx = inflowTransactions.find(
                            (t) => t.id === lend.inflowTransactionId,
                          )
                          return (
                            <div
                              key={lend.id}
                              className="flex flex-col p-2.5 border rounded-lg text-xs bg-muted/20 space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-muted-foreground">
                                  {lend.friendName}
                                </span>
                                <span className="line-through font-mono text-muted-foreground">
                                  {formatCurrency(lend.amount)}
                                </span>
                              </div>
                              {lend.description && (
                                <p className="text-[10px] text-muted-foreground/80 italic truncate">
                                  Dívida: {lend.description}
                                </p>
                              )}
                              {linkedInflowTx && (
                                <p className="text-[10px] text-emerald-600/90 dark:text-emerald-400/90 font-medium">
                                  Recebido via: {linkedInflowTx.description} (
                                  {formatDateSafe(
                                    getTransactionDate(linkedInflowTx),
                                    "dd/MM",
                                  )}
                                  )
                                </p>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
