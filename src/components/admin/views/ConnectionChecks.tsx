"use client";
import { useState } from "react";

export function ConnectionChecks({ token }: { token: string }) {
  const [results, setResults] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  async function check(provider: string) {
    setBusy(provider);
    try {
      const response = await fetch("/api/admin/integrations/test", {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await response.json();
      setResults(v => ({ ...v, [provider]: data.message || data.error || "Check failed." }));
    } catch { setResults(v => ({ ...v, [provider]: "Could not run connection check." })); }
    finally { setBusy(null); }
  }
  return <section className="rounded-xl border border-gray-200 bg-white p-6">
    <h2 className="font-semibold">Connection checks</h2>
    <p className="my-2 text-sm text-gray-600">Save changes first. These checks read provider status without sending messages or placing orders.</p>
    {["stripe", "shopify", "telegram"].map(provider => <div key={provider} className="my-4">
      <button disabled={busy !== null} onClick={() => check(provider)} className="rounded border px-3 py-2 text-sm disabled:opacity-50">{busy === provider ? "Checking…" : `Test ${provider}`}</button>
      {results[provider] && <p role="status" className="mt-2 text-sm">{results[provider]}</p>}
    </div>)}
  </section>;
}
