"use client"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { formatDate, daysUntilLabel } from "@/lib/format"
import { useCurrency } from "@/lib/currency-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { PageError } from "@/components/page-error"

interface RecurringIncomeRule {
  id: string
  description: string
  amount: number
  frequency: string
  category: string
  categoryId?: string | null
  nextDate: string
  type: string
  occurrences: number
  lastDate: string | null
  confidence: number
  isManual: boolean
  origin: string
}

interface RecurringIncomeSummary {
  totalMonthlyIncome: number
  count: number
}

interface RecurringIncomeData {
  rules: RecurringIncomeRule[]
  summary: RecurringIncomeSummary
}

interface CategoryOption {
  id: string
  name: string
  kind: string
}

const FREQUENCY_LABEL: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  QUARTERLY: "Trimestral",
  YEARLY: "Anual",
}

// Fator para converter o valor da regra em equivalente mensal.
const MONTHLY_FACTOR: Record<string, number> = {
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  MONTHLY: 1,
  QUARTERLY: 1 / 3,
  YEARLY: 1 / 12,
}

function monthlyEquivalent(rule: RecurringIncomeRule) {
  return Math.abs(rule.amount) * (MONTHLY_FACTOR[rule.frequency] ?? 1)
}

const chartConfig: ChartConfig = {
  income: {
    label: "Receitas Recorrentes",
    color: "#10b981",
  },
}

const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

const MONTH_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

type RuleForm = {
  name: string
  amount: string
  frequency: string
  nextDate: string
  categoryId: string
}

const EMPTY_FORM: RuleForm = {
  name: "",
  amount: "",
  frequency: "MONTHLY",
  nextDate: new Date().toISOString().slice(0, 10),
  categoryId: "",
}

