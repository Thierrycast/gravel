"use client"

import * as React from "react"
import { ShieldCheck, Lock, Unlock, Loader2, Shield } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useApi } from "@/hooks/use-api"

interface VaultContextType {
  isLocked: boolean
  lock: () => void
  unlock: (password: string) => Promise<boolean>
  enabled: boolean
}

const VaultContext = React.createContext<VaultContextType | undefined>(undefined)

type VaultSettings = {
  vaultEnabled: boolean
  vaultMasterPassword?: string | null
  vaultInactivityMin: number
}

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { data: settings, loading } = useApi<VaultSettings>("/api/settings")
  const [isLocked, setIsLocked] = React.useState(false)
  const [passwordInput, setPasswordInput] = React.useState("")
  const [unlocking, setUnlocking] = React.useState(false)

  const enabled = settings?.vaultEnabled ?? false
  const masterPassword = settings?.vaultMasterPassword
  const inactivityMin = settings?.vaultInactivityMin ?? 0

  // Handle Lock logic
  const lock = React.useCallback(() => {
    if (!enabled) return
    setIsLocked(true)
    toast.warning("Vault travado. Seu cascalho está seguro!", { icon: <Lock className="size-4" /> })
  }, [enabled])

  const unlock = React.useCallback(async (password: string) => {
    setUnlocking(true)
    // Simple check for now, in a real app we'd use a more secure comparison
    // But as requested, it's a local lock
    await new Promise(resolve => setTimeout(resolve, 800)) // Simulate verify
    
    if (password === masterPassword) {
      setIsLocked(false)
      setPasswordInput("")
      toast.success("Acesso liberado. Bem-vindo de volta ao Toá!", { icon: <ShieldCheck className="size-4" /> })
      setUnlocking(false)
      return true
    } else {
      toast.error("Senha incorreta")
      setUnlocking(false)
      return false
    }
  }, [masterPassword])

  // Panic Key (Escape)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLocked && enabled) {
        lock()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isLocked, enabled, lock])

  // Inactivity Timer
  React.useEffect(() => {
    if (!enabled || inactivityMin <= 0 || isLocked) return

    let timer: NodeJS.Timeout
    const resetTimer = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        lock()
      }, inactivityMin * 60 * 1000)
    }

    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"]
    events.forEach(event => document.addEventListener(event, resetTimer))
    resetTimer()

    return () => {
      if (timer) clearTimeout(timer)
      events.forEach(event => document.removeEventListener(event, resetTimer))
    }
  }, [enabled, inactivityMin, isLocked, lock])

  if (loading) return children

  if (isLocked && enabled) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-xl transition-all animate-in fade-in duration-500">
        <Card className="w-full max-w-sm border-2 border-primary/20 bg-card/80 shadow-2xl backdrop-blur-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary animate-pulse">
              <Shield className="size-8" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Vault Locked</CardTitle>
            <CardDescription>Insira sua senha mestre para continuar</CardDescription>
          </CardHeader>
          <CardContent>
            <form 
              onSubmit={(e) => {
                e.preventDefault()
                unlock(passwordInput)
              }}
              className="space-y-4"
            >
              <Input
                type="password"
                placeholder="Senha Mestre"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoFocus
                className="h-12 text-center text-lg tracking-[0.5em]"
              />
              <Button 
                type="submit" 
                className="w-full h-12 text-lg font-semibold gap-2"
                disabled={unlocking}
              >
                {unlocking ? <Loader2 className="size-5 animate-spin" /> : <Unlock className="size-5" />}
                Desbloquear
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <VaultContext.Provider value={{ isLocked, lock, unlock, enabled }}>
      {children}
    </VaultContext.Provider>
  )
}

export const useVault = () => {
  const context = React.useContext(VaultContext)
  if (context === undefined) {
    throw new Error("useVault must be used within a VaultProvider")
  }
  return context
}
