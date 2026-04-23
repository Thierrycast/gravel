"use client"

import { useMemo, useCallback, useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  sankey as d3Sankey,
  type SankeyNode,
  type SankeyLink,
} from "d3-sankey"
import { useCurrency } from "@/lib/currency-context"
import { Slider } from "@/components/ui/slider"
import { Maximize2, Minimize2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface SankeyCategory {
  name: string
  total: number
  color: string
  categoryId?: string
}

interface SankeyData {
  income: number
  categories: SankeyCategory[]
  periodParam?: string
}

interface Node {
  name: string
  color: string
  categoryId?: string
  isCategory?: boolean
}

interface Link {
  source: number
  target: number
  value: number
  color: string
}

type SNode = SankeyNode<Node, Link>
type SLink = SankeyLink<Node, Link>

export function SankeyChart({
  data,
}: {
  data: SankeyData
}) {
  const router = useRouter()
  const { format, isPrivate } = useCurrency()
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 })
  const [userHeight, setUserHeight] = useState(360)
  const [nodePadding, setNodePadding] = useState(14)
  const [nodeWidth, setNodeWidth] = useState(16)
  const [showLabels, setShowLabels] = useState(true)
  const [curvature, setCurvature] = useState(0.5)

  // Handle Resize
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width } = entries[0].contentRect
        setDimensions(prev => ({ ...prev, width }))
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const width = dimensions.width
  const height = userHeight

  const { nodes, links } = useMemo(() => {
    if (!data || !data.categories.length) return { nodes: [], links: [] }

    const safeIncome = Number.isFinite(data.income) ? data.income : 0
    const categories = data.categories.filter(
      (c) => Number.isFinite(c.total) && c.total > 0
    )
    const totalExpenses = categories.reduce((s, c) => s + c.total, 0)
    const remaining = safeIncome - totalExpenses

    if (totalExpenses <= 0 && safeIncome <= 0) {
      return { nodes: [], links: [] }
    }

    const nodeList: Node[] = [
      { name: "Receitas", color: "oklch(0.70 0.20 150)" },
      { name: "Despesas", color: "oklch(0.60 0.25 25)" },
    ]

    categories.forEach((c) => {
      nodeList.push({ name: c.name, color: c.color, categoryId: c.categoryId, isCategory: true })
    })

    if (remaining > 0) {
      nodeList.push({ name: "Saldo", color: "oklch(0.85 0.15 200)" })
    }

    const linkList: Link[] = []

    if (totalExpenses > 0) {
      linkList.push({ source: 0, target: 1, value: totalExpenses, color: "oklch(0.60 0.25 25)" })
    }

    if (remaining > 0) {
      linkList.push({ source: 0, target: nodeList.length - 1, value: remaining, color: "oklch(0.85 0.15 200)" })
    }

    categories.forEach((c, i) => {
      if (c.total <= 0) return
      linkList.push({ source: 1, target: i + 2, value: c.total, color: c.color })
    })

    return { nodes: nodeList, links: linkList }
  }, [data])

  const margin = useMemo(
    () =>
      width < 640
        ? { top: 16, right: 50, bottom: 16, left: 50 }
        : { top: 16, right: 160, bottom: 16, left: 160 },
    [width]
  )

  const sankeyData = useMemo(() => {
    if (!nodes.length || !links.length) return null

    const innerWidth = Math.max(1, width - margin.left - margin.right)
    const innerHeight = Math.max(1, height - margin.top - margin.bottom)

    const generator = d3Sankey<Node, Link>()
      .nodeId((d) => d.index as unknown as string)
      .nodeWidth(nodeWidth)
      .nodePadding(nodePadding)
      .nodeSort(null)
      .extent([
        [margin.left, margin.top],
        [margin.left + innerWidth, margin.top + innerHeight],
      ])

    const { nodes: sNodes, links: sLinks } = generator({
      nodes: nodes.map((d) => ({ ...d })),
      links: links.map((d) => ({ ...d })),
    })

    return { nodes: sNodes, links: sLinks }
  }, [nodes, links, width, height, margin, nodePadding, nodeWidth])

  const handleNodeClick = useCallback((node: SNode) => {
    if (!node.isCategory || !node.categoryId) return
    const params = new URLSearchParams()
    params.set("categoryId", node.categoryId)
    if (data.periodParam) params.set("period", data.periodParam)
    router.push(`/transactions?${params.toString()}`)
  }, [router, data.periodParam])

  const handleLinkClick = useCallback((link: SLink) => {
    const target = link.target as SNode
    if (!target.isCategory || !target.categoryId) return
    const params = new URLSearchParams()
    params.set("categoryId", target.categoryId)
    if (data.periodParam) params.set("period", data.periodParam)
    router.push(`/transactions?${params.toString()}`)
  }, [router, data.periodParam])

  const linkPath = useMemo(() => {
    return (d: SLink) => {
      const source = d.source as SNode
      const target = d.target as SNode
      const x0 = source.x1 ?? 0
      const x1 = target.x0 ?? 0
      const xi = (t: number) => x0 * (1 - t) + x1 * t
      const x2 = xi(curvature)
      const x3 = xi(1 - curvature)
      const y0 = d.y0 ?? 0
      const y1 = d.y1 ?? 0
      return `M${x0},${y0}C${x2},${y0} ${x3},${y1} ${x1},${y1}`
    }
  }, [curvature])

  if (!sankeyData) {
    return (
      <div className="flex h-[300px] items-center justify-center font-mono text-xs text-muted-foreground">
        {"// dados_insuficientes"}
      </div>
    )
  }

  return (
    <div className="space-y-6" ref={containerRef}>
      {/* Controls — desktop */}
      <div className="hidden sm:flex flex-wrap items-center justify-between gap-4 px-2">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Altura</span>
            <div className="w-24">
              <Slider
                value={[userHeight]}
                min={300}
                max={1000}
                step={50}
                onValueChange={(val: number[]) => setUserHeight(val[0])}
              />
            </div>
            <span className="font-mono text-[10px] text-muted-foreground min-w-[32px]">{userHeight}px</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Espaçamento</span>
            <div className="w-24">
              <Slider
                value={[nodePadding]}
                min={2}
                max={40}
                step={2}
                onValueChange={(val: number[]) => setNodePadding(val[0])}
              />
            </div>
            <span className="font-mono text-[10px] text-muted-foreground min-w-[32px]">{nodePadding}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Largura</span>
            <div className="w-24">
              <Slider
                value={[nodeWidth]}
                min={4}
                max={40}
                step={2}
                onValueChange={(val: number[]) => setNodeWidth(val[0])}
              />
            </div>
            <span className="font-mono text-[10px] text-muted-foreground min-w-[32px]">{nodeWidth}px</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Curvatura</span>
            <div className="w-24">
              <Slider
                value={[curvature * 100]}
                min={10}
                max={100}
                step={5}
                onValueChange={(val: number[]) => setCurvature(val[0] / 100)}
              />
            </div>
            <span className="font-mono text-[10px] text-muted-foreground min-w-[32px]">{Math.round(curvature * 100)}%</span>
          </div>

          <button
            onClick={() => setShowLabels(!showLabels)}
            className={cn(
              "font-mono text-[10px] uppercase tracking-widest px-2 py-1 border transition-colors",
              showLabels ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted border-border text-muted-foreground"
            )}
          >
            Labels: {showLabels ? "ON" : "OFF"}
          </button>
        </div>

        <div className="flex gap-2">
           <button onClick={() => setUserHeight(prev => Math.max(prev - 100, 300))} className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground" title="Diminuir altura">
             <Minimize2 className="size-4" />
           </button>
           <button onClick={() => setUserHeight(prev => Math.min(prev + 100, 1000))} className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground" title="Aumentar altura">
             <Maximize2 className="size-4" />
           </button>
        </div>
      </div>

      {/* Controls — mobile */}
      <div className="flex sm:hidden items-center justify-between px-2">
        <button
          onClick={() => setShowLabels(!showLabels)}
          className={cn(
            "font-mono text-[10px] uppercase tracking-widest px-2 py-1 border transition-colors",
            showLabels ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted border-border text-muted-foreground"
          )}
        >
          Labels: {showLabels ? "ON" : "OFF"}
        </button>
        <div className="flex gap-2">
          <button onClick={() => setUserHeight(prev => Math.max(prev - 50, 200))} className="p-1.5 hover:bg-accent rounded transition-colors text-muted-foreground" title="Diminuir altura">
            <Minimize2 className="size-4" />
          </button>
          <button onClick={() => setUserHeight(prev => Math.min(prev + 50, 800))} className="p-1.5 hover:bg-accent rounded transition-colors text-muted-foreground" title="Aumentar altura">
            <Maximize2 className="size-4" />
          </button>
        </div>
      </div>

      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full transition-[height] duration-300"
        style={{ maxHeight: height }}
      >
        <defs>
          {sankeyData.links.map((link, i) => {
            const source = link.source as SNode
            const target = link.target as SNode
            const gradientId = `link-grad-${i}`
            return (
              <linearGradient key={gradientId} id={gradientId} gradientUnits="userSpaceOnUse" x1={source.x1} x2={target.x0}>
                <stop offset="0%" stopColor={source.color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={target.color} stopOpacity={0.4} />
              </linearGradient>
            )
          })}
        </defs>
        {/* Links */}
        <g>
          {sankeyData.links.map((link, i) => {
            const path = linkPath(link as SLink)
            if (!path) return null
            const target = link.target as SNode
            const isClickable = target.isCategory && target.categoryId
            return (
              <g key={i}>
                <path
                  d={path}
                  fill="none"
                  stroke={`url(#link-grad-${i})`}
                  strokeWidth={Math.max((link.width ?? 1), 1)}
                  className={isClickable ? "cursor-pointer transition-all duration-300 hover:stroke-opacity-100" : "transition-all duration-300"}
                  onClick={() => handleLinkClick(link as SLink)}
                />
                <title>
                  {`${(link.source as SNode).name} → ${(link.target as SNode).name}: ${isPrivate ? "••••" : format(link.value)}`}
                </title>
              </g>
            )
          })}
        </g>

        {/* Nodes */}
        <g>
          {(() => {
            const leftNodes = sankeyData.nodes
              .filter((n) => (n.x0 ?? 0) < width / 3)
              .sort((a, b) => (a.y0 ?? 0) - (b.y0 ?? 0))
            const rightNodes = sankeyData.nodes
              .filter((n) => (n.x1 ?? 0) > (width * 2) / 3)
              .sort((a, b) => (a.y0 ?? 0) - (b.y0 ?? 0))
            
            const labelH = 20

            const solve = (nodes: typeof leftNodes) => {
              const labels = nodes.map((n) => ({
                node: n,
                y: ((n.y0 ?? 0) + (n.y1 ?? 0)) / 2,
                h: labelH,
              }))

              // Top-down
              let curr = 0
              for (const l of labels) {
                if (l.y - l.h / 2 < curr) l.y = curr + l.h / 2
                curr = l.y + l.h / 2
              }
              // Bottom-up
              curr = height
              for (let i = labels.length - 1; i >= 0; i--) {
                const l = labels[i]
                if (l.y + l.h / 2 > curr) l.y = curr - l.h / 2
                curr = l.y - l.h / 2
              }
              return labels
            }

            const leftLabels = solve(leftNodes)
            const rightLabels = solve(rightNodes)
            const allLabels = [...leftLabels, ...rightLabels]

            return sankeyData.nodes.map((node, i) => {
              const x0 = node.x0 ?? 0
              const x1 = node.x1 ?? 0
              const y0 = node.y0 ?? 0
              const y1 = node.y1 ?? 0
              const nodeHeight = y1 - y0
              if (nodeHeight < 0.5) return null

              const isLeft = x0 < width / 3
              const isRight = x1 > (width * 2) / 3
              const isClickable = node.isCategory && node.categoryId

              const labelInfo = allLabels.find((l) => l.node === node)
              const labelY = labelInfo ? labelInfo.y : (y0 + y1) / 2

              const nodeValueRaw =
                (node.sourceLinks ?? []).reduce((s, l) => s + (l as SLink).value, 0) ||
                (node.targetLinks ?? []).reduce((s, l) => s + (l as SLink).value, 0)
              const nodeValue = Number.isFinite(nodeValueRaw) ? Math.max(0, nodeValueRaw) : 0

              const hideLabel = nodeHeight < 2 && !isLeft && !isRight

              return (
                <g
                  key={`${i}-${isPrivate}`}
                  className={cn(
                    "transition-all duration-500",
                    isClickable ? "cursor-pointer group" : ""
                  )}
                  onClick={() => isClickable && handleNodeClick(node)}
                >
                  <rect
                    x={x0}
                    y={y0}
                    width={x1 - x0}
                    height={nodeHeight}
                    fill={node.color}
                    rx={2}
                    className={cn(
                      "transition-all duration-300",
                      isClickable ? "opacity-70 group-hover:opacity-100" : "opacity-90"
                    )}
                  />
                  
                  {isClickable && (
                    <rect
                      x={x0 - 1}
                      y={y0 - 1}
                      width={x1 - x0 + 2}
                      height={nodeHeight + 2}
                      fill="transparent"
                      stroke={node.color}
                      strokeWidth={1}
                      strokeOpacity={0}
                      rx={2}
                      className="transition-all duration-300 group-hover:stroke-opacity-50"
                    />
                  )}

                  {!hideLabel && showLabels && (
                    <g className="transition-opacity duration-300">
                      <text
                        x={isRight ? x1 + 8 : isLeft ? x0 - 8 : x0 - 8}
                        y={labelY - 6}
                        dy="0.35em"
                        textAnchor={isRight ? "start" : "end"}
                        fill="oklch(0.95 0 0)"
                        fontSize={width < 640 ? 9 : 10}
                        fontFamily="monospace"
                        fontWeight={isClickable ? 500 : 700}
                        className="pointer-events-none select-none"
                      >
                        {width < 640 && node.name.length > 10
                          ? node.name.slice(0, 9) + "…"
                          : node.name}
                      </text>
                      {width >= 400 && (
                        <text
                          x={isRight ? x1 + 8 : isLeft ? x0 - 8 : x0 - 8}
                          y={labelY + 8}
                          dy="0.35em"
                          textAnchor={isRight ? "start" : "end"}
                          fill="oklch(0.70 0 0)"
                          fontSize={9}
                          fontFamily="monospace"
                          className="pointer-events-none select-none"
                        >
                          {isPrivate ? "••••" : format(nodeValue)}
                        </text>
                      )}
                    </g>
                  )}
                  
                  <title>{`${node.name}: ${isPrivate ? "••••" : format(nodeValue)}${isClickable ? " — clique para ver transações" : ""}`}</title>
                </g>
              )
            })
          })()}
        </g>
      </svg>
    </div>
  )
}
