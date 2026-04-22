import type { Metadata } from "next";
import { Suspense } from "react";
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
  description: "Personal financial dashboard with multi-currency support and privacy mode.",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
  },
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Gravel",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className="dark">
      <body className="antialiased">
        <ThemeProvider defaultTheme="system" storageKey="gravel-ui-theme">
          <CurrencyProvider>
            <TooltipProvider delayDuration={150}>
            <SidebarProvider>
              <AppSidebar />
              <main className="flex min-h-svh flex-1 flex-col w-full">
                <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-2 border-b border-border bg-background/80 backdrop-blur-md px-3 md:px-4">
                  <SidebarTrigger className="-ml-1 hidden md:flex text-muted-foreground hover:text-foreground" />
                  <div className="flex items-center gap-1.5 md:gap-2">
                    <PrivacyToggle />
                    <CurrencySelector />
                    <SyncButton />
                  </div>
                </header>
                <div className="flex-1">
                  <div className="page-container py-5 pb-20 md:pb-8 md:py-6 lg:py-8">
                    <Suspense fallback={<div className="flex w-full h-full items-center justify-center p-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
                      {children}
                    </Suspense>
                  </div>
                </div>
              </main>
              <BottomNav />
            </SidebarProvider>
            </TooltipProvider>
          </CurrencyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
