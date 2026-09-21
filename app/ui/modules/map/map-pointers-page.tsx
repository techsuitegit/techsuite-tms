"use client";

import { MapPin, Pin } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { MAP_POINTERS, type MapPointer } from "@/app/ui/modules/map/pointer-catalog";

const MapCanvas = dynamic(
  () => import("@/app/ui/modules/map/map-canvas").then((mod) => mod.MapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-[var(--chrome-muted)]">
        Loading map…
      </div>
    ),
  },
);

export function MapPointersPage() {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  const pinned = useMemo(
    () => MAP_POINTERS.filter((pointer) => pinnedIds.includes(pointer.id)),
    [pinnedIds],
  );

  function pinPointer(id: string) {
    setPinnedIds((current) => (current.includes(id) ? current : [...current, id]));
  }

  function unpinPointer(id: string) {
    setPinnedIds((current) => current.filter((item) => item !== id));
  }

  return (
    <div className="grid h-full min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <section className="app-surface-card flex min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-[color:var(--chrome-border)]/70 px-5 py-4">
            <h2 className="text-sm font-semibold text-[var(--sidebar-text)]">Pointer keys</h2>
            <p className="mt-0.5 text-[11px] text-[var(--chrome-muted)]">
              {pinned.length} of {MAP_POINTERS.length} pinned to the map
            </p>
          </div>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 [scrollbar-width:thin]">
            {MAP_POINTERS.map((pointer) => (
              <PointerRow
                key={pointer.id}
                pointer={pointer}
                pinned={pinnedIds.includes(pointer.id)}
                onPin={() => pinPointer(pointer.id)}
              />
            ))}
          </ul>
        </section>

        <section className="app-surface-card relative min-h-0 overflow-hidden p-0">
          <MapCanvas pointers={pinned} onRemove={unpinPointer} />
        </section>
    </div>
  );
}

function PointerRow({
  pointer,
  pinned,
  onPin,
}: {
  pointer: MapPointer;
  pinned: boolean;
  onPin: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPin}
        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
          pinned
            ? "border-[color:var(--primary)] bg-[color-mix(in_srgb,var(--primary)_18%,white)] shadow-sm ring-1 ring-[color:var(--primary)]/35"
            : "border-[color:var(--chrome-border)]/70 bg-white/70 hover:border-[color:var(--primary)]/50 hover:bg-white"
        }`}
      >
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            pinned ? "bg-[var(--primary)] text-white" : "bg-[color-mix(in_srgb,var(--chrome-via)_70%,white)] text-[var(--chrome-muted)]"
          }`}
        >
          <MapPin size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-xs font-semibold tracking-wide text-[var(--sidebar-text)]">
            {pointer.keyName}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-[var(--chrome-muted)]">
            {pointer.name} · {pointer.area}
          </span>
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
            pinned ? "bg-[var(--primary)] text-white" : "bg-slate-100 text-[var(--chrome-muted)]"
          }`}
        >
          <Pin size={11} />
          {pinned ? "Pinned" : "Pin"}
        </span>
      </button>
    </li>
  );
}
