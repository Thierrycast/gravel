"use client";

import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  sankey as d3Sankey,
  type SankeyNode,
  type SankeyLink,
} from "d3-sankey";
import { useCurrency } from "@/lib/currency-context";
import { cn } from "@/lib/utils";

interface SankeyCategory {
  name: string;
  total: number;
  color: string;
  categoryId?: string;
}

interface SankeyData {
  income: number;
  categories: SankeyCategory[];
  periodParam?: string;
}

interface Node {
  name: string;
  color: string;
  categoryId?: string;
  isCategory?: boolean;
}

interface Link {
  source: number;
  target: number;
  value: number;
  color: string;
}

type SNode = SankeyNode<Node, Link>;
type SLink = SankeyLink<Node, Link>;

export function SankeyChart({ data }: { data: SankeyData }) {
  const router = useRouter();
  const { format, isPrivate } = useCurrency();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setWidth(Math.max(1, entries[0].contentRect.width));
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const isVertical = width < 640;
  const height = isVertical ? 420 : 360;
  const nodePadding = isVertical ? 10 : 14;
  const nodeWidth = isVertical ? 14 : 16;
  const curvature = 0.5;

  const { nodes, links } = useMemo(() => {
    if (!data || !data.categories.length) return { nodes: [], links: [] };

    const safeIncome = Number.isFinite(data.income) ? data.income : 0;
    const categories = data.categories.filter(
      (c) => Number.isFinite(c.total) && c.total > 0,
    );
    const totalExpenses = categories.reduce((s, c) => s + c.total, 0);
    const remaining = safeIncome - totalExpenses;

    if (totalExpenses <= 0 && safeIncome <= 0) {
      return { nodes: [], links: [] };
    }

    const nodeList: Node[] = [
      { name: "Receitas", color: "oklch(0.70 0.20 150)" },
      { name: "Despesas", color: "oklch(0.60 0.25 25)" },
    ];

    categories.forEach((c) => {
      nodeList.push({
        name: c.name,
        color: c.color,
        categoryId: c.categoryId,
        isCategory: true,
      });
    });

    if (remaining > 0) {
      nodeList.push({ name: "Saldo", color: "oklch(0.85 0.15 200)" });
    }

    const linkList: Link[] = [];

    if (totalExpenses > 0) {
      linkList.push({
        source: 0,
        target: 1,
        value: totalExpenses,
        color: "oklch(0.60 0.25 25)",
      });
    }

    if (remaining > 0) {
      linkList.push({
        source: 0,
        target: nodeList.length - 1,
        value: remaining,
        color: "oklch(0.85 0.15 200)",
      });
    }

    categories.forEach((c, i) => {
      if (c.total <= 0) return;
      linkList.push({
        source: 1,
        target: i + 2,
        value: c.total,
        color: c.color,
      });
    });
    return { nodes: nodeList, links: linkList };
  }, [data]);

  const margin = useMemo(
    () =>
      isVertical
        ? { top: 44, right: 12, bottom: 12, left: 12 }
        : width < 960
          ? { top: 20, right: 132, bottom: 20, left: 132 }
          : { top: 20, right: 200, bottom: 20, left: 200 },
    [isVertical, width],
  );

  const sankeyData = useMemo(() => {
    if (!nodes.length || !links.length) return null;

    const extent: [[number, number], [number, number]] = isVertical
      ? [
          [margin.top, margin.left],
          [height - margin.bottom, width - margin.right],
        ]
      : [
          [margin.left, margin.top],
          [width - margin.right, height - margin.bottom],
        ];

    const generator = d3Sankey<Node, Link>()
      .nodeId((d) => d.index as unknown as string)
      .nodeWidth(nodeWidth)
      .nodePadding(nodePadding)
      .nodeSort(null)
      .extent(extent);

    const { nodes: sNodes, links: sLinks } = generator({
      nodes: nodes.map((d) => ({ ...d })),
      links: links.map((d) => ({ ...d })),
    });

    if (isVertical) {
      sNodes.forEach((node) => {
        const x0 = node.x0 ?? 0;
        const x1 = node.x1 ?? 0;
        const y0 = node.y0 ?? 0;
        const y1 = node.y1 ?? 0;
        node.x0 = y0;
        node.x1 = y1;
        node.y0 = x0;
        node.y1 = x1;
      });
    }

    return { nodes: sNodes, links: sLinks };
  }, [nodes, links, width, height, margin, nodePadding, nodeWidth, isVertical]);

  const handleNodeClick = useCallback(
    (node: SNode) => {
      if (!node.isCategory || !node.categoryId) return;
      const params = new URLSearchParams();
      params.set("categoryId", node.categoryId);
      if (data.periodParam) params.set("period", data.periodParam);
      router.push(`/transactions?${params.toString()}`);
    },
    [router, data.periodParam],
  );

  const handleLinkClick = useCallback(
    (link: SLink) => {
      const target = link.target as SNode;
      if (!target.isCategory || !target.categoryId) return;
      const params = new URLSearchParams();
      params.set("categoryId", target.categoryId);
      if (data.periodParam) params.set("period", data.periodParam);
      router.push(`/transactions?${params.toString()}`);
    },
    [router, data.periodParam],
  );

  const linkPath = useMemo(() => {
    return (d: SLink) => {
      const source = d.source as SNode;
      const target = d.target as SNode;
      if (isVertical) {
        const x0 = d.y0 ?? 0;
        const x1 = d.y1 ?? 0;
        const y0 = source.y1 ?? 0;
        const y1 = target.y0 ?? 0;
        const yi = (t: number) => y0 * (1 - t) + y1 * t;
        const y2 = yi(curvature);
        const y3 = yi(1 - curvature);
        return `M${x0},${y0}C${x0},${y2} ${x1},${y3} ${x1},${y1}`;
      }
      const x0 = source.x1 ?? 0;
      const x1 = target.x0 ?? 0;
      const xi = (t: number) => x0 * (1 - t) + x1 * t;
      const x2 = xi(curvature);
      const x3 = xi(1 - curvature);
      const y0 = d.y0 ?? 0;
      const y1 = d.y1 ?? 0;
      return `M${x0},${y0}C${x2},${y0} ${x3},${y1} ${x1},${y1}`;
    };
  }, [curvature, isVertical]);

  if (!sankeyData) {
    return (
      <div className="flex h-[300px] items-center justify-center font-mono text-xs text-muted-foreground">
        {"// dados_insuficientes"}
      </div>
    );
  }

  return (
    <div
      className="min-w-0 max-w-full space-y-4 overflow-hidden"
      ref={containerRef}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={isVertical ? "Fluxo de caixa vertical" : "Fluxo de caixa"}
        className="w-full"
        style={{ maxHeight: height }}
      >
        <defs>
          {sankeyData.links.map((link, i) => {
            const source = link.source as SNode;
            const target = link.target as SNode;
            const gradientId = `link-grad-${i}`;
            return (
              <linearGradient
                key={gradientId}
                id={gradientId}
                gradientUnits="userSpaceOnUse"
                x1={isVertical ? link.y0 : source.x1}
                y1={isVertical ? source.y1 : link.y0}
                x2={isVertical ? link.y1 : target.x0}
                y2={isVertical ? target.y0 : link.y1}
              >
                <stop offset="0%" stopColor={source.color} stopOpacity={0.2} />
                <stop
                  offset="100%"
                  stopColor={target.color}
                  stopOpacity={0.4}
                />
              </linearGradient>
            );
          })}
        </defs>
        {/* Links */}
        <g>
          {sankeyData.links.map((link, i) => {
            const path = linkPath(link as SLink);
            if (!path) return null;
            const target = link.target as SNode;
            const isClickable = target.isCategory && target.categoryId;
            return (
              <g key={i}>
                <path
                  d={path}
                  fill="none"
                  stroke={`url(#link-grad-${i})`}
                  strokeWidth={Math.max(link.width ?? 1, 1)}
                  className={
                    isClickable
                      ? "cursor-pointer transition-all duration-300 hover:stroke-opacity-100"
                      : "transition-all duration-300"
                  }
                  onClick={() => handleLinkClick(link as SLink)}
                />
                <title>
                  {`${(link.source as SNode).name} → ${(link.target as SNode).name}: ${isPrivate ? "••••" : format(link.value)}`}
                </title>
              </g>
            );
          })}
        </g>

        {/* Nodes */}
        <g>
          {(() => {
            const leftNodes = sankeyData.nodes
              .filter((n) => !isVertical && (n.x0 ?? 0) < width / 3)
              .sort((a, b) => (a.y0 ?? 0) - (b.y0 ?? 0));
            const rightNodes = sankeyData.nodes
              .filter((n) => !isVertical && (n.x1 ?? 0) > (width * 2) / 3)
              .sort((a, b) => (a.y0 ?? 0) - (b.y0 ?? 0));

            const labelH = 28;

            const solve = (nodes: typeof leftNodes) => {
              const labels = nodes.map((n) => ({
                node: n,
                y: ((n.y0 ?? 0) + (n.y1 ?? 0)) / 2,
                h: labelH,
              }));

              // Top-down
              let curr = 0;
              for (const l of labels) {
                if (l.y - l.h / 2 < curr) l.y = curr + l.h / 2;
                curr = l.y + l.h / 2;
              }
              // Bottom-up
              curr = height;
              for (let i = labels.length - 1; i >= 0; i--) {
                const l = labels[i];
                if (l.y + l.h / 2 > curr) l.y = curr - l.h / 2;
                curr = l.y - l.h / 2;
              }
              return labels;
            };

            const leftLabels = solve(leftNodes);
            const rightLabels = solve(rightNodes);
            const allLabels = [...leftLabels, ...rightLabels];

            return sankeyData.nodes.map((node, i) => {
              const x0 = node.x0 ?? 0;
              const x1 = node.x1 ?? 0;
              const y0 = node.y0 ?? 0;
              const y1 = node.y1 ?? 0;
              const nodeHeight = y1 - y0;
              const nodeBreadth = isVertical ? x1 - x0 : nodeHeight;
              if (nodeBreadth < 0.5) return null;

              const isLeft = !isVertical && x0 < width / 3;
              const isRight = !isVertical && x1 > (width * 2) / 3;
              const isClickable = node.isCategory && node.categoryId;

              const labelInfo = allLabels.find((l) => l.node === node);
              const labelX = isVertical
                ? (x0 + x1) / 2
                : isRight
                  ? x1 + 10
                  : x0 - 10;
              const labelY = isVertical
                ? y0 - 22
                : (labelInfo ? labelInfo.y : (y0 + y1) / 2) - 6;
              const textAnchor = isVertical
                ? "middle"
                : isRight
                  ? "start"
                  : "end";

              const nodeValueRaw =
                (node.sourceLinks ?? []).reduce(
                  (s, l) => s + (l as SLink).value,
                  0,
                ) ||
                (node.targetLinks ?? []).reduce(
                  (s, l) => s + (l as SLink).value,
                  0,
                );
              const nodeValue = Number.isFinite(nodeValueRaw)
                ? Math.max(0, nodeValueRaw)
                : 0;

              const showLabel = isVertical
                ? !node.isCategory
                : nodeHeight >= 2 || isLeft || isRight;

              return (
                <g
                  key={`${i}-${isPrivate}`}
                  className={cn(
                    "transition-all duration-500",
                    isClickable ? "cursor-pointer group" : "",
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
                      isClickable
                        ? "opacity-70 group-hover:opacity-100"
                        : "opacity-90",
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

                  {showLabel && (
                    <g className="transition-opacity duration-300">
                      <text
                        x={labelX}
                        y={labelY}
                        dy="0.35em"
                        textAnchor={textAnchor}
                        fontSize={isVertical ? 12 : 13}
                        fontFamily="monospace"
                        fontWeight={isClickable ? 500 : 700}
                        className="pointer-events-none select-none fill-foreground"
                      >
                        {node.name}
                      </text>
                      <text
                        x={labelX}
                        y={labelY + 16}
                        dy="0.35em"
                        textAnchor={textAnchor}
                        fontSize={isVertical ? 11 : 12}
                        fontFamily="monospace"
                        className="pointer-events-none select-none fill-muted-foreground"
                      >
                        {isPrivate ? "••••" : format(nodeValue)}
                      </text>
                    </g>
                  )}

                  <title>{`${node.name}: ${isPrivate ? "••••" : format(nodeValue)}${isClickable ? " — clique para ver transações" : ""}`}</title>
                </g>
              );
            });
          })()}
        </g>
      </svg>
      {isVertical && (
        <div
          className="grid gap-2 px-1"
          aria-label="Categorias do fluxo de caixa"
        >
          {sankeyData.nodes
            .filter((node) => node.isCategory)
            .map((node) => {
              const isClickable = Boolean(node.categoryId);
              const nodeValueRaw = (node.targetLinks ?? []).reduce(
                (sum, link) => sum + (link as SLink).value,
                0,
              );
              const nodeValue = Number.isFinite(nodeValueRaw)
                ? Math.max(0, nodeValueRaw)
                : 0;

              return (
                <button
                  key={`${node.name}-${node.index}`}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => handleNodeClick(node)}
                  className={cn(
                    "flex items-center gap-2 border border-border/60 px-2 py-2 text-left text-xs transition-colors",
                    isClickable ? "hover:bg-muted/60" : "cursor-default",
                  )}
                >
                  <span
                    className="size-2.5 shrink-0"
                    style={{ backgroundColor: node.color }}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                    {node.name}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                    {isPrivate ? "••••" : format(nodeValue)}
                  </span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
