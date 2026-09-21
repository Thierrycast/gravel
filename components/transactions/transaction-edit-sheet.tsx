"use client";

import { useEffect, useState } from "react";
import { BadgeDollarSign, CalendarClock, Link2, TrendingUp, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CopyDebugId } from "@/components/transactions/copy-debug-id";
import { useCurrency } from "@/lib/currency-context";
import { getCategoryEmoji } from "@/lib/category-emoji";
import { amountToneClass, formatDateFull } from "@/lib/format";
import { installmentLabel } from "@/lib/transaction-utils";
import { cn } from "@/lib/utils";
import type { CategoryLookup, Transaction } from "@/lib/types/api";

/**
 * Folha de edição de uma transação.
 *
 * Saiu de dentro de `app/transactions/page.tsx`, que tinha 1557 linhas e
 * acumulava busca de dados, leitura de parâmetros da URL, debounce, tabela de
 * desktop, lista mobile e esta folha — tudo no mesmo componente. Só este bloco
 * eram quase 400 linhas.
 *
 * O estado de rascunho (`draft`, `lendDraft`) e as duas mutações vieram junto:
 * são dela, não da página. A página agora só diz qual transação está
 * selecionada e se a folha está aberta.
 */

export type TransactionEditSheetProps = {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryLookup[];
  transferCategoryId: string | null;
  /** Chamado depois de salvar, para a página recarregar a lista. */
  onSaved: () => void;
};

