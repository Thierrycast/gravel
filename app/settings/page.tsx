"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  RefreshCw,
  DollarSign,
  Save,
  Loader2,
  Shield,
  Palette,
  Plus,
  X,
  Tags,
  Sparkles,
  CreditCard,
  Database,
  AlertTriangle,
  Download,
  Bell,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { ThemePicker } from "@/components/theme-picker"
import { useApi } from "@/hooks/use-api"
import { useCurrency } from "@/lib/currency-context"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/page-header"
import type {
  Account,
  AccountsResponse,
  CardStatementsResponse,
} from "@/lib/types/api"

type SettingsFormData = {
  monthlySalary: number
  effectiveMonthlySalary?: number
  showFutureSalary: boolean
  showFutureAccounts: boolean
  syncIntervalHours: number
  syncLookbackDays: number
  vaultEnabled: boolean
  vaultMasterPassword: string
  vaultInactivityMin: number
  notificationWebhookUrl: string
  telegramBotToken: string
  telegramChatId: string
  anthropicApiKey: string
}

type SalarySource = {
  pattern: string
  lastAmount: number | null
  lastDate: string | null
  lastDescription: string | null
}

type SalarySuggestion = {
  pattern: string
  averageAmount: number
  lastDate: string
  lastDescription: string
}

type SettingsResponse = SettingsFormData & {
  salaryPatterns?: string[]
  salarySources?: SalarySource[]
  salarySuggestions?: SalarySuggestion[]
  notificationWebhookUrl?: string | null
  telegramBotToken?: string | null
  telegramChatId?: string | null
  anthropicApiKey?: string | null
}

const SECTIONS = [
  { id: "financeiro", label: "Financeiro", icon: DollarSign },
  { id: "cartoes", label: "Cartões", icon: CreditCard },
  { id: "salario", label: "Fontes de salário", icon: Tags },
  { id: "aparencia", label: "Aparência", icon: Palette },
  { id: "seguranca", label: "Segurança", icon: Shield },
  { id: "notificacoes", label: "Notificações", icon: Bell },
  { id: "sincronizacao", label: "Sincronização", icon: RefreshCw },
  { id: "dados", label: "Dados e cache", icon: Database },
] as const

function isCreditCard(account: Account) {
  return account.kind === "CARD" || account.kind === "CREDIT"
}

function CardBillingRow({
  account,
  suggestedDueDay,
  onSaved,
}: {
  account: Account
  suggestedDueDay: number | null
  onSaved: () => void
}) {
  const [closingDay, setClosingDay] = useState(
    account.billingClosingDay != null ? String(account.billingClosingDay) : "",
  )
  const [dueDay, setDueDay] = useState(
    account.billingDueDay != null ? String(account.billingDueDay) : "",
  )
  const [saving, setSaving] = useState(false)

  const configured = account.billingClosingDay != null

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/domain/accounts/${account.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingClosingDay: closingDay ? Number(closingDay) : null,
          billingDueDay: dueDay ? Number(dueDay) : null,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? "Erro ao salvar")
      }
      toast.success(`Ciclo de fatura de ${account.name} atualizado`)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {account.name}
          {!configured && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
              <AlertTriangle className="size-3" />
              Não configurado
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {account.institution || "Cartão de crédito"}
        </p>
      </div>
      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Fechamento</Label>
          <Input
            type="number"
            min="1"
            max="31"
            placeholder="dia"
            className="h-8 w-20 text-sm"
            value={closingDay}
            onChange={(e) => setClosingDay(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Vencimento</Label>
          <Input
            type="number"
            min="1"
            max="31"
            placeholder={suggestedDueDay ? `${suggestedDueDay}?` : "dia"}
            className="h-8 w-20 text-sm"
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
          />
        </div>
        <Button size="sm" className="h-8" disabled={saving} onClick={save}>
          {saving ? "..." : "Salvar"}
        </Button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { data: settings, loading, refetch } =
    useApi<SettingsResponse>("/api/settings")
  const { data: accountsData, refetch: refetchAccounts } =
    useApi<AccountsResponse>("/api/domain/accounts")
  const { data: statementsData, refetch: refetchStatements } =
    useApi<CardStatementsResponse>("/api/domain/cards/statements")
  const queryClient = useQueryClient()
  const { format } = useCurrency()
  const [saving, setSaving] = useState(false)
  const [clearingCache, setClearingCache] = useState(false)
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id)
  const [salaryPatterns, setSalaryPatterns] = useState<string[]>([])
  const [salarySources, setSalarySources] = useState<SalarySource[]>([])
  const [salarySuggestions, setSalarySuggestions] = useState<SalarySuggestion[]>([])
  const [newPattern, setNewPattern] = useState("")
  const [formData, setFormData] = useState<SettingsFormData>({
    monthlySalary: 0,
    showFutureSalary: false,
    showFutureAccounts: true,
    syncIntervalHours: 6,
    syncLookbackDays: 30,
    vaultEnabled: false,
    vaultMasterPassword: "",
    vaultInactivityMin: 0,
    notificationWebhookUrl: "",
    telegramBotToken: "",
    telegramChatId: "",
    anthropicApiKey: "",
  })

  const creditCards = (accountsData?.results ?? []).filter(isCreditCard)
  const suggestedDueDayByAccount = new Map(
    (statementsData?.results ?? []).map((entry) => [
      entry.accountId,
      entry.suggestedDueDay,
    ]),
  )

  useEffect(() => {
    if (settings) {
      setFormData({
        monthlySalary: settings.monthlySalary,
        showFutureSalary: settings.showFutureSalary,
        showFutureAccounts: settings.showFutureAccounts,
        syncIntervalHours: settings.syncIntervalHours,
        syncLookbackDays: settings.syncLookbackDays,
        vaultEnabled: settings.vaultEnabled,
        vaultMasterPassword: settings.vaultMasterPassword || "",
        vaultInactivityMin: settings.vaultInactivityMin,
        notificationWebhookUrl: settings.notificationWebhookUrl || "",
        telegramBotToken: settings.telegramBotToken || "",
        telegramChatId: settings.telegramChatId || "",
        anthropicApiKey: settings.anthropicApiKey || "",
      })
      if (Array.isArray(settings.salaryPatterns)) {
        setSalaryPatterns(settings.salaryPatterns)
      }
      if (Array.isArray(settings.salarySources)) {
        setSalarySources(settings.salarySources)
      }
      if (Array.isArray(settings.salarySuggestions)) {
        setSalarySuggestions(settings.salarySuggestions)
      }
    }
  }, [settings])

  async function patchPatterns(updated: string[], successMessage: string) {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salaryPatterns: updated }),
      })
      if (!res.ok) throw new Error("Falha ao salvar padrão")
      toast.success(successMessage)
      void queryClient.invalidateQueries({ queryKey: ["api"] })
      refetch()
      return true
    } catch {
      toast.error("Erro ao atualizar fontes de salário")
      return false
    }
  }

  async function addPattern() {
    const trimmed = newPattern.trim()
    if (!trimmed || salaryPatterns.includes(trimmed)) return
    const ok = await patchPatterns(
      [...salaryPatterns, trimmed],
      `Fonte "${trimmed}" cadastrada`,
    )
    if (ok) setNewPattern("")
  }

  async function acceptSuggestion(pattern: string) {
    if (salaryPatterns.includes(pattern)) return
    await patchPatterns([...salaryPatterns, pattern], `Fonte "${pattern}" ativada`)
  }

  async function removePattern(pattern: string) {
    await patchPatterns(
      salaryPatterns.filter((p) => p !== pattern),
      `Fonte "${pattern}" removida`,
    )
  }

  async function saveSettings() {
    setSaving(true)
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })
      if (!res.ok) throw new Error("Falha ao salvar")
      toast.success("Configurações salvas!")
      void queryClient.invalidateQueries({ queryKey: ["api"] })
      refetch()
    } catch {
      toast.error("Erro ao salvar configurações")
    } finally {
      setSaving(false)
    }
  }

  async function clearLocalCache() {
    setClearingCache(true)
    try {
      window.localStorage.removeItem("gravel-query-cache")
      queryClient.clear()
      if ("caches" in window) {
        const keys = await window.caches.keys()
        await Promise.all(keys.map((key) => window.caches.delete(key)))
      }
      toast.success("Cache local limpo — recarregando…")
      setTimeout(() => window.location.reload(), 800)
    } catch {
      toast.error("Erro ao limpar cache")
      setClearingCache(false)
    }
  }

  function scrollToSection(id: string) {
    setActiveSection(id)
    document.getElementById(`section-${id}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }

  if (loading) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    )
  }

  return (
    // max-w-3xl: formulários de configurações ficam ilegíveis/deformados
    // ocupando a largura total do app em telas grandes.
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="Configurações"
        description="Gerencie as preferências do seu painel financeiro."
      />

      {/* Section navigation */}
      <nav
        aria-label="Seções de configurações"
        className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        {SECTIONS.map((section) => {
          const Icon = section.icon
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => scrollToSection(section.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                activeSection === section.id
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-transparent bg-muted/50 text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {section.label}
            </button>
          )
        })}
      </nav>

      <div className="grid gap-6">
        {/* Financeiro */}
        <Card id="section-financeiro" className="scroll-mt-16">
          <CardHeader>
            <div className="flex items-center gap-2">
              <DollarSign className="size-5 text-primary" />
              <CardTitle>Financeiro</CardTitle>
            </div>
            <CardDescription>Defina parâmetros para cálculos de projeção e patrimônio.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="salary">Salário Mensal Estimado (Líquido)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">R$</span>
                <Input
                  id="salary"
                  type="number"
                  className="pl-9"
                  value={formData.monthlySalary}
                  onChange={(e) => setFormData({ ...formData, monthlySalary: parseFloat(e.target.value) })}
                />
              </div>
              {(!formData.showFutureSalary || formData.monthlySalary <= 0) && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                  A projeção não incluirá salário enquanto houver valor zero ou
                  a opção de projetar salário estiver desligada.
                </p>
              )}
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label>Projetar Salário Futuro</Label>
                <p className="text-xs text-muted-foreground">Incluir receita estimada nos meses futuros do gráfico de patrimônio.</p>
              </div>
              <Switch
                checked={formData.showFutureSalary}
                onCheckedChange={(checked) => setFormData({ ...formData, showFutureSalary: checked })}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label>Projetar Contas Futuras</Label>
                <p className="text-xs text-muted-foreground">Incluir gastos recorrentes, faturas de cartão e parcelas nas projeções.</p>
              </div>
              <Switch
                checked={formData.showFutureAccounts}
                onCheckedChange={(checked) => setFormData({ ...formData, showFutureAccounts: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Cartões */}
        <Card id="section-cartoes" className="scroll-mt-16">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="size-5 text-primary" />
              <CardTitle>Cartões de crédito</CardTitle>
            </div>
            <CardDescription>
              Dia de fechamento e vencimento de cada cartão. Sem esses dados não
              é possível separar a fatura atual das próximas em Faturas,
              Contas e Projeções.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {creditCards.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Nenhum cartão de crédito conectado.
              </p>
            ) : (
              creditCards.map((card) => (
                <CardBillingRow
                  key={card.id}
                  account={card}
                  suggestedDueDay={suggestedDueDayByAccount.get(card.id) ?? null}
                  onSaved={() => {
                    refetchAccounts()
                    refetchStatements()
                  }}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* Fontes de salário */}
        <Card id="section-salario" className="scroll-mt-16">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Tags className="size-5 text-primary" />
              <CardTitle>Fontes de salário</CardTitle>
            </div>
            <CardDescription>
              Adicione palavras-chave para identificar automaticamente transações de salário (ex: &quot;Nubank&quot;, &quot;Salário&quot;, &quot;XYZ SA&quot;).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {salarySuggestions.length > 0 && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                  <Sparkles className="size-4" />
                  <span>Sugestões de Salário Detectadas</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Identificamos depósitos recorrentes com valores parecidos nos últimos meses. Deseja rastrear alguma dessas fontes como seu salário?
                </p>
                <div className="grid gap-2">
                  {salarySuggestions.map((sug) => (
                    <div
                      key={sug.pattern}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3 transition-all hover:border-primary/30"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-xs block truncate text-foreground">{sug.pattern}</span>
                        <span className="text-[10px] text-muted-foreground block truncate">
                          Média: {format(sug.averageAmount)}/mês • Última: {sug.lastDescription || sug.pattern} ({new Date(sug.lastDate).toLocaleDateString("pt-BR")})
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => acceptSuggestion(sug.pattern)}
                        className="gap-1.5 px-2.5 h-8 shrink-0 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary transition-all text-xs font-medium"
                      >
                        <Sparkles className="size-3" />
                        Sim, é meu salário
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Ex: Nubank, Salário, XYZ SA..."
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPattern() } }}
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={addPattern}
                disabled={!newPattern.trim()}
                className="gap-1.5 shrink-0"
              >
                <Plus className="size-4" />
                Adicionar
              </Button>
            </div>

            {salarySources.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nenhuma fonte de salário cadastrada ainda. Marque uma transação de entrada como salário na lista de transações para começar!</p>
            ) : (
              <div className="grid gap-3">
                {salarySources.map((source) => (
                  <div
                    key={source.pattern}
                    className="flex items-center justify-between gap-4 rounded-xl border bg-muted/30 p-3.5 transition-all hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{source.pattern}</span>
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Ativa</span>
                      </div>
                      {source.lastDescription ? (
                        <p className="text-xs text-muted-foreground truncate">
                          Última: {source.lastDescription} • {new Date(source.lastDate!).toLocaleDateString("pt-BR")}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Nenhuma transação recebida ainda no período de busca.</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {source.lastAmount !== null && (
                        <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {format(source.lastAmount)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removePattern(source.pattern)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                        aria-label={`Remover fonte ${source.pattern}`}
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Aparência */}
        <Card id="section-aparencia" className="scroll-mt-16">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="size-5 text-primary" />
              <CardTitle>Aparência</CardTitle>
            </div>
            <CardDescription>
              Escolha a personalidade visual do painel. Cada tema tem tipografia e cantos próprios, e cada um suporta modo claro e escuro. Use o botão no cabeçalho para alternar claro/escuro.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ThemePicker />
          </CardContent>
        </Card>

        {/* Segurança */}
        <Card
          id="section-seguranca"
          className={cn(
            "scroll-mt-16 transition-all",
            formData.vaultEnabled && "border-primary/50 shadow-md",
          )}
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className={`size-5 ${formData.vaultEnabled ? "text-primary" : "text-muted-foreground"}`} />
                <CardTitle>Vault (Segurança)</CardTitle>
              </div>
              <Switch
                checked={formData.vaultEnabled}
                onCheckedChange={(checked) => setFormData({ ...formData, vaultEnabled: checked })}
              />
            </div>
            <CardDescription>Trave sua interface localmente para evitar olhares curiosos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6" aria-disabled={!formData.vaultEnabled}>
              <div className="space-y-2">
                <Label htmlFor="vaultPassword">Senha Mestre Local</Label>
                <Input
                  id="vaultPassword"
                  type="password"
                  placeholder="Defina uma senha mestre"
                  disabled={!formData.vaultEnabled}
                  value={formData.vaultMasterPassword}
                  onChange={(e) => setFormData({ ...formData, vaultMasterPassword: e.target.value })}
                />
                <p className="text-xs text-muted-foreground italic">DICA: Use o atalho ESC para travar instantaneamente (Panic Key).</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vaultInactivity">Bloquear após inatividade (minutos)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="vaultInactivity"
                    type="number"
                    className="max-w-24"
                    disabled={!formData.vaultEnabled}
                    value={formData.vaultInactivityMin}
                    onChange={(e) => setFormData({ ...formData, vaultInactivityMin: parseInt(e.target.value) })}
                  />
                  <span className="text-sm text-muted-foreground">minutos (0 para desativar)</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notificações */}
        <Card id="section-notificacoes" className="scroll-mt-16">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="size-5 text-primary" />
              <CardTitle>Notificações</CardTitle>
            </div>
            <CardDescription>
              Receba alertas de orçamento, faturas e fluxo de caixa via Webhook (Slack/Discord) ou Telegram.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="webhookUrl">Webhook URL (Slack / Discord)</Label>
              <Input
                id="webhookUrl"
                type="url"
                placeholder="https://hooks.slack.com/..."
                value={formData.notificationWebhookUrl}
                onChange={(e) => setFormData({ ...formData, notificationWebhookUrl: e.target.value })}
              />
            </div>
            <Separator />
            <div className="space-y-4">
              <p className="text-sm font-medium">Telegram</p>
              <div className="space-y-2">
                <Label htmlFor="telegramToken">Bot Token</Label>
                <Input
                  id="telegramToken"
                  type="password"
                  placeholder="123456:ABCdef..."
                  value={formData.telegramBotToken}
                  onChange={(e) => setFormData({ ...formData, telegramBotToken: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telegramChat">Chat ID</Label>
                <Input
                  id="telegramChat"
                  placeholder="-100123456789"
                  value={formData.telegramChatId}
                  onChange={(e) => setFormData({ ...formData, telegramChatId: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Use @userinfobot no Telegram para descobrir seu Chat ID.</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="anthropicKey">Anthropic API Key (para Briefing por IA)</Label>
              <Input
                id="anthropicKey"
                type="password"
                placeholder="sk-ant-..."
                value={formData.anthropicApiKey}
                onChange={(e) => setFormData({ ...formData, anthropicApiKey: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Necessária para o Briefing Automático Mensal em /insights.</p>
            </div>
          </CardContent>
        </Card>

        {/* Sincronização */}
        <Card id="section-sincronizacao" className="scroll-mt-16">
          <CardHeader>
            <div className="flex items-center gap-2">
              <RefreshCw className="size-5 text-primary" />
              <CardTitle>Sincronização</CardTitle>
            </div>
            <CardDescription>Configure como o sistema busca novos dados das suas contas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="syncInterval">Atualização automática (horas)</Label>
                <Input
                  id="syncInterval"
                  type="number"
                  value={formData.syncIntervalHours}
                  onChange={(e) => setFormData({ ...formData, syncIntervalHours: parseInt(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">
                  O sistema revisita suas contas para buscar novos dados a cada X horas.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lookback">Período de busca (dias)</Label>
                <Input
                  id="lookback"
                  type="number"
                  value={formData.syncLookbackDays}
                  onChange={(e) => setFormData({ ...formData, syncLookbackDays: parseInt(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">
                  O app procura transações ocorridas nos últimos X dias em cada sincronização.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dados e cache */}
        <Card id="section-dados" className="scroll-mt-16">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="size-5 text-primary" />
              <CardTitle>Dados e cache</CardTitle>
            </div>
            <CardDescription>
              Exportação de dados e limpeza do cache local (PWA e consultas).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" asChild className="gap-2">
                <a href="/api/domain/transactions/export" download>
                  <Download className="size-4" />
                  Exportar transações (CSV)
                </a>
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                disabled={clearingCache}
                onClick={clearLocalCache}
              >
                {clearingCache ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Limpar cache local
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Se algum valor parecer desatualizado (dados antigos servidos pelo
              cache offline), limpe o cache local — os dados do banco não são
              afetados.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => refetch()} disabled={saving}>Cancelar</Button>
        <Button onClick={saveSettings} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Salvar Alterações
        </Button>
      </div>
    </div>
  )
}
