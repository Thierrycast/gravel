"use client"

import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2, ArrowDown } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const THRESHOLD = 70
const MAX_PULL = 120
const RESISTANCE = 0.5

export function PullToRefresh() {
  const queryClient = useQueryClient()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const startY = useRef<number | null>(null)
  const pulling = useRef(false)
  const pullRef = useRef(0)
  const refreshingRef = useRef(false)

  useEffect(() => {
    pullRef.current = pull
  }, [pull])
  useEffect(() => {
    refreshingRef.current = refreshing
  }, [refreshing])

  useEffect(() => {
    // The page scrolls inside <main>, not window — check its scrollTop
    function getScrollTop(): number {
      return document.querySelector<HTMLElement>("main")?.scrollTop ?? 0
    }

    function atTop() {
      return getScrollTop() <= 2 // small tolerance for iOS momentum scrolling
    }

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current) return
      if (!atTop()) {
        startY.current = null
        return
      }
      startY.current = e.touches[0].clientY
      pulling.current = false
    }

    function onTouchMove(e: TouchEvent) {
      if (refreshingRef.current || startY.current == null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) {
        if (pulling.current) {
          pulling.current = false
          setPull(0)
        }
        return
      }
      // Re-check on every move — user may have scrolled down since touchstart
      if (!atTop()) {
        startY.current = null
        if (pulling.current) {
          pulling.current = false
          setPull(0)
        }
        return
      }
      pulling.current = true
      const damped = Math.min(MAX_PULL, dy * RESISTANCE)
      setPull(damped)
      // Only block browser scroll when we're actually handling the pull gesture
      if (e.cancelable) e.preventDefault()
    }

    async function trigger() {
      setRefreshing(true)
      setPull(THRESHOLD)
      try {
        const res = await fetch("/api/sync/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ full: false }),
        })
        if (!res.ok) throw new Error(String(res.status))
        await queryClient.invalidateQueries()
        toast.success("Atualizado.")
      } catch {
        toast.error("Falha ao sincronizar")
      } finally {
        setRefreshing(false)
        setPull(0)
      }
    }

    function onTouchEnd() {
      const wasPulling = pulling.current
      const finalPull = pullRef.current
      pulling.current = false
      startY.current = null
      if (refreshingRef.current) return
      if (!wasPulling) {
        setPull(0)
        return
      }
      if (finalPull >= THRESHOLD) {
        void trigger()
      } else {
        setPull(0)
      }
    }

    // Only attach listeners on mobile or devices with touch support
    const isMobile = window.matchMedia("(max-width: 767px)").matches
    if (!isMobile) return

    window.addEventListener("touchstart", onTouchStart, { passive: true })
    window.addEventListener("touchmove", onTouchMove, { passive: false })
    window.addEventListener("touchend", onTouchEnd, { passive: true })
    window.addEventListener("touchcancel", onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener("touchstart", onTouchStart)
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("touchend", onTouchEnd)
      window.removeEventListener("touchcancel", onTouchEnd)
    }
  }, [queryClient])

  const visible = pull > 0 || refreshing
  const reachedThreshold = pull >= THRESHOLD || refreshing
  const settling = !refreshing && !pulling.current

  return (
    <div
      aria-hidden={!visible}
      className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-40 flex items-start justify-center md:hidden"
      style={{
        transform: `translateY(${pull}px)`,
        opacity: visible ? Math.min(1, pull / THRESHOLD || 1) : 0,
        transition: settling
          ? "transform 220ms cubic-bezier(0.4,0,0.2,1), opacity 220ms ease"
          : "opacity 120ms ease",
      }}
    >
      <div
        className={cn(
          "mt-2 flex size-9 items-center justify-center rounded-full border border-border/60 bg-background/85 shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/70",
        )}
      >
        {refreshing ? (
          <Loader2 className="size-4 animate-spin text-primary" />
        ) : (
          <ArrowDown
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-150",
              reachedThreshold && "rotate-180 text-primary",
            )}
          />
        )}
      </div>
    </div>
  )
}
