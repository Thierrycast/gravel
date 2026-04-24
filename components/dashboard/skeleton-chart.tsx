"use client"

import { Skeleton } from "@/components/ui/skeleton"

export function ChartSkeleton() {
  return (
    <div className="flex flex-col gap-4 w-full h-full min-h-[300px]">
      <div className="flex items-end justify-between gap-2 h-full px-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton 
            key={i} 
            className="w-full bg-muted/40" 
            style={{ height: `${Math.random() * 60 + 20}%` }} 
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
