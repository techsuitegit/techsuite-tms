"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
  isAppThemeId,
  isPublicAuthPath,
  type AppThemeId,
} from "@/app/config/app-themes";

type ThemeState = {
  theme: AppThemeId;
  setTheme: (theme: AppThemeId) => void;
};

function applyTheme(theme: AppThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: DEFAULT_APP_THEME,
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: APP_THEME_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (typeof window === "undefined") return;
        if (isPublicAuthPath(window.location.pathname)) {
          applyTheme(DEFAULT_APP_THEME);
          return;
        }
        if (state?.theme && isAppThemeId(state.theme)) applyTheme(state.theme);
      },
    },
  ),
);
