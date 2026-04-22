"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number[]
  onValueChange?: (value: number[]) => void
  min?: number
  max?: number
  step?: number
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, onValueChange, min = 0, max = 100, step = 1, ...props }, ref) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(event.target.value)
      onValueChange?.([newValue])
    }

    const percentage = ((value[0] - min) / (max - min)) * 100

    return (
      <div className={cn("relative flex w-full touch-none select-none items-center py-4", className)}>
        <div className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted/30">
          <div 
            className="absolute h-full bg-primary transition-all duration-300 ease-out" 
            style={{ 
              width: `${percentage}%`,
              boxShadow: `0 0 12px color-mix(in oklab, var(--primary) 40%, transparent)`
            }} 
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value[0]}
          onChange={handleChange}
          ref={ref}
          className={cn(
            "absolute w-full h-1.5 opacity-0 cursor-pointer appearance-none z-20",
            "active:cursor-grabbing"
          )}
          {...props}
        />
        <div 
          className="absolute h-4 w-4 rounded-full border-2 border-primary bg-background ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 pointer-events-none shadow-lg z-10"
          style={{ left: `calc(${percentage}% - 8px)` }}
        />
      </div>
    )
  }
)
Slider.displayName = "Slider"

export { Slider }
