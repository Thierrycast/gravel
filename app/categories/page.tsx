"use client";

import { Suspense, useState, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  Tag,
  Zap,
  BarChart3,
} from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useApi } from "@/hooks/use-api";
import { usePeriod } from "@/hooks/use-period";
import { useCurrency } from "@/lib/currency-context";
import { PageHeader } from "@/components/page-header";
import { PeriodSwitcher } from "@/components/period-switcher";
import { formatPercent } from "@/lib/format";
import { getCategoryEmoji, getCategoryColor } from "@/lib/category-emoji";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useRouter, useSearchParams } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpendingCategory {
  name: string;
  categoryId: string;
  amount: number;
  sharePercent: number;
  count: number;
}

interface SpendingResponse {
  summary: {
    total: number;
    appliedFilters?: { from?: string; to?: string };
  };
  results: SpendingCategory[];
}

interface DomainCategory {
  id: string;
  slug: string;
  name: string;
  kind: string;
  color: string | null;
  parentId: string | null;
}

interface DomainCategoriesResponse {
  results: DomainCategory[];
}

type DisplayCategory = SpendingCategory;

interface TagItem {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

interface TagsResponse {
  results: TagItem[];
}

interface RuleCategory {
  id: string;
  name: string;
}

interface AutomationRule {
  id: string;
  provider: string | null;
  matchType: string;
  matchField: string;
  matchValue: string;
  domainCategoryId: string | null;
  active: boolean;
  priority: number;
  category: RuleCategory | null;
  createdAt: string;
  updatedAt: string;
}

interface AutomationsResponse {
  results: AutomationRule[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TabKey = "categorias" | "tags" | "automacoes";

const MATCH_FIELD_LABELS: Record<string, string> = {
  description: "Descrição",
  merchantName: "Nome do Comerciante",
  merchantCnpj: "CNPJ",
  providerCategoryId: "Categoria do Provider",
};

const MATCH_TYPE_LABELS: Record<string, string> = {
  EXACT: "Exato",
  CONTAINS: "Contém",
  PREFIX: "Prefixo",
  REGEX: "Regex",
};

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="mx-auto h-[200px] w-[200px] rounded-full" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category Badge - colored circle with emoji
// ---------------------------------------------------------------------------

function CategoryBadge({
  name,
  index,
  size = "md",
}: {
  name: string;
  index?: number;
  size?: "sm" | "md";
}) {
  const emoji = getCategoryEmoji(name);
  const color = getCategoryColor(name, index);
  const sizeClasses = size === "sm" ? "size-8 text-sm" : "size-10 text-lg";

  return (
    <div
      className={`${sizeClasses} flex shrink-0 items-center justify-center rounded-full`}
      style={{ backgroundColor: `${color}20` }}
    >
      <span>{emoji}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tags Tab
// ---------------------------------------------------------------------------

function TagsTab() {
  const { data: tagsData, refetch } = useApi<TagsResponse>("/api/tags");
  const tags = tagsData?.results ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagItem | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditingTag(null);
    setTagName("");
    setTagColor("#6366f1");
    setDialogOpen(true);
  }

  function openEdit(tag: TagItem) {
    setEditingTag(tag);
    setTagName(tag.name);
    setTagColor(tag.color);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!tagName.trim()) return;
    setSaving(true);
    try {
      if (editingTag) {
        await fetch(`/api/tags/${editingTag.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: tagName.trim(), color: tagColor }),
        });
      } else {
        await fetch("/api/tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: tagName.trim(), color: tagColor }),
        });
      }
      setDialogOpen(false);
      refetch();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/tags/${id}`, { method: "DELETE" });
    refetch();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Tags</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie tags para organizar suas transações.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 size-4" />
          Nova Tag
        </Button>
      </div>

      {tags.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Tag className="mb-3 size-10 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma tag criada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tags.map((tag) => (
            <Card key={tag.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div
                    className="size-4 rounded-full shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="font-medium">{tag.name}</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(tag)}>
                      <Pencil className="mr-2 size-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(tag.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 size-4" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTag ? "Editar Tag" : "Nova Tag"}</DialogTitle>
            <DialogDescription>
              {editingTag
                ? "Atualize o nome e a cor da tag."
                : "Crie uma nova tag para organizar suas transações."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Nome</label>
              <Input
                placeholder="Nome da tag"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Cor</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={tagColor}
                  onChange={(e) => setTagColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border"
                />
                <Input
                  value={tagColor}
                  onChange={(e) => setTagColor(e.target.value)}
                  placeholder="#6366f1"
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !tagName.trim()}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Automations Tab
// ---------------------------------------------------------------------------

function AutomacoesTab() {
  const { data: rulesData, refetch } =
    useApi<AutomationsResponse>("/api/automations");
  const { data: categoriesData } = useApi<DomainCategoriesResponse>(
    "/api/domain/categories",
  );

  const rules = rulesData?.results ?? [];
  const domainCategories = categoriesData?.results ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [matchField, setMatchField] = useState("description");
  const [matchType, setMatchType] = useState("CONTAINS");
  const [matchValue, setMatchValue] = useState("");
  const [domainCategoryId, setDomainCategoryId] = useState("");
  const [priority, setPriority] = useState(100);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditingRule(null);
    setMatchField("description");
    setMatchType("CONTAINS");
    setMatchValue("");
    setDomainCategoryId("");
    setPriority(100);
    setDialogOpen(true);
  }

  function openEdit(rule: AutomationRule) {
    setEditingRule(rule);
    setMatchField(rule.matchField);
    setMatchType(rule.matchType);
    setMatchValue(rule.matchValue);
    setDomainCategoryId(rule.domainCategoryId ?? "");
    setPriority(rule.priority);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!matchValue.trim()) return;
    setSaving(true);
    try {
      const payload = {
        matchField,
        matchType,
        matchValue: matchValue.trim(),
        domainCategoryId: domainCategoryId || null,
        priority,
      };
      if (editingRule) {
        await fetch(`/api/automations/${editingRule.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/automations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setDialogOpen(false);
      refetch();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/automations/${id}`, { method: "DELETE" });
    refetch();
  }

  async function handleToggleActive(rule: AutomationRule) {
    await fetch(`/api/automations/${rule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !rule.active }),
    });
    refetch();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Automações</h2>
          <p className="text-sm text-muted-foreground">
            Regras automáticas para categorizar transações.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 size-4" />
          Nova Automação
        </Button>
      </div>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Zap className="mb-3 size-10 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma automação criada</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-center">Prioridade</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">
                      {MATCH_FIELD_LABELS[rule.matchField] ?? rule.matchField}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {MATCH_TYPE_LABELS[rule.matchType] ?? rule.matchType}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-mono text-xs">
                      {rule.matchValue}
                    </TableCell>
                    <TableCell>
                      {rule.category?.name ?? (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {rule.priority}
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={() => handleToggleActive(rule)}
                        className="cursor-pointer"
                      >
                        <Badge variant={rule.active ? "default" : "outline"}>
                          {rule.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(rule)}>
                            <Pencil className="mr-2 size-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(rule.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 size-4" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "Editar Automação" : "Nova Automação"}
            </DialogTitle>
            <DialogDescription>
              {editingRule
                ? "Atualize a regra de categorização."
                : "Crie uma nova regra para categorizar transações automaticamente."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Campo</label>
              <select
                value={matchField}
                onChange={(e) => setMatchField(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="description">Descrição</option>
                <option value="merchantName">Nome do Comerciante</option>
                <option value="merchantCnpj">CNPJ</option>
                <option value="providerCategoryId">
                  Categoria do Provider
                </option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                Tipo de Correspondência
              </label>
              <select
                value={matchType}
                onChange={(e) => setMatchType(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="EXACT">Exato</option>
                <option value="CONTAINS">Contém</option>
                <option value="PREFIX">Prefixo</option>
                <option value="REGEX">Regex</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Valor</label>
              <Input
                placeholder="Valor para correspondência"
                value={matchValue}
                onChange={(e) => setMatchValue(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Categoria</label>
              <select
                value={domainCategoryId}
                onChange={(e) => setDomainCategoryId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Selecionar categoria...</option>
                {domainCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Prioridade</label>
              <Input
                type="number"
                placeholder="100"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                min={1}
              />
              <p className="text-xs text-muted-foreground">
                Menor número = maior prioridade
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !matchValue.trim()}
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function CategoriesLoadingFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-[420px] rounded-xl" />
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <Suspense fallback={<CategoriesLoadingFallback />}>
      <CategoriesPageContent />
    </Suspense>
  );
}

function CategoriesPageContent() {
  const { format } = useCurrency();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>("categorias");
  const period = usePeriod("mtd");

  const [showSalary, setShowSalary] = useState(
    searchParams.get("showFutureSalary") !== "false",
  );
  const [showFuture, setShowFuture] = useState(
    searchParams.get("showFutureAccounts") !== "false",
  );
  const [detailed, setDetailed] = useState(
    searchParams.get("detailed") !== "false",
  );

  const updateParam = (key: string, value: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, String(value));
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const { data: spending, loading: spendingLoading } = useApi<SpendingResponse>(
    "/api/domain/metrics/spending/categories",
    {
      ...period.params,
      limit: "30",
    },
  );

  // Fetch all categories for hierarchy
  const { data: allCategoriesData } = useApi<DomainCategoriesResponse>("/api/domain/categories", {
    pageSize: "500",
  });

  const loading = spendingLoading;

  const sortedCategories = useMemo(() => {
    if (!spending?.results) return [];
    return [...spending.results].sort(
      (a, b) => Math.abs(b.amount) - Math.abs(a.amount),
    );
  }, [spending]);

  // Compute aggregated categories (roll up to parent)
  const aggregatedCategories = useMemo(() => {
    if (!spending?.results || !allCategoriesData?.results) return [];

    const catParentMap = new Map<string, string | null>();
    allCategoriesData.results.forEach((cat) => {
      catParentMap.set(cat.id, cat.parentId);
    });

    const rootAmounts: Record<string, number> = {};
    const rootCounts: Record<string, number> = {};

    spending.results.forEach((item) => {
      let rootId = item.categoryId;
      let parentId = catParentMap.get(item.categoryId);
      while (parentId) {
        rootId = parentId;
        parentId = catParentMap.get(rootId);
      }
      rootAmounts[rootId] = (rootAmounts[rootId] || 0) + item.amount;
      rootCounts[rootId] = (rootCounts[rootId] || 0) + item.count;
    });

    const rootCats = allCategoriesData.results.filter(
      (cat) => !cat.parentId && rootAmounts[cat.id] !== undefined,
    );

    const total = rootCats.reduce(
      (sum, cat) => sum + rootAmounts[cat.id],
      0,
    );

    const results = rootCats
      .map((cat) => ({
        categoryId: cat.id,
        name: cat.name,
        amount: rootAmounts[cat.id],
        sharePercent: total > 0 ? (rootAmounts[cat.id] / total) * 100 : 0,
        count: rootCounts[cat.id] || 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return results;
  }, [spending, allCategoriesData]);

  const displayCategories = useMemo(() => {
    return detailed ? sortedCategories : aggregatedCategories;
  }, [detailed, sortedCategories, aggregatedCategories]);

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    displayCategories.forEach((cat, i) => {
      config[cat.name] = {
        label: cat.name,
        color: getCategoryColor(cat.name, i),
      };
    });
    return config;
  }, [displayCategories]);

  const pieData = useMemo(() => {
    return displayCategories.map((cat, i) => ({
      name: cat.name,
      value: Math.abs(cat.amount),
      fill: getCategoryColor(cat.name, i),
    }));
  }, [displayCategories]);

  const totalSpending = spending?.summary?.total ?? 0;

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    {
      key: "categorias",
      label: "Categorias",
      icon: <BarChart3 className="size-4" />,
    },
    { key: "tags", label: "Tags", icon: <Tag className="size-4" /> },
    {
      key: "automacoes",
      label: "Automações",
      icon: <Zap className="size-4" />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Categorias"
        title="Categorias e regras"
        description="Acompanhe onde o dinheiro saiu no período e mantenha tags e automações em ordem."
        actions={
          activeTab === "categorias" ? (
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-4 border-r pr-6 border-border/60">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="show-salary"
                    checked={showSalary}
                    onCheckedChange={(val) => {
                      setShowSalary(val);
                      updateParam("showFutureSalary", val);
                    }}
                  />
                  <Label
                    htmlFor="show-salary"
                    className="text-xs font-medium cursor-pointer"
                  >
                    Salários
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="show-future"
                    checked={showFuture}
                    onCheckedChange={(val) => {
                      setShowFuture(val);
                      updateParam("showFutureAccounts", val);
                    }}
                  />
                  <Label
                    htmlFor="show-future"
                    className="text-xs font-medium cursor-pointer"
                  >
                    Parcelas
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="detailed"
                    checked={detailed}
                    onCheckedChange={(val) => {
                      setDetailed(val);
                      updateParam("detailed", val);
                    }}
                  />
                  <Label
                    htmlFor="detailed"
                    className="text-xs font-medium cursor-pointer"
                  >
                    Subcategorias
                  </Label>
                </div>
              </div>
              <PeriodSwitcher state={period} />
            </div>
          ) : null
        }
      />

      {/* Tab navigation */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "categorias" && (
        <>
          {loading ? (
            <LoadingSkeleton />
          ) : (
            <div className="flex flex-col gap-6">
              {/* Hero: Month overview with donut */}
              <Card>
                <CardContent className="flex flex-col items-center gap-5 p-5 sm:flex-row sm:justify-between">
                  <div className="flex flex-col items-center gap-1 sm:items-start">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      Gasto{" "}
                      {period.period === "mtd"
                        ? "neste mês"
                        : period.period === "ytd"
                          ? "neste ano"
                          : `em ${period.label.toLowerCase()}`}
                    </p>
                    <p className="text-4xl font-bold tabular-nums tracking-tight">
                      {format(totalSpending)}
                    </p>
                  </div>

                  {pieData.length > 0 && (
                    <ChartContainer
                      config={chartConfig}
                      className="aspect-square h-[160px] shrink-0"
                    >
                      <PieChart>
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value) => format(value as number)}
                            />
                          }
                        />
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={72}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                          strokeWidth={0}
                        >
                          {pieData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>

              {/* Info banner */}
              <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                Clique numa categoria para abrir a lista de transações já
                filtrada.
              </div>

              {/* Category list */}
              {displayCategories.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <BarChart3 className="mb-3 size-10 text-muted-foreground" />
                    <p className="font-medium">Nenhum gasto registrado</p>
                    <p className="text-sm text-muted-foreground">
                      Nenhuma despesa encontrada neste período.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-xl border bg-card">
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 sm:gap-4 border-b px-4 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground sm:grid-cols-[1fr_120px_80px_100px]">
                    <span>Categoria</span>
                    <span className="hidden text-right sm:block">Saldo</span>
                    <span className="text-right">%</span>
                    <span className="hidden text-right sm:block">
                      Transações
                    </span>
                  </div>

                  {/* Category rows */}
                  {displayCategories.map((cat: DisplayCategory, i: number) => {
                    const color = getCategoryColor(cat.name, i);
                    const barPercent = Math.min(
                      (Math.abs(cat.amount) /
                        Math.abs(displayCategories[0]?.amount || 1)) *
                        100,
                      100,
                    );

                    return (
                      <Link
                        href={`/transactions?categoryId=${encodeURIComponent(cat.categoryId)}`}
                        key={cat.categoryId}
                        className="group grid grid-cols-[1fr_auto_auto] items-center gap-2 sm:gap-4 border-b border-border/50 px-4 py-3 transition-colors last:border-0 hover:bg-muted/20 sm:grid-cols-[1fr_120px_80px_100px]"
                      >
                        {/* Category name with badge */}
                        <div className="flex items-center gap-3 min-w-0">
                          <CategoryBadge name={cat.name} index={i} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {cat.name}
                            </p>
                            <div className="mt-1 h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-muted/50">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${barPercent}%`,
                                  backgroundColor: color,
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Amount */}
                        <p className="hidden text-right text-sm font-semibold tabular-nums sm:block">
                          {format(Math.abs(cat.amount))}
                        </p>

                        {/* Percentage */}
                        <p className="text-right text-sm tabular-nums text-muted-foreground">
                          {formatPercent(cat.sharePercent)}
                        </p>

                        {/* Transaction count */}
                        <div className="hidden text-right sm:block">
                          <Badge variant="secondary" className="text-xs">
                            {cat.count}{" "}
                            {cat.count === 1 ? "transação" : "transações"}
                          </Badge>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === "tags" && <TagsTab />}
      {activeTab === "automacoes" && <AutomacoesTab />}
    </div>
  );
}
