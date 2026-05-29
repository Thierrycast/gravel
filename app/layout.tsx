import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { ViewTransitions } from "next-view-transitions";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SyncButton } from "@/components/sync-button";
import { CurrencySelector } from "@/components/currency-selector";
import { PrivacyToggle } from "@/components/privacy-toggle";
import { CurrencyProvider } from "@/lib/currency-context";
import { BottomNav } from "@/components/bottom-nav";

export const metadata: Metadata = {
  title: "Gravel Finance",
  description: "Personal financial dashboard with multi-currency support and privacy mode. Tracking every digital 'cascalho' with precision.",
  applicationName: "Gravel",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.png",
    apple: [{ url: "/icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Gravel",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

import { AppToaster } from "@/components/app-toaster";
import { ModeToggle } from "@/components/mode-toggle";
import { MobileToolbox } from "@/components/mobile-toolbox";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { SyncFailureBanner } from "@/components/sync-failure-banner";
import { VaultProvider } from "@/components/vault-provider";
import { AppQueryProvider } from "@/app/providers";
import { NEXT_THEMES_REGISTRY } from "@/lib/theme";
import { checkAndTriggerAutoSync } from "@/lib/ingestion/auto-sync";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shouldRunAutoSync =
    process.env.npm_lifecycle_event !== "build" &&
    process.env.NEXT_PHASE !== "phase-production-build";

  // Trigger auto-sync check on server-side load (fire-and-forget background check)
  // Skip this during production build/prerender to avoid touching a not-yet-migrated DB.
  if (shouldRunAutoSync) {
    checkAndTriggerAutoSync().catch((err) =>
      console.error("[layout] auto-sync check failed", err)
    );
  }

  return (
    <ViewTransitions>
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="gravel-ui-theme"
          themes={[...NEXT_THEMES_REGISTRY]}
        >
          <AppQueryProvider>
          <CurrencyProvider>
            <VaultProvider>
              <TooltipProvider delayDuration={150}>
              <SidebarProvider style={{ height: "100dvh" }}>
                <AppSidebar />
                <div className="relative flex flex-1 flex-col overflow-hidden">
                  <PullToRefresh />
                  <main
                    className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden [WebkitOverflowScrolling:touch]"
                  >
                    <header className="sticky top-0 z-50 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-background/80 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/65 px-3 md:px-6 xl:px-12 2xl:px-16 pt-[env(safe-area-inset-top)] [view-transition-name:app-header]">
                      <div className="flex items-center gap-3">
                        <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
                        <div className="flex items-center gap-2 md:hidden">
                          <div className="size-6 overflow-hidden rounded-md border border-primary/20 shadow-sm">
                            <Image src="/icon.png" alt="Logo" width={24} height={24} className="size-full object-cover" />
                          </div>
                          <span className="text-sm font-bold tracking-tighter uppercase italic">Gravel</span>
                        </div>
                      </div>
                      <div className="hidden md:flex items-center gap-1.5 md:gap-2">
                        <ModeToggle />
                        <PrivacyToggle />
                        <CurrencySelector />
                        <SyncButton />
                      </div>
                      <MobileToolbox />
                    </header>
                    <div className="page-container px-4 md:px-6 xl:px-12 2xl:px-16 xl:max-w-[1400px] 2xl:max-w-[1600px] mx-auto w-full py-5 pb-[calc(4rem+env(safe-area-inset-bottom)+1.25rem)] md:pb-8 md:py-6 lg:py-8">
                      <SyncFailureBanner />
                      <Suspense fallback={<div className="flex min-h-[40vh] w-full items-center justify-center p-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
                        {children}
                      </Suspense>
                    </div>
                  </main>
                  <BottomNav />
                </div>
              </SidebarProvider>
              </TooltipProvider>
            </VaultProvider>
            <AppToaster />
          </CurrencyProvider>
          </AppQueryProvider>
        </ThemeProvider>
      </body>
    </html>
    </ViewTransitions>
  );
}
