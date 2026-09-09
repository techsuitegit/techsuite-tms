"use client";

import { User } from "lucide-react";
import { useState } from "react";

const LOGO_SOURCES = ["/company-logo.svg"] as const;
const DARK_LOGO_SOURCES = ["/company-logo-dark.svg", "/company-logo.svg"] as const;

type CompanyLogoProps = {
  className?: string;
  /** Use on dark backgrounds — swaps in the light wordmark. */
  onDark?: boolean;
  alt?: string;
};

export function CompanyLogo({
  className = "h-32 w-auto max-w-[440px] object-contain",
  onDark = false,
  alt = "techsuite",
}: CompanyLogoProps) {
  const [srcIndex, setSrcIndex] = useState(0);
  const sources = onDark ? DARK_LOGO_SOURCES : LOGO_SOURCES;

  if (srcIndex >= sources.length) {
    return (
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-primary shadow-sm">
        <User size={22} />
      </div>
    );
  }

  return (
    <img
      src={sources[srcIndex]}
      alt={alt}
      width={340}
      height={96}
      className={className}
      onError={() => setSrcIndex((i) => i + 1)}
    />
  );
}
