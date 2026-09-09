type BrandTaglineProps = {
  variant?: "auth" | "sidebar";
};

export function BrandTagline({ variant = "auth" }: BrandTaglineProps) {
  const isSidebar = variant === "sidebar";

  return (
    <p
      className={
        isSidebar
          ? "brand-tagline text-[10px] leading-[1.35] tracking-[0.14em] text-[#5a4a32]"
          : "brand-tagline mt-1 max-w-[22.5rem] text-[11px] font-semibold uppercase leading-[1.45] tracking-[0.28em] text-[var(--chrome-muted)]"
      }
    >
      Delivering Trust
    </p>
  );
}
