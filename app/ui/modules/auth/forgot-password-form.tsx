"use client";

import { Mail } from "lucide-react";
import { FormEvent, useState } from "react";

import { BackButton } from "@/app/ui/components/back-button";
import { BrandTagline } from "@/app/ui/components/brand-tagline";
import { CompanyLogo } from "@/app/ui/components/company-logo";
import { LoginWorldBackground } from "@/app/ui/modules/auth/login-world-background";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Password reset will be available once sign-in is connected.");
  }

  return (
    <div className="relative min-h-app-screen overflow-hidden px-4 py-8">
      <LoginWorldBackground />

      <div className="relative mx-auto flex min-h-[calc(var(--app-viewport-height)-4rem)] w-full max-w-[1200px] items-center justify-center">
        <div className="app-auth-card w-full max-w-[440px]">
          <section className="px-6 py-7 sm:px-8 sm:py-8">
            <div className="flex w-full flex-col items-center justify-center text-center">
              <CompanyLogo className="mx-auto h-[5.25rem] w-auto max-w-[260px] object-contain object-center" />
              <BrandTagline />
            </div>
            <div className="mx-auto mt-5 h-px w-24 bg-gradient-to-r from-transparent via-[color:var(--primary)] to-transparent" />
            <h1 className="mt-5 text-center font-[family-name:var(--font-cormorant)] text-[2rem] font-bold tracking-tight text-[var(--sidebar-text)]">
              Forgot password
            </h1>
            <p className="mt-2 text-center text-[13px] leading-relaxed text-[var(--chrome-muted)]">
              Enter the email you use for tms-web. Reset will be enabled with the upcoming sign-in flow.
            </p>

            {message ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-medium text-emerald-900">
                {message}
              </div>
            ) : null}

            <form className="mt-5 space-y-3.5" onSubmit={onSubmit}>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--chrome-muted)]">
                  Email
                </span>
                <span className="relative block">
                  <span className="app-auth-field-icon">
                    <Mail size={14} />
                  </span>
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    className="app-auth-field py-3 pl-[3.15rem] pr-3 text-sm"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </span>
              </label>
              <button type="submit" className="app-auth-submit">
                Send reset link
              </button>
            </form>

            <p className="mt-5 flex justify-center">
              <BackButton href="/login" />
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
