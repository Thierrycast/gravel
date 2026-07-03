"use client"

import { useState } from "react"
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Target,
  CalendarClock,
  TrendingUp,
  ShieldCheck,
  Plane,
  CreditCard,
  Home,
  AlertCircle,
} from "lucide-react"
import { toast } from "sonner"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useApi } from "@/hooks/use-api"
import { useCurrency } from "@/lib/currency-context"
import { formatDateFull, daysUntilLabel } from "@/lib/format"
import { PageError } from "@/components/page-error"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/ui/empty-state"


interface Goal {
  id: string
  name: string
  emoji: string
  targetAmount: string
  currentAmount: string
  manualAmount?: number
  monthlyContribution: string
  targetDate: string | null
  active: boolean
  matchCategorySlug?: string | null
  matchKeyword?: string | null
  matchDateStart?: string | null
  createdAt: string
  updatedAt: string
}

interface GoalsResponse {
  summary: {
    totalTarget: number
    totalSaved: number
    overallProgress: number
  }
  results: Goal[]
}

interface GoalFormData {
  name: string
  emoji: string
  targetAmount: string
  currentAmount: string
  monthlyContribution: string
  targetDate: string
  matchCategorySlug: string
  matchKeyword: string
  matchDateStart: string
}

type GoalTemplate = {
  icon: typeof ShieldCheck
  label: string
  hint: string
  emoji: string
  color: string
}

const emptyForm: GoalFormData = {
  name: "",
  emoji: "🎯",
  targetAmount: "",
  currentAmount: "",
  monthlyContribution: "",
  targetDate: "",
  matchCategorySlug: "",
  matchKeyword: "",
  matchDateStart: "",
}

const GOAL_TEMPLATES: readonly GoalTemplate[] = [
  {
    icon: ShieldCheck,
    label: "Reserva de emergência",
    hint: "3-6x suas despesas mensais",
    emoji: "🛡️",
    color: "text-emerald-400",
  },
  {
    icon: Plane,
    label: "Viagem dos sonhos",
    hint: "Defina destino e data alvo",
    emoji: "✈️",
    color: "text-blue-400",
  },
  {
    icon: CreditCard,
    label: "Quitar uma dívida",
    hint: "Cartão, empréstimo ou parcela",
    emoji: "💳",
    color: "text-pink-400",
  },
  {
    icon: Home,
    label: "Entrada de imóvel",
    hint: "Geralmente 20% do valor",
    emoji: "🏠",
    color: "text-amber-400",
  },
] as const


function progressColor(pct: number): string {
  if (pct > 75) return "bg-green-500"
  if (pct > 50) return "bg-yellow-500"
  return "bg-primary"
}

function estimatedCompletion(
  target: number,
  current: number,
  monthly: number
): string | null {
  if (monthly <= 0 || current >= target) return null
  const months = Math.ceil((target - current) / monthly)
  const date = new Date()
  date.setMonth(date.getMonth() + months)
  const str = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" }).format(date)
  return str.replace(" de ", "/").replace(".", "")
}

function paceAlert(
  target: number,
  current: number,
  monthly: number,
  targetDate: string | null
): number | null {
  if (!targetDate || current >= target) return null
  const tDate = new Date(targetDate)
  const now = new Date()
  const monthsLeft = (tDate.getFullYear() - now.getFullYear()) * 12 + (tDate.getMonth() - now.getMonth())
  const effectiveMonths = Math.max(monthsLeft, 1)
  const needed = (target - current) / effectiveMonths
  if (monthly < needed) {
    return needed
  }
  return null
}

