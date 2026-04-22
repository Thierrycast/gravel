import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

export const metadata: Metadata = {
  title: "Gravel Finance",
  description: "Dashboard financeira pessoal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider defaultTheme="system" storageKey="gravel-ui-theme">
          <TooltipProvider delayDuration={150}>
            <SidebarProvider>
              <AppSidebar />
              <main className="flex min-h-svh flex-1 flex-col w-full">
                <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border/60 bg-background/75 px-3 backdrop-blur-md md:px-4">
                  <SidebarTrigger className="-ml-1" />
                </header>
                <div className="flex-1">
                  <div className="page-container py-5 md:py-6 lg:py-8">
                    {children}
                  </div>
                </div>
              </main>
            </SidebarProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
