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
    title: "Proje\u00e7\u00f5es",
    href: "/projection",
    icon: Activity,
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
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center border border-primary/40 bg-background text-primary">
                  <span className="text-[10px] font-bold tracking-widest font-mono">GRV</span>
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-bold tracking-widest font-mono text-foreground">GRAVEL</span>
                  <span className="truncate text-[10px] tracking-widest text-muted-foreground font-mono">FINANCE_v1</span>
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
        <div className="px-3 py-2 text-[10px] font-mono text-muted-foreground tracking-wider border-t border-border">
          SYS::OK
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