export default function GoalsPage() {
  const { format } = useCurrency()
  const { data, loading, error, refetch } = useApi<GoalsResponse>("/api/goals")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [form, setForm] = useState<GoalFormData>(emptyForm)
  const [saving, setSaving] = useState(false)

  const [contributeDialogOpen, setContributeDialogOpen] = useState(false)
  const [contributeGoal, setContributeGoal] = useState<Goal | null>(null)
  const [contributeAmount, setContributeAmount] = useState("")
  const [contributing, setContributing] = useState(false)

  const goals = data?.results ?? []
  const summary = data?.summary
  const contributionValue = parseFloat(contributeAmount)
  const contributionCanSave =
    Number.isFinite(contributionValue) && contributionValue > 0
  const contributionCurrent = contributeGoal
    ? parseFloat(contributeGoal.currentAmount) || 0
    : 0
  const contributionTarget = contributeGoal
    ? parseFloat(contributeGoal.targetAmount) || 0
    : 0
  const contributionNext = contributionCurrent + (contributionCanSave ? contributionValue : 0)
  const contributionNextPct =
    contributionTarget > 0 ? Math.min((contributionNext / contributionTarget) * 100, 100) : 0


  function openCreate() {
    setEditingGoal(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openTemplate(template: GoalTemplate) {
    setEditingGoal(null)
    setForm({
      ...emptyForm,
      name: template.label,
      emoji: template.emoji,
    })
    setDialogOpen(true)
  }

  function openEdit(goal: Goal) {
    setEditingGoal(goal)
    setForm({
      name: goal.name,
      emoji: goal.emoji,
      targetAmount: goal.targetAmount,
      currentAmount: String(goal.manualAmount ?? goal.currentAmount),
      monthlyContribution: goal.monthlyContribution,
      targetDate: goal.targetDate ? goal.targetDate.slice(0, 10) : "",
      matchCategorySlug: goal.matchCategorySlug ?? "",
      matchKeyword: goal.matchKeyword ?? "",
      matchDateStart: goal.matchDateStart ? goal.matchDateStart.slice(0, 10) : "",
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        emoji: form.emoji,
        targetAmount: parseFloat(form.targetAmount),
        currentAmount: parseFloat(form.currentAmount) || 0,
        monthlyContribution: parseFloat(form.monthlyContribution) || 0,
        targetDate: form.targetDate || null,
        matchCategorySlug: form.matchCategorySlug || null,
        matchKeyword: form.matchKeyword || null,
        matchDateStart: form.matchDateStart || null,
      }

      if (editingGoal) {
        const res = await fetch(`/api/goals/${editingGoal.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error("Falha ao atualizar meta")
      } else {
        const res = await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error("Falha ao criar meta")
      }

      setDialogOpen(false)
      toast.success(editingGoal ? "Meta atualizada" : "Meta criada")
      refetch()
    } catch {
      toast.error("Erro ao salvar meta")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(goal: Goal) {
    const res = await fetch(`/api/goals/${goal.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Erro ao excluir meta")
      return
    }
    toast.success("Meta removida")
    refetch()
  }


  function openContribute(goal: Goal) {
    setContributeGoal(goal)
    setContributeAmount("")
    setContributeDialogOpen(true)
  }

  async function handleContribute() {
    if (!contributeGoal) return
    setContributing(true)
    try {
      if (!contributionCanSave) return
      const newAmount = parseFloat(contributeGoal.currentAmount) + contributionValue

      const res = await fetch(`/api/goals/${contributeGoal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentAmount: newAmount }),
      })
      if (!res.ok) throw new Error("Falha ao adicionar valor")

      setContributeDialogOpen(false)
      toast.success("Valor adicionado")
      refetch()
    } catch {
      toast.error("Erro ao adicionar valor")
    } finally {
      setContributing(false)
    }
  }


  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return <PageError message="Não foi possível carregar as metas." refetch={refetch} />
  }

  if (goals.length === 0) {
    return (
      <>
        <div className="flex flex-col gap-6">
          <EmptyState
            icon={Target}
            title="Você ainda não tem nenhuma meta"
            description="Defina o que você quer conquistar, planeje seus aportes e acompanhe seu progresso."
            action={
              <Button onClick={openCreate}>
                <Plus className="mr-2 size-4" />
                Nova Meta
              </Button>
            }
          />

          <div className="mx-auto w-full max-w-lg">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Exemplos de metas
            </p>
            <div className="grid grid-cols-2 gap-3">
              {GOAL_TEMPLATES.map(({ icon: Icon, label, hint, color, ...template }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => openTemplate({ icon: Icon, label, hint, color, ...template })}
                  className="flex flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/50"
                >
                  <Icon className={`size-5 ${color}`} />
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <GoalDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          form={form}
          setForm={setForm}
          onSave={handleSave}
          saving={saving}
          isEdit={false}
        />
      </>
    )
  }


  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        title="Metas"
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            Nova Meta
          </Button>
        }
      />

      {/* Summary cards */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Guardado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {format(summary.totalSaved)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total das Metas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {format(summary.totalTarget)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Progresso Geral
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-2xl font-bold">
                {summary.overallProgress.toFixed(1)}%
              </p>
              <Progress
                value={Math.min(summary.overallProgress, 100)}
                className="h-2"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Goal cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {goals.map((goal) => {
          const target = parseFloat(goal.targetAmount)
          const current = parseFloat(goal.currentAmount)
          const monthly = parseFloat(goal.monthlyContribution)
          const pct = target > 0 ? (current / target) * 100 : 0
          const est = estimatedCompletion(target, current, monthly)
          const alertNeeded = paceAlert(target, current, monthly, goal.targetDate)

          return (
            <Card key={goal.id} className="relative">
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                  <span className="text-2xl shrink-0">{goal.emoji}</span>
                  <CardTitle className="text-base truncate">{goal.name}</CardTitle>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(goal)}>
                      <Pencil className="mr-2 size-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(goal)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 size-4" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {format(current)} de {format(target)}
                    </span>
                    <Badge
                      variant={
                        pct >= 100
                          ? "default"
                          : pct > 75
                            ? "default"
                            : "secondary"
                      }
                      className="text-xs"
                    >
                      {pct.toFixed(1)}%
                    </Badge>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${progressColor(pct)}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>

                <Separator />

                {(goal.matchCategorySlug || goal.matchKeyword) && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 text-[10px] text-sky-600 dark:text-sky-400 w-fit">
                    <Target className="size-3" />
                    <span>Aportes automáticos ativos</span>
                  </div>
                )}

                {/* Details */}
                <div className="space-y-2 text-sm">
                  {monthly > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <TrendingUp className="size-4" />
                      <span>
                        {format(monthly)}/mês
                      </span>
                    </div>
                  )}


                  {goal.targetDate && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CalendarClock className="size-4" />
                      <span>
                        {formatDateFull(goal.targetDate)} &middot;{" "}
                        {daysUntilLabel(goal.targetDate)}
                      </span>
                    </div>
                  )}

                  {est && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Target className="size-4" />
                      <span>Previsão: {est}</span>
                    </div>
                  )}

                  {alertNeeded && (
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                      <AlertCircle className="size-4" />
                      <span>Precisa de {format(alertNeeded)}/mês para chegar a tempo</span>
                    </div>
                  )}
                </div>

                {/* Add contribution button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => openContribute(goal)}
                >
                  <Plus className="mr-1 size-4" />
                  Adicionar Valor
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Create/Edit Dialog */}
      <GoalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        onSave={handleSave}
        saving={saving}
        isEdit={!!editingGoal}
      />

      {/* Contribute Dialog */}
      <Dialog open={contributeDialogOpen} onOpenChange={setContributeDialogOpen}>
        <DialogContent className="p-0 sm:max-w-lg">
          <DialogHeader className="border-b bg-muted/30 px-6 py-5">
            <div className="flex items-start gap-3 pr-8">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background text-2xl">
                {contributeGoal?.emoji ?? "🎯"}
              </div>
              <div className="min-w-0">
                <DialogTitle>Adicionar valor</DialogTitle>
                <DialogDescription>
                  {contributeGoal?.name ?? "Meta selecionada"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="goal-contribution">Valor</Label>
              <Input
                id="goal-contribution"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={contributeAmount}
                onChange={(e) => setContributeAmount(e.target.value)}
                className="h-11"
              />
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Depois do aporte</p>
                  <p className="text-xs text-muted-foreground">
                    {format(contributionNext)} de {format(contributionTarget)}
                  </p>
                </div>
                <Badge variant={contributionNextPct >= 100 ? "default" : "secondary"}>
                  {contributionNextPct.toFixed(1)}%
                </Badge>
              </div>
              <Progress value={contributionNextPct} className="h-2" />
            </div>
          </div>

          <DialogFooter className="mx-0 mb-0 rounded-none px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setContributeDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleContribute}
              disabled={contributing || !contributionCanSave}
            >
              {contributing ? "Salvando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}



function GoalDialog({
  open,
  onOpenChange,
  form,
  setForm,
  onSave,
  saving,
  isEdit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  form: GoalFormData
  setForm: React.Dispatch<React.SetStateAction<GoalFormData>>
  onSave: () => void
  saving: boolean
  isEdit: boolean
}) {
  const { format } = useCurrency()

  function update(field: keyof GoalFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const target = parseFloat(form.targetAmount) || 0
  const current = parseFloat(form.currentAmount) || 0
  const monthly = parseFloat(form.monthlyContribution) || 0
  const remaining = Math.max(target - current, 0)
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0
  const est = estimatedCompletion(target, current, monthly)
  const canSave = form.name.trim() !== "" && target > 0

  function applyTemplate(template: GoalTemplate) {
    setForm((prev) => ({
      ...prev,
      name: prev.name || template.label,
      emoji: template.emoji,
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader className="border-b bg-muted/30 px-6 py-5">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background text-2xl">
              {form.emoji || "🎯"}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-xl">
                {isEdit ? "Editar meta" : "Nova meta"}
              </DialogTitle>
              <DialogDescription>
                {isEdit
                  ? "Atualize valores, prazo e aporte mensal."
                  : "Defina alvo, ponto de partida e ritmo de aporte."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-5 px-6 py-5">
          {!isEdit && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GOAL_TEMPLATES.map((template) => {
                const Icon = template.icon
                return (
                  <button
                    key={template.label}
                    type="button"
                    onClick={() => applyTemplate(template)}
                    className="flex min-h-20 flex-col items-start justify-between rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50"
                  >
                    <Icon className={`size-4 ${template.color}`} />
                    <span className="text-xs font-medium leading-tight">
                      {template.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_92px]">
            <div className="space-y-2">
              <Label htmlFor="goal-name">Nome</Label>
              <Input
                id="goal-name"
                placeholder="Ex: Reserva de emergência"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-emoji">Ícone</Label>
              <Input
                id="goal-emoji"
                value={form.emoji}
                onChange={(e) => update("emoji", e.target.value)}
                className="h-11 text-center text-2xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="goal-target">Valor alvo</Label>
              <Input
                id="goal-target"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.targetAmount}
                onChange={(e) => update("targetAmount", e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-current">Valor atual</Label>
              <Input
                id="goal-current"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.currentAmount}
                onChange={(e) => update("currentAmount", e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="goal-monthly">Aporte mensal</Label>
              <Input
                id="goal-monthly"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.monthlyContribution}
                onChange={(e) => update("monthlyContribution", e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-date">Data alvo</Label>
              <Input
                id="goal-date"
                type="date"
                value={form.targetDate}
                onChange={(e) => update("targetDate", e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
              <Target className="size-4" />
              Regras de Aporte Automático (Opcional)
            </h4>
            <p className="text-xs text-muted-foreground">
              Vincule transações reais para atualizar o progresso da meta automaticamente.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="goal-match-category" className="text-xs">Por categoria (slug)</Label>
                <Input
                  id="goal-match-category"
                  placeholder="Ex: investimentos"
                  value={form.matchCategorySlug}
                  onChange={(e) => update("matchCategorySlug", e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="goal-match-keyword" className="text-xs">Por descrição (palavra-chave)</Label>
                <Input
                  id="goal-match-keyword"
                  placeholder="Ex: Tesouro"
                  value={form.matchKeyword}
                  onChange={(e) => update("matchKeyword", e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="goal-match-date" className="text-xs">Ignorar transações antes de</Label>
              <Input
                id="goal-match-date"
                type="date"
                value={form.matchDateStart}
                onChange={(e) => update("matchDateStart", e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Progresso estimado</p>
                <p className="text-xs text-muted-foreground">
                  {remaining > 0 ? `${format(remaining)} restantes` : "Meta completa"}
                </p>
              </div>
              <Badge variant={pct >= 100 ? "default" : "secondary"}>
                {pct.toFixed(1)}%
              </Badge>
            </div>
            <Progress value={pct} className="h-2" />
            <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <span>Guardado: {format(current)}</span>
              <span>Previsão: {est ?? "sem aporte mensal"}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-none px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={saving || !canSave}>
            {saving ? "Salvando..." : isEdit ? "Salvar" : "Criar Meta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
