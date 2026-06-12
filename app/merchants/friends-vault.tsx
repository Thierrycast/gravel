"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Plus, Trash2, Users, Wallet } from "lucide-react";

import { useApi } from "@/hooks/use-api";
import { useCurrency } from "@/lib/currency-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface LendSuggestion {
  id: string;
  description: string;
  amount: number;
  date: string;
  accountName: string | null;
  amountDifference: number;
  daysFromDue: number;
}

interface Lend {
  id: string;
  friendName: string;
  friendPhone: string | null;
  amount: number | string; // Decimal from prisma might come as string
  description: string | null;
  dueDate: string;
  status: "PENDING" | "PAID";
  suggestedInflowTransactions?: LendSuggestion[];
}

export function FriendsVault() {
  const { format: formatCurrency } = useCurrency();
  const { data: lends, refetch, loading } = useApi<Lend[]>("/api/lends");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({
    friendName: "",
    amount: "",
    description: "",
    dueDate: new Date().toISOString().split("T")[0],
  });

  const [selectedInflowId, setSelectedInflowId] = useState<string>("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.friendName || !form.amount || !form.dueDate) return;

    try {
      const res = await fetch("/api/lends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          friendName: form.friendName,
          amount: parseFloat(form.amount),
          description: form.description,
          dueDate: new Date(form.dueDate).toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Failed to add lend");
      toast.success("Empréstimo/Divisão registrada!");
      setForm({ friendName: "", amount: "", description: "", dueDate: new Date().toISOString().split("T")[0] });
      setIsAddOpen(false);
      refetch();
    } catch (err) {
      console.error("[lends] add failed", err)
      toast.error("Erro ao registrar");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja remover este registro?")) return;
    try {
      const res = await fetch(`/api/lends?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Registro removido");
      refetch();
    } catch (err) {
      console.error("[lends] delete failed", err)
      toast.error("Erro ao remover");
    }
  }

  async function handleMarkAsPaid(id: string, inflowId?: string) {
    try {
      const res = await fetch("/api/lends", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: "PAID",
          inflowTransactionId: inflowId || selectedInflowId || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Marcado como pago!");
      setSelectedInflowId("");
      refetch();
    } catch (err) {
      console.error("[lends] mark-paid failed", err)
      toast.error("Erro ao atualizar");
    }
  }

  const pendingLends = lends?.filter((l) => l.status === "PENDING") || [];
  const paidLends = lends?.filter((l) => l.status === "PAID") || [];

  const totalPending = pendingLends.reduce((acc, lend) => acc + Number(lend.amount), 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Users className="size-4 text-muted-foreground" />
                <CardDescription>A Receber</CardDescription>
              </div>
            </div>
            <CardTitle className="text-emerald-500">{formatCurrency(totalPending)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Pendentes</CardTitle>
            <CardDescription>Valores que seus amigos ainda te devem</CardDescription>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4 mr-2" />
                Novo Registro
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleAdd}>
                <DialogHeader>
                  <DialogTitle>Registrar Empréstimo/Divisão</DialogTitle>
                  <DialogDescription>
                    Adicione um valor que você emprestou ou dividiu e precisa receber de volta.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="friendName">Nome do Amigo(a)</Label>
                    <Input
                      id="friendName"
                      placeholder="Ex: João Silva"
                      value={form.friendName}
                      onChange={(e) => setForm({ ...form, friendName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Valor (R$)</Label>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dueDate">Data Prevista</Label>
                      <Input
                        id="dueDate"
                        type="date"
                        value={form.dueDate}
                        onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição / Motivo</Label>
                    <Input
                      id="description"
                      placeholder="Ex: Churrasco, Compra no cartão..."
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Salvar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          {pendingLends.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Users className="size-12 text-muted-foreground mb-4 opacity-20" />
              <h3 className="text-lg font-medium mb-1">Ninguém te deve nada</h3>
              <p className="text-sm text-muted-foreground">Que maravilha! Tudo certo com seus amigos.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Amigo(a)</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Previsão</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingLends.map((lend) => {
                  const isLate = new Date(lend.dueDate) < new Date();
                  return (
                    <TableRow key={lend.id}>
                      <TableCell className="font-medium">{lend.friendName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                        {lend.description || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isLate ? "destructive" : "secondary"}>
                          {format(new Date(lend.dueDate), "dd MMM, yy", { locale: ptBR })}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-emerald-500">
                        {formatCurrency(Number(lend.amount))}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {/* Intelligent Suggestions for payments */}
                        {lend.suggestedInflowTransactions && lend.suggestedInflowTransactions.length > 0 && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="secondary" className="h-8">
                                <Wallet className="size-3.5 mr-1" /> Ver Recebimentos
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Entradas Encontradas</DialogTitle>
                                <DialogDescription>
                                  Encontramos transações na sua conta com valor parecido. Foi o(a) {lend.friendName} que pagou?
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-3 py-4">
                                {lend.suggestedInflowTransactions.map((tx) => (
                                  <div key={tx.id} className="flex items-center justify-between border p-3 rounded-md">
                                    <div>
                                      <p className="font-medium text-sm">{tx.description}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {format(new Date(tx.date), "dd/MM/yyyy")} • {tx.accountName}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="font-medium text-emerald-500">{formatCurrency(tx.amount)}</span>
                                      <Button size="sm" onClick={() => handleMarkAsPaid(lend.id, tx.id)}>
                                        Confirmar
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}

                        <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Marcar como pago" onClick={() => handleMarkAsPaid(lend.id)}>
                          <Check className="size-4 text-emerald-500" />
                        </Button>
                        <Button size="icon" variant="outline" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" aria-label="Excluir empréstimo" onClick={() => handleDelete(lend.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {paidLends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Pagamentos</CardTitle>
            <CardDescription>Valores que já foram devolvidos</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Amigo(a)</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paidLends.map((lend) => (
                  <TableRow key={lend.id} className="opacity-60">
                    <TableCell className="font-medium">{lend.friendName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{lend.description || "-"}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(Number(lend.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
