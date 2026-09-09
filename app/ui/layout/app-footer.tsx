"use client";

import { getAppFooterSegments } from "@/app/config/app-branding";

type AppFooterProps = {
  className?: string;
};

function FooterSeparator() {
  return (
    <span className="px-1.5 font-semibold text-[var(--chrome-muted)]" aria-hidden>
      •
    </span>
  );
}

/** Persistent premium enterprise footer for authenticated application layouts. */
export function AppFooter({ className = "" }: AppFooterProps) {
  const { copyrightLine, versionLabel, rightsLine } = getAppFooterSegments();
  const hasLeft = Boolean(copyrightLine || rightsLine);

  return (
    <footer
      role="contentinfo"
      className={`app-gold-chrome app-global-footer relative flex min-h-[38px] min-w-0 max-w-full shrink-0 items-center justify-between gap-4 overflow-hidden pl-6 pr-6 ${className}`.trim()}
      style={{ boxShadow: "0 -2px 10px rgba(0, 0, 0, 0.04)" }}
    >
      <span className="app-global-footer-border" aria-hidden />
      <span className="app-global-footer-shimmer" aria-hidden />

      <p className="relative z-[1] min-w-0 truncate text-sm font-semibold leading-none text-[var(--sidebar-text)]">
        {hasLeft ? (
          <>
            {copyrightLine ? <span>{copyrightLine}</span> : null}
            {copyrightLine && rightsLine ? <FooterSeparator /> : null}
            {rightsLine ? <span>{rightsLine}</span> : null}
          </>
        ) : (
          "\u00A0"
        )}
      </p>
      {versionLabel ? (
        <p className="relative z-[1] shrink-0 text-sm font-semibold leading-none text-[var(--sidebar-text)]">
          {versionLabel}
        </p>
      ) : null}
    </footer>
  );
}
