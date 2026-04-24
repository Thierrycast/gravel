"use client"

import { useApi } from "@/hooks/use-api"
import { 
  Brain, 
  Search, 
  BarChart, 
  Zap,
  Loader2,
  AlertTriangle,
  Lightbulb
} from "lucide-react"
import { BarChart as ReChartsBarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

type Nudge = {
  type: "WARNING" | "INFO" | string
  title: string
  message: string
}

type HiddenSubscription = {
  name: string
  avgGap: number
  avgAmount: number
  occurrences: number
}

type InsightsResponse = {
  nudges?: Nudge[]
  forensics?: {
    benford?: {
      actual: number[]
      ideal: number[]
    }
    hiddenSubs?: HiddenSubscription[]
  }
}

export default function InsightsPage() {
  const { data: insights, loading } = useApi<InsightsResponse>("/api/insights")

  const chartConfig = {
    valor: {
      label: "Seu Perfil",
      color: "hsl(var(--primary))",
    },
    ideal: {
      label: "Ideal",
      color: "hsl(var(--muted-foreground))",
    },
  }

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  const benfordData = insights?.forensics?.benford?.actual.map((v: number, i: number) => ({
    digit: (i + 1).toString(),
    valor: v.toFixed(1),
    ideal: insights?.forensics?.benford?.ideal[i].toFixed(1)
  }))

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI & Forense</h1>
        <p className="text-muted-foreground">Insights automáticos e análise estatística do seu comportamento financeiro.</p>
      </div>

      {/* Nudges Section */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Brain className="size-5 text-primary" />
          Provocações Comportamentais
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {insights?.nudges?.map((nudge, i) => (
            <Alert key={i} variant={nudge.type === "WARNING" ? "destructive" : "default"} className="bg-card/50 backdrop-blur-sm border-2">
              {nudge.type === "WARNING" ? <AlertTriangle className="size-5" /> : <Lightbulb className="size-5 text-amber-500" />}
              <AlertTitle className="font-bold">{nudge.title}</AlertTitle>
              <AlertDescription className="text-sm">
                {nudge.message}
              </AlertDescription>
            </Alert>
          ))}
          {(!insights?.nudges || insights.nudges.length === 0) && (
            <p className="text-sm text-muted-foreground italic py-4">Tudo calmo por aqui. Nenhum alerta comportamental no momento.</p>
          )}
        </div>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Benford's Law */}
        <Card className="border-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart className="size-5 text-primary" />
              <CardTitle>Lei de Benford</CardTitle>
            </div>
            <CardDescription>
              Distribuição do primeiro dígito das suas transações vs. o ideal estatístico. Anomalias podem sugerir dados manipulados ou erros de importação.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
             <ChartContainer config={chartConfig}>
                <ReChartsBarChart data={benfordData}>
                   <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.1} />
                   <XAxis dataKey="digit" fontSize={12} tickLine={false} axisLine={false} />
                   <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                   <ChartTooltip content={<ChartTooltipContent />} />
                   <Bar dataKey="valor" fill="var(--color-valor)" radius={[4, 4, 0, 0]} />
                   <Bar dataKey="ideal" fill="var(--color-ideal)" radius={[4, 4, 0, 0]} fillOpacity={0.3} />
                </ReChartsBarChart>
             </ChartContainer>
          </CardContent>
        </Card>

        {/* Hidden Subscriptions */}
        <Card className="border-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Search className="size-5 text-primary" />
              <CardTitle>Assinaturas Ocultas</CardTitle>
            </div>
            <CardDescription>
              Detectamos gastos repetitivos com variação de valor que podem ser assinaturas não mapeadas.
            </CardDescription>
          </CardHeader>
          <CardContent>
             <div className="space-y-4">
               {insights?.forensics?.hiddenSubs?.length === 0 && (
                 <div className="text-center py-12">
                   <Zap className="size-12 text-muted-foreground/20 mx-auto mb-4" />
                   <p className="text-sm text-muted-foreground">Nenhuma assinatura oculta detectada.</p>
                 </div>
               )}
               {insights?.forensics?.hiddenSubs?.map((sub, i) => (
                 <div key={i} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                    <div className="flex flex-col">
                       <span className="font-medium">{sub.name}</span>
                       <span className="text-xs text-muted-foreground">Ocorre a cada {sub.avgGap.toFixed(0)} dias</span>
                    </div>
                    <div className="text-right">
                       <div className="font-mono font-bold text-pink-400">~R$ {sub.avgAmount.toFixed(2)}</div>
                       <div className="text-[10px] uppercase text-muted-foreground">{sub.occurrences} vezes</div>
                    </div>
                 </div>
               ))}
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
