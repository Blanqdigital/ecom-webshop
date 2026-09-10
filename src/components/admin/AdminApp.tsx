"use client";

import { SITE } from "@/lib/site";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { AdminShell } from "./AdminShell";

export function AdminApp() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  if (!supabase) {
    return (
      <Centered>
        <p className="text-[14px] text-[#6b6b66]">
          Supabase isn't configured. Set{" "}
          <code className="rounded bg-[#eee] px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="rounded bg-[#eee] px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </p>
      </Centered>
    );
  }

  if (!ready) {
    return (
      <Centered>
        <p className="text-[14px] text-[#8a8a84]">Loading …</p>
      </Centered>
    );
  }

  if (!session) return <LoginForm />;

  return <AdminShell session={session} onSignOut={() => supabase.auth.signOut()} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f6f3] px-6">
      {children}
    </div>
  );
}

function LoginForm() {
  const supabase = getSupabaseBrowser()!;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <Centered>
      <form
        onSubmit={submit}
        className="w-full max-w-[360px] rounded-2xl border border-[#e8e8e4] bg-white p-7"
      >
        <div className="mb-1 flex items-center justify-center gap-2">
          <span className="font-serif text-[24px] tracking-[0.04em]">{SITE.name}</span>
          <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase text-cream">
            Admin
          </span>
        </div>
        <p className="mb-5 text-center text-[13px] text-[#8a8a84]">
          Sign in to manage the store.
        </p>
        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-[#e2e2dd] px-3.5 py-2.5 text-[14px] outline-none focus:border-ink"
          />
          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-[#e2e2dd] px-3.5 py-2.5 text-[14px] outline-none focus:border-ink"
          />
          {error && <p className="text-[13px] text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-ink py-2.5 text-[14px] font-semibold text-cream transition-colors hover:bg-clay disabled:opacity-60"
          >
            {busy ? "Signing in …" : "Sign in"}
          </button>
        </div>
      </form>
    </Centered>
  );
}
