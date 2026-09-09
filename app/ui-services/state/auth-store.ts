"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SessionStatus = "pending" | "authenticated" | "unauthenticated";

export type SessionUser = {
  fullName: string;
  email: string;
  role: string;
  phoneNumber?: string;
};

type AuthState = {
  hasHydrated: boolean;
  sessionStatus: SessionStatus;
  user: SessionUser | null;
  accessToken: string | null;
  setHasHydrated: (value: boolean) => void;
  setSessionStatus: (status: SessionStatus) => void;
  signIn: (login: string, password: string) => Promise<void>;
  logout: () => void;
};

const AUTH_STORAGE_KEY = "tms-web-auth";

const memoryStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function authStorage() {
  return typeof window === "undefined" ? memoryStorage : window.sessionStorage;
}

function clearBrowserAuth() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

function localUserFromLogin(login: string): SessionUser {
  const value = login.trim();
  const isEmail = value.includes("@");
  return {
    fullName: isEmail ? (value.split("@")[0] ?? value) : value,
    email: isEmail ? value : `${value}@local`,
    role: "User",
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      sessionStatus: "pending",
      user: null,
      accessToken: null,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setSessionStatus: (status) => set({ sessionStatus: status }),
      signIn: async (login) => {
        set({
          accessToken: "local-session",
          sessionStatus: "authenticated",
          user: localUserFromLogin(login),
        });
      },
      logout: () => {
        clearBrowserAuth();
        set({
          user: null,
          accessToken: null,
          sessionStatus: "unauthenticated",
        });
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => authStorage()),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (!state) return;
        if (error || !state.accessToken) {
          state.setSessionStatus("unauthenticated");
        } else {
          state.setSessionStatus("authenticated");
        }
        state.setHasHydrated(true);
      },
    },
  ),
);
