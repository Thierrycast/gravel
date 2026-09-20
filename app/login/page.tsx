"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // O middleware manda `motivo=sem-senha` quando APP_PASSWORD não está no
  // ambiente. Sem este recado a tela seria um campo que rejeita tudo, sem dizer
  // por quê — e o problema está no env_file, não no que a pessoa digitou.
  const missingPassword = params.get("motivo") === "sem-senha";
  const next = params.get("next") ?? "/";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "Não foi possível entrar.");
        return;
      }

      // `refresh` antes de navegar: sem ele o App Router pode servir a página
      // de destino do cache, ainda renderizada como deslogada.
      router.refresh();
      router.replace(next.startsWith("/") ? next : "/");
    } catch {
      setError("Não foi possível falar com o servidor.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Lock className="h-5 w-5" aria-hidden />
        </div>
        <CardTitle>Gravel</CardTitle>
        <CardDescription>
          {missingPassword
            ? "Este app está trancado até que uma senha exista no ambiente."
            : "Entre para ver suas finanças."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {missingPassword ? (
          <p className="text-sm text-muted-foreground">
            Defina <code className="font-mono">APP_PASSWORD</code> no arquivo de
            segredos do container e reinicie. Enquanto ela não existir, nenhuma
            rota responde — inclusive esta tela.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>

            {error ? (
              <p id="login-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={isSubmitting || !password}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Entrar
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      {/* useSearchParams exige Suspense, senão a rota inteira sai do render
          estático — o mesmo de-opt que a auditoria apontou em /cash-flow. */}
      <Suspense fallback={<Card className="w-full max-w-sm p-6">Carregando…</Card>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
