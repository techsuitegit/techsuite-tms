"use client";

import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  CircleHelp,
  LogOut,
  Mail,
  MoonStar,
  Phone,
  RefreshCw,
  Search,
  SunMedium,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { APP_THEMES } from "@/app/config/app-themes";
import { useAuthStore } from "@/app/store/auth-store";
import { usePageRefreshStore } from "@/app/store/page-refresh-store";
import { useThemeStore } from "@/app/store/theme-store";
import { AppSidebar } from "@/app/ui/layout/app-sidebar";
import { AppFooter } from "@/app/ui/layout/app-footer";

type Daypart = "morning" | "afternoon" | "evening";

const headerIconBtnClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-sm transition-all hover:-translate-y-px hover:bg-secondary hover:shadow disabled:cursor-not-allowed disabled:opacity-60";

function HeaderIconButton({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <button type="button" title={label} aria-label={label} className={headerIconBtnClass}>
      {children}
    </button>
  );
}

function DaypartBadge({ daypart }: { daypart: Daypart }) {
  const isEvening = daypart === "evening";
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--chrome-via)] text-[var(--primary)] ring-1 ring-[color:var(--chrome-border)]/80"
      aria-hidden
    >
      {isEvening ? <MoonStar size={13} /> : <SunMedium size={13} />}
    </span>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const lockPageScroll = pathname === "/map-pointers" || pathname.startsWith("/map-pointers/");
  const { user, logout: clearAuth } = useAuthStore();
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const userMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const [userMenuCoords, setUserMenuCoords] = useState<{ top: number; right: number } | null>(null);
  const [refreshingData, setRefreshingData] = useState(false);

  const jobTitle = user?.role ?? "User";
  const contactPhone = user?.phoneNumber ?? "Not available";

  const daypart: Daypart = (() => {
    const h = new Date().getHours();
    if (h < 12) return "morning";
    if (h < 17) return "afternoon";
    return "evening";
  })();

  const greetingName = (() => {
    const full = user?.fullName?.trim();
    if (!full) return "there";
    const parts = full.split(/\s+/).filter(Boolean);
    if ((parts[0]?.length ?? 0) <= 2 && parts.length > 1) return full.toUpperCase();
    return parts[0]!.toUpperCase();
  })();

  function onLogout() {
    clearAuth();
    router.push("/login");
  }

  const handleRefreshData = useCallback(async () => {
    if (refreshingData) return;
    setRefreshingData(true);
    try {
      const handler = usePageRefreshStore.getState().handler;
      if (handler) {
        await handler();
      } else {
        router.refresh();
      }
    } finally {
      setRefreshingData(false);
    }
  }, [refreshingData, router]);

  useLayoutEffect(() => {
    if (!userMenuOpen) {
      setUserMenuCoords(null);
      return;
    }
    const update = () => {
      const rect = userMenuButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setUserMenuCoords({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    function onDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (userMenuOpen) {
        const inTrigger = userMenuButtonRef.current?.contains(target);
        const inPanel = userMenuPanelRef.current?.contains(target);
        if (!inTrigger && !inPanel) setUserMenuOpen(false);
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setUserMenuOpen(false);
    }

    document.addEventListener("mousedown", onDocumentMouseDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    function focusSearchOnSlash(event: KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    }
    window.addEventListener("keydown", focusSearchOnSlash);
    return () => window.removeEventListener("keydown", focusSearchOnSlash);
  }, []);

  return (
    <div className="flex h-app-screen overflow-hidden bg-background">
      <AppSidebar />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="app-gold-chrome sticky top-0 z-30 shrink-0 overflow-visible border-b border-[color:var(--chrome-border)]/80">
          <div className="app-page-shell relative z-10">
            <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-2.5 sm:px-1 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center lg:gap-3">
              <div className="lg:col-start-1">
                <div className="flex flex-wrap items-center gap-2">
                  <DaypartBadge daypart={daypart} />
                  <p className="truncate text-xs font-semibold leading-none tracking-tight text-[var(--sidebar-text)]">
                    Hi, {greetingName}
                  </p>
                </div>
              </div>
              <div className="order-3 flex w-full min-w-0 items-center gap-2 lg:order-none lg:col-start-2">
                <label className="relative mx-auto hidden w-full min-w-0 lg:block">
                  <span className="sr-only">Search</span>
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-[var(--chrome-placeholder)]"
                    aria-hidden
                  />
                  <input
                    ref={searchInputRef}
                    type="search"
                    placeholder="Search…"
                    className="w-full rounded-xl border border-[color:var(--chrome-border)]/80 bg-white/70 py-2.5 pl-10 pr-12 text-sm text-[var(--sidebar-text)] placeholder:text-[var(--chrome-placeholder)] transition focus:border-secondary focus:bg-white focus:outline-none focus:ring-2 focus:ring-[color:var(--chrome-border)]/50"
                  />
                  <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center rounded-md border border-[color:var(--chrome-border)] bg-white/80 px-2 py-0.5 font-sans text-[11px] font-semibold text-[var(--chrome-placeholder)] lg:inline-flex">
                    /
                  </kbd>
                </label>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end justify-self-end gap-2.5 lg:col-start-3">
                <button
                  type="button"
                  title="Refresh Data"
                  aria-label="Refresh Data"
                  disabled={refreshingData}
                  onClick={() => void handleRefreshData()}
                  className={headerIconBtnClass}
                >
                  <RefreshCw size={16} className={refreshingData ? "animate-spin" : undefined} />
                </button>
                <HeaderIconButton label="Help & Support">
                  <CircleHelp size={16} />
                </HeaderIconButton>
                <HeaderIconButton label="Notifications">
                  <Bell size={16} />
                </HeaderIconButton>
                <div className="relative flex items-center gap-2.5">
                  <button
                    ref={userMenuButtonRef}
                    type="button"
                    onClick={() => setUserMenuOpen((value) => !value)}
                    className="flex items-center gap-2 rounded-full border border-[color:var(--chrome-border)]/90 bg-white/70 py-1 pl-1 pr-2.5 text-sm font-medium text-[var(--sidebar-text)] shadow-sm transition-all hover:-translate-y-px hover:bg-white hover:shadow"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                      {user?.fullName?.charAt(0)?.toUpperCase() ?? "A"}
                    </span>
                    <span className="max-w-[10rem] truncate">{user?.fullName ?? "User"}</span>
                    <ChevronDown size={14} className="text-[var(--chrome-placeholder)]" />
                  </button>
                  {userMenuOpen && userMenuCoords && typeof document !== "undefined"
                    ? createPortal(
                        <div
                          ref={userMenuPanelRef}
                          className="fixed z-[200] w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl"
                          style={{ top: userMenuCoords.top, right: userMenuCoords.right }}
                        >
                          <div className="mb-3 flex items-center gap-3 border-b border-slate-200 pb-3">
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
                              {user?.fullName?.charAt(0)?.toUpperCase() ?? "A"}
                            </span>
                            <div>
                              <p className="text-sm font-semibold">{user?.fullName ?? "User"}</p>
                              <p className="text-xs text-zinc-500">{jobTitle}</p>
                            </div>
                          </div>

                          <div className="mb-3 rounded-lg px-1">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                              Profile Information
                            </p>
                            <div className="space-y-2 text-sm text-zinc-700">
                              <p className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-zinc-100">
                                <Mail size={15} className="shrink-0 text-zinc-500" />
                                <span className="min-w-0 break-all">
                                  <span className="font-semibold">Email ID:</span> {user?.email ?? "N/A"}
                                </span>
                              </p>
                              <p className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-zinc-100">
                                <Phone size={15} className="shrink-0 text-zinc-500" />
                                <span>
                                  <span className="font-semibold">Phone Number:</span> {contactPhone}
                                </span>
                              </p>
                              <p className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-zinc-100">
                                <BriefcaseBusiness size={15} className="shrink-0 text-zinc-500" />
                                <span>
                                  <span className="font-semibold">Job Title:</span> {jobTitle}
                                </span>
                              </p>
                            </div>
                          </div>

                          <div className="mb-3 rounded-lg px-1">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                              Theme
                            </p>
                            <div className="grid grid-cols-3 gap-1.5">
                              {APP_THEMES.map((option) => {
                                const selected = theme === option.id;
                                return (
                                  <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => setTheme(option.id)}
                                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition ${
                                      selected
                                        ? "border-primary bg-primary/10 text-zinc-800 ring-1 ring-primary/40"
                                        : "border-slate-200 text-zinc-600 hover:bg-zinc-50"
                                    }`}
                                  >
                                    <span
                                      className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
                                      style={{ background: option.swatch }}
                                      aria-hidden
                                    />
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="border-t border-slate-200 pt-3">
                            <button
                              type="button"
                              onClick={onLogout}
                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                            >
                              <LogOut size={16} />
                              Logout
                            </button>
                          </div>
                        </div>,
                        document.body,
                      )
                    : null}
                </div>
              </div>
            </div>
          </div>
        </header>
        <main className={`min-h-0 min-w-0 flex-1 overflow-x-hidden bg-background ${lockPageScroll ? "overflow-hidden" : "overflow-y-auto"}`}>
          <div className={`app-page-shell app-page-stack py-5 pb-6 ${lockPageScroll ? "flex h-full min-h-0 flex-col overflow-hidden" : ""}`}>
            {children}
          </div>
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
