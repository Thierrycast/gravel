"use client"

import { Skeleton } from "@/components/ui/skeleton"

const BAR_HEIGHTS = [42, 68, 35, 74, 51, 83, 46, 61, 29, 57, 76, 39]

export function ChartSkeleton() {
  return (
    <div className="flex flex-col gap-4 w-full h-full min-h-80">
      <div className="flex items-end justify-between gap-2 h-full px-2">
        {BAR_HEIGHTS.map((height, i) => (
          <Skeleton
            key={i}
            className="w-full bg-muted/40"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between px-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-2 w-8" />
        ))}
      </div>
    </div>
  )
}
