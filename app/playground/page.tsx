"use client"

import { useState, useEffect, useMemo } from "react"
import { toast } from "sonner"
import {
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  HelpCircle,
  Loader2,
  Calendar,
  Share2,
} from "lucide-react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useApi } from "@/hooks/use-api"
import { useCurrency } from "@/lib/currency-context"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/page-header"

type ProjectionMonth = {
  month: number
  year: number
  label: string
  income: number
  recurringExpenses: number
  cardBills?: number
  installments: number
  variableExpenses: number
  scenarioAdjustments?: number
  projected: number
  balance: number
  startingBalance: number
}

type ScenarioEvent = {
  id: string
  title: string
  amount: number
  date: string
  isRecurring: boolean
}

type ProjectionPayload = {
  summary: {
    averageMonthlyIncome: number
    averageMonthlyExpenses: number
    projectedSavings: number
  }
  months: ProjectionMonth[]
}

type HypothesisType = "INCOME" | "EXPENSE"
type HypothesisFrequency = "ONCE" | "MONTHLY" | "INSTALLMENTS"

type Hypothesis = {
  id: string
  title: string
  type: HypothesisType
  amount: number
  frequency: HypothesisFrequency
  startYear: number
  startMonth: number
  installmentsCount?: number
  notes?: string
  active: boolean
}

