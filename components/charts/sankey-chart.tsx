"use client"

import { useMemo } from "react"
import {
  sankey as d3Sankey,
  sankeyLinkHorizontal,
  type SankeyNode,
  type SankeyLink,
} from "d3-sankey"
import { formatCurrency } from "@/lib/format"

interface SankeyData {
  income: number
  categories: Array<{
    name: string
    total: number
    color: string
  }>
}

interface Node {
  name: string
  color: string
}

interface Link {
  source: number
  target: number
  value: number
  color: string
}

type SNode = SankeyNode<Node, Link>
type SLink = SankeyLink<Node, Link>

const MARGIN = { top: 16, right: 140, bottom: 16, left: 140 }

export function SankeyChart({
  data,
  width = 1100,
  height = 320,
}: {
  data: SankeyData
  width?: number
  height?: number
}) {
  const { nodes, links } = useMemo(() => {
    if (!data || !data.categories.length) return { nodes: [], links: [] }

    const safeIncome = Number.isFinite(data.income) ? data.income : 0
    const categories = data.categories.filter(
      (c) => Number.isFinite(c.total) && c.total > 0
    )
    const totalExpenses = categories.reduce((s, c) => s + c.total, 0)
    const remaining = safeIncome - totalExpenses

    if (totalExpenses <= 0 && remaining <= 0) {
      return { nodes: [], links: [] }
    }

    // Nodes: [0] = Receitas, [1] = Despesas, [2..n] = categories, [n+1?] = Saldo
    const nodeList: Node[] = [
      { name: "Receitas", color: "hsl(142, 71%, 45%)" },
      { name: "Despesas", color: "hsl(0, 84%, 60%)" },
    ]

    categories.forEach((c) => {
      nodeList.push({ name: c.name, color: c.color })
    })

    if (remaining > 0) {
      nodeList.push({ name: "Saldo", color: "hsl(221, 83%, 53%)" })
    }

    const linkList: Link[] = []

    // Receitas → Despesas
    if (totalExpenses > 0) {
      linkList.push({
        source: 0,
        target: 1,
        value: totalExpenses,
        color: "hsl(0, 84%, 60%)",
      })
    }

    // Receitas → Saldo
    if (remaining > 0) {
      linkList.push({
        source: 0,
        target: nodeList.length - 1,
        value: remaining,
        color: "hsl(221, 83%, 53%)",
      })
    }

    // Despesas → each category
    categories.forEach((c, i) => {
      if (c.total <= 0) return
      linkList.push({
        source: 1,
        target: i + 2,
        value: c.total,
        color: c.color,
      })
    })

    return { nodes: nodeList, links: linkList }
  }, [data])

  const sankeyData = useMemo(() => {
    if (!nodes.length || !links.length) return null

    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = height - MARGIN.top - MARGIN.bottom

    const generator = d3Sankey<Node, Link>()
      .nodeId((d) => d.index as unknown as string)
      .nodeWidth(20)
      .nodePadding(16)
      .nodeSort(null)
      .extent([
        [MARGIN.left, MARGIN.top],
        [MARGIN.left + innerWidth, MARGIN.top + innerHeight],
      ])

    const { nodes: sNodes, links: sLinks } = generator({
      nodes: nodes.map((d) => ({ ...d })),
      links: links.map((d) => ({ ...d })),
    })

    return { nodes: sNodes, links: sLinks }
  }, [nodes, links, width, height])

  if (!sankeyData) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        Dados insuficientes para o diagrama
      </div>
    )
  }

  const linkPath = sankeyLinkHorizontal()

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full"
      style={{ maxHeight: height, minWidth: 600 }}
    >
      {/* Links */}
      <g>
        {sankeyData.links.map((link, i) => {
          const path = linkPath(link as never)
          if (!path) return null
          return (
            <g key={i}>
              <path
                d={path}
                fill="none"
                stroke={link.color}
                strokeWidth={Math.max((link.width ?? 1), 1)}
                strokeOpacity={0.35}
                className="transition-all duration-200 hover:stroke-opacity-60"
              />
              <title>
                {`${(link.source as SNode).name} → ${(link.target as SNode).name}: ${formatCurrency(link.value)}`}
              </title>
            </g>
          )
        })}
      </g>

      {/* Nodes */}
      <g>
        {sankeyData.nodes.map((node, i) => {
          const x0 = node.x0 ?? 0
          const x1 = node.x1 ?? 0
          const y0 = node.y0 ?? 0
          const y1 = node.y1 ?? 0
          const nodeHeight = y1 - y0
          if (nodeHeight < 1) return null

          const isLeft = x0 < width / 2
          const isRight = x0 > width * 0.6

          // Calculate total value through node
          const nodeValueRaw =
            (node.sourceLinks ?? []).reduce((s, l) => s + (l as SLink).value, 0) ||
            (node.targetLinks ?? []).reduce((s, l) => s + (l as SLink).value, 0)
          const nodeValue = Number.isFinite(nodeValueRaw) ? Math.max(0, nodeValueRaw) : 0

          return (
            <g key={i}>
              <rect
                x={x0}
                y={y0}
                width={x1 - x0}
                height={nodeHeight}
                fill={node.color}
                rx={3}
                className="transition-opacity hover:opacity-80"
              />
              <title>{`${node.name}: ${formatCurrency(nodeValue)}`}</title>
              <text
                x={isRight ? x1 + 8 : isLeft ? x0 - 8 : x0 - 8}
                y={(y0 + y1) / 2}
                dy="0.35em"
                textAnchor={isRight ? "start" : "end"}
                className="fill-foreground text-[11px] font-medium"
              >
                {node.name}
              </text>
              <text
                x={isRight ? x1 + 8 : isLeft ? x0 - 8 : x0 - 8}
                y={(y0 + y1) / 2 + 14}
                dy="0.35em"
                textAnchor={isRight ? "start" : "end"}
                className="fill-muted-foreground text-[10px]"
              >
                {formatCurrency(nodeValue)}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
