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
} from "lucide-react"
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Goal {
  id: string
  name: string
  emoji: string
  targetAmount: string
  currentAmount: string
  monthlyContribution: string
  targetDate: string | null
  active: boolean
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
}

const emptyForm: GoalFormData = {
  name: "",
  emoji: "\uD83C\uDFAF",
  targetAmount: "",
  currentAmount: "",
  monthlyContribution: "",
  targetDate: "",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  return formatDateFull(date)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GoalsPage() {
  const { format } = useCurrency()
  const { data, loading, refetch } = useApi<GoalsResponse>("/api/goals")

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

  // --- Dialog handlers ---

  function openCreate() {
    setEditingGoal(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(goal: Goal) {
    setEditingGoal(goal)
    setForm({
      name: goal.name,
      emoji: goal.emoji,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      monthlyContribution: goal.monthlyContribution,
      targetDate: goal.targetDate ? goal.targetDate.slice(0, 10) : "",
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
      }

      if (editingGoal) {
        await fetch(`/api/goals/${editingGoal.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } else {
        await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }

      setDialogOpen(false)
      refetch()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(goal: Goal) {
    await fetch(`/api/goals/${goal.id}`, { method: "DELETE" })
    refetch()
  }

  // --- Contribute handlers ---

  function openContribute(goal: Goal) {
    setContributeGoal(goal)
    setContributeAmount("")
    setContributeDialogOpen(true)
  }

  async function handleContribute() {
    if (!contributeGoal) return
    setContributing(true)
    try {
      const newAmount =
        parseFloat(contributeGoal.currentAmount) +
        (parseFloat(contributeAmount) || 0)

      await fetch(`/api/goals/${contributeGoal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentAmount: newAmount }),
      })

      setContributeDialogOpen(false)
      refetch()
    } finally {
      setContributing(false)
    }
  }

  // --- Loading ---

  if (loading) {
    return (
      <div className="space-y-6 p-6">
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

  // --- Empty state ---

  if (goals.length === 0) {
    return (
      <>
        <div className="flex h-[70vh] flex-col items-center justify-center gap-4 p-6">
          <div className="flex size-20 items-center justify-center rounded-full bg-muted">
            <Target className="size-10 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">Nenhuma meta ainda</h2>
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            Crie sua primeira meta financeira e acompanhe seu progresso ate
            alcanca-la.
          </p>
          <Button onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            Nova Meta
          </Button>
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

  // --- Main render ---

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Metas</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          Nova Meta
        </Button>
      </div>

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

                {/* Details */}
                <div className="space-y-2 text-sm">
                  {monthly > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <TrendingUp className="size-4" />
                      <span>
                        {format(monthly)}/mes
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
                      <span>Conclusao estimada: {est}</span>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Adicionar Valor{" "}
              {contributeGoal && (
                <span>
                  — {contributeGoal.emoji} {contributeGoal.name}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Informe o valor que deseja adicionar a esta meta.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Valor (R$)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={contributeAmount}
                onChange={(e) => setContributeAmount(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setContributeDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleContribute}
              disabled={contributing || !contributeAmount}
            >
              {contributing ? "Salvando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// GoalDialog sub-component
// ---------------------------------------------------------------------------

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
  function update(field: keyof GoalFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const canSave = form.name.trim() !== "" && parseFloat(form.targetAmount) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Meta" : "Nova Meta"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atualize as informacoes da sua meta."
              : "Preencha os dados para criar uma nova meta financeira."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-[1fr_80px] gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome</label>
              <Input
                placeholder="Ex: Viagem, Carro novo..."
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Emoji</label>
              <Input
                value={form.emoji}
                onChange={(e) => update("emoji", e.target.value)}
                className="text-center text-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Valor Alvo (R$)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.targetAmount}
                onChange={(e) => update("targetAmount", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Valor Atual (R$)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.currentAmount}
                onChange={(e) => update("currentAmount", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Aporte Mensal (R$)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.monthlyContribution}
                onChange={(e) => update("monthlyContribution", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Data Alvo</label>
              <Input
                type="date"
                value={form.targetDate}
                onChange={(e) => update("targetDate", e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
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
