"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { useAuthStore } from "@/app/store/auth-store";
import { BrandTagline } from "@/app/ui/components/brand-tagline";
import { CompanyLogo } from "@/app/ui/components/company-logo";
import { LoginWorldBackground } from "@/app/ui/modules/auth/login-world-background";

export function LoginForm() {
  const router = useRouter();
  const signIn = useAuthStore((state) => state.signIn);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const sessionStatus = useAuthStore((state) => state.sessionStatus);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hasHydrated && sessionStatus === "authenticated") {
      router.replace("/dashboard");
    }
  }, [hasHydrated, router, sessionStatus]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!login.trim() || !password) {
      setError("Login and password are required.");
      return;
    }
    setBusy(true);
    try {
      await signIn(login.trim(), password);
      router.replace("/dashboard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-app-screen overflow-hidden px-4 py-8">
      <LoginWorldBackground />

      <div className="relative z-10 mx-auto flex min-h-[calc(var(--app-viewport-height)-4rem)] w-full max-w-[1400px] items-center justify-center lg:justify-between">
        <div className="app-auth-card w-full max-w-[440px]">
          <section className="px-6 py-7 sm:px-8 sm:py-8">
            <div className="flex w-full flex-col items-center justify-center text-center">
              <CompanyLogo className="mx-auto h-[5.25rem] w-auto max-w-[260px] object-contain object-center" />
              <BrandTagline />
            </div>

            <div className="mx-auto mt-5 h-px w-24 bg-gradient-to-r from-transparent via-[color:var(--primary)] to-transparent" />

            <div className="mt-5 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--chrome-muted)]">
                Approver workspace
              </p>
              <h1 className="mt-1.5 font-[family-name:var(--font-cormorant)] text-[2.05rem] font-bold leading-none tracking-tight text-[var(--sidebar-text)]">
                Sign In
              </h1>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--chrome-muted)]">
                Continue to your SAP release inbox.
              </p>
            </div>

            <form className="mt-6 space-y-3.5" onSubmit={(event) => void onSubmit(event)} autoComplete="on">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--chrome-muted)]">
                  Username or Email
                </span>
                <span className="relative block">
                  <span className="app-auth-field-icon">
                    <Mail size={14} />
                  </span>
                  <input
                    className="app-auth-field py-3 pl-[3.15rem] pr-3 text-sm"
                    placeholder="name@company.com"
                    type="text"
                    name="login"
                    autoComplete="username"
                    value={login}
                    onChange={(event) => setLogin(event.target.value)}
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--chrome-muted)]">
                  Password
                </span>
                <span className="relative block">
                  <span className="app-auth-field-icon">
                    <Lock size={14} />
                  </span>
                  <input
                    className="app-auth-field py-3 pl-[3.15rem] pr-11 text-sm"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--chrome-muted)] transition-colors hover:bg-[var(--chrome-via)] hover:text-[var(--sidebar-text)]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </span>
              </label>

              {error ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              ) : null}

              <div className="flex items-center justify-end">
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-[var(--primary)] transition-colors hover:text-[var(--secondary)] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              <button className="app-auth-submit mt-1" type="submit" disabled={busy}>
                {busy ? "Signing in…" : "Sign In"}
                <ArrowRight size={16} />
              </button>
            </form>

            <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] font-medium tracking-wide text-[var(--chrome-muted)]">
              <ShieldCheck size={13} className="text-[var(--primary)]" />
              Secured access for SAP approvers
            </p>
          </section>
        </div>

        <section className="relative hidden min-h-[420px] flex-1 items-center justify-center px-6 lg:flex xl:px-12">
          <div className="relative z-10 max-w-[40rem] text-center">
            <h2 className="login-tagline-title">Transport Management System.</h2>
            <p className="login-tagline-copy mt-4">
              Help to manage Truck, Route and Movements In Connected with Customer Order.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
