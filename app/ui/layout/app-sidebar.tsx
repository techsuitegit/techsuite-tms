"use client";

import { ChevronsLeft, ChevronDown, Database, LayoutDashboard, LogOut, MapPin, MoreVertical } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { MENU_NAV_ITEMS, type MenuNavItem } from "@/app/config/menu-permissions";
import { useAuthStore } from "@/app/store/auth-store";
import { useUiStore } from "@/app/store/ui-store";
import { BrandTagline } from "@/app/ui/components/brand-tagline";
import { CompanyLogo } from "@/app/ui/components/company-logo";

const SIDEBAR_WIDTH_EXPANDED = 288;
const SIDEBAR_WIDTH_COLLAPSED = 72;

const NAV_ICONS: Record<string, typeof LayoutDashboard> = {
  Dashboard: LayoutDashboard,
  MapPointers: MapPin,
  Masters: Database,
};

function submenuKeyForPath(pathname: string): string | null {
  for (const item of MENU_NAV_ITEMS) {
    if (!item.children?.length) continue;
    if (item.children.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`))) {
      return item.key;
    }
  }
  return null;
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout: clearAuth } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [openSubmenuKey, setOpenSubmenuKey] = useState<string | null>(() => submenuKeyForPath(pathname));

  useEffect(() => {
    setProfileMenuOpen(false);
  }, [pathname, sidebarCollapsed]);

  useEffect(() => {
    setOpenSubmenuKey(submenuKeyForPath(pathname));
  }, [pathname]);

  function onLogout() {
    clearAuth();
    router.push("/login");
  }

  function closeSubmenus() {
    setOpenSubmenuKey(null);
  }

  function onSubmenuToggle(key: string) {
    if (sidebarCollapsed) {
      toggleSidebar();
      setOpenSubmenuKey(key);
      return;
    }
    setOpenSubmenuKey((current) => (current === key ? null : key));
  }

  const sidebarWidth = sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  const userInitials = (() => {
    const parts = (user?.fullName ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
    return (parts[0]?.slice(0, 2) ?? "AP").toUpperCase();
  })();

  function linkClass(href: string, nested = false) {
    const active = href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
    return `group flex w-full items-center gap-3 rounded-xl text-[14px] font-semibold leading-tight transition-all duration-200 ${
      nested ? "px-3 py-2 text-[13px]" : "px-3 py-2.5"
    } ${
      active
        ? "bg-white/55 text-[var(--sidebar-text)] shadow-[inset_0_1px_0_rgb(255_255_255/0.7)] ring-1 ring-[color:var(--chrome-border)]/80"
        : "text-[var(--chrome-muted)] hover:bg-white/35 hover:text-[var(--sidebar-text)]"
    }`;
  }

  function renderItem(item: MenuNavItem) {
    const Icon = NAV_ICONS[item.key] ?? LayoutDashboard;

    if (item.children?.length) {
      const childActive = item.children.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`));
      const expanded = openSubmenuKey === item.key;

      return (
        <div key={item.key}>
          <button
            type="button"
            onClick={() => onSubmenuToggle(item.key)}
            className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold leading-tight transition-all duration-200 ${
              childActive
                ? "bg-white/40 text-[var(--sidebar-text)]"
                : "text-[var(--chrome-muted)] hover:bg-white/35 hover:text-[var(--sidebar-text)]"
            }`}
            title={sidebarCollapsed ? item.label : undefined}
            aria-expanded={expanded}
          >
            <span className="shrink-0 text-[var(--chrome-muted)]">
              <Icon size={21} strokeWidth={1.75} />
            </span>
            {!sidebarCollapsed ? (
              <>
                <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                <ChevronDown size={16} className={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-0" : "-rotate-90"}`} />
              </>
            ) : null}
          </button>
          {!sidebarCollapsed && expanded ? (
            <div className="mt-1 space-y-0.5 border-l border-[color:var(--chrome-border)]/70 ml-5 pl-2">
              {item.children.map((child) => (
                <Link key={child.href} href={child.href} className={linkClass(child.href, true)} title={child.label}>
                  <span className="truncate">{child.label}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    if (!item.href) return null;

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={closeSubmenus}
        className={linkClass(item.href)}
        title={sidebarCollapsed ? item.label : undefined}
      >
        <span className="shrink-0 text-[var(--chrome-muted)]">
          <Icon size={21} strokeWidth={1.75} />
        </span>
        {!sidebarCollapsed ? <span className="truncate">{item.label}</span> : null}
      </Link>
    );
  }

  return (
    <aside
      className="app-gold-chrome app-sidebar-gold relative flex h-full shrink-0 flex-col overflow-hidden text-sidebar-text transition-[width] duration-[250ms] ease-in-out"
      style={{ width: sidebarWidth, ["--sidebar-width" as string]: `${sidebarWidth}px` }}
    >
      <div className={`relative z-10 flex shrink-0 border-b border-[color:var(--chrome-border)]/80 ${sidebarCollapsed ? "h-[5.25rem] items-center justify-center px-2" : "flex-col justify-center gap-1.5 px-3 py-2.5"}`}>
        {sidebarCollapsed ? (
          <button
            type="button"
            onClick={toggleSidebar}
            className="rounded-lg p-1 transition-colors duration-200 hover:bg-white/40"
            aria-label="Expand sidebar"
          >
            <CompanyLogo className="h-12 w-12 object-contain object-left" alt="techsuite" />
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <CompanyLogo className="h-[3.5rem] w-auto max-w-[240px] object-contain object-left" />
              </div>
              <button
                type="button"
                onClick={toggleSidebar}
                className="rounded-lg p-2 text-[var(--chrome-muted)] transition-colors duration-200 hover:bg-white/40 hover:text-[var(--sidebar-text)]"
                aria-label="Collapse sidebar"
              >
                <ChevronsLeft size={18} strokeWidth={2} />
              </button>
            </div>
            <BrandTagline variant="sidebar" />
          </>
        )}
      </div>

      <nav className="relative z-10 min-h-0 flex-1 overflow-y-auto px-2 py-3 [scrollbar-color:#d4b56a_transparent] [scrollbar-width:thin]">
        <div className="space-y-1">{MENU_NAV_ITEMS.map(renderItem)}</div>
      </nav>

      <div className="relative z-10 shrink-0 border-t border-[color:var(--chrome-border)]/80 p-3">
        <div
          className={`relative flex items-center gap-3 rounded-2xl bg-white/40 px-2.5 py-2.5 ring-1 ring-[color:var(--chrome-border)]/90 ${sidebarCollapsed ? "justify-center" : ""}`}
          title={sidebarCollapsed ? user?.fullName ?? "User" : undefined}
        >
          <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold tracking-wide text-white">
            {userInitials}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[color:var(--chrome-via)]" title="Online" />
          </span>
          {!sidebarCollapsed ? (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--sidebar-text)]">{user?.fullName ?? "User"}</p>
                <p className="truncate text-[11px] capitalize text-[var(--chrome-muted)]">
                  {user?.role ?? "User"}
                </p>
                <p className="flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
                </p>
              </div>
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((open) => !open)}
                  className="rounded-lg p-1.5 text-[var(--chrome-muted)] transition-colors duration-200 hover:bg-white/50 hover:text-[var(--sidebar-text)]"
                  aria-label="Profile options"
                  aria-expanded={profileMenuOpen}
                >
                  <MoreVertical size={16} />
                </button>
                {profileMenuOpen ? (
                  <div className="absolute bottom-9 right-0 z-30 w-36 rounded-xl border border-[color:var(--chrome-border)] bg-[var(--chrome-from)] p-1 shadow-xl">
                    <button
                      type="button"
                      onClick={onLogout}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-red-600 transition-colors duration-200 hover:bg-white/70"
                    >
                      <LogOut size={14} /> Logout
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

export { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED };
