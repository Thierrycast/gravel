"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
  ChevronRight,
  ArrowLeft,
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
  {
    id: "financeiro",
    label: "Financeiro",
    icon: DollarSign,
    description: "Salário, projeções e patrimônio",
    hasSave: true,
  },
  {
    id: "cartoes",
    label: "Cartões",
    icon: CreditCard,
    description: "Ciclos de fatura dos cartões",
    hasSave: false,
  },
  {
    id: "salario",
    label: "Fontes de salário",
    icon: Tags,
    description: "Identificação automática de salário",
    hasSave: false,
  },
  {
    id: "aparencia",
    label: "Aparência",
    icon: Palette,
    description: "Tema e modo claro/escuro",
    hasSave: false,
  },
  {
    id: "seguranca",
    label: "Segurança",
    icon: Shield,
    description: "Vault local e senha mestre",
    hasSave: true,
  },
  {
    id: "notificacoes",
    label: "Notificações",
    icon: Bell,
    description: "Webhook, Telegram e chave de IA",
    hasSave: true,
  },
  {
    id: "sincronizacao",
    label: "Sincronização",
    icon: RefreshCw,
    description: "Intervalos e período de busca",
    hasSave: true,
  },
  {
    id: "dados",
    label: "Dados e cache",
    icon: Database,
    description: "Exportação e limpeza de cache",
    hasSave: false,
  },
] as const

type SectionId = (typeof SECTIONS)[number]["id"]

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

function SettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawTab = searchParams.get("tab") as SectionId | null
  const activeTab: SectionId = (rawTab && SECTIONS.some((s) => s.id === rawTab) ? rawTab : SECTIONS[0].id) as SectionId

  const { data: settings, loading, refetch } = useApi<SettingsResponse>("/api/settings")
  const { data: accountsData, refetch: refetchAccounts } = useApi<AccountsResponse>("/api/domain/accounts")
  const { data: statementsData, refetch: refetchStatements } = useApi<CardStatementsResponse>("/api/domain/cards/statements")
  const queryClient = useQueryClient()
  const { format } = useCurrency()
  const [saving, setSaving] = useState(false)
  const [clearingCache, setClearingCache] = useState(false)
  const [pushState, setPushState] = useState<"idle" | "loading" | "active" | "unsupported">("idle")

  async function togglePushSubscription() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("unsupported")
      return
    }
    setPushState("loading")
    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()

      if (existing) {
        await existing.unsubscribe()
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        })
        setPushState("idle")
        toast.success("Notificações push desativadas")
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setPushState("idle")
        toast.error("Permissão negada pelo navegador")
        return
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setPushState("unsupported")
        toast.error("VAPID key não configurada no servidor")
        return
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      })

      const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        }),
      })

      setPushState("active")
      toast.success("Notificações push ativadas!")
    } catch (err) {
      console.error("[PUSH]", err)
      setPushState("idle")
      toast.error("Erro ao configurar notificações push")
    }
  }

  useEffect(() => {
    let mounted = true
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("unsupported")
      return
    }
    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((sub) => {
        if (mounted) setPushState(sub ? "active" : "idle")
      })
    ).catch(() => { if (mounted) setPushState("unsupported") })
    return () => { mounted = false }
  }, [])
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
    (statementsData?.results ?? []).map((entry) => [entry.accountId, entry.suggestedDueDay]),
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
      if (Array.isArray(settings.salaryPatterns)) setSalaryPatterns(settings.salaryPatterns)
      if (Array.isArray(settings.salarySources)) setSalarySources(settings.salarySources)
      if (Array.isArray(settings.salarySuggestions)) setSalarySuggestions(settings.salarySuggestions)
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
    const ok = await patchPatterns([...salaryPatterns, trimmed], `Fonte "${trimmed}" cadastrada`)
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

  function navigateTo(id: SectionId) {
    router.replace(`/settings?tab=${id}`)
  }

  function renderPanel(id: SectionId) {
    switch (id) {
      case "financeiro":
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="salary">Salário mensal estimado (líquido)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">R$</span>
                <Input
                  id="salary"
                  type="number"
                  className="pl-9"
                  value={formData.monthlySalary}
                  onChange={(e) => setFormData({ ...formData, monthlySalary: parseFloat(e.target.value) })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Usado para calcular o fluxo de caixa projetado e a capacidade de aporte em metas.
              </p>
              {(!formData.showFutureSalary || formData.monthlySalary <= 0) && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                  A projeção não incluirá salário enquanto o valor estiver zerado ou a opção abaixo estiver desligada.
                </p>
              )}
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label>Projetar salário futuro</Label>
                <p className="text-xs text-muted-foreground">
                  Inclui receita estimada nos meses futuros do gráfico de projeção.
                </p>
              </div>
              <Switch
                checked={formData.showFutureSalary}
                onCheckedChange={(checked) => setFormData({ ...formData, showFutureSalary: checked })}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label>Projetar contas futuras</Label>
                <p className="text-xs text-muted-foreground">
                  Inclui recorrências, faturas de cartão e parcelas na projeção.
                </p>
              </div>
              <Switch
                checked={formData.showFutureAccounts}
                onCheckedChange={(checked) => setFormData({ ...formData, showFutureAccounts: checked })}
              />
            </div>
          </div>
        )

      case "cartoes":
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Dia de fechamento e vencimento de cada cartão. Sem esses dados o app usa estimativas para separar a fatura atual das próximas.
            </p>
            {creditCards.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center">
                <CreditCard className="mx-auto mb-2 size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nenhum cartão de crédito conectado.</p>
              </div>
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
          </div>
        )

      case "salario":
        return (
          <div className="space-y-5">
            <div className="rounded-xl border border-muted bg-muted/10 p-4 text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground text-sm">Como funciona a detecção automática</p>
              <p className="text-xs">
                O app analisa seus histórico de entradas e identifica depósitos recorrentes com valores parecidos vindo da mesma origem em meses diferentes. Quando encontra um padrão, ele aparece como sugestão abaixo — basta confirmar.
              </p>
            </div>

            {salarySuggestions.length > 0 && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                  <Sparkles className="size-4" />
                  <span>Padrões detectados automaticamente</span>
                </div>
                <div className="grid gap-2">
                  {salarySuggestions.map((sug) => (
                    <div
                      key={sug.pattern}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3 transition-all hover:border-primary/30"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-xs block truncate text-foreground">{sug.pattern}</span>
                        <span className="text-[10px] text-muted-foreground block truncate">
                          Média: {format(sug.averageAmount)}/mês · Última: {sug.lastDescription || sug.pattern} ({new Date(sug.lastDate).toLocaleDateString("pt-BR")})
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => acceptSuggestion(sug.pattern)}
                        disabled={salaryPatterns.includes(sug.pattern)}
                        className="gap-1.5 px-2.5 h-8 shrink-0 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary text-xs font-medium"
                      >
                        <Sparkles className="size-3" />
                        {salaryPatterns.includes(sug.pattern) ? "Ativada" : "É meu salário"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label>Adicionar fonte manualmente</Label>
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
            </div>

            {salarySources.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground text-center">
                Nenhuma fonte cadastrada. Aceite uma sugestão ou adicione manualmente.
              </p>
            ) : (
              <div className="grid gap-3">
                <Label className="text-xs text-muted-foreground">Fontes ativas</Label>
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
                          Última: {source.lastDescription} · {new Date(source.lastDate!).toLocaleDateString("pt-BR")}
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
          </div>
        )

      case "aparencia":
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cada tema tem tipografia e cantos próprios e suporta modo claro e escuro. Use o botão no cabeçalho para alternar entre claro e escuro.
            </p>
            <ThemePicker />
          </div>
        )

      case "seguranca":
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Vault local</Label>
                <p className="text-xs text-muted-foreground">
                  Trava a interface com senha para evitar olhares curiosos. Não é criptografia bancária — é uma camada visual de proteção local.
                </p>
              </div>
              <Switch
                checked={formData.vaultEnabled}
                onCheckedChange={(checked) => setFormData({ ...formData, vaultEnabled: checked })}
              />
            </div>

            <div className={cn("space-y-4 transition-opacity", !formData.vaultEnabled && "pointer-events-none opacity-40")}>
              <div className="space-y-2">
                <Label htmlFor="vaultPassword">Senha mestre</Label>
                <Input
                  id="vaultPassword"
                  type="password"
                  placeholder="Defina uma senha mestre"
                  disabled={!formData.vaultEnabled}
                  value={formData.vaultMasterPassword}
                  onChange={(e) => setFormData({ ...formData, vaultMasterPassword: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Use ESC para travar instantaneamente (Panic Key).</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vaultInactivity">Bloquear após inatividade</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="vaultInactivity"
                    type="number"
                    min="0"
                    className="max-w-24"
                    disabled={!formData.vaultEnabled}
                    value={formData.vaultInactivityMin}
                    onChange={(e) => setFormData({ ...formData, vaultInactivityMin: parseInt(e.target.value) || 0 })}
                  />
                  <span className="text-sm text-muted-foreground">minutos (0 = desativado)</span>
                </div>
              </div>
            </div>
          </div>
        )

      case "notificacoes":
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="webhookUrl">Webhook URL (Slack / Discord)</Label>
              <Input
                id="webhookUrl"
                type="url"
                placeholder="https://hooks.slack.com/services/..."
                value={formData.notificationWebhookUrl}
                onChange={(e) => setFormData({ ...formData, notificationWebhookUrl: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Receba alertas de orçamento, faturas vencidas e caixa negativo diretamente no Slack ou Discord.
              </p>
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Telegram</p>
                <p className="text-xs text-muted-foreground mt-0.5">Crie um bot em @BotFather para obter o token.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
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
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Use @userinfobot no Telegram para descobrir seu Chat ID.</p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="anthropicKey">Anthropic API Key</Label>
              <Input
                id="anthropicKey"
                type="password"
                placeholder="sk-ant-..."
                value={formData.anthropicApiKey}
                onChange={(e) => setFormData({ ...formData, anthropicApiKey: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Necessária para o Briefing Automático Mensal em /insights.
              </p>
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Notificações Push (PWA)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Receba alertas diretamente no seu dispositivo, mesmo com o app fechado.
                </p>
              </div>
              {pushState === "unsupported" ? (
                <p className="text-xs text-muted-foreground italic">
                  Notificações push não são suportadas neste navegador.
                </p>
              ) : (
                <Button
                  type="button"
                  variant={pushState === "active" ? "destructive" : "outline"}
                  size="sm"
                  disabled={pushState === "loading"}
                  onClick={togglePushSubscription}
                  className="gap-2"
                >
                  {pushState === "loading" && <Loader2 className="size-3.5 animate-spin" />}
                  {pushState === "active" ? "Desativar notificações push" : "Ativar notificações push"}
                </Button>
              )}
              {pushState === "active" && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  Notificações push ativadas neste dispositivo.
                </p>
              )}
            </div>
          </div>
        )

      case "sincronizacao":
        return (
          <div className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="syncInterval">Intervalo de sincronização</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="syncInterval"
                    type="number"
                    min="1"
                    className="max-w-24"
                    value={formData.syncIntervalHours}
                    onChange={(e) => setFormData({ ...formData, syncIntervalHours: parseInt(e.target.value) || 6 })}
                  />
                  <span className="text-sm text-muted-foreground">horas</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  O app revisita suas contas e busca transações novas a cada X horas.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lookback">Janela de busca</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="lookback"
                    type="number"
                    min="7"
                    max="365"
                    className="max-w-24"
                    value={formData.syncLookbackDays}
                    onChange={(e) => setFormData({ ...formData, syncLookbackDays: parseInt(e.target.value) || 30 })}
                  />
                  <span className="text-sm text-muted-foreground">dias</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Quantos dias para trás o app procura transações em cada sincronização.
                </p>
              </div>
            </div>
          </div>
        )

      case "dados":
        return (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label>Exportação</Label>
              <Button variant="outline" asChild className="gap-2 w-full sm:w-auto">
                <a href="/api/domain/transactions/export" download>
                  <Download className="size-4" />
                  Exportar transações (CSV)
                </a>
              </Button>
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <Label>Cache local</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Se valores parecerem desatualizados, limpe o cache. Os dados do banco de dados não são afetados.
                </p>
              </div>
              <Button
                variant="outline"
                className="gap-2 w-full sm:w-auto"
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
          </div>
        )
    }
  }

  const activeSection = SECTIONS.find((s) => s.id === activeTab) ?? SECTIONS[0]

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <div className="flex gap-6">
          <Skeleton className="hidden lg:block h-80 w-56 shrink-0" />
          <div className="flex-1 grid gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title="Configurações"
        description="Gerencie as preferências do seu painel financeiro."
      />

      {/* Mobile: show list when no tab in URL, otherwise show section */}
      <div className="lg:hidden">
        {!rawTab ? (
          <div className="grid gap-2">
            {SECTIONS.map((section) => {
              const Icon = section.icon
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => navigateTo(section.id)}
                  className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/50 active:bg-muted"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="size-4 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{section.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{section.description}</p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              )
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => router.replace("/settings")}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
              Configurações
            </button>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <activeSection.icon className="size-5 text-primary" />
                  <CardTitle>{activeSection.label}</CardTitle>
                </div>
                <CardDescription>{activeSection.description}</CardDescription>
              </CardHeader>
              <CardContent>{renderPanel(activeTab)}</CardContent>
            </Card>

            {activeSection.hasSave && (
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => refetch()} disabled={saving}>
                  Cancelar
                </Button>
                <Button className="flex-1 gap-2" onClick={saveSettings} disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Salvar
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop: sidebar + panel */}
      <div className="hidden lg:flex gap-6 items-start">
        {/* Sidebar */}
        <aside className="w-60 shrink-0 sticky top-4">
          <nav className="grid gap-1">
            {SECTIONS.map((section) => {
              const Icon = section.icon
              const isActive = section.id === activeTab
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => navigateTo(section.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors w-full",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", isActive ? "text-primary" : "")} />
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium leading-none", isActive ? "text-primary" : "")}>{section.label}</p>
                    <p className="mt-0.5 text-[11px] leading-tight truncate opacity-70">{section.description}</p>
                  </div>
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Active panel */}
        <div className="flex-1 min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <activeSection.icon className="size-5 text-primary" />
                <CardTitle>{activeSection.label}</CardTitle>
              </div>
              <CardDescription>{activeSection.description}</CardDescription>
            </CardHeader>
            <CardContent>{renderPanel(activeTab)}</CardContent>
          </Card>

          {activeSection.hasSave && (
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => refetch()} disabled={saving}>
                Cancelar
              </Button>
              <Button className="gap-2" onClick={saveSettings} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Salvar alterações
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  )
}
