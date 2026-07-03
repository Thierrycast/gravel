"use client";

import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Calendar,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";

const tabs = [
  { href: "/", icon: LayoutDashboard, label: "Painel" },
  { href: "/transactions", icon: ArrowLeftRight, label: "Transações" },
  { href: "/accounts", icon: Wallet, label: "Contas" },
  { href: "/recurring", icon: Calendar, label: "Recorrências" },
];

export function BottomNav() {
  const pathname = usePathname();
  const { openMobile, setOpenMobile } = useSidebar();
  const activeHref = tabs
    .filter(({ href }) =>
      href === "/"
        ? pathname === "/"
        : pathname === href || pathname.startsWith(`${href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav
      aria-label="Navegação principal"
      // view-transition-name: nav persists across page transitions — no flicker.
      // Sem padding de safe-area de propósito (decisão do usuário): a barra
      // fica rente ao fundo da tela (bottom: 0), sem faixa extra embaixo.
      className="fixed bottom-0 left-0 right-0 z-50 select-none md:hidden [view-transition-name:bottom-nav] border-t border-border/60 bg-background/80 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/65"
    >
      <div className="flex h-16 items-stretch">
        {tabs.map(({ href, icon: Icon, label }) => {
          const isActive = activeHref === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 font-mono text-[11px] tracking-tight transition-colors sm:text-xs sm:tracking-wider",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("size-5", isActive && "stroke-[2.5px]")} />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-label={openMobile ? "Fechar menu completo" : "Abrir menu completo"}
          aria-expanded={openMobile}
          aria-haspopup="dialog"
          onClick={() => setOpenMobile(!openMobile)}
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 font-mono text-[11px] tracking-tight text-muted-foreground transition-colors hover:text-foreground sm:text-xs sm:tracking-wider"
        >
          <MoreHorizontal className="size-5" />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
}
