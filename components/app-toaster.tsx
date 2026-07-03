"use client";

import { useTheme } from "next-themes";
import { Toaster } from "sonner";

export function AppToaster() {
  const { resolvedTheme } = useTheme();

  const sonnerTheme: "light" | "dark" =
    resolvedTheme === "light" ||
    resolvedTheme === "cyberpunk-light" ||
    resolvedTheme === "emerald-light"
      ? "light"
      : "dark";

  return (
    <Toaster
      theme={sonnerTheme}
      // Appears just below the sticky header, accounting for the safe-area
      // inset on notched/Dynamic Island iPhones.
      position="top-right"
      offset={{ top: "calc(3.75rem + env(safe-area-inset-top))", right: "1rem" }}
      // No mobile o sonner usa mobileOffset (não offset) — sem ele o toast
      // usa 16px fixos e fica escondido atrás da Dynamic Island no PWA iOS.
      mobileOffset={{
        top: "calc(3.75rem + env(safe-area-inset-top))",
        left: "1rem",
        right: "1rem",
      }}
      gap={8}
      toastOptions={{
        classNames: {
          toast: [
            // Background + border use CSS variables — always match the active theme
            // regardless of sonner's own light/dark internal styles.
            "group border font-mono text-xs tracking-tight rounded-xl shadow-2xl",
            "bg-card text-foreground border-border/60",
          ].join(" "),
          title: "font-semibold text-sm text-foreground",
          description: "text-xs text-muted-foreground",
          actionButton:
            "bg-primary text-primary-foreground text-xs hover:bg-primary/90",
          cancelButton:
            "bg-muted text-muted-foreground text-xs hover:bg-muted/80",
          closeButton:
            "border-border/40 bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
          success: "border-emerald-500/30 [&>[data-icon]]:text-emerald-400",
          error:   "border-red-500/30   [&>[data-icon]]:text-red-400",
          warning: "border-amber-500/30 [&>[data-icon]]:text-amber-400",
          info:    "border-blue-500/30  [&>[data-icon]]:text-blue-400",
        },
        // Sits above headers (z-50), sheets (radix uses z-50), and bottom nav (z-50).
        style: { zIndex: 99999 },
      }}
    />
  );
}
