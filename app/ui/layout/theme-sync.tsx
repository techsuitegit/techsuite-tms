"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { DEFAULT_APP_THEME, isPublicAuthPath } from "@/app/config/app-themes";
import { useThemeStore } from "@/app/store/theme-store";

function applyTheme(theme: string) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeSync() {
  const pathname = usePathname();
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    if (isPublicAuthPath(pathname)) {
      applyTheme(DEFAULT_APP_THEME);
      return;
    }
    applyTheme(theme);
  }, [pathname, theme]);

  return null;
}
