"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuthStore } from "@/app/store/auth-store";
import { LoadingSpinner } from "@/app/ui/components/loading-spinner";

export function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const { hasHydrated, sessionStatus } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!hasHydrated) return;
    if (sessionStatus === "unauthenticated") router.replace("/login");
  }, [hasHydrated, router, sessionStatus]);

  if (!hasHydrated || sessionStatus !== "authenticated") {
    return (
      <div className="flex min-h-app-screen items-center justify-center bg-slate-50">
        <LoadingSpinner label="Checking session…" />
      </div>
    );
  }

  return <>{children}</>;
}
