"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

const backButtonClassName =
  "inline-flex items-center gap-2 rounded-full border border-white/70 bg-[#e9edf3] px-5 py-2.5 text-sm font-medium text-[#1a2b4b] shadow-[5px_5px_12px_rgba(15,23,42,0.07),-4px_-4px_10px_rgba(255,255,255,0.95)] transition-all hover:bg-[#eef2f7] hover:shadow-[4px_4px_8px_rgba(15,23,42,0.09),-3px_-3px_8px_rgba(255,255,255,0.98)] active:shadow-[inset_3px_3px_8px_rgba(15,23,42,0.08),inset_-2px_-2px_6px_rgba(255,255,255,0.9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40";

type BackButtonProps = {
  href: string;
  label?: string;
  className?: string;
  iconSize?: number;
};

export function BackButton({ href, label = "Back", className = "", iconSize = 16 }: BackButtonProps) {
  const router = useRouter();
  const classes = `${backButtonClassName} ${className}`.trim();

  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      className={classes}
      aria-label={label}
    >
      <ArrowLeft size={iconSize} strokeWidth={2} aria-hidden />
      <span>{label}</span>
    </button>
  );
}
