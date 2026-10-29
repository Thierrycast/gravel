"use client"

import { useMemo, useRef, useState } from "react"
import { CheckCircle2, Copy, FileText, Plus, ReceiptText, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { PageError } from "@/components/page-error"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import { useCurrency } from "@/lib/currency-context"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"

type Payable = {
  id: string
  description: string
  kind: "BANK" | "CONVENIO"
  digitableLine: string
  amount: number
  dueDate: string
  status: "PENDING" | "PAID" | "CANCELLED"
  paidAt: string | null
  paidTransactionId: string | null
  daysToDue: number
  overdue: boolean
}

type PayablesResponse = {
  summary: { pendingCount: number; pendingAmount: number; overdueCount: number; dueIn7DaysCount: number }
  results: Payable[]
}

type Preview = {
  kind: "BANK" | "CONVENIO"
  digitableLine: string
  amount: number | null
  dueDate: string | null
  issuer: string
}

type Draft = { code: string; description: string; dueDate: string; amount: string; preview: Preview | null }
const EMPTY_DRAFT: Draft = { code: "", description: "", dueDate: "", amount: "", preview: null }

function dueLabel(payable: Payable) {
  if (payable.status === "PAID") return payable.paidTransactionId ? "Pago (conferido no banco)" : "Pago (marcado à mão)"
  if (payable.overdue) return `Venceu há ${-payable.daysToDue} dia(s)`
  if (payable.daysToDue === 0) return "Vence hoje"
  return `Vence em ${payable.daysToDue} dia(s)`
}

/** Linha digitável agrupada como o banco imprime, para conferir de olho. */
function formatLine(line: string) {
  if (line.length === 47) {
    return `${line.slice(0, 5)}.${line.slice(5, 10)} ${line.slice(10, 15)}.${line.slice(15, 21)} ${line.slice(21, 26)}.${line.slice(26, 32)} ${line[32]} ${line.slice(33)}`
  }
  return line.match(/.{1,12}/g)?.join(" ") ?? line
}

async function readError(res: Response) {
  const payload = await res.json().catch(() => null)
  return payload?.error?.message ?? "Não foi possível concluir"
}

export default function PayablesPage() {
  const { format } = useCurrency()
  const { data, loading, error, refetch } = useApi<PayablesResponse>("/api/domain/payables")
  const [draft, setDraft] = useState<Draft | null>(null)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const pending = useMemo(() => (data?.results ?? []).filter((row) => row.status === "PENDING"), [data])
  const paid = useMemo(() => (data?.results ?? []).filter((row) => row.status === "PAID"), [data])

  async function readCode(code: string) {
    if (!draft) return
    setReading(true)
    try {
      const res = await fetch("/api/domain/payables/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) throw new Error(await readError(res))
      const { results } = (await res.json()) as { results: Preview }
      setDraft({ ...draft, code, preview: results })
    } catch (err) {
      setDraft({ ...draft, code, preview: null })
      toast.error(err instanceof Error ? err.message : "Código inválido")
    } finally {
      setReading(false)
    }
  }

  async function readPdf(file: File) {
    if (!draft) return
    setReading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/domain/payables/parse", { method: "POST", body: form })
      if (!res.ok) throw new Error(await readError(res))
      const { results } = (await res.json()) as { results: Preview }
      setDraft({ ...draft, code: results.digitableLine, preview: results })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível ler o PDF")
    } finally {
      setReading(false)
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  async function save() {
    if (!draft?.preview) return toast.error("Leia o código do boleto primeiro")
    if (!draft.description.trim()) return toast.error("Dê um nome para a conta")
    const amount = draft.amount ? Number(draft.amount.replace(",", ".")) : null
    setSaving(true)
    try {
      const res = await fetch("/api/domain/payables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: draft.code,
          description: draft.description,
          dueDate: draft.preview.dueDate ? null : draft.dueDate || null,
          amount: draft.preview.amount ? null : amount,
        }),
      })
      if (!res.ok) throw new Error(await readError(res))
      toast.success("Conta cadastrada")
      setDraft(null)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar")
    } finally {
      setSaving(false)
    }
  }

  async function patch(payable: Payable, body: Record<string, unknown>, message: string) {
    const res = await fetch(`/api/domain/payables/${payable.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) return toast.error(await readError(res))
    toast.success(message)
    refetch()
  }

  async function remove(payable: Payable) {
    if (!window.confirm(`Remover "${payable.description}"?`)) return
    const res = await fetch(`/api/domain/payables/${payable.id}`, { method: "DELETE" })
    if (!res.ok) return toast.error(await readError(res))
    toast.success("Conta removida")
    refetch()
  }

  async function copyLine(payable: Payable) {
    try {
      await navigator.clipboard.writeText(payable.digitableLine)
      toast.success("Linha digitável copiada")
    } catch {
      toast.error("Não foi possível copiar")
    }
  }

  if (error) return <PageError message="Erro ao carregar contas a pagar" refetch={refetch} />

  const preview = draft?.preview

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contas a pagar"
        description="Boletos que ainda não foram pagos. A conta sai da lista sozinha quando o pagamento aparece no banco."
        actions={
          <Button onClick={() => setDraft(EMPTY_DRAFT)}>
            <Plus className="mr-2 size-4" />
            Novo boleto
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : pending.length === 0 && paid.length === 0 ? (
        <EmptyState
          className="bg-card/50 py-16"
          icon={ReceiptText}
          title="Nenhum boleto cadastrado"
          description="Cole a linha digitável ou envie o PDF. O app avisa perto do vencimento e reconhece o pagamento pelo Open Finance."
          action={
            <Button onClick={() => setDraft(EMPTY_DRAFT)}>
              <Plus className="mr-2 size-4" />
              Cadastrar boleto
            </Button>
          }
        />
      ) : (
        <>
          {data?.summary && pending.length > 0 ? (
            <div className="surface flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4 text-sm">
              <div>
                <p className="section-eyebrow">A pagar</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums">{format(data.summary.pendingAmount)}</p>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span>{data.summary.pendingCount} boleto(s)</span>
                {data.summary.dueIn7DaysCount > 0 ? (
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {data.summary.dueIn7DaysCount} vence(m) em 7 dias
                  </span>
                ) : null}
                {data.summary.overdueCount > 0 ? (
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    {data.summary.overdueCount} vencido(s)
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {pending.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {pending.map((payable) => (
                <li key={payable.id} className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold" title={payable.description}>
                      {payable.description}
                    </p>
                    <p
                      className={cn(
                        "text-xs font-medium",
                        payable.overdue
                          ? "text-rose-600 dark:text-rose-400"
                          : payable.daysToDue <= 3
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground",
                      )}
                    >
                      {dueLabel(payable)} · {formatDate(payable.dueDate)}
                    </p>
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={payable.digitableLine}>
                      {formatLine(payable.digitableLine)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="text-lg font-bold tabular-nums">{format(payable.amount)}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => void copyLine(payable)}>
                        <Copy className="size-3.5" />
                        Copiar código
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Marcar ${payable.description} como pago`}
                        title="Paguei por fora (dinheiro, conta não conectada)"
                        onClick={() => void patch(payable, { status: "PAID" }, "Marcado como pago")}
                      >
                        <CheckCircle2 className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remover ${payable.description}`}
                        onClick={() => void remove(payable)}
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum boleto pendente.</p>
          )}

          {paid.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="section-eyebrow">Pagos nos últimos 60 dias</h2>
              <ul className="surface divide-y divide-border/60">
                {paid.map((payable) => (
                  <li key={payable.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium" title={payable.description}>
                        {payable.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dueLabel(payable)}
                        {payable.paidAt ? ` em ${formatDate(payable.paidAt)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums text-muted-foreground">{format(payable.amount)}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void patch(payable, { status: "PENDING" }, "Voltou para pendente")}
                      >
                        Desfazer
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => (!open ? setDraft(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo boleto</DialogTitle>
            <DialogDescription>
              Cole a linha digitável (o app do banco deixa copiar) ou envie o PDF. Os dígitos verificadores são conferidos.
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="payable-code">Linha digitável ou código de barras</Label>
                <div className="flex gap-2">
                  <Input
                    id="payable-code"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="34191.23454 67890.123457 …"
                    value={draft.code}
                    onChange={(event) => setDraft({ ...draft, code: event.target.value, preview: null })}
                    onBlur={() => (draft.code.trim() && !draft.preview ? void readCode(draft.code) : undefined)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={reading || !draft.code.trim()}
                    onClick={() => void readCode(draft.code)}
                  >
                    Ler
                  </Button>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void readPdf(file)
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start px-0 text-xs"
                  disabled={reading}
                  onClick={() => fileInput.current?.click()}
                >
                  <FileText className="size-3.5" />
                  {reading ? "Lendo…" : "Enviar PDF do boleto"}
                </Button>
              </div>

              {preview ? (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">
                    {preview.kind === "BANK" ? `Boleto bancário · banco ${preview.issuer}` : "Conta de consumo / tributo"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {preview.amount ? format(preview.amount) : "Sem valor no código"}
                    {" · "}
                    {preview.dueDate ? `vence ${formatDate(preview.dueDate)}` : "sem vencimento no código"}
                  </p>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="payable-description">Nome</Label>
                <Input
                  id="payable-description"
                  placeholder="Condomínio de novembro"
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </div>

              {preview && (!preview.dueDate || !preview.amount) ? (
                <div className="grid grid-cols-2 gap-3">
                  {!preview.dueDate ? (
                    <div className="grid gap-2">
                      <Label htmlFor="payable-due">Vencimento</Label>
                      <Input
                        id="payable-due"
                        type="date"
                        value={draft.dueDate}
                        onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
                      />
                    </div>
                  ) : null}
                  {!preview.amount ? (
                    <div className="grid gap-2">
                      <Label htmlFor="payable-amount">Valor (R$)</Label>
                      <Input
                        id="payable-amount"
                        inputMode="decimal"
                        value={draft.amount}
                        onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={saving || !preview}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
