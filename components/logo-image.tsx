"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

export function LogoImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={64}
      height={64}
      unoptimized
      className={cn("object-contain", className)}
    />
  );
}
