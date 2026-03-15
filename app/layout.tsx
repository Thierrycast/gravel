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
        <ThemeProvider
          defaultTheme="system"
          storageKey="gravel-ui-theme"
        >
          <TooltipProvider>
            <SidebarProvider>
              <AppSidebar />
              <main className="flex-1 w-full">
                <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-4 py-2">
                  <SidebarTrigger />
                </div>
                <div className="flex-1">
                  {children}
                </div>
              </main>
            </SidebarProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