export default function PlaygroundPage() {
  const { format: formatCurrency } = useCurrency()
  
  // Carrega os 12 meses de projeção base
  const { data: baseProjection, loading: loadingProjection } = useApi<ProjectionPayload>("/api/projection?months=12")
  const { data: scenarios, refetch: refetchScenarios } =
    useApi<ScenarioEvent[]>("/api/scenarios")

  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([])
  
  // Form de nova hipótese
  const [form, setForm] = useState({
    title: "",
    type: "EXPENSE" as HypothesisType,
    amount: "",
    frequency: "ONCE" as HypothesisFrequency,
    startMonth: new Date().getMonth() + 1,
    startYear: new Date().getFullYear(),
    installmentsCount: "6",
    notes: "",
  })

  // Carrega hipóteses do localStorage no client-side
  useEffect(() => {
    const saved = localStorage.getItem("gravel_playground_hypotheses")
    if (saved) {
      try {
        setHypotheses(JSON.parse(saved))
      } catch {}
    }
  }, [])

  // Salva hipóteses no localStorage sempre que alterado
  const saveHypotheses = (newHypotheses: Hypothesis[]) => {
    setHypotheses(newHypotheses)
    localStorage.setItem("gravel_playground_hypotheses", JSON.stringify(newHypotheses))
  }

  // Adiciona hipótese
  const addHypothesis = () => {
    if (!form.title || !form.amount) {
      toast.error("Preencha o título e o valor da simulação.")
      return
    }

    const value = parseFloat(form.amount)
    if (isNaN(value) || value <= 0) {
      toast.error("O valor deve ser um número positivo.")
      return
    }

    const newHypothesis: Hypothesis = {
      id: crypto.randomUUID(),
      title: form.title,
      type: form.type,
      amount: value,
      frequency: form.frequency,
      startYear: Number(form.startYear),
      startMonth: Number(form.startMonth),
      installmentsCount: form.frequency === "INSTALLMENTS" ? Number(form.installmentsCount) : undefined,
      notes: form.notes || undefined,
      active: true,
    }

    const updated = [...hypotheses, newHypothesis]
    saveHypotheses(updated)
    setForm({
      ...form,
      title: "",
      amount: "",
      notes: "",
    })
    toast.success("Hipótese adicionada! (A mesa de testes está fervendo)")
  }

  // Remove hipótese
  const removeHypothesis = (id: string) => {
    const updated = hypotheses.filter((h) => h.id !== id)
    saveHypotheses(updated)
    toast.success("Hipótese removida.")
  }

  // Alterna ativação de hipótese
  const toggleHypothesis = (id: string) => {
    const updated = hypotheses.map((h) => (h.id === id ? { ...h, active: !h.active } : h))
    saveHypotheses(updated)
  }

  // Exportar para cenário real (POST para a API de cenários)
  const exportToScenario = async (hypothesis: Hypothesis) => {
    try {
      const amountMultiplier = hypothesis.type === "EXPENSE" ? -1 : 1
      const date = new Date(hypothesis.startYear, hypothesis.startMonth - 1, 1)

      const response = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `[Simulação] ${hypothesis.title}`,
          amount: hypothesis.amount * amountMultiplier,
          date: date.toISOString(),
          isRecurring: hypothesis.frequency === "MONTHLY",
        }),
      })

      if (!response.ok) throw new Error()
      toast.success("Exportado! A hipótese virou um cenário oficial na Projeção.")
      refetchScenarios()
    } catch {
      toast.error("Erro ao exportar cenário.")
    }
  }

  // Remove um cenário salvo (afeta a projeção real)
  const deleteScenario = async (id: string) => {
    try {
      const res = await fetch(`/api/scenarios?id=${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Cenário removido da projeção.")
      refetchScenarios()
    } catch {
      toast.error("Erro ao remover cenário.")
    }
  }

  // Recalcula as projeções mes a mes aplicando as hipóteses ativas
  const simulatedData = useMemo(() => {
    if (!baseProjection?.months) return []

    let simulatedBalance = baseProjection.months[0]?.startingBalance ?? 0
    const activeHypotheses = hypotheses.filter((h) => h.active)

    return baseProjection.months.map((m) => {
      // Variação real do mês (usa `projected` da API para incluir todos os
      // componentes: faturas de cartão, cenários salvos, ajustes do mês).
      const baseNet = m.projected
      let scenarioAdjustments = 0

      // Processa cada hipótese aplicável para este mês
      for (const h of activeHypotheses) {
        const sign = h.type === "INCOME" ? 1 : -1
        
        // Verifica se a hipótese atinge este período
        const startDiffMonths = (m.year - h.startYear) * 12 + (m.month - h.startMonth)

        if (h.frequency === "ONCE") {
          if (m.year === h.startYear && m.month === h.startMonth) {
            scenarioAdjustments += h.amount * sign
          }
        } else if (h.frequency === "MONTHLY") {
          if (startDiffMonths >= 0) {
            scenarioAdjustments += h.amount * sign
          }
        } else if (h.frequency === "INSTALLMENTS") {
          const limit = h.installmentsCount ?? 1
          if (startDiffMonths >= 0 && startDiffMonths < limit) {
            scenarioAdjustments += (h.amount / limit) * sign
          }
        }
      }

      const startingBalance = simulatedBalance
      const projectedNet = baseNet + scenarioAdjustments
      simulatedBalance = startingBalance + projectedNet

      return {
        label: m.label,
        "Saldo Real": m.balance,
        "Saldo Simulado": Number(simulatedBalance.toFixed(2)),
        Variação: Number(projectedNet.toFixed(2)),
      }
    })
  }, [baseProjection, hypotheses])

  // Métricas finais para exibição
  const metrics = useMemo(() => {
    if (simulatedData.length === 0 || !baseProjection?.months) {
      return { finalReal: 0, finalSimulated: 0, difference: 0, lowestSimulated: 0 }
    }

    const finalReal = baseProjection.months[baseProjection.months.length - 1]?.balance ?? 0
    const finalSimulated = simulatedData[simulatedData.length - 1]["Saldo Simulado"]
    const difference = finalSimulated - finalReal
    const lowestSimulated = Math.min(...simulatedData.map((d) => d["Saldo Simulado"]))

    return { finalReal, finalSimulated, difference, lowestSimulated }
  }, [simulatedData, baseProjection])

  // Opções de ano
  const years = useMemo(() => {
    const current = new Date().getFullYear()
    return [current, current + 1, current + 2]
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Playground Financeiro"
        description="Teste hipóteses (&quot;e se eu comprar/receber X?&quot;) sobre a projeção real. Hipóteses ficam só neste navegador; ao exportar, viram cenários salvos que passam a afetar as Projeções."
      />

      {loadingProjection ? (
        <div className="flex flex-col items-center justify-center p-24 gap-4">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando projeção de dados base...</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Coluna Lateral: Form e Hipóteses */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  Nova Hipótese
                </CardTitle>
                <CardDescription>Simule compras, reajustes de contratos ou bônus extras.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Tipo de Hipótese */}
                <div className="flex items-center justify-between gap-2 p-1.5 bg-muted rounded-lg">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, type: "EXPENSE" })}
                    className={cn(
                      "flex-1 text-xs py-1.5 rounded-md font-medium transition-all flex items-center justify-center gap-1",
                      form.type === "EXPENSE"
                        ? "bg-background text-red-500 shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <TrendingDown className="size-3.5" />
                    Nova Despesa
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, type: "INCOME" })}
                    className={cn(
                      "flex-1 text-xs py-1.5 rounded-md font-medium transition-all flex items-center justify-center gap-1",
                      form.type === "INCOME"
                        ? "bg-background text-emerald-500 shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <TrendingUp className="size-3.5" />
                    Nova Receita
                  </button>
                </div>

                {/* Título e Valor */}
                <div className="space-y-2">
                  <Label htmlFor="hyp-title" className="text-xs">Título da Hipótese</Label>
                  <Input
                    id="hyp-title"
                    placeholder={form.type === "EXPENSE" ? "Ex: Troca de Carro" : "Ex: Venda de Notebook"}
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hyp-amount" className="text-xs">Valor Total (ou Mensal)</Label>
                  <Input
                    id="hyp-amount"
                    type="number"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="h-9 text-xs font-mono"
                  />
                </div>

                {/* Frequência */}
                <div className="space-y-2">
                  <Label className="text-xs">Frequência</Label>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-muted rounded-lg text-center text-[10px] font-medium">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, frequency: "ONCE" })}
                      className={cn("py-1 rounded", form.frequency === "ONCE" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground")}
                    >
                      Única
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, frequency: "MONTHLY" })}
                      className={cn("py-1 rounded", form.frequency === "MONTHLY" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground")}
                    >
                      Mensal
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, frequency: "INSTALLMENTS" })}
                      className={cn("py-1 rounded", form.frequency === "INSTALLMENTS" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground")}
                    >
                      Parcelada
                    </button>
                  </div>
                </div>

                {/* Se for parcelado, número de parcelas */}
                {form.frequency === "INSTALLMENTS" && (
                  <div className="space-y-2">
                    <Label htmlFor="hyp-installments" className="text-xs">Quantidade de Meses (Parcelas)</Label>
                    <Input
                      id="hyp-installments"
                      type="number"
                      value={form.installmentsCount}
                      onChange={(e) => setForm({ ...form, installmentsCount: e.target.value })}
                      className="h-9 text-xs"
                    />
                  </div>
                )}

                {/* Período de Início */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="hyp-month" className="text-xs">Mês Inicial</Label>
                    <select
                      id="hyp-month"
                      value={form.startMonth}
                      onChange={(e) => setForm({ ...form, startMonth: Number(e.target.value) })}
                      className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-xs transition-colors"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                          {new Date(2026, m - 1, 1).toLocaleString("pt-BR", { month: "long" })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="hyp-year" className="text-xs">Ano Inicial</Label>
                    <select
                      id="hyp-year"
                      value={form.startYear}
                      onChange={(e) => setForm({ ...form, startYear: Number(e.target.value) })}
                      className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-xs transition-colors"
                    >
                      {years.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <Button className="w-full h-9 gap-1 text-xs mt-2" onClick={addHypothesis}>
                  <Plus className="size-3.5" /> Simular Hipótese
                </Button>
              </CardContent>
            </Card>

            {/* Listagem das Hipóteses Locais */}
            <Card className="flex-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <HelpCircle className="size-4 text-muted-foreground" />
                  Hipóteses Ativas ({hypotheses.length})
                </CardTitle>
                <CardDescription>Simulando no navegador (salvo localmente).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {hypotheses.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    Nenhuma hipótese adicionada. Monte um cenário e veja o impacto ao lado!
                  </p>
                )}
                {hypotheses.map((h) => (
                  <div
                    key={h.id}
                    className={cn(
                      "flex flex-col gap-2 p-3 rounded-lg border transition-colors",
                      h.active
                        ? h.type === "INCOME"
                          ? "bg-emerald-500/5 border-emerald-500/10"
                          : "bg-red-500/5 border-red-500/10"
                        : "bg-muted/40 border-muted opacity-60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <div
                          className={cn(
                            "size-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                            h.type === "INCOME" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                          )}
                        >
                          {h.type === "INCOME" ? (
                            <ArrowUpRight className="size-3.5" />
                          ) : (
                            <ArrowDownRight className="size-3.5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-xs text-foreground block truncate" title={h.title}>
                            {h.title}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Calendar className="size-3" />
                            {new Date(2026, h.startMonth - 1, 1).toLocaleString("pt-BR", { month: "short" })}/{h.startYear}
                            {h.frequency === "MONTHLY" && " (Mensal)"}
                            {h.frequency === "INSTALLMENTS" && ` (${h.installmentsCount}x)`}
                          </span>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "font-mono text-xs font-bold shrink-0",
                          h.type === "INCOME" ? "text-emerald-500" : "text-red-400"
                        )}
                      >
                        {h.type === "INCOME" ? "+" : "-"}
                        {formatCurrency(h.amount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-muted/50 pt-2 mt-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          className="scale-75"
                          checked={h.active}
                          onCheckedChange={() => toggleHypothesis(h.id)}
                        />
                        <span className="text-[9px] font-medium text-muted-foreground uppercase">
                          {h.active ? "Ativo" : "Pausado"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-sky-500"
                          onClick={() => exportToScenario(h)}
                          title="Exportar como Cenário Real no banco de dados"
                        >
                          <Share2 className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-red-400"
                          onClick={() => removeHypothesis(h.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Cenários salvos (persistidos — afetam a projeção real) */}
            <Card className="border-sky-500/15">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Share2 className="size-4 text-sky-500" />
                  Cenários salvos ({scenarios?.length ?? 0})
                </CardTitle>
                <CardDescription>
                  Gravados no banco e considerados na página de Projeções.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(scenarios?.length ?? 0) === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Nenhum cenário salvo. Exporte uma hipótese com o botão{" "}
                    <Share2 className="size-3 inline" /> para consolidá-la.
                  </p>
                )}
                {scenarios?.map((scenario) => (
                  <div
                    key={scenario.id}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">
                        {scenario.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {scenario.isRecurring ? "Mensal a partir de " : ""}
                        {new Date(scenario.date).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span
                        className={cn(
                          "font-mono text-xs font-bold",
                          scenario.amount < 0 ? "text-red-400" : "text-emerald-400",
                        )}
                      >
                        {formatCurrency(scenario.amount)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-red-400"
                        onClick={() => deleteScenario(scenario.id)}
                        title="Remover cenário da projeção"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Coluna Direita: Gráficos e KPIs comparativos */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* KPIs */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardDescription className="text-[10px] font-semibold uppercase tracking-wider">Final Real</CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <p className="text-base font-bold font-mono">{formatCurrency(metrics.finalReal)}</p>
                </CardContent>
              </Card>

              <Card className="border-sky-500/20 bg-sky-500/5">
                <CardHeader className="p-3 pb-1">
                  <CardDescription className="text-[10px] font-semibold uppercase tracking-wider text-sky-500">Final Simulado</CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <p className="text-base font-bold font-mono text-sky-500">{formatCurrency(metrics.finalSimulated)}</p>
                </CardContent>
              </Card>

              <Card className={cn(metrics.difference >= 0 ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5")}>
                <CardHeader className="p-3 pb-1">
                  <CardDescription className="text-[10px] font-semibold uppercase tracking-wider">Variação Líquida</CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <p className={cn("text-base font-bold font-mono", metrics.difference >= 0 ? "text-emerald-500" : "text-red-400")}>
                    {metrics.difference >= 0 ? "+" : ""}
                    {formatCurrency(metrics.difference)}
                  </p>
                </CardContent>
              </Card>

              <Card className={cn(metrics.lowestSimulated < 0 ? "border-rose-500 bg-rose-500/10 text-rose-500 animate-pulse" : "")}>
                <CardHeader className="p-3 pb-1">
                  <CardDescription className="text-[10px] font-semibold uppercase tracking-wider">Menor Saldo</CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <p className="text-base font-bold font-mono">{formatCurrency(metrics.lowestSimulated)}</p>
                  {metrics.lowestSimulated < 0 && (
                    <span className="text-[9px] font-medium block">Risco de insolvência!</span>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Gráfico */}
            <Card className="flex-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  Evolução do Patrimônio Projetado
                </CardTitle>
                <CardDescription>Comparação de evolução do saldo nos próximos 12 meses com as hipóteses aplicadas.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {simulatedData.length > 0 ? (
                  <div className="h-[320px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={simulatedData}
                        margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--muted-foreground)" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="var(--muted-foreground)" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorSim" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => `R$ ${v / 1000}k`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--background)",
                            borderColor: "var(--border)",
                            borderRadius: "8px",
                            fontSize: "12px",
                            fontFamily: "monospace",
                          }}
                          formatter={(value) => [formatCurrency(Number(value))]}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                        <Area
                          type="monotone"
                          dataKey="Saldo Real"
                          stroke="var(--muted-foreground)"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorReal)"
                        />
                        <Area
                          type="monotone"
                          dataKey="Saldo Simulado"
                          stroke="#0ea5e9"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorSim)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-20">Projeção sem dados.</p>
                )}
              </CardContent>
            </Card>

            {/* Quadro explicativo */}
            <Card>
              <CardContent className="p-4 flex gap-3 text-xs bg-muted/20 text-muted-foreground rounded-xl">
                <Info className="size-4 shrink-0 text-primary mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground">Como funciona a Projeção Simulação?</p>
                  <p className="mt-1 leading-relaxed">
                    O Playground carrega o saldo de contas e projeções reais de despesas fixas, recorrentes e parceladas do seu banco local.
                    Ao adicionar despesas/receitas hipotéticas, recalculamos cumulativamente a variação mês a mês. 
                    Se uma hipótese fizer sentido para sua governança, use o botão <Share2 className="size-3 inline mx-0.5" /> <strong>Exportar</strong> para gravá-la permanentemente no banco como um Cenário de Projeção real.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