export default function RecurringIncomePage() {
  const { format, formatCompact } = useCurrency()
  const currentMonth = new Date().getMonth()

  const { data, loading, error, refetch } =
    useApi<RecurringIncomeData>("/api/recurring/income")
  const { data: categoriesData } = useApi<{ results: CategoryOption[] }>(
    "/api/domain/categories",
    { pageSize: "200" },
  )

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<RecurringIncomeRule | null>(null)
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const incomeCategories = useMemo(
    () =>
      (categoriesData?.results ?? []).filter(
        (category) => category.kind === "INCOME" || category.kind === "OTHER",
      ),
    [categoriesData],
  )

  const rules = useMemo(() => data?.rules ?? [], [data])
  const monthlyTotal = rules.reduce((sum, r) => sum + monthlyEquivalent(r), 0)

  const chartData = useMemo(() => {
    if (rules.length === 0) return []
    const year = new Date().getFullYear()
    return MONTHS.map((month, index) => {
      const monthStart = new Date(Date.UTC(year, index, 1))
      const monthEnd = new Date(Date.UTC(year, index + 1, 0, 23, 59, 59))
      const income = rules.reduce((sum, rule) => {
        const next = new Date(rule.nextDate)
        switch (rule.frequency) {
          case "WEEKLY":
          case "BIWEEKLY": {
            // Aproximação para o gráfico anual: equivalente mensal.
            return sum + monthlyEquivalent(rule)
          }
          case "QUARTERLY":
          case "YEARLY": {
            const period = rule.frequency === "QUARTERLY" ? 3 : 12
            const delta =
              (monthStart.getUTCFullYear() - next.getUTCFullYear()) * 12 +
              (monthStart.getUTCMonth() - next.getUTCMonth())
            return delta >= 0 && delta % period === 0
              ? sum + Math.abs(rule.amount)
              : sum
          }
          default: {
            const delta =
              (monthStart.getUTCFullYear() - next.getUTCFullYear()) * 12 +
              (monthStart.getUTCMonth() - next.getUTCMonth())
            const occurs = delta >= 0 || (next >= monthStart && next <= monthEnd)
            return occurs ? sum + Math.abs(rule.amount) : sum
          }
        }
      }, 0)
      return { month, income: Math.round(income * 100) / 100 }
    })
  }, [rules])

  function openCreateDialog() {
    setEditingRule(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEditDialog(rule: RecurringIncomeRule) {
    setEditingRule(rule)
    setForm({
      name: rule.description,
      amount: String(Math.abs(rule.amount)),
      frequency: rule.frequency in FREQUENCY_LABEL ? rule.frequency : "MONTHLY",
      nextDate: rule.nextDate?.slice(0, 10) ?? EMPTY_FORM.nextDate,
      categoryId: rule.categoryId ?? "",
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const amount = Number(form.amount.replace(",", "."))
    if (!form.name.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Preencha nome e valor válidos")
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        amount,
        type: "INCOME",
        interval: form.frequency,
        nextDate: form.nextDate,
        categoryId: form.categoryId || null,
      }
      const response = editingRule
        ? await fetch(`/api/recurring/${editingRule.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/recurring", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(body?.error ?? "Erro ao salvar recorrência")
      }
      toast.success(editingRule ? "Receita atualizada" : "Receita criada")
      setDialogOpen(false)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(rule: RecurringIncomeRule) {
    setDeletingId(rule.id)
    try {
      const response = await fetch(`/api/recurring/${rule.id}`, {
        method: "DELETE",
      })
      if (!response.ok) throw new Error("Erro ao excluir recorrência")
      toast.success(
        rule.isManual
          ? "Receita excluída"
          : "Receita detectada descartada — não será recriada",
      )
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir")
    } finally {
      setDeletingId(null)
    }
  }

  if (error) {
    return <PageError message="Erro ao carregar receitas recorrentes" refetch={refetch} />
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Receitas Recorrentes
          </h1>
          <p className="text-muted-foreground">
            Salário, aluguéis e outras entradas previsíveis
          </p>
        </div>
        <Button onClick={openCreateDialog} className="self-start sm:self-auto">
          <Plus data-icon="inline-start" />
          Nova receita
        </Button>
      </div>

      {/* Chart */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Este ano / {new Date().getFullYear()}
          </p>
          <div className="flex items-center gap-2">
            <div className="size-2.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-muted-foreground">Receitas Recorrentes</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          <div className="flex-1 min-w-0">
            <ChartContainer config={chartConfig} className="h-56 w-full">
              <BarChart data={chartData} accessibilityLayer>
                <CartesianGrid vertical={false} strokeOpacity={0.1} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v) => formatCompact(v)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => (
                        <span>Receita: {format(Number(value))}</span>
                      )}
                    />
                  }
                />
                <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>

          {/* Month summary */}
          <div className="w-44 rounded-lg border bg-popover p-4 shrink-0 hidden lg:block">
            <div className="text-sm font-semibold mb-2">{MONTH_FULL[currentMonth]}</div>
            <div className="border-t pt-2 flex justify-between">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-sm font-bold tabular-nums text-emerald-400">
                {format(monthlyTotal)}
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              Equivalente mensal somando todas as periodicidades
            </p>
          </div>
        </div>
      </div>

      {/* Income list */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Receitas Recorrentes ({rules.length})
          </h3>
        </div>

        {rules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-muted/50 p-8 text-center space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Nenhuma receita recorrente</p>
            <p className="text-xs text-muted-foreground/70 max-w-sm mx-auto">
              Receitas com padrão consistente (salário, aluguéis, freelance) são
              detectadas automaticamente do histórico. Você também pode
              cadastrar manualmente.
            </p>
            <Button variant="outline" size="sm" onClick={openCreateDialog}>
              <Plus data-icon="inline-start" />
              Cadastrar receita
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="size-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-lg shrink-0">
                    {rule.description.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{rule.description}</p>
                      <Badge
                        variant="secondary"
                        className="hidden text-[10px] uppercase tracking-wider sm:inline-flex"
                      >
                        {rule.isManual ? "Manual" : "Detectada"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-xs">
                        {FREQUENCY_LABEL[rule.frequency] ?? rule.frequency}
                      </Badge>
                      {rule.nextDate && (
                        <span className="text-xs text-muted-foreground">
                          Pr&oacute;xima: {formatDate(rule.nextDate)} (
                          {daysUntilLabel(rule.nextDate)})
                        </span>
                      )}
                      {rule.category && rule.category !== "Sem categoria" && (
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          · {rule.category}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <div className="text-right mr-2">
                    <p className="text-sm font-bold tabular-nums text-emerald-400">
                      {format(Math.abs(rule.amount))}
                    </p>
                    {rule.frequency !== "MONTHLY" && (
                      <p className="text-[11px] tabular-nums text-muted-foreground">
                        ≈ {format(monthlyEquivalent(rule))}/mês
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Editar receita"
                    onClick={() => openEditDialog(rule)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Excluir receita"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={deletingId === rule.id}
                    onClick={() => handleDelete(rule)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "Editar receita recorrente" : "Nova receita recorrente"}
            </DialogTitle>
            <DialogDescription>
              {editingRule && !editingRule.isManual
                ? "Editar uma receita detectada a converte em manual — a detecção automática não vai mais sobrescrevê-la."
                : "Cadastre entradas previsíveis para projeções e relatórios."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="income-name">Nome</Label>
              <Input
                id="income-name"
                placeholder="ex: Salário, Aluguel recebido"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="income-amount">Valor (R$)</Label>
                <Input
                  id="income-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Periodicidade</Label>
                <Select
                  value={form.frequency}
                  onValueChange={(value) => setForm({ ...form, frequency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQUENCY_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="income-next">Próxima ocorrência</Label>
                <Input
                  id="income-next"
                  type="date"
                  value={form.nextDate}
                  onChange={(e) => setForm({ ...form, nextDate: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Categoria (opcional)</Label>
                <Select
                  value={form.categoryId || "none"}
                  onValueChange={(value) =>
                    setForm({ ...form, categoryId: value === "none" ? "" : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sem categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {incomeCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editingRule ? "Salvar alterações" : "Criar receita"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
