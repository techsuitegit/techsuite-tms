export const APP_THEMES = [
  { id: "gold", label: "Gold", swatch: "#d4a61c" },
  { id: "azure", label: "Azure", swatch: "#3d73c8" },
  { id: "sage", label: "Sage", swatch: "#5a8648" },
  { id: "rose", label: "Rose", swatch: "#c07074" },
  { id: "copper", label: "Copper", swatch: "#c67434" },
  { id: "teal", label: "Teal", swatch: "#2a9084" },
  { id: "lavender", label: "Lavender", swatch: "#7a62b8" },
  { id: "platinum", label: "Platinum", swatch: "#6a7484" },
  { id: "coral", label: "Coral", swatch: "#d86a50" },
  { id: "indigo", label: "Indigo", swatch: "#5566d0" },
  { id: "mint", label: "Mint", swatch: "#2ea87a" },
  { id: "sand", label: "Sand", swatch: "#c49a58" },
  { id: "wine", label: "Wine", swatch: "#a4546c" },
  { id: "lemon", label: "Lemon", swatch: "#c8bc30" },
  { id: "sky", label: "Sky", swatch: "#3a9ccc" },
] as const;

export type AppThemeId = (typeof APP_THEMES)[number]["id"];

export const APP_THEME_STORAGE_KEY = "tms-web.ui-theme";

export function isAppThemeId(value: string | null | undefined): value is AppThemeId {
  return APP_THEMES.some((theme) => theme.id === value);
}

/** Resolves `NEXT_PUBLIC_DEEFAULT_COLOR` (or `NEXT_PUBLIC_DEFAULT_COLOR`) to a theme id. */
export function getEnvDefaultTheme(): AppThemeId {
  const raw = (
    process.env.NEXT_PUBLIC_DEEFAULT_COLOR ??
    process.env.NEXT_PUBLIC_DEFAULT_COLOR ??
    "gold"
  )
    .trim()
    .toLowerCase();

  if (isAppThemeId(raw)) return raw;
  const byLabel = APP_THEMES.find((theme) => theme.label.toLowerCase() === raw);
  return byLabel?.id ?? "gold";
}

export const DEFAULT_APP_THEME: AppThemeId = getEnvDefaultTheme();

const AUTH_PATH_PREFIXES = ["/login", "/forgot-password"];

export function isPublicAuthPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return AUTH_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

