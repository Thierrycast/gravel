"use client"

import { useState } from "react"
import { toast } from "sonner"
import { 
  Sparkles, 
  Users, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Phone,
  ArrowUpRight,
  Calculator,
  Calendar as CalendarIcon,
  Loader2,
  Info
} from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { useApi } from "@/hooks/use-api"
import { Separator } from "@/components/ui/separator"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"

export default function ScenariosPage() {
  const { data: scenarios, refetch: refetchScenarios, loading: loadingScenarios } = useApi<any[]>("/api/scenarios")
  const { data: lends, refetch: refetchLends, loading: loadingLends } = useApi<any[]>("/api/lends")
  
  const [activeTab, setActiveTab] = useState("scenarios")
  const [creatingScenario, setCreatingScenario] = useState(false)
  const [creatingLend, setCreatingLend] = useState(false)

  // Scenario Form
  const [scenarioForm, setScenarioForm] = useState({
    title: "",
    amount: "",
    date: new Date(),
    isRecurring: false,
  })

  // Lend Form
  const [lendForm, setLendForm] = useState({
    friendName: "",
    friendPhone: "",
    amount: "",
    dueDate: new Date(),
    description: "",
  })

  async function handleAddScenario() {
    if (!scenarioForm.title || !scenarioForm.amount) return
    try {
      const res = await fetch("/api/scenarios", {
        method: "POST",
        body: JSON.stringify(scenarioForm),
      })
      if (!res.ok) throw new Error()
      toast.success("Cenário adicionado!")
      setCreatingScenario(false)
      setScenarioForm({ title: "", amount: "", date: new Date(), isRecurring: false })
      refetchScenarios()
    } catch {
      toast.error("Erro ao adicionar cenário")
    }
  }

  async function handleDeleteScenario(id: string) {
    try {
      await fetch(`/api/scenarios?id=${id}`, { method: "DELETE" })
      toast.success("Cenário removido")
      refetchScenarios()
    } catch {
      toast.error("Erro ao remover")
    }
  }

  async function handleAddLend() {
    if (!lendForm.friendName || !lendForm.amount) return
    try {
      const res = await fetch("/api/lends", {
        method: "POST",
        body: JSON.stringify(lendForm),
      })
      if (!res.ok) throw new Error()
      toast.success("Empréstimo registrado!")
      setCreatingLend(false)
      setLendForm({ friendName: "", friendPhone: "", amount: "", dueDate: new Date(), description: "" })
      refetchLends()
    } catch {
      toast.error("Erro ao registrar")
    }
  }

  async function handleMarkLendAsPaid(id: string) {
    try {
      await fetch("/api/lends", {
        method: "PATCH",
        body: JSON.stringify({ id, status: "PAID" }),
      })
      toast.success("Marcado como pago!")
      refetchLends()
    } catch {
      toast.error("Erro ao atualizar")
    }
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val)
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Motor de Cenários</h1>
        <p className="text-muted-foreground">Simule o futuro e gerencie dinheiro a receber de terceiros.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-8">
          <TabsTrigger value="scenarios" className="gap-2">
            <Sparkles className="size-4" />
            Cenários Futuristas
          </TabsTrigger>
          <TabsTrigger value="lends" className="gap-2">
            <Users className="size-4" />
            Cofre de Amigos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scenarios" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-1 h-fit">
              <CardHeader>
                <CardTitle>Nova Simulação</CardTitle>
                <CardDescription>Crie eventos hipotéticos para ver o impacto no seu saldo futuro.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Título do Evento</Label>
                  <Input 
                    placeholder="Ex: Compra de Carro" 
                    value={scenarioForm.title}
                    onChange={(e) => setScenarioForm({ ...scenarioForm, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor</Label>
                  <Input 
                    type="number" 
                    placeholder="0.00" 
                    value={scenarioForm.amount}
                    onChange={(e) => setScenarioForm({ ...scenarioForm, amount: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground">Valores negativos = gastos, positivos = ganhos.</p>
                </div>
                <div className="space-y-2">
                  <Label>Data do Evento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !scenarioForm.date && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {scenarioForm.date ? format(scenarioForm.date, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={scenarioForm.date}
                        onSelect={(date) => setScenarioForm({ ...scenarioForm, date: date || new Date() })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <Button className="w-full gap-2" onClick={handleAddScenario}>
                  <Plus className="size-4" />
                  Adicionar Simulação
                </Button>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Cenários Ativos</CardTitle>
                <CardDescription>Estes eventos aparecem como uma linha pontilhada no gráfico de projeção.</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingScenarios ? (
                  <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>
                ) : (
                  <div className="space-y-4">
                    {scenarios?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhum cenário simulado ainda.</p>}
                    {scenarios?.map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                        <div className="flex flex-col">
                          <span className="font-medium">{s.title}</span>
                          <span className="text-xs text-muted-foreground">{format(new Date(s.date), "dd MMM yyyy", { locale: ptBR })}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={cn("font-mono font-bold", s.amount < 0 ? "text-red-400" : "text-emerald-400")}>
                            {formatCurrency(s.amount)}
                          </span>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteScenario(s.id)}>
                            <Trash2 className="size-4 text-muted-foreground hover:text-red-400" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="lends" className="space-y-6">
           <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-1 h-fit border-amber-500/20">
              <CardHeader>
                <CardTitle className="text-amber-500 flex items-center gap-2">
                  <Calculator className="size-5" />
                  Registrar Dívida
                </CardTitle>
                <CardDescription>Dinheiro que você emprestou ou comprou para alguém no seu cartão.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome do Amigo</Label>
                  <Input 
                    placeholder="João Silva" 
                    value={lendForm.friendName}
                    onChange={(e) => setLendForm({ ...lendForm, friendName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor</Label>
                  <Input 
                    type="number" 
                    placeholder="0.00" 
                    value={lendForm.amount}
                    onChange={(e) => setLendForm({ ...lendForm, amount: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data Prevista (Recebimento)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {lendForm.dueDate ? format(lendForm.dueDate, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={lendForm.dueDate}
                        onSelect={(date) => setLendForm({ ...lendForm, dueDate: date || new Date() })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Descrição / Motivo</Label>
                  <Input 
                    placeholder="Ex: Almoço, Compra Amazon" 
                    value={lendForm.description}
                    onChange={(e) => setLendForm({ ...lendForm, description: e.target.value })}
                  />
                </div>
                <Button className="w-full gap-2 bg-amber-600 hover:bg-amber-700" onClick={handleAddLend}>
                  <Users className="size-4" />
                  Registrar no Cofre
                </Button>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Pendências de Amigos</CardTitle>
                <CardDescription>Controle quem te deve e quando devem pagar. Dívidas pendentes podem abater faturas.</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingLends ? (
                  <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>
                ) : (
                  <div className="space-y-4">
                    {lends?.filter(l => l.status === "PENDING").length === 0 && (
                      <div className="text-center py-12 border-2 border-dashed rounded-xl border-muted/20">
                         <CheckCircle2 className="size-12 text-emerald-500/20 mx-auto mb-4" />
                         <p className="text-sm text-muted-foreground">Tudo em dia! Nenhum amigo devendo por enquanto.</p>
                      </div>
                    )}
                    {lends?.filter(l => l.status === "PENDING").map((l) => (
                      <div key={l.id} className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl bg-amber-500/5 border-amber-500/10 hover:border-amber-500/30 transition-all">
                        <div className="flex items-start gap-4">
                          <div className="size-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 font-bold">
                            {l.friendName.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold">{l.friendName}</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Info className="size-3" /> {l.description || "Sem descrição"}
                            </span>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] text-amber-600 font-mono flex items-center gap-1 uppercase tracking-tighter">
                                <Clock className="size-3" /> Vence em {format(new Date(l.dueDate), "dd/MM")}
                              </span>
                              {l.friendPhone && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Phone className="size-3" /> {l.friendPhone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-4 sm:mt-0 ml-14 sm:ml-0">
                          <span className="text-lg font-mono font-bold text-amber-500">
                            {formatCurrency(l.amount)}
                          </span>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={() => handleMarkLendAsPaid(l.id)}>
                            Pago
                          </Button>
                        </div>
                      </div>
                    ))}

                    {lends?.some(l => l.status === "PAID") && (
                      <>
                        <Separator className="my-6" />
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Histórico Recente (Pagos)</h4>
                        <div className="space-y-2 opacity-60">
                           {lends.filter(l => l.status === "PAID").slice(0, 5).map(l => (
                              <div key={l.id} className="flex items-center justify-between p-2 border rounded-lg text-sm italic grayscale">
                                 <span>{l.friendName}</span>
                                 <span className="line-through">{formatCurrency(l.amount)}</span>
                              </div>
                           ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
