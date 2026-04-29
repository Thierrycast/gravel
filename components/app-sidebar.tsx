"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  Receipt,
  TrendingUp,
  Tags,
  Bitcoin,
  PieChart,
  Calendar,
  FileText,
  Link as LinkIcon,
  Store,
  Target,
  Landmark,
  ArrowUpRight,
  Activity,
  Settings2,
  Sparkles,
  Brain,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const mainNavItems = [
  {
    title: "Vis\u00e3o Geral",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Transa\u00e7\u00f5es",
    href: "/transactions",
    icon: ArrowLeftRight,
  },
  {
    title: "Recorr\u00eancias",
    href: "/recurring",
    icon: Calendar,
  },
  {
    title: "Receitas",
    href: "/recurring/income",
    icon: ArrowUpRight,
  },
  {
    title: "Fluxo de Caixa",
    href: "/cash-flow",
    icon: TrendingUp,
  },
]

const financeNavItems = [
  {
    title: "Contas",
    href: "/accounts",
    icon: Wallet,
  },
  {
    title: "Faturas",
    href: "/bills",
    icon: Receipt,
  },
  {
    title: "Categorias",
    href: "/categories",
    icon: Tags,
  },
  {
    title: "Comerciantes",
    href: "/merchants",
    icon: Store,
  },
]

const investmentNavItems = [
  {
    title: "Portf\u00f3lio",
    href: "/portfolio",
    icon: PieChart,
  },
  {
    title: "Investimentos",
    href: "/investments",
    icon: Landmark,
  },
  {
    title: "Crypto",
    href: "/crypto",
    icon: Bitcoin,
  },
]

const planningNavItems = [
  {
    title: "Insights AI",
    href: "/insights",
    icon: Brain,
  },
  {
    title: "Proje\u00e7\u00f5es",
    href: "/projection",
    icon: Activity,
  },
  {
    title: "Cen\u00e1rios",
    href: "/scenarios",
    icon: Sparkles,
  },
  {
    title: "Metas",
    href: "/goals",
    icon: Target,
  },
  {
    title: "Relat\u00f3rios",
    href: "/reports",
    icon: FileText,
  },
  {
    title: "Configura\u00e7\u00f5es",
    href: "/settings",
    icon: Settings2,
  },
  {
    title: "Conex\u00f5es",
    href: "/connect",
    icon: LinkIcon,
  },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20 group-data-[collapsible=icon]:size-8">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-5"
                  >
                    <path d="M2 20c1-2 3-3 5-3s4 1 5 3" />
                    <path d="M7 17c1-3 4-5 8-5s7 2 8 5" />
                    <path d="M12 12c1-4 5-7 10-7" />
                    <circle cx="5" cy="5" r="1" fill="currentColor" />
                    <circle cx="10" cy="8" r="1" fill="currentColor" />
                  </svg>
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-black text-lg tracking-tighter uppercase italic">Gravel</span>
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Finance OS</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Organiza&ccedil;&atilde;o</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Controle Financeiro</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {financeNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Investimentos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {investmentNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Vis&atilde;o Estrat&eacute;gica</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {planningNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-3 py-2 text-xs font-mono text-muted-foreground tracking-wider border-t border-border">
          SYS::OK
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
