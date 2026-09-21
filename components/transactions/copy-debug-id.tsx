"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

/**
 * Botão que copia um identificador interno. Estava dentro de
 * `app/transactions/page.tsx`; virou arquivo próprio porque a folha de edição,
 * extraída na mesma rodada, também usa.
 */
export function CopyDebugId({ id, label = "ID" }: { id: string; label?: string }) {
  async function copyId() {
    try {
      await navigator.clipboard.writeText(id);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Não foi possível copiar o ID");
    }
  }

  return (
    <button
      type="button"
      onClick={copyId}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
      title={`Copiar ${label.toLowerCase()}: ${id}`}
    >
      <span className="uppercase tracking-widest">{label}</span>
      <span className="truncate">{id}</span>
      <Copy className="size-3 shrink-0" />
    </button>
  );
}
