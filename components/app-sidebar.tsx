"use client";

import * as React from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";
import { ModeToggle } from "@/components/mode-toggle";
import { PrivacyToggle } from "@/components/privacy-toggle";
import { CurrencySelector } from "@/components/currency-selector";
import { SyncButton } from "@/components/sync-button";
import {
  NAV_MAIN,
  NAV_FINANCE,
  NAV_INVESTMENTS,
  NAV_PLANNING,
} from "@/lib/constants/navigation";

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
  useSidebar,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  ...NAV_MAIN,
  ...NAV_FINANCE,
  ...NAV_INVESTMENTS,
  ...NAV_PLANNING,
];

function activeRouteHref(pathname: string) {
  return NAV_ITEMS.filter(({ href }) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`),
  ).sort((left, right) => right.href.length - left.href.length)[0]?.href;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const activeHref = activeRouteHref(pathname);

  // Close mobile sidebar on navigation
  React.useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [pathname, isMobile, setOpenMobile]);

  const handleNavigate = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/" onClick={handleNavigate}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg shadow-lg shadow-primary/20 overflow-hidden group-data-[collapsible=icon]:size-8">
                  <Image
                    src="/icon.png"
                    alt="Gravel Logo"
                    width={32}
                    height={32}
                    className="size-full rounded-md object-cover"
                  />
                </div>
                <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                  <span className="font-black text-lg tracking-tighter uppercase italic">
                    Gravel
                  </span>
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-widest">
                    Finance OS
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Organização</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_MAIN.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={activeHref === item.href}
                  >
                    <Link
                      href={item.href}
                      aria-current={
                        activeHref === item.href ? "page" : undefined
                      }
                      onClick={handleNavigate}
                    >
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
              {NAV_FINANCE.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={activeHref === item.href}
                  >
                    <Link
                      href={item.href}
                      aria-current={
                        activeHref === item.href ? "page" : undefined
                      }
                      onClick={handleNavigate}
                    >
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
              {NAV_INVESTMENTS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={activeHref === item.href}
                  >
                    <Link
                      href={item.href}
                      aria-current={
                        activeHref === item.href ? "page" : undefined
                      }
                      onClick={handleNavigate}
                    >
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
          <SidebarGroupLabel>Visão Estratégica</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_PLANNING.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={activeHref === item.href}
                  >
                    <Link
                      href={item.href}
                      aria-current={
                        activeHref === item.href ? "page" : undefined
                      }
                      onClick={handleNavigate}
                    >
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

      <SidebarFooter className="p-3 border-t border-border/60 bg-muted/20">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 px-1 md:hidden">
            <div className="flex items-center gap-1">
              <ModeToggle />
              <PrivacyToggle />
            </div>
            <SyncButton />
          </div>
          <div className="md:hidden">
            <CurrencySelector />
          </div>
          <div className="px-1 py-1 text-[10px] font-mono text-muted-foreground/60 tracking-[0.2em] flex items-center justify-between group-data-[collapsible=icon]:hidden">
            <span>SYS::READY</span>
            <span className="animate-pulse">●</span>
          </div>
          <a
            href="https://github.com/Thierrycast"
            target="_blank"
            rel="noopener noreferrer"
            className="group-data-[collapsible=icon]:hidden px-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors leading-relaxed"
          >
            Desenvolvido por Thierry Castro
          </a>
        </div>
      </SidebarFooter>

    </Sidebar>
  );
}
