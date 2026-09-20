"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Saída da sessão. Existe porque o porteiro criado em 2026-09-20 tornou a
 * sessão um estado real do app: sem este botão, o único jeito de sair seria
 * apagar cookie na mão.
 */
export function LogoutButton() {
  const router = useRouter();
  const [isLeaving, setIsLeaving] = useState(false);

  async function handleLogout() {
    setIsLeaving(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Mesmo se a chamada falhar, mandar para o login é o comportamento certo:
      // o cookie pode já ter expirado, e ficar preso numa tela morta é pior.
      router.refresh();
      router.replace("/login");
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleLogout}
      disabled={isLeaving}
      className="group-data-[collapsible=icon]:hidden h-7 gap-2 px-1 text-[10px] text-muted-foreground hover:text-destructive"
    >
      <LogOut className="h-3 w-3" aria-hidden />
      Sair
    </Button>
  );
}
