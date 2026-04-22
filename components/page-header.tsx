"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  eyebrow?: string
  className?: string
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="section-eyebrow">{eyebrow}</p>
        ) : null}
        <h1 className="truncate text-2xl font-semibold tracking-tight md:text-[26px]">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
