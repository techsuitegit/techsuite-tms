"use client";

import { create } from "zustand";

type RefreshHandler = () => void | Promise<void>;

type PageRefreshState = {
  handler: RefreshHandler | null;
  registerHandler: (handler: RefreshHandler) => void;
  unregisterHandler: (handler: RefreshHandler) => void;
  clearHandler: () => void;
};

export const usePageRefreshStore = create<PageRefreshState>((set, get) => ({
  handler: null,
  registerHandler: (handler) => set({ handler }),
  unregisterHandler: (handler) => {
    if (get().handler === handler) set({ handler: null });
  },
  clearHandler: () => set({ handler: null }),
}));
