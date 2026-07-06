import * as React from "react"

import { cn } from "@/lib/utils"

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" | "xs" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        // base
        "group/card flex flex-col gap-2.5 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground shadow-card ring-1 ring-foreground/[0.06]",
        // size variants
        "data-[size=sm]:gap-2 data-[size=sm]:py-3",
        "data-[size=xs]:gap-1.5 data-[size=xs]:py-2.5",
        // footer / image edge handling
        "has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        // dark-mode polish
        "dark:ring-foreground/[0.08] dark:shadow-[0_1px_0_0_rgb(255_255_255/0.04)]",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-4",
        "group-data-[size=sm]/card:px-3 group-data-[size=xs]/card:px-3",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        "has-data-[slot=card-description]:grid-rows-[auto_auto]",
        "[.border-b]:pb-3 group-data-[size=sm]/card:[.border-b]:pb-2.5 group-data-[size=xs]/card:[.border-b]:pb-2",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const safeChildren =
    typeof children === "number" && Number.isNaN(children) ? "-" : children
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-sm font-semibold leading-snug tracking-tight",
        "group-data-[size=sm]/card:text-[13px] group-data-[size=xs]/card:text-xs",
        className
      )}
      {...props}
    >
      {safeChildren}
    </div>
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn(
        "px-4 group-data-[size=sm]/card:px-3 group-data-[size=xs]/card:px-3",
        className
      )}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t border-border/60 bg-muted/40 p-3",
        "group-data-[size=sm]/card:p-2.5 group-data-[size=xs]/card:p-2",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}