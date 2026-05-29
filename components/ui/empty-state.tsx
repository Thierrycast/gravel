import * as React from "react"
import { cn } from "@/lib/utils"

type EmptyStateVariant = "default" | "compact"

function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  variant = "default",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  action?: React.ReactNode
  variant?: EmptyStateVariant
}) {
  const isCompact = variant === "compact"

  return (
    <div
      data-slot="empty-state"
      data-variant={variant}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        isCompact ? "min-h-[140px] p-4" : "min-h-[400px] p-8",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-muted/50",
          isCompact ? "mb-2 size-10" : "mb-4 size-20"
        )}
      >
        {Icon ? (
          <Icon
            className={cn(
              "text-muted-foreground/60",
              isCompact ? "size-5" : "size-10"
            )}
          />
        ) : (
          <div
            className={cn(
              "rounded-full bg-muted-foreground/20",
              isCompact ? "size-5" : "size-10"
            )}
          />
        )}
      </div>
      <h3
        className={cn(
          "font-medium text-foreground",
          isCompact ? "text-sm" : "text-lg"
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            "mt-1 max-w-sm text-muted-foreground",
            isCompact ? "text-xs" : "mt-2 text-sm"
          )}
        >
          {description}
        </p>
      )}
      {action && (
        <div className={cn(isCompact ? "mt-3" : "mt-6")}>{action}</div>
      )}
    </div>
  )
}

export { EmptyState }