export function TransactionEditSheet({
  transaction,
  open,
  onOpenChange,
  categories,
  transferCategoryId,
  onSaved,
}: TransactionEditSheetProps) {
  const { format, formatSigned } = useCurrency();
  const [draft, setDraft] = useState({
    categoryId: "",
    merchantName: "",
    description: "",
  });
  const [lendDraft, setLendDraft] = useState({
    friendName: "",
    dueDate: "",
    description: "",
  });
  const [savingOverride, setSavingOverride] = useState(false);
  const [savingLend, setSavingLend] = useState(false);

  // Semeia os rascunhos quando outra transação é selecionada. Antes isso ficava
  // em `openTransaction`, na página, que precisava conhecer a forma interna
  // desta folha para preenchê-la.
  useEffect(() => {
    if (!transaction) return;
    const defaultDueDate = new Date(transaction.date);
    defaultDueDate.setDate(defaultDueDate.getDate() + 30);

    setDraft({
      categoryId: transaction.categoryId ?? "",
      merchantName: transaction.merchantName ?? "",
      description: transaction.rawDescription ?? transaction.description ?? "",
    });
    setLendDraft({
      friendName: "",
      dueDate: Number.isNaN(defaultDueDate.getTime())
        ? new Date().toISOString().slice(0, 10)
        : defaultDueDate.toISOString().slice(0, 10),
      description: transaction.rawDescription ?? transaction.description ?? "",
    });
  }, [transaction]);

  const isSelfTransfer = Boolean(transaction?.isSelfTransfer);
  const signedAmount = transaction
    ? transaction.direction === "OUTFLOW"
      ? -Math.abs(transaction.amount)
      : Math.abs(transaction.amount)
    : 0;

  async function saveTransactionOverrides(extra?: Record<string, unknown>) {
    if (!transaction) return;
    setSavingOverride(true);
    try {
      const response = await fetch(`/api/domain/transactions/${transaction.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domainCategoryId: draft.categoryId || null,
          merchantName: draft.merchantName.trim() || null,
          description: draft.description.trim() || transaction.description,
          ...extra,
        }),
      });
      if (response.ok) {
        toast.success(
          extra?.markAsSalary ? "Transação marcada como salário" : "Transação atualizada",
        );
        onOpenChange(false);
        onSaved();
      } else {
        toast.error("Erro ao salvar transação");
      }
    } catch (error) {
      console.error("Failed to save transaction overrides", error);
      toast.error("Erro ao salvar transação");
    } finally {
      setSavingOverride(false);
    }
  }

  async function createLendFromSelectedTransaction() {
    if (!transaction) return;
    if (!lendDraft.friendName.trim()) {
      toast.error("Informe o nome da pessoa");
      return;
    }

    setSavingLend(true);
    try {
      const response = await fetch("/api/lends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          friendName: lendDraft.friendName.trim(),
          amount: Math.abs(transaction.amount),
          dueDate: lendDraft.dueDate || new Date().toISOString(),
          description:
            lendDraft.description.trim() ||
            transaction.rawDescription ||
            transaction.description,
          domainTransactionId: transaction.id,
        }),
      });

      if (!response.ok) throw new Error("Falha ao criar empréstimo");

      toast.success("Empréstimo criado e vinculado à transação");
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error("Erro ao criar empréstimo");
    } finally {
      setSavingLend(false);
    }
  }

  return (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent>
      <SheetHeader>
        <SheetTitle>
          {transaction?.displayTitle ??
            transaction?.description}
        </SheetTitle>
        <SheetDescription>
          {transaction?.displaySubtitle ??
            "Detalhes da transação selecionada."}
        </SheetDescription>
      </SheetHeader>

      {transaction ? (
        <div className="flex flex-1 flex-col gap-0 overflow-y-auto px-4 pb-6">
          {/* Hero amount */}
          <div className="py-4">
            <div
              className={cn(
                "text-center text-3xl font-bold tabular-nums",
                isSelfTransfer
                  ? "text-sky-500"
                  : amountToneClass(signedAmount),
              )}
            >
              {isSelfTransfer
                ? format(Math.abs(transaction.amount))
                : formatSigned(signedAmount, "always")}
            </div>
            {(transaction.isSalary || isSelfTransfer || transaction.linkedLend) && (
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {transaction.isSalary ? (
                  <Badge className="gap-1 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400">
                    <BadgeDollarSign className="size-3.5" />
                    Salário configurado
                  </Badge>
                ) : null}
                {isSelfTransfer ? (
                  <Badge className="gap-1 bg-sky-500/10 text-sky-600 hover:bg-sky-500/10 dark:text-sky-400">
                    ↔ Transferência entre contas
                  </Badge>
                ) : null}
                {transaction.linkedLend ? (
                  <Badge className="gap-1 bg-sky-500/10 text-sky-600 hover:bg-sky-500/10 dark:text-sky-400">
                    <Users className="size-3.5" />
                    {transaction.linkedLend.role === "payment-inflow"
                      ? "Recebimento de empréstimo"
                      : "Empréstimo a amigo"}
                  </Badge>
                ) : null}
              </div>
            )}
          </div>

          <Separator />

          {/* Info section */}
          <div className="space-y-3 py-4 text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Informações
            </p>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Descrição</span>
              <span className="max-w-[60%] text-right font-medium">
                {transaction.rawDescription ??
                  transaction.description}
              </span>
            </div>
            {installmentLabel(transaction) ? (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Parcela</span>
                <span>{installmentLabel(transaction)}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Data</span>
              <span>{formatDateFull(transaction.date)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Conta</span>
              <span className="text-right">
                {transaction.accountName || "Sem conta"}
              </span>
            </div>
            {isSelfTransfer ? (
              <>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Origem</span>
                  <span className="text-right">
                    {transaction.transferFromAccountName || "Não detectada"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Destino</span>
                  <span className="text-right">
                    {transaction.transferToAccountName || "Não detectado"}
                  </span>
                </div>
              </>
            ) : null}
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Categoria</span>
              <span className="text-right">
                {getCategoryEmoji(transaction.categoryName)}{" "}
                {transaction.categoryName}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Direção</span>
              <span>
                {transaction.direction === "INFLOW"
                  ? "Entrada"
                  : transaction.direction === "TRANSFER"
                    ? "Transferência"
                    : "Saída"}
              </span>
            </div>
            {transaction.merchantName ? (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Comerciante</span>
                <span className="max-w-[60%] text-right">
                  {transaction.merchantName}
                </span>
              </div>
            ) : null}
            {transaction.linkedLend ? (
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
                <div className="mb-2 flex items-center gap-2 text-sky-600 dark:text-sky-400">
                  <Link2 className="size-4" />
                  <span className="text-xs font-semibold uppercase tracking-widest">
                    Empréstimo vinculado
                  </span>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-3">
                    <span>Pessoa</span>
                    <span className="font-medium text-foreground">
                      {transaction.linkedLend.friendName}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Status</span>
                    <span className="font-medium text-foreground">
                      {transaction.linkedLend.status === "PAID"
                        ? "Pago"
                        : "Pendente"}
                    </span>
                  </div>
                  <CopyDebugId id={transaction.linkedLend.id} label="LEND" />
                </div>
              </div>
            ) : null}
          </div>

          <Separator />

          {/* Editable fields */}
          <div className="space-y-3 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Editar
            </p>
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Categoria
              </span>
              <Select
                value={draft.categoryId || "__none__"}
                onValueChange={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    categoryId: value === "__none__" ? "" : value,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem categoria</SelectItem>
                  {(categories).map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Comerciante
              </span>
              <Input
                value={draft.merchantName}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    merchantName: event.target.value,
                  }))
                }
                placeholder="Nome do comerciante"
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Descrição
              </span>
              <Input
                value={draft.description}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                placeholder="Descrição da transação"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                disabled={savingOverride}
                onClick={() => saveTransactionOverrides()}
              >
                {savingOverride ? "Salvando..." : "Salvar ajustes"}
              </Button>
              <Button
                variant="secondary"
                disabled={savingOverride}
                onClick={() =>
                  saveTransactionOverrides({
                    markInternalTransfer: true,
                    domainCategoryId: transferCategoryId,
                  })
                }
              >
                Transferência interna
              </Button>
            </div>
            {transaction.direction === "INFLOW" &&
            !transaction.isSalary &&
            // Pagamento de fatura de cartão nunca é salário — esconder o
            // botão evita padrões genéricos ("Pagamento recebido") que
            // transformariam todo pagamento de cartão em renda.
            !/pagamento\s+(de\s+)?(cart[aã]o|fatura)|fatura\s+de\s+cart[aã]o/i.test(
              transaction.categoryName ?? "",
            ) &&
            !/^pagamento\s*(recebido|de\s*fatura)/i.test(
              transaction.description ?? "",
            ) ? (
              <Button
                variant="outline"
                className="w-full justify-start gap-2 border-emerald-500/30 bg-emerald-500/5 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                disabled={savingOverride}
                onClick={() => saveTransactionOverrides({ markAsSalary: true })}
              >
                <BadgeDollarSign className="size-4" />
                Marcar esta entrada como salário
              </Button>
            ) : null}
            {transaction.direction === "OUTFLOW" &&
            transaction.categoryName.toLowerCase() !== "investimentos" &&
            transaction.categoryName.toLowerCase() !== "investimento" ? (
              <Button
                variant="outline"
                className="w-full justify-start gap-2 border-amber-500/30 bg-amber-500/5 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                disabled={savingOverride}
                onClick={() => saveTransactionOverrides({ markAsInvestment: true })}
              >
                <TrendingUp className="size-4" />
                Marcar como investimento
              </Button>
            ) : null}
            {transaction.direction === "OUTFLOW" &&
            !transaction.linkedLend ? (
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                <div className="mb-3 flex items-center gap-2 text-sky-600 dark:text-sky-400">
                  <Users className="size-4" />
                  <span className="text-xs font-semibold uppercase tracking-widest">
                    Criar empréstimo desta saída
                  </span>
                </div>
                <div className="space-y-2">
                  <Input
                    value={lendDraft.friendName}
                    onChange={(event) =>
                      setLendDraft((prev) => ({
                        ...prev,
                        friendName: event.target.value,
                      }))
                    }
                    placeholder="Nome da pessoa"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      type="date"
                      value={lendDraft.dueDate}
                      onChange={(event) =>
                        setLendDraft((prev) => ({
                          ...prev,
                          dueDate: event.target.value,
                        }))
                      }
                    />
                    <Input
                      value={lendDraft.description}
                      onChange={(event) =>
                        setLendDraft((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      placeholder="Motivo"
                    />
                  </div>
                  <Button
                    className="w-full gap-2"
                    disabled={savingLend}
                    onClick={createLendFromSelectedTransaction}
                  >
                    <Link2 className="size-4" />
                    {savingLend ? "Vinculando..." : "Vincular empréstimo"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex flex-col gap-2 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Ações
            </p>
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={async () => {
                if (!transaction) return;
                const currentDate = new Date(transaction.date);
                const nextMonth = new Date(currentDate);
                nextMonth.setMonth(currentDate.getMonth() + 1);
                try {
                  const res = await fetch(
                    `/api/domain/transactions/${transaction.id}`,
                    {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ occurredAt: nextMonth.toISOString() }),
                    },
                  );
                  if (res.ok) { onOpenChange(false); onSaved(); }
                } catch (error) { console.error("Failed to update date", error); }
              }}
            >
              <CalendarClock className="size-4" />
              Adiar para o próximo mês
            </Button>
            <Button
              variant="ghost"
              className="justify-start gap-2 text-muted-foreground hover:text-destructive"
              onClick={async () => {
                if (!transaction) return;
                try {
                  const res = await fetch(
                    `/api/domain/transactions/${transaction.id}`,
                    {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ignored: !transaction.ignored }),
                    },
                  );
                  if (res.ok) { onOpenChange(false); onSaved(); }
                } catch (error) { console.error("Failed to toggle ignored", error); }
              }}
            >
              <X className="size-4" />
              {transaction.ignored ? "Remover de ignorados" : "Ignorar transação"}
            </Button>
          </div>

          <Separator />

          {/* Debug */}
          <div className="py-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Debug
            </p>
            <CopyDebugId id={transaction.id} label="TX" />
          </div>
        </div>
      ) : null}
    </SheetContent>
  </Sheet>
  );
}
