"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function LogoImage({
  src,
  alt,
  className,
  fallback,
  fallbackClassName,
}: {
  src: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
  fallbackClassName?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;

  if (failed && fallback) {
    return (
      <span
        aria-label={alt}
        role="img"
        className={cn(
          "flex size-full items-center justify-center text-lg leading-none",
          fallbackClassName,
        )}
      >
        {fallback}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={64}
      height={64}
      unoptimized
      onError={() => setFailedSrc(src)}
      className={cn("object-contain", className)}
    />
  );
}
