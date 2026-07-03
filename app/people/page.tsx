
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
  Plus,
  Receipt,
  Link as LinkIcon
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

// TYPES
type Person = {
  id: string
  name: string
  phone: string | null
  notes: string | null
  metrics: {
    pendingTotal: number
    settledTotal: number
    openItems: number
    totalItems: number
  }
}

type SplitShare = {
  id: string
  personId: string
  personName: string
  amount: number
  status: "PENDING" | "PAID"
  paidAt: string | null
}

type Split = {
  id: string
  title: string
  totalAmount: number
  date: string | null
  domainTransactionId: string | null
  notes: string | null
  pendingTotal: number
  shares: SplitShare[]
}

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
  
  // API HOOKS
  const { data: peopleData, refetch: refetchPeople, loading: loadingPeople } = useApi<{ results: Person[] }>("/api/people")
  const { data: splitsData, refetch: refetchSplits, loading: loadingSplits } = useApi<{ results: Split[] }>("/api/splits")
  const { data: lends, refetch: refetchLends, loading: loadingLends } = useApi<Lend[]>("/api/lends")
  const { data: transactionsData } = useApi<{ results: TransactionOption[] }>(
    "/api/domain/transactions",
    { page: "1", pageSize: "100" },
  )

  const people = useMemo(() => peopleData?.results ?? [], [peopleData])
  const splits = useMemo(() => splitsData?.results ?? [], [splitsData])

  const outflowTransactions = useMemo(
    () => transactionsData?.results?.filter((t) => t.direction === "OUTFLOW") ?? [],
    [transactionsData],
  )
  const inflowTransactions = useMemo(
    () => transactionsData?.results?.filter((t) => t.direction === "INFLOW") ?? [],
    [transactionsData],
  )

  // HEADER METRICS
  const totalPending = people.reduce((sum, p) => sum + Number(p.metrics.pendingTotal || 0), 0)
  const peopleCount = people.length
  const openSplitsCount = splits.filter(s => Number(s.pendingTotal) > 0).length

  // PEOPLE STATE
  const [personForm, setPersonForm] = useState({ name: "", phone: "", notes: "" })
  const [isPersonDialogOpen, setIsPersonDialogOpen] = useState(false)
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null)
  
  async function savePerson() {
    if (!personForm.name) {
      toast.error("Nome é obrigatório")
      return
    }
    try {
      const url = editingPersonId ? `/api/people/${editingPersonId}` : "/api/people"
      const method = editingPersonId ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(personForm)
      })
      if (res.status === 409) {
        toast.error("Nome de pessoa já existe")
        return
      }
      if (!res.ok) throw new Error()
      
      toast.success(editingPersonId ? "Pessoa atualizada" : "Pessoa criada")
      setIsPersonDialogOpen(false)
      setEditingPersonId(null)
      setPersonForm({ name: "", phone: "", notes: "" })
      refetchPeople()
    } catch {
      toast.error("Erro ao salvar pessoa")
    }
  }

  function openEditPerson(p: Person) {
    setEditingPersonId(p.id)
    setPersonForm({ name: p.name, phone: p.phone || "", notes: p.notes || "" })
    setIsPersonDialogOpen(true)
  }

  async function deletePerson(id: string) {
    try {
      const res = await fetch(`/api/people/${id}`, { method: "DELETE" })
      if (!res.ok) {
        if (res.status === 409) {
          const body = await res.json()
          toast.error(body.error?.message || "Não é possível excluir pessoa com pendências")
          return
        }
        throw new Error()
      }
      toast.success("Pessoa removida")
      refetchPeople()
    } catch {
      toast.error("Erro ao remover pessoa")
    }
  }

  // SPLITS STATE
  const [isSplitDialogOpen, setIsSplitDialogOpen] = useState(false)
  const [splitForm, setSplitForm] = useState({
    title: "",
    totalAmount: "",
    date: new Date(),
    domainTransactionId: "",
    notes: "",
    shares: [] as { personId: string; amount: string }[]
  })

  const handleSplitTxSelect = (txId: string) => {
    if (txId === "__none__") {
      setSplitForm(f => ({ ...f, domainTransactionId: "", title: "", totalAmount: "" }))
      return
    }
    const tx = outflowTransactions.find(t => t.id === txId)
    if (tx) {
      setSplitForm(f => ({
        ...f,
        domainTransactionId: txId,
        title: tx.description,
        totalAmount: String(Math.abs(tx.amount)),
        date: tx.date ? new Date(tx.date) : (tx.occurredAt ? new Date(tx.occurredAt) : new Date())
      }))
    }
  }

  const addShare = (personId: string) => {
    if (!personId) return
    if (splitForm.shares.some(s => s.personId === personId)) return
    setSplitForm(f => ({
      ...f,
      shares: [...f.shares, { personId, amount: "" }]
    }))
  }

  const updateShareAmount = (personId: string, amount: string) => {
    setSplitForm(f => ({
      ...f,
      shares: f.shares.map(s => s.personId === personId ? { ...s, amount } : s)
    }))
  }

  const removeShare = (personId: string) => {
    setSplitForm(f => ({
      ...f,
      shares: f.shares.filter(s => s.personId !== personId)
    }))
  }

  const splitEqually = () => {
    const total = parseFloat(splitForm.totalAmount) || 0
    if (total <= 0) return
    const n = splitForm.shares.length + 1 // +1 for the user
    const equalPart = (total / n).toFixed(2)
    setSplitForm(f => ({
      ...f,
      shares: f.shares.map(s => ({ ...s, amount: equalPart }))
    }))
  }

  const sumShares = splitForm.shares.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0)
  const totalAmountNum = parseFloat(splitForm.totalAmount) || 0
  const userPart = totalAmountNum - sumShares
  const isSharesInvalid = userPart < -0.01 // allow small float precision issues

  async function saveSplit() {
    if (!splitForm.title || !splitForm.totalAmount) {
      toast.error("Preencha título e valor total")
      return
    }
    if (isSharesInvalid) {
      toast.error("A soma das partes excede o total")
      return
    }
    
    try {
      const payload = {
        ...splitForm,
        totalAmount: parseFloat(splitForm.totalAmount),
        shares: splitForm.shares.map(s => ({ ...s, amount: parseFloat(s.amount) || 0 }))
      }
      
      const res = await fetch("/api/splits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        if (res.status === 400) toast.error("Partes inválidas")
        throw new Error()
      }
      toast.success("Divisão criada")
      setIsSplitDialogOpen(false)
      setSplitForm({ title: "", totalAmount: "", date: new Date(), domainTransactionId: "", notes: "", shares: [] })
      refetchSplits()
      refetchPeople()
    } catch {
      toast.error("Erro ao criar divisão")
    }
  }

  async function updateSplitShareStatus(splitId: string, shareId: string, status: "PAID" | "PENDING") {
    try {
      const res = await fetch(`/api/splits/${splitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId, status })
      })
      if (!res.ok) throw new Error()
      toast.success(status === "PAID" ? "Recebimento confirmado" : "Desfeito")
      refetchSplits()
      refetchPeople()
    } catch {
      toast.error("Erro ao atualizar")
    }
  }

  async function deleteSplit(splitId: string) {
    try {
      const res = await fetch(`/api/splits/${splitId}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Divisão removida")
      refetchSplits()
      refetchPeople()
    } catch {
      toast.error("Erro ao remover divisão")
    }
  }

  // LENDS STATE
  const [payingLendId, setPayingLendId] = useState<string | null>(null)
  const [selectedInflowTxId, setSelectedInflowTxId] = useState("")
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<string[]>([])
  const [editingLendId, setEditingLendId] = useState<string | null>(null)
  
  const [lendForm, setLendForm] = useState({
    personId: "",
    amount: "",
    dueDate: new Date(),
    description: "",
    domainTransactionId: "",
  })

  const [editLendForm, setEditLendForm] = useState({
    personId: "",
    friendName: "",
    amount: "",
    description: "",
    friendPhone: "",
  })

  const pendingLends = useMemo(
    () => lends?.filter((lend) => lend.status === "PENDING") ?? [],
    [lends],
  )

  async function registerLend() {
    if (!lendForm.personId || !lendForm.amount) {
      toast.error("Selecione uma pessoa e informe o valor")
      return
    }
    const person = people.find(p => p.id === lendForm.personId)
    try {
      const res = await fetch("/api/lends", {
        method: "POST",
        body: JSON.stringify({
          ...lendForm,
          friendName: person?.name || "Desconhecido", // fallback para compatibilidade
          friendPhone: person?.phone || ""
        }),
      })
      if (!res.ok) throw new Error()
      toast.success("Empréstimo registrado")
      setLendForm({
        personId: "",
        amount: "",
        dueDate: new Date(),
        description: "",
        domainTransactionId: "",
      })
      refetchLends()
      refetchPeople()
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
      refetchPeople()
    } catch {
      toast.error("Erro ao atualizar")
    }
  }

  async function confirmSuggestedPayment(lend: Lend, transaction: TransactionOption) {
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
      toast.success("Recebimento confirmado")
      refetchLends()
      refetchPeople()
    } catch {
      toast.error("Erro ao confirmar")
    }
  }

  async function deleteLend(id: string) {
    try {
      const res = await fetch(`/api/lends?id=${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Pendência removida")
      refetchLends()
      refetchPeople()
    } catch {
      toast.error("Erro ao remover")
    }
  }

  function startEditLend(lend: Lend) {
    setEditingLendId(lend.id)
    const person = people.find(p => p.name === lend.friendName)
    setEditLendForm({
      personId: person?.id || "",
      friendName: lend.friendName,
      amount: String(lend.amount),
      description: lend.description ?? "",
      friendPhone: lend.friendPhone ?? "",
    })
  }

  async function saveEditLend(id: string) {
    try {
      const person = people.find(p => p.id === editLendForm.personId)
      const res = await fetch("/api/lends", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          personId: editLendForm.personId || null,
          friendName: person?.name || editLendForm.friendName,
          amount: parseFloat(editLendForm.amount),
          description: editLendForm.description || null,
          friendPhone: person?.phone || editLendForm.friendPhone || null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success("Pendência atualizada")
      setEditingLendId(null)
      refetchLends()
      refetchPeople()
    } catch {
      toast.error("Erro ao atualizar")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Pessoas</h1>
          <p className="text-muted-foreground">Hub de pessoas, empréstimos e contas divididas</p>
        </div>
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
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Divisões abertas</p>
            <p className="font-bold tabular-nums">{openSplitsCount}</p>
          </div>
        </div>
      </div>

      <Dialog open={isPersonDialogOpen} onOpenChange={setIsPersonDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPersonId ? "Editar Pessoa" : "Nova Pessoa"}</DialogTitle>
            <DialogDescription>Cadastre alguém para associar a divisões ou empréstimos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input 
                value={personForm.name} 
                onChange={e => setPersonForm({...personForm, name: e.target.value})} 
                placeholder="Ex: João Silva" 
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone (opcional)</Label>
              <Input 
                value={personForm.phone} 
                onChange={e => setPersonForm({...personForm, phone: e.target.value})} 
                placeholder="Ex: 11999999999" 
              />
            </div>
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Input 
                value={personForm.notes} 
                onChange={e => setPersonForm({...personForm, notes: e.target.value})} 
                placeholder="Ex: Amigo da faculdade" 
              />
            </div>
            <Button onClick={savePerson} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between mt-2">
        <h2 className="text-xl font-semibold">Pessoas cadastradas</h2>
        <Button onClick={() => {
          setEditingPersonId(null)
          setPersonForm({ name: "", phone: "", notes: "" })
          setIsPersonDialogOpen(true)
        }} size="sm">
          <Plus className="mr-2 size-4" /> Nova Pessoa
        </Button>
      </div>
      
      {loadingPeople ? (
        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>
      ) : people.length === 0 ? (
        <EmptyState icon={Users} title="Nenhuma pessoa" description="Cadastre pessoas para começar a dividir contas." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {people.map(person => (
            <Card key={person.id} className="relative overflow-hidden group">
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-lg">{person.name}</h3>
                    {person.phone && (
                      <a 
                        href={`https://wa.me/${person.phone.replace(/\D/g, "")}`}
                        target="_blank" 
                        rel="noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-1"
                      >
                        <Phone className="size-3" /> {person.phone}
                      </a>
                    )}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditPerson(person)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir {person.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. A exclusão falhará se houver pendências ativas.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletePerson(person.id)}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <div className="flex gap-4 text-sm mt-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">A Receber</p>
                    <p className="font-medium text-sky-500">{formatCurrency(person.metrics.pendingTotal)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Itens abertos</p>
                    <p className="font-medium">{person.metrics.openItems}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Separator />

      <div className="flex items-center justify-between mt-2">
        <h2 className="text-xl font-semibold">Divisões de Conta</h2>
        <Dialog open={isSplitDialogOpen} onOpenChange={setIsSplitDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Receipt className="mr-2 size-4" /> Dividir conta
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Nova Divisão</DialogTitle>
              <DialogDescription>Crie uma divisão de despesa com várias pessoas.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Atrelar a uma transação (opcional)</Label>
                <Select value={splitForm.domainTransactionId || "__none__"} onValueChange={handleSplitTxSelect}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Selecione uma transação..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Criar sem atrelar</SelectItem>
                    {outflowTransactions.slice(0, 15).map(tx => (
                      <SelectItem key={tx.id} value={tx.id}>
                        {formatCurrency(Math.abs(tx.amount))} — {tx.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input 
                    value={splitForm.title} 
                    onChange={e => setSplitForm({...splitForm, title: e.target.value})}
                    placeholder="Ex: Churrasco"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor Total</Label>
                  <Input 
                    type="number"
                    value={splitForm.totalAmount} 
                    onChange={e => setSplitForm({...splitForm, totalAmount: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <Label>Participantes</Label>
                  {splitForm.shares.length > 0 && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={splitEqually}>
                      Dividir igualmente
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Select onValueChange={addShare} value="">
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Adicionar pessoa..." />
                    </SelectTrigger>
                    <SelectContent>
                      {people.filter(p => !splitForm.shares.some(s => s.personId === p.id)).map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={() => {
                    setEditingPersonId(null)
                    setPersonForm({ name: "", phone: "", notes: "" })
                    setIsPersonDialogOpen(true)
                  }} title="Nova pessoa">
                    <Plus className="size-4" />
                  </Button>
                </div>
                
                {splitForm.shares.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {splitForm.shares.map(share => {
                      const person = people.find(p => p.id === share.personId)
                      return (
                        <div key={share.personId} className="flex items-center gap-2">
                          <span className="text-sm font-medium flex-1 truncate">{person?.name}</span>
                          <Input 
                            type="number" 
                            className="w-24 text-right" 
                            placeholder="0.00"
                            value={share.amount}
                            onChange={e => updateShareAmount(share.personId, e.target.value)}
                          />
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => removeShare(share.personId)}>
                            <X className="size-4" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
                
                <div className={cn(
                  "p-3 mt-4 rounded-lg flex justify-between items-center",
                  isSharesInvalid ? "bg-destructive/10 text-destructive" : "bg-muted"
                )}>
                  <span className="text-sm font-semibold">Sua parte:</span>
                  <span className="font-bold tabular-nums">
                    {formatCurrency(userPart)}
                  </span>
                </div>
                {isSharesInvalid && (
                  <p className="text-xs text-destructive mt-1">A soma das partes excede o total.</p>
                )}
              </div>
              
              <Button onClick={saveSplit} className="w-full mt-4">Criar Divisão</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loadingSplits ? (
         <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>
      ) : splits.length === 0 ? (
        <EmptyState icon={Receipt} title="Nenhuma divisão" description="Você não possui divisões de conta ativas." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {splits.map(split => (
            <Card key={split.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {split.title}
                      {split.domainTransactionId && (
                        <a href="/transactions" title="Ver transação">
                          <LinkIcon className="size-3.5 text-muted-foreground hover:text-primary transition-colors" />
                        </a>
                      )}
                    </CardTitle>
                    <CardDescription>{formatDateSafe(split.date, "dd/MM/yyyy")} • Total: {formatCurrency(split.totalAmount)}</CardDescription>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir divisão?</AlertDialogTitle>
                        <AlertDialogDescription>Isto removerá a divisão para todos os participantes.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteSplit(split.id)}>
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardHeader>
              <CardContent className="pt-2 flex-1 flex flex-col gap-2">
                {split.shares.map(share => (
                  <div key={share.id} className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/50">
                    <div>
                      <p className="font-medium">{share.personName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{formatCurrency(share.amount)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {share.status === "PAID" ? (
                        <>
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded">PAGO</span>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => updateSplitShareStatus(split.id, share.id, "PENDING")}>
                            Desfazer
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-[10px] font-semibold text-amber-600 bg-amber-500/10 px-2 py-1 rounded">PENDENTE</span>
                          <Button size="sm" className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700" onClick={() => updateSplitShareStatus(split.id, share.id, "PAID")}>
                            Recebi
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Separator />

      <h2 className="text-xl font-semibold mt-2">Empréstimos Individuais</h2>
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HandCoins className="size-5 text-sky-500" />
              Registrar empréstimo
            </CardTitle>
            <CardDescription>
              Dinheiro que você emprestou ou comprou para alguém.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Atrelar a despesa (opcional)</Label>
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
                      {formatCurrency(Math.abs(tx.amount))} — {tx.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pessoa</Label>
              <div className="flex gap-2">
                <Select value={lendForm.personId} onValueChange={v => setLendForm({ ...lendForm, personId: v })}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {people.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => {
                  setEditingPersonId(null)
                  setPersonForm({ name: "", phone: "", notes: "" })
                  setIsPersonDialogOpen(true)
                }}>
                  <Plus className="size-4" />
                </Button>
              </div>
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
              <Label>Vencimento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {lendForm.dueDate ? formatDateSafe(lendForm.dueDate, "PPP") : <span>Selecione</span>}
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
              <Label>Descrição</Label>
              <Input
                placeholder="Ex: Almoço"
                value={lendForm.description}
                onChange={(e) => setLendForm({ ...lendForm, description: e.target.value })}
              />
            </div>
            <Button className="w-full gap-2" onClick={registerLend}>
              <Users className="size-4" /> Registrar
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Pendências</CardTitle>
            <CardDescription>Acompanhe os empréstimos ativos.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingLends ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>
            ) : (
              <div className="space-y-4">
                {pendingLends.length === 0 && (
                  <EmptyState icon={CheckCircle2} title="Tudo em dia!" description="Nenhum empréstimo pendente." />
                )}
                {pendingLends.map((lend) => {
                  const linkedTx = outflowTransactions.find(t => t.id === lend.domainTransactionId)
                  const suggestedPayment = dismissedSuggestionIds.includes(lend.id) ? null : (lend.suggestedInflowTransactions?.[0] ?? null)
                  return (
                    <div key={lend.id} className="group flex flex-col p-4 border rounded-xl bg-sky-500/5 border-sky-500/10 hover:border-sky-500/30 transition-all">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="size-10 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-500 font-bold shrink-0">
                            {lend.friendName.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold truncate">{lend.friendName}</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Info className="size-3 shrink-0" /> <span className="truncate">{lend.description || "Sem descrição"}</span>
                            </span>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="text-xs text-amber-600 font-mono flex items-center gap-1 uppercase tracking-tighter shrink-0">
                                <Clock className="size-3" /> Vence em {formatDateSafe(lend.dueDate, "dd/MM")}
                              </span>
                              {lend.friendPhone && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                                  <Phone className="size-3" /> {lend.friendPhone}
                                </span>
                              )}
                            </div>
                            {linkedTx && (
                              <div className="mt-1.5 text-[10px] text-sky-600/80 bg-sky-500/5 px-2 py-0.5 rounded-md border border-sky-500/15 w-fit font-medium">
                                Origem: {linkedTx.description} ({formatCurrency(Math.abs(linkedTx.amount))})
                              </div>
                            )}
                            {suggestedPayment && (
                              <div className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-2 text-xs">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="min-w-0">
                                    <p className="font-semibold text-emerald-600">Possível recebimento</p>
                                    <p className="truncate text-muted-foreground">
                                      {formatCurrency(suggestedPayment.amount)} - {suggestedPayment.description}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 gap-2">
                                    <Button size="sm" className="h-7 bg-emerald-600 text-xs hover:bg-emerald-700" onClick={() => confirmSuggestedPayment(lend, suggestedPayment)}>
                                      Recebi
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDismissedSuggestionIds(c => [...c, lend.id])}>
                                      Não
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
                          {payingLendId !== lend.id && editingLendId !== lend.id && (
                            <div className="flex items-center gap-1">
                              <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-foreground" onClick={() => startEditLend(lend)}>
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => deleteLend(lend.id)}>
                                <Trash2 className="size-3.5" />
                              </Button>
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs" onClick={() => { setPayingLendId(lend.id); setSelectedInflowTxId("") }}>
                                Pago
                              </Button>
                            </div>
                          )}
                          {editingLendId === lend.id && (
                            <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" onClick={() => setEditingLendId(null)}>
                              <X className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {editingLendId === lend.id && (
                        <div className="mt-3 border-t pt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Pessoa</Label>
                              <Select value={editLendForm.personId} onValueChange={v => setEditLendForm({ ...editLendForm, personId: v })}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Opcional" /></SelectTrigger>
                                <SelectContent>
                                  {people.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Valor</Label>
                              <Input type="number" className="h-7 text-xs" value={editLendForm.amount} onChange={e => setEditLendForm({...editLendForm, amount: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Descrição</Label>
                              <Input className="h-7 text-xs" value={editLendForm.description} onChange={e => setEditLendForm({...editLendForm, description: e.target.value})} />
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingLendId(null)}>Cancelar</Button>
                            <Button size="sm" className="h-7 text-xs" onClick={() => saveEditLend(lend.id)}>Salvar</Button>
                          </div>
                        </div>
                      )}

                      {payingLendId === lend.id && (
                        <div className="mt-3 border-t pt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-medium">Atrelar recebimento?</Label>
                            <Select value={selectedInflowTxId || "__manual__"} onValueChange={v => setSelectedInflowTxId(v === "__manual__" ? "" : v)}>
                              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__manual__">Marcar manualmente</SelectItem>
                                {inflowTransactions.map(tx => (
                                  <SelectItem key={tx.id} value={tx.id}>
                                    {formatCurrency(tx.amount)} — {tx.description}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPayingLendId(null)}>Cancelar</Button>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs" onClick={() => handleConfirmPayment(lend.id)}>
                              Confirmar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                {lends?.some(l => l.status === "PAID") && (
                  <>
                    <Separator className="my-6" />
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Histórico (pagos)</h4>
                    <div className="space-y-2 opacity-70">
                      {lends.filter(l => l.status === "PAID").slice(0, 5).map(lend => {
                        const linkedInflowTx = inflowTransactions.find(t => t.id === lend.inflowTransactionId)
                        return (
                          <div key={lend.id} className="flex flex-col p-2.5 border rounded-lg text-xs bg-muted/20 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{lend.friendName}</span>
                              <span className="line-through font-mono">{formatCurrency(lend.amount)}</span>
                            </div>
                            {linkedInflowTx && (
                              <p className="text-[10px] text-emerald-600/90 font-medium">
                                Recebido via: {linkedInflowTx.description}
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
