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
  KeyRound,
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

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { SettingsCredentials } from "@/components/settings-credentials"
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
  syncIntervalMinutes: number
  syncLookbackDays: number
  vaultEnabled: boolean
  vaultMasterPassword: string
  vaultInactivityMin: number
  notificationWebhookUrl: string
  telegramBotToken: string
  telegramChatId: string
  aiProvider: "anthropic" | "openai-compatible"
  aiBaseUrl: string
  aiModel: string
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
  hasVaultMasterPassword?: boolean
  salaryPatterns?: string[]
  salarySources?: SalarySource[]
  salarySuggestions?: SalarySuggestion[]
  notificationWebhookUrl?: string | null
  telegramBotToken?: string | null
  telegramChatId?: string | null
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
    id: "credenciais",
    label: "Chaves e credenciais",
    icon: KeyRound,
    description: "Pluggy, Binance e Logo.dev, criptografadas no banco",
    hasSave: false,
  },
  {
    id: "seguranca",
    label: "Privacidade",
    icon: Shield,
    description: "Senha e bloqueio da interface",
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
    <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
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
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Fechamento</Label>
          <Input
            type="number"
            min="1"
            max="31"
            placeholder="dia"
            className="h-8 min-w-0 w-full text-sm"
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
            className="h-8 min-w-0 w-full text-sm"
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
          />
        </div>
        <Button size="sm" className="h-8 whitespace-nowrap" disabled={saving} onClick={save}>
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
  // Snapshot do que veio do servidor: sem ele o botão Salvar fica sempre ativo e
  // não há como saber se há algo para salvar (nem oferecer "Descartar").
  const [baseline, setBaseline] = useState<string | null>(null)
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

      // Buscada em runtime, não embutida no build: `NEXT_PUBLIC_*` é inlinado
      // na compilação, e o build nunca teve a chave — o push ficava morto sem
      // dizer por quê. Agora cadastrar em Chaves e credenciais basta.
      const keyRes = await fetch("/api/push/key")
      const keyBody = (await keyRes.json().catch(() => null)) as {
        results?: { publicKey?: string | null }
      } | null
      const vapidKey = keyBody?.results?.publicKey
      if (!vapidKey) {
        setPushState("unsupported")
        toast.error(
          "Chave VAPID não cadastrada. Configure em Chaves e credenciais.",
        )
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
    syncIntervalMinutes: 30,
    syncLookbackDays: 30,
    vaultEnabled: false,
    vaultMasterPassword: "",
    vaultInactivityMin: 0,
    notificationWebhookUrl: "",
    telegramBotToken: "",
    telegramChatId: "",
    aiProvider: "anthropic",
    aiBaseUrl: "",
    aiModel: "claude-haiku-4-5-20251001",
  })

  const creditCards = (accountsData?.results ?? []).filter(isCreditCard)
  const suggestedDueDayByAccount = new Map(
    (statementsData?.results ?? []).map((entry) => [entry.accountId, entry.suggestedDueDay]),
  )

  useEffect(() => {
    if (settings) {
      const next: SettingsFormData = {
        monthlySalary: settings.monthlySalary,
        showFutureSalary: settings.showFutureSalary,
        showFutureAccounts: settings.showFutureAccounts,
        syncIntervalMinutes: settings.syncIntervalMinutes ?? 30,
        syncLookbackDays: settings.syncLookbackDays,
        vaultEnabled: settings.vaultEnabled,
        // A senha nunca volta do servidor; o campo começa vazio e só é enviado
        // quando o usuário digita algo novo.
        vaultMasterPassword: "",
        vaultInactivityMin: settings.vaultInactivityMin,
        notificationWebhookUrl: settings.notificationWebhookUrl || "",
        telegramBotToken: settings.telegramBotToken || "",
        telegramChatId: settings.telegramChatId || "",
        aiProvider: settings.aiProvider || "anthropic",
        aiBaseUrl: settings.aiBaseUrl || "",
        aiModel: settings.aiModel || "claude-haiku-4-5-20251001",
      }
      setFormData(next)
      setBaseline(JSON.stringify(next))
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
              <div className="relative max-w-[13rem]">
                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">R$</span>
                <Input
                  id="salary"
                  type="number"
                  inputMode="decimal"
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
                      className="flex flex-col gap-3 rounded-lg border bg-background p-3 transition-all hover:border-primary/30 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="block break-words text-xs font-semibold text-foreground">{sug.pattern}</span>
                        <span className="mt-0.5 block break-words text-[10px] text-muted-foreground">
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
                    className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3.5 transition-all hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="min-w-0 break-words text-sm font-semibold">{source.pattern}</span>
                        <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Ativa</span>
                      </div>
                      {source.lastDescription ? (
                        <p className="line-clamp-2 break-words text-xs text-muted-foreground">
                          Última: {source.lastDescription} · {new Date(source.lastDate!).toLocaleDateString("pt-BR")}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Nenhuma transação recebida ainda no período de busca.</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 self-end sm:self-auto">
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

      case "credenciais":
        return <SettingsCredentials />

      case "seguranca":
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Bloquear a interface</Label>
                <p className="text-xs text-muted-foreground">
                  Esconde a tela atrás da senha para evitar olhares curiosos. É
                  proteção visual — os dados no banco já ficam criptografados
                  independente disto.
                </p>
              </div>
              <Switch
                checked={formData.vaultEnabled}
                onCheckedChange={(checked) => setFormData({ ...formData, vaultEnabled: checked })}
              />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vaultPassword">Senha</Label>
                <Input
                  id="vaultPassword"
                  type="password"
                  placeholder={settings?.hasVaultMasterPassword ? "•••••••• (definida)" : "Defina uma senha"}
                  value={formData.vaultMasterPassword}
                  onChange={(e) => setFormData({ ...formData, vaultMasterPassword: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Serve para duas coisas: autorizar mudanças em{" "}
                  <strong>Chaves e credenciais</strong> e — se o bloqueio acima
                  estiver ligado — destravar a interface (ESC tranca na hora).
                  Também é ela que recupera suas credenciais se você restaurar um
                  backup em outra máquina, então não a perca.
                </p>
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
              <Label htmlFor="aiProvider">Provider do briefing</Label>
              <select
                id="aiProvider"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={formData.aiProvider}
                onChange={(event) => setFormData({ ...formData, aiProvider: event.target.value as SettingsFormData["aiProvider"] })}
              >
                <option value="anthropic">Anthropic (legado)</option>
                <option value="openai-compatible">OpenAI-compatible</option>
              </select>
              <Input
                aria-label="Modelo do briefing"
                placeholder="Modelo"
                value={formData.aiModel}
                onChange={(event) => setFormData({ ...formData, aiModel: event.target.value })}
              />
              {formData.aiProvider === "openai-compatible" && (
                <Input
                  aria-label="Base URL do provider"
                  type="url"
                  placeholder="http://servidor-local:porta/v1"
                  value={formData.aiBaseUrl}
                  onChange={(event) => setFormData({ ...formData, aiBaseUrl: event.target.value })}
                />
              )}
              <p className="text-xs text-muted-foreground">
                A chave é cadastrada no cofre, em Credenciais. Nenhum endpoint é ativado automaticamente.
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
                    min="5"
                    max="1440"
                    step="5"
                    className="max-w-24"
                    value={formData.syncIntervalMinutes}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        syncIntervalMinutes: parseInt(e.target.value) || 30,
                      })
                    }
                  />
                  <span className="text-sm text-muted-foreground">minutos</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Rede de segurança: o app revisita suas contas a cada X minutos.
                  O normal é o dado chegar antes disso, por webhook, assim que a
                  instituição sincroniza.
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
            <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Exportação</h3>
                <p className="text-xs text-muted-foreground">
                  Baixe uma cópia das transações para análise externa. O arquivo não altera seus dados.
                </p>
              </div>
              <Button variant="outline" asChild className="w-full shrink-0 gap-2 sm:w-auto">
                <a href="/api/domain/transactions/export" download>
                  <Download className="size-4" />
                  Exportar transações (CSV)
                </a>
              </Button>
            </section>

            <Separator />

            <section className="border-t border-destructive/20 pt-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">Limpar cache local</h3>
                  <p className="text-xs text-muted-foreground">
                    Remove cópias salvas neste dispositivo e recarrega a interface. Os dados do banco não são afetados.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full shrink-0 gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
                  disabled={clearingCache}
                  onClick={clearLocalCache}
                >
                  {clearingCache ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Limpar cache
                </Button>
              </div>
            </section>
          </div>
        )
    }
  }

  const activeSection = SECTIONS.find((s) => s.id === activeTab) ?? SECTIONS[0]
  // Nada alterado → Salvar desabilitado e rotulado "Salvo". Estado que faltava.
  const isDirty = baseline !== null && JSON.stringify(formData) !== baseline

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
                  className="flex w-full min-w-0 items-center gap-3 border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/50 active:bg-muted"
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
                <CardTitle className="text-base">{activeSection.label}</CardTitle>
                <CardDescription>{activeSection.description}</CardDescription>
              </CardHeader>
              <CardContent>{renderPanel(activeTab)}</CardContent>
              {activeSection.hasSave && (
                // Mesmo desenho do desktop: rodapé dentro do painel, os mesmos
                // rótulos e o mesmo estado. Antes as ações ficavam fora do Card,
                // diziam "Cancelar" em vez de "Descartar" e nunca desabilitavam.
                <CardFooter className="gap-2 border-t pt-4">
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => refetch()}
                    disabled={saving || !isDirty}
                  >
                    Descartar
                  </Button>
                  <Button
                    variant={isDirty ? "default" : "outline"}
                    className="flex-1 gap-2"
                    onClick={saveSettings}
                    disabled={saving || !isDirty}
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    {isDirty ? "Salvar" : "Salvo"}
                  </Button>
                </CardFooter>
              )}
            </Card>
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
                    // `min-w-0`: item de grid tem `min-width: auto`, então sem isto
                    // o botão cresce além da trilha de 240px e nenhum `truncate`
                    // interno segura — foi assim que o texto invadiu o painel.
                    "flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", isActive ? "text-primary" : "")} />
                  {/* Só o label: a descrição vive no cabeçalho do painel. Repetir nos
                      dois lugares transformava o índice numa parede de texto de 11px
                      e duplicava a mesma frase na tela. */}
                  <span className="min-w-0 flex-1 truncate font-medium">{section.label}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Painel ativo. `max-w-2xl` mantém rótulo e campo no mesmo campo de visão —
            sem isso o conteúdo esticava por toda a largura e a tela ficava com um
            vazio enorme à direita. */}
        <div className="min-w-0 flex-1 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{activeSection.label}</CardTitle>
              <CardDescription>{activeSection.description}</CardDescription>
            </CardHeader>
            <CardContent>{renderPanel(activeTab)}</CardContent>
            {activeSection.hasSave && (
              // Ações no rodapé do próprio painel, alinhadas aos campos. Antes
              // flutuavam soltas a ~150px do último campo, no meio do vazio.
              <CardFooter className="justify-end gap-2 border-t pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={saving || !isDirty}
                >
                  Descartar
                </Button>
                <Button
                  size="sm"
                  // Sem alterações o botão não pode continuar pintado no accent
                  // cheio: accent saturado em estado inativo mente sobre o que
                  // está disponível.
                  variant={isDirty ? "default" : "outline"}
                  className="gap-2"
                  onClick={saveSettings}
                  disabled={saving || !isDirty}
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {isDirty ? "Salvar alterações" : "Salvo"}
                </Button>
              </CardFooter>
            )}
          </Card>
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
