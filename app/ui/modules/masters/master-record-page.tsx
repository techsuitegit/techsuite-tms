"use client";

import { Database } from "lucide-react";

export function MasterRecordPage({ title }: { title: string }) {
  return (
    <section className="app-surface-card px-6 py-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--chrome-muted)]">
        Masters
      </p>
      <h1 className="mt-1 font-[family-name:var(--font-cormorant)] text-3xl font-bold tracking-tight text-[var(--sidebar-text)]">
        {title}
      </h1>
      <p className="mt-3 flex items-center gap-2 text-sm text-[var(--chrome-muted)]">
        <Database size={15} className="text-[var(--primary)]" />
        Master data screen. Records and forms will be added next.
      </p>
    </section>
  );
}
