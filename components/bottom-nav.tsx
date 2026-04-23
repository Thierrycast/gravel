"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Calendar,
  MoreHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useSidebar } from "@/components/ui/sidebar"

const tabs = [
  { href: "/", icon: LayoutDashboard, label: "Painel" },
  { href: "/transactions", icon: ArrowLeftRight, label: "Transações" },
  { href: "/accounts", icon: Wallet, label: "Contas" },
  { href: "/recurring", icon: Calendar, label: "Recorrências" },
]

export function BottomNav() {
  const pathname = usePathname()
  const { toggleSidebar } = useSidebar()
  const activeHref = tabs
    .filter(({ href }) =>
      href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-stretch border-t border-border bg-background/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map(({ href, icon: Icon, label }) => {
        const isActive = activeHref === href
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-mono tracking-widest transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className={cn("size-5", isActive && "stroke-[2.5px]")} />
            <span>{label}</span>
          </Link>
        )
      })}
      <button
        onClick={toggleSidebar}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-mono tracking-widest text-muted-foreground transition-colors hover:text-foreground"
      >
        <MoreHorizontal className="size-5" />
        <span>Menu</span>
      </button>
    </nav>
  )
}
