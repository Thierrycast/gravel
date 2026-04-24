"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  RefreshCw,
  DollarSign,
  LayoutDashboard,
  Save,
  Loader2,
  Shield,
  Palette
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ThemePicker } from "@/components/theme-picker"
import { useApi } from "@/hooks/use-api"

type SettingsFormData = {
  monthlySalary: number
  showFutureSalary: boolean
  showFutureAccounts: boolean
  syncIntervalHours: number
  syncLookbackDays: number
  vaultEnabled: boolean
  vaultMasterPassword: string
  vaultInactivityMin: number
}

export default function SettingsPage() {
  const { data: settings, loading, refetch } = useApi<SettingsFormData>("/api/settings")
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<SettingsFormData>({
    monthlySalary: 0,
    showFutureSalary: false,
    showFutureAccounts: true,
    syncIntervalHours: 6,
    syncLookbackDays: 30,
    vaultEnabled: false,
    vaultMasterPassword: "",
    vaultInactivityMin: 0,
  })

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
      })
    }
  }, [settings])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })
      if (!res.ok) throw new Error("Falha ao salvar")
      toast.success("Configurações salvas com sucesso!")
      refetch()
    } catch {
      toast.error("Erro ao salvar configurações")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie as preferências do seu painel financeiro.</p>
      </div>

      <div className="grid gap-6">
        {/* Vault Security */}
        <Card className={formData.vaultEnabled ? "border-primary/50 shadow-md transition-all" : "transition-all"}>
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
            <div className={`grid gap-6 ${!formData.vaultEnabled && "opacity-40 pointer-events-none"}`}>
              <div className="space-y-2">
                <Label htmlFor="vaultPassword">Senha Mestre Local</Label>
                <Input 
                  id="vaultPassword" 
                  type="password" 
                  placeholder="Defina uma senha mestre"
                  value={formData.vaultMasterPassword}
                  onChange={(e) => setFormData({ ...formData, vaultMasterPassword: e.target.value })}
                />
                <p className="text-[10px] text-muted-foreground italic">DICA: Use o atalho ESC para travar instantaneamente (Panic Key).</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="vaultInactivity">Bloqueio Automático (Inatividade em Minutos)</Label>
                <div className="flex items-center gap-3">
                  <Input 
                    id="vaultInactivity" 
                    type="number" 
                    className="max-w-24"
                    value={formData.vaultInactivityMin}
                    onChange={(e) => setFormData({ ...formData, vaultInactivityMin: parseInt(e.target.value) })}
                  />
                  <span className="text-sm text-muted-foreground">minutos (0 para desativar)</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Appearance */}
        <Card>
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

        {/* Sync Engine */}
        <Card>
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
                <Label htmlFor="syncInterval">Intervalo de Pooling (Horas)</Label>
                <Input 
                  id="syncInterval" 
                  type="number" 
                  value={formData.syncIntervalHours}
                  onChange={(e) => setFormData({ ...formData, syncIntervalHours: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lookback">Lookback Window (Dias)</Label>
                <Input 
                  id="lookback" 
                  type="number" 
                  value={formData.syncLookbackDays}
                  onChange={(e) => setFormData({ ...formData, syncLookbackDays: parseInt(e.target.value) })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Financial Core */}
        <Card>
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
                <p className="text-xs text-muted-foreground">Incluir gastos recorrentes e parcelas nas projeções.</p>
              </div>
              <Switch 
                checked={formData.showFutureAccounts}
                onCheckedChange={(checked) => setFormData({ ...formData, showFutureAccounts: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Dashboard UI */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <LayoutDashboard className="size-5 text-primary" />
              <CardTitle>Interface do Dashboard</CardTitle>
            </div>
            <CardDescription>Personalize quais módulos são exibidos na sua tela inicial.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <p className="text-sm text-muted-foreground italic">Opções modulares em breve (Phase 4).</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => refetch()} disabled={saving}>Cancelar</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Salvar Alterações
        </Button>
      </div>
    </div>
  )
}
