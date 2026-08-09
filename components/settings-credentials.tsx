"use client"

import { useState } from "react"
import { AlertTriangle, Check, KeyRound, Loader2, Save } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useApi } from "@/hooks/use-api"
import { cn } from "@/lib/utils"

type SecretStatus = {
  key: string
  provider: string
  label: string
  description: string
  effectiveSource: "database" | "environment" | "unset"
  managedByApp: boolean
  hasDatabaseValue: boolean
  hasEnvironmentValue: boolean
  canPersistToDatabase: boolean
}

type SecretsResponse = {
  results?: {
    secrets?: SecretStatus[]
    canPersist?: boolean
    requiresMasterPassword?: boolean
  }
}

const SOURCE_LABEL: Record<SecretStatus["effectiveSource"], string> = {
  database: "criptografada no banco",
  environment: "vindo do ambiente",
  unset: "não configurada",
}

/**
 * Cadastro das credenciais de provedor. É a única forma prevista de informá-las:
 * o valor vai criptografado (AES-256-GCM) para o banco e **nunca** volta para a
 * tela — o formulário só mostra se existe e de onde vem.
 *
 * Antes desta tela a única via era editar arquivo no servidor, o que não
 * sobrevive a um usuário real.
 */
export function SettingsCredentials() {
  const { data, loading, refetch } = useApi<SecretsResponse>(
    "/api/settings/secrets",
  )
  const [values, setValues] = useState<Record<string, string>>({})
  const [masterPassword, setMasterPassword] = useState("")
  const [saving, setSaving] = useState(false)

  const secrets = data?.results?.secrets ?? []
  const requiresPassword = data?.results?.requiresMasterPassword ?? false
  const canPersist = data?.results?.canPersist ?? false

  // Agrupamento por provedor. São ~7 itens; memoizar não pagaria o custo de
  // depender de um array recriado a cada render.
  const byProvider = new Map<string, SecretStatus[]>()
  for (const secret of secrets) {
    byProvider.set(secret.provider, [
      ...(byProvider.get(secret.provider) ?? []),
      secret,
    ])
  }
  const groups = [...byProvider.entries()]

  const filled = Object.entries(values).filter(([, value]) => value.trim())

  async function save() {
    if (filled.length === 0) {
      toast.error("Preencha ao menos uma credencial.")
      return
    }
    if (requiresPassword && !masterPassword.trim()) {
      toast.error("Informe a senha para autorizar a mudança.")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/settings/secrets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPassword: masterPassword || undefined,
          secrets: Object.fromEntries(filled),
        }),
      })
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string }
      } | null
      if (!res.ok) {
        throw new Error(body?.error?.message ?? `Erro ${res.status}`)
      }

      toast.success(
        `${filled.length} credencial(is) salva(s) e criptografada(s).`,
      )
      // Nunca reexibimos valor: limpa os campos e recarrega só o status.
      setValues({})
      setMasterPassword("")
      refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Carregando credenciais…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-muted/20 p-4 text-xs text-muted-foreground">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <KeyRound className="size-4" />
          Como isto é guardado
        </p>
        <p className="mt-1.5">
          O valor é criptografado com AES-256-GCM antes de ir para o banco e nunca
          volta para esta tela — por isso os campos aparecem vazios mesmo quando a
          credencial está configurada. A chave de criptografia é gerada pelo
          próprio app no primeiro boot; você não precisa administrá-la.
        </p>
        {!canPersist ? (
          <p className="mt-2 flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            O cofre está indisponível — verifique se o diretório de dados é
            gravável. Enquanto isso, só valores vindos do ambiente funcionam.
          </p>
        ) : null}
      </div>

      {groups.map(([provider, items]) => (
        <div key={provider} className="space-y-3">
          <Label className="text-base">{provider}</Label>
          {items.map((secret) =>
            // Valores que o app gera e rotaciona sozinho (ex.: o secret do
            // webhook, que ele inventa e comunica à Pluggy) aparecem como status,
            // sem campo — pedir digitação seria transferir trabalho de máquina
            // para o usuário.
            secret.managedByApp ? (
              <div
                key={secret.key}
                className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3"
              >
                <Check
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0",
                    secret.effectiveSource === "unset"
                      ? "text-muted-foreground"
                      : "text-emerald-500",
                  )}
                />
                <div className="space-y-0.5">
                  <p className="text-sm">
                    {secret.label}{" "}
                    <span className="text-xs text-muted-foreground">
                      —{" "}
                      {secret.effectiveSource === "unset"
                        ? "será gerado no primeiro registro do webhook"
                        : "gerado pelo app"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {secret.description}
                  </p>
                </div>
              </div>
            ) : (
            <div key={secret.key} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={secret.key} className="text-sm">
                  {secret.label}
                </Label>
                {/* Badge do sistema em vez de span à mão — e sem `rounded-full`:
                    os tokens de raio do projeto são 0rem, cantos retos por decisão. */}
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1 text-[10px] font-medium",
                    secret.effectiveSource === "database" &&
                      "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
                    secret.effectiveSource === "environment" &&
                      "border-sky-500/40 text-sky-600 dark:text-sky-400",
                    secret.effectiveSource === "unset" &&
                      "border-amber-500/40 text-amber-600 dark:text-amber-400",
                  )}
                >
                  {secret.effectiveSource === "database" ? (
                    <Check className="size-3" />
                  ) : null}
                  {SOURCE_LABEL[secret.effectiveSource]}
                </Badge>
              </div>
              <Input
                id={secret.key}
                type="password"
                autoComplete="off"
                placeholder={
                  secret.effectiveSource === "unset"
                    ? "Cole o valor aqui"
                    : "•••••••• (deixe vazio para manter)"
                }
                value={values[secret.key] ?? ""}
                onChange={(e) =>
                  setValues({ ...values, [secret.key]: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">{secret.description}</p>
            </div>
            ),
          )}
          <Separator />
        </div>
      ))}

      {requiresPassword ? (
        <div className="space-y-2">
          <Label htmlFor="credentialsMasterPassword">
            Senha (definida em Privacidade)
          </Label>
          <Input
            id="credentialsMasterPassword"
            type="password"
            autoComplete="off"
            placeholder="Confirme para autorizar a mudança"
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nenhuma senha definida ainda, então o primeiro cadastro está liberado.
          Defina uma em <strong>Privacidade</strong> para exigir confirmação nas
          próximas mudanças.
        </p>
      )}

      <Button onClick={save} disabled={saving || filled.length === 0} className="gap-2">
        {saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        {filled.length > 0
          ? `Salvar ${filled.length} credencial(is)`
          : "Salvar"}
      </Button>
    </div>
  )
}
