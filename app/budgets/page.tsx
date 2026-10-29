"use client"

import { useMemo, useState } from "react"
import { Pencil, PiggyBank, Plus, Trash2 } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import { useCurrency } from "@/lib/currency-context"
import { cn } from "@/lib/utils"

type BudgetStatus = "ok" | "warning" | "over"

type Budget = {
  id: string
  categoryId: string
  categoryName: string
  monthlyLimit: number
  alertAtPercent: number
  spent: number
  remaining: number
  percent: number
  projected: number
  status: BudgetStatus
  reason: string | null
}

type BudgetsResponse = {
  summary: { count: number; totalLimit: number; totalSpent: number; over: number; warning: number }
  results: Budget[]
  meta: { month: string; monthElapsedPercent: number }
}

type Category = { id: string; name: string; kind: string }
type CategoriesResponse = { results: Category[] }

const STATUS_STYLE: Record<BudgetStatus, { bar: string; text: string; label: string }> = {
  ok: { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: "No ritmo" },
  warning: { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", label: "Atenção" },
  over: { bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", label: "Estourado" },
}

type FormState = { id: string | null; categoryId: string; monthlyLimit: string; alertAtPercent: string }
const EMPTY_FORM: FormState = { id: null, categoryId: "", monthlyLimit: "", alertAtPercent: "80" }

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    const payload = await res.json().catch(() => null)
    throw new Error(payload?.error?.message ?? "Não foi possível salvar")
  }
}

