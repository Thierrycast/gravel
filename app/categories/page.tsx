"use client"

import { useState, useMemo, useCallback } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  Tag,
  Zap,
  BarChart3,
} from "lucide-react"
import { PieChart, Pie, Cell } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { useApi } from "@/hooks/use-api"
import { formatCurrency, formatPercent } from "@/lib/format"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Category {
  id: string
  name: string
  parentId: string | null
}

interface CategoriesResponse {
  results: Category[]
}

interface SpendingCategory {
  category: string
  categoryId: string
  total: number
  percentage: number
  transactionCount: number
}

interface SpendingResponse {
  summary: {
    total: number
  }
  results: SpendingCategory[]
}

interface TagItem {
  id: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
}

interface TagsResponse {
  results: TagItem[]
}

interface DomainCategory {
  id: string
  slug: string
  name: string
  kind: string
  color: string | null
}

interface DomainCategoriesResponse {
  results: DomainCategory[]
}

interface RuleCategory {
  id: string
  name: string
}

interface AutomationRule {
  id: string
  provider: string | null
  matchType: string
  matchField: string
  matchValue: string
  domainCategoryId: string | null
  active: boolean
  priority: number
  category: RuleCategory | null
  createdAt: string
  updatedAt: string
}

interface AutomationsResponse {
  results: AutomationRule[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TabKey = "categorias" | "tags" | "automacoes"

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

const HSL_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
]

const MATCH_FIELD_LABELS: Record<string, string> = {
  description: "Descri\u00e7\u00e3o",
  merchantName: "Nome do Comerciante",
  merchantCnpj: "CNPJ",
  providerCategoryId: "Categoria do Provider",
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  EXACT: "Exato",
  CONTAINS: "Cont\u00e9m",
  PREFIX: "Prefixo",
  REGEX: "Regex",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMonthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="mx-auto h-[200px] w-[200px] rounded-full" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 py-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-2 flex-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tags Tab
// ---------------------------------------------------------------------------

function TagsTab() {
  const { data: tagsData, refetch } = useApi<TagsResponse>("/api/tags")
  const tags = tagsData?.results ?? []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<TagItem | null>(null)
  const [tagName, setTagName] = useState("")
  const [tagColor, setTagColor] = useState("#6366f1")
  const [saving, setSaving] = useState(false)

  function openCreate() {
    setEditingTag(null)
    setTagName("")
    setTagColor("#6366f1")
    setDialogOpen(true)
  }

  function openEdit(tag: TagItem) {
    setEditingTag(tag)
    setTagName(tag.name)
    setTagColor(tag.color)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!tagName.trim()) return
    setSaving(true)
    try {
      if (editingTag) {
        await fetch(`/api/tags/${editingTag.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: tagName.trim(), color: tagColor }),
        })
      } else {
        await fetch("/api/tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: tagName.trim(), color: tagColor }),
        })
      }
      setDialogOpen(false)
      refetch()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/tags/${id}`, { method: "DELETE" })
    refetch()
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Tags</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie tags para organizar suas transa\u00e7\u00f5es.
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
                : "Crie uma nova tag para organizar suas transa\u00e7\u00f5es."}
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
  )
}

// ---------------------------------------------------------------------------
// Automations Tab
// ---------------------------------------------------------------------------

function AutomacoesTab() {
  const { data: rulesData, refetch } =
    useApi<AutomationsResponse>("/api/automations")
  const { data: categoriesData } =
    useApi<DomainCategoriesResponse>("/api/domain/categories")

  const rules = rulesData?.results ?? []
  const domainCategories = categoriesData?.results ?? []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null)
  const [matchField, setMatchField] = useState("description")
  const [matchType, setMatchType] = useState("CONTAINS")
  const [matchValue, setMatchValue] = useState("")
  const [domainCategoryId, setDomainCategoryId] = useState("")
  const [priority, setPriority] = useState(100)
  const [saving, setSaving] = useState(false)

  function openCreate() {
    setEditingRule(null)
    setMatchField("description")
    setMatchType("CONTAINS")
    setMatchValue("")
    setDomainCategoryId("")
    setPriority(100)
    setDialogOpen(true)
  }

  function openEdit(rule: AutomationRule) {
    setEditingRule(rule)
    setMatchField(rule.matchField)
    setMatchType(rule.matchType)
    setMatchValue(rule.matchValue)
    setDomainCategoryId(rule.domainCategoryId ?? "")
    setPriority(rule.priority)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!matchValue.trim()) return
    setSaving(true)
    try {
      const payload = {
        matchField,
        matchType,
        matchValue: matchValue.trim(),
        domainCategoryId: domainCategoryId || null,
        priority,
      }
      if (editingRule) {
        await fetch(`/api/automations/${editingRule.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } else {
        await fetch("/api/automations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }
      setDialogOpen(false)
      refetch()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/automations/${id}`, { method: "DELETE" })
    refetch()
  }

  async function handleToggleActive(rule: AutomationRule) {
    await fetch(`/api/automations/${rule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !rule.active }),
    })
    refetch()
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Automa\u00e7\u00f5es</h2>
          <p className="text-sm text-muted-foreground">
            Regras autom\u00e1ticas para categorizar transa\u00e7\u00f5es.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 size-4" />
          Nova Automa\u00e7\u00e3o
        </Button>
      </div>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Zap className="mb-3 size-10 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma automa\u00e7\u00e3o criada</p>
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
                  <TableHead className="text-right">A\u00e7\u00f5es</TableHead>
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
                    <TableCell className="text-center">{rule.priority}</TableCell>
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
              {editingRule ? "Editar Automa\u00e7\u00e3o" : "Nova Automa\u00e7\u00e3o"}
            </DialogTitle>
            <DialogDescription>
              {editingRule
                ? "Atualize a regra de categoriza\u00e7\u00e3o."
                : "Crie uma nova regra para categorizar transa\u00e7\u00f5es automaticamente."}
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
                <option value="description">Descri\u00e7\u00e3o</option>
                <option value="merchantName">Nome do Comerciante</option>
                <option value="merchantCnpj">CNPJ</option>
                <option value="providerCategoryId">Categoria do Provider</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Tipo de Correspond\u00eancia</label>
              <select
                value={matchType}
                onChange={(e) => setMatchType(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="EXACT">Exato</option>
                <option value="CONTAINS">Cont\u00e9m</option>
                <option value="PREFIX">Prefixo</option>
                <option value="REGEX">Regex</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Valor</label>
              <Input
                placeholder="Valor para correspond\u00eancia"
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
                Menor n\u00famero = maior prioridade
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
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CategoriesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("categorias")
  const [currentMonth, setCurrentMonth] = useState(() => new Date())

  const monthParam = useMemo(() => getMonthParam(currentMonth), [currentMonth])

  const { data: spending, loading: spendingLoading } =
    useApi<SpendingResponse>("/api/domain/metrics/spending/categories", {
      month: monthParam,
    })

  const { loading: categoriesLoading } = useApi<CategoriesResponse>(
    "/api/domain/categories"
  )

  const loading = spendingLoading || categoriesLoading

  const sortedCategories = useMemo(() => {
    if (!spending?.results) return []
    return [...spending.results].sort((a, b) => b.total - a.total)
  }, [spending])

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {}
    sortedCategories.forEach((cat, i) => {
      config[cat.category] = {
        label: cat.category,
        color: HSL_COLORS[i % HSL_COLORS.length],
      }
    })
    return config
  }, [sortedCategories])

  const pieData = useMemo(() => {
    return sortedCategories.map((cat, i) => ({
      name: cat.category,
      value: cat.total,
      fill: HSL_COLORS[i % HSL_COLORS.length],
    }))
  }, [sortedCategories])

  function goToPreviousMonth() {
    setCurrentMonth((prev) => {
      const next = new Date(prev)
      next.setMonth(next.getMonth() - 1)
      return next
    })
  }

  function goToNextMonth() {
    setCurrentMonth((prev) => {
      const next = new Date(prev)
      next.setMonth(next.getMonth() + 1)
      return next
    })
  }

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "categorias", label: "Categorias", icon: <BarChart3 className="size-4" /> },
    { key: "tags", label: "Tags", icon: <Tag className="size-4" /> },
    { key: "automacoes", label: "Automa\u00e7\u00f5es", icon: <Zap className="size-4" /> },
  ]

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categorias</h1>
          <p className="text-muted-foreground">
            Distribui\u00e7\u00e3o dos gastos por categoria.
          </p>
        </div>

        {activeTab === "categorias" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-[160px] text-center text-sm font-medium capitalize">
              {formatMonthLabel(currentMonth)}
            </span>
            <Button variant="outline" size="icon" onClick={goToNextMonth}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

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
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Donut Chart Card */}
              <Card>
                <CardHeader>
                  <CardDescription>Distribui\u00e7\u00e3o de Gastos</CardDescription>
                  <CardTitle className="text-2xl">
                    {formatCurrency(spending?.summary?.total ?? 0)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={chartConfig}
                    className="mx-auto aspect-square h-[220px]"
                  >
                    <PieChart>
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value) =>
                              formatCurrency(value as number)
                            }
                          />
                        }
                      />
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                      >
                        {pieData.map((entry, index) => (
                          <Cell
                            key={`cell-${entry.name}`}
                            fill={HSL_COLORS[index % HSL_COLORS.length]}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>

                  {/* Legend */}
                  <div className="mt-4 flex flex-wrap justify-center gap-3">
                    {sortedCategories.slice(0, 5).map((cat, i) => (
                      <div
                        key={cat.categoryId}
                        className="flex items-center gap-1.5"
                      >
                        <div
                          className="size-2.5 rounded-full"
                          style={{
                            backgroundColor: HSL_COLORS[i % HSL_COLORS.length],
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {cat.category}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Categories Table */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Detalhamento por Categoria</CardTitle>
                  <CardDescription>
                    {sortedCategories.length} categorias neste per\u00edodo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-center">
                          Transa\u00e7\u00f5es
                        </TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Progresso
                        </TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedCategories.map((cat, i) => (
                        <TableRow key={cat.categoryId}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div
                                className="size-2.5 shrink-0 rounded-full"
                                style={{
                                  backgroundColor:
                                    HSL_COLORS[i % HSL_COLORS.length],
                                }}
                              />
                              <span className="font-medium">
                                {cat.category}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {cat.transactionCount}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Progress value={cat.percentage} className="h-1.5" />
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(cat.total)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatPercent(cat.percentage)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {sortedCategories.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="py-8 text-center text-muted-foreground"
                          >
                            Nenhum gasto registrado neste per\u00edodo.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {activeTab === "tags" && <TagsTab />}
      {activeTab === "automacoes" && <AutomacoesTab />}
    </div>
  )
}