export default function BudgetsPage() {
  const { format } = useCurrency()
  const { data, loading, error, refetch } = useApi<BudgetsResponse>("/api/domain/budgets")
  const { data: categoriesData } = useApi<CategoriesResponse>("/api/domain/categories", { pageSize: "500" })
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)

  const budgets = useMemo(() => data?.results ?? [], [data])
  const budgetedIds = useMemo(() => new Set(budgets.map((budget) => budget.categoryId)), [budgets])
  const expenseCategories = useMemo(
    () =>
      (categoriesData?.results ?? [])
        .filter((category) => category.kind === "EXPENSE")
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
    [categoriesData],
  )

  async function save() {
    if (!form) return
    const monthlyLimit = Number(form.monthlyLimit.replace(",", "."))
    const alertAtPercent = Number(form.alertAtPercent)
    if (!form.categoryId) return toast.error("Escolha a categoria")
    if (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0) return toast.error("Limite precisa ser maior que zero")
    if (!Number.isInteger(alertAtPercent) || alertAtPercent < 1 || alertAtPercent > 100) {
      return toast.error("Aviso entre 1% e 100%")
    }
    setSaving(true)
    try {
      if (form.id) {
        await send(`/api/domain/budgets/${form.id}`, "PATCH", { monthlyLimit, alertAtPercent })
      } else {
        await send("/api/domain/budgets", "POST", { categoryId: form.categoryId, monthlyLimit, alertAtPercent })
      }
      toast.success("Orçamento salvo")
      setForm(null)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar")
    } finally {
      setSaving(false)
    }
  }

  async function remove(budget: Budget) {
    if (!window.confirm(`Remover o orçamento de ${budget.categoryName}?`)) return
    try {
      await send(`/api/domain/budgets/${budget.id}`, "DELETE")
      toast.success("Orçamento removido")
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível remover")
    }
  }

  if (error) return <PageError message="Erro ao carregar orçamentos" refetch={refetch} />

  const summary = data?.summary
  const elapsed = data?.meta.monthElapsedPercent ?? 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Orçamentos"
        description="Limite mensal por categoria, com o mesmo gasto que o fluxo de caixa mostra. Subcategorias contam na categoria-mãe."
        actions={
          <Button onClick={() => setForm(EMPTY_FORM)}>
            <Plus className="mr-2 size-4" />
            Novo orçamento
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <EmptyState
          className="bg-card/50 py-16"
          icon={PiggyBank}
          title="Nenhum orçamento ainda"
          description="Defina um limite mensal para as categorias que você quer acompanhar. O app avisa ao chegar perto e ao estourar."
          action={
            <Button onClick={() => setForm(EMPTY_FORM)}>
              <Plus className="mr-2 size-4" />
              Criar o primeiro
            </Button>
          }
        />
      ) : (
        <>
          {summary ? (
            <div className="surface flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4 text-sm">
              <div>
                <p className="section-eyebrow">Gasto nas categorias com orçamento</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums">
                  {format(summary.totalSpent)}{" "}
                  <span className="text-base font-medium text-muted-foreground">de {format(summary.totalLimit)}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span>{Math.round(elapsed)}% do mês decorrido</span>
                {summary.warning > 0 ? (
                  <span className="font-semibold text-amber-600 dark:text-amber-400">{summary.warning} em atenção</span>
                ) : null}
                {summary.over > 0 ? (
                  <span className="font-semibold text-rose-600 dark:text-rose-400">{summary.over} estourado(s)</span>
                ) : null}
              </div>
            </div>
          ) : null}

          <ul className="grid gap-3 md:grid-cols-2">
            {budgets.map((budget) => {
              const style = STATUS_STYLE[budget.status]
              return (
                <li key={budget.id} className="surface flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold" title={budget.categoryName}>
                        {budget.categoryName}
                      </p>
                      <p className={cn("text-xs font-medium", style.text)}>
                        {style.label}
                        {budget.reason ? ` · ${budget.reason}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Editar orçamento de ${budget.categoryName}`}
                        onClick={() =>
                          setForm({
                            id: budget.id,
                            categoryId: budget.categoryId,
                            monthlyLimit: String(budget.monthlyLimit),
                            alertAtPercent: String(budget.alertAtPercent),
                          })
                        }
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remover orçamento de ${budget.categoryName}`}
                        onClick={() => void remove(budget)}
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>

                  <div
                    className="relative h-2 w-full overflow-hidden rounded-full bg-muted/50"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, Math.round(budget.percent))}
                    aria-label={`${Math.round(budget.percent)}% do limite`}
                  >
                    <div
                      className={cn("h-full rounded-full transition-all", style.bar)}
                      style={{ width: `${Math.min(100, budget.percent)}%` }}
                    />
                    {/* Marca do quanto do mês já passou: gasto à frente dela = ritmo alto. */}
                    <div
                      className="absolute inset-y-0 w-px bg-foreground/40"
                      style={{ left: `${Math.min(100, elapsed)}%` }}
                      aria-hidden
                    />
                  </div>

                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                    <span className="tabular-nums">
                      <span className="font-semibold">{format(budget.spent)}</span>
                      <span className="text-muted-foreground"> de {format(budget.monthlyLimit)}</span>
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {budget.remaining >= 0
                        ? `Restam ${format(budget.remaining)}`
                        : `${format(-budget.remaining)} acima`}
                      {" · "}projeção {format(budget.projected)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <Dialog open={form !== null} onOpenChange={(open) => (!open ? setForm(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar orçamento" : "Novo orçamento"}</DialogTitle>
            <DialogDescription>
              O limite vale por mês. O aviso chega uma vez ao cruzar o percentual escolhido e outra ao estourar.
            </DialogDescription>
          </DialogHeader>
          {form ? (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="budget-category">Categoria</Label>
                <Select
                  value={form.categoryId}
                  onValueChange={(categoryId) => setForm({ ...form, categoryId })}
                  disabled={Boolean(form.id)}
                >
                  <SelectTrigger id="budget-category">
                    <SelectValue placeholder="Escolha a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseCategories.map((category) => (
                      <SelectItem
                        key={category.id}
                        value={category.id}
                        disabled={!form.id && budgetedIds.has(category.id)}
                      >
                        {category.name}
                        {!form.id && budgetedIds.has(category.id) ? " (já tem orçamento)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="budget-limit">Limite mensal (R$)</Label>
                  <Input
                    id="budget-limit"
                    inputMode="decimal"
                    placeholder="800,00"
                    value={form.monthlyLimit}
                    onChange={(event) => setForm({ ...form, monthlyLimit: event.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="budget-alert">Avisar em (%)</Label>
                  <Input
                    id="budget-alert"
                    inputMode="numeric"
                    value={form.alertAtPercent}
                    onChange={(event) => setForm({ ...form, alertAtPercent: event.target.value })}
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
