"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "../ui";

interface WebhookSummary {
  id: string;
  topic: string;
  callbackUrl: string | null;
}

interface WebhookRegistration {
  topic: string;
  ok: boolean;
  id?: string;
  alreadyExists?: boolean;
  errors?: unknown;
}

export function ShopifyWebhooksCard({ token }: { token: string }) {
  const [whCallback, setWhCallback] = useState<string | null>(null);
  const [whSecretOk, setWhSecretOk] = useState<boolean | null>(null);
  const [whList, setWhList] = useState<WebhookSummary[] | null>(null);
  const [whResults, setWhResults] = useState<WebhookRegistration[] | null>(null);
  const [whLoading, setWhLoading] = useState(false);
  const [whRegistering, setWhRegistering] = useState(false);
  const [whError, setWhError] = useState<string | null>(null);
  const [whMessage, setWhMessage] = useState<string | null>(null);

  const loadWebhooks = useCallback(async () => {
    setWhLoading(true);
    setWhError(null);
    try {
      const res = await fetch("/api/admin/shopify-webhooks", {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load Shopify webhooks.");
      setWhCallback(data.callbackUrl ?? null);
      setWhSecretOk(!!data.secretConfigured);
      setWhList(data.webhooks ?? []);
      if (data.errors) {
        setWhError(
          typeof data.errors === "string" ? data.errors : JSON.stringify(data.errors)
        );
      }
    } catch (e) {
      setWhError((e as Error).message);
      setWhList(null);
    } finally {
      setWhLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);

  async function registerWebhooks() {
    setWhRegistering(true);
    setWhError(null);
    setWhMessage(null);
    setWhResults(null);
    try {
      const res = await fetch("/api/admin/shopify-webhooks", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't register webhooks.");
      setWhResults(data.results ?? []);
      setWhCallback(data.callbackUrl ?? whCallback);
      setWhMessage(data.ok ? "Webhook registration finished." : "Registration completed with errors.");
      await loadWebhooks();
    } catch (e) {
      setWhError((e as Error).message);
    } finally {
      setWhRegistering(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-[15px] font-semibold text-ink">Shopify fulfilment webhooks</h2>
      <p className="mb-4 text-[12.5px] text-[#8a8a84]">
        Registers <code className="rounded bg-[#eee] px-1">FULFILLMENTS_CREATE</code> and{" "}
        <code className="rounded bg-[#eee] px-1">FULFILLMENTS_UPDATE</code> so tracking syncs back to paid webshop orders.
      </p>
      <div className="mb-4 space-y-1 text-[12.5px] text-[#6b6b66]">
        <div>
          Callback:{" "}
          <code className="rounded bg-[#eee] px-1 py-0.5 text-[12px]">{whCallback ?? "..."}</code>
        </div>
        <div>
          Webhook secret:{" "}
          {whSecretOk == null
            ? "..."
            : whSecretOk
              ? "configured"
              : "missing - save shopify_webhook_secret first"}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={loadWebhooks}
          disabled={whLoading || whRegistering}
          className="rounded-lg border border-[#e2e2dd] px-3.5 py-1.5 text-[13px] font-medium text-ink transition-colors hover:border-ink disabled:opacity-50"
        >
          {whLoading ? "Refreshing ..." : "Inspect webhooks"}
        </button>
        <button
          type="button"
          onClick={registerWebhooks}
          disabled={whRegistering || whLoading}
          className="rounded-lg bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-cream transition-colors hover:bg-clay disabled:opacity-50"
        >
          {whRegistering ? "Registering ..." : "Register fulfilment webhooks"}
        </button>
      </div>
      {whError && <p className="mb-3 text-[13px] text-[#9a2820]">{whError}</p>}
      {whMessage && <p className="mb-3 text-[13px] text-[#1f7a4d]">{whMessage}</p>}
      {whResults && whResults.length > 0 && (
        <ul className="mb-4 space-y-1 text-[12.5px] text-[#6b6b66]">
          {whResults.map((r) => (
            <li key={r.topic}>
              <span className="font-medium text-ink">{r.topic}</span>
              {": "}
              {r.ok ? (r.alreadyExists ? "already registered" : "registered") : "failed"}
            </li>
          ))}
        </ul>
      )}
      {whList && whList.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[#eeeeea]">
          <table className="w-full min-w-[480px] text-left text-[12.5px]">
            <thead className="bg-[#fafaf7] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8a8a84]">
              <tr>
                <th className="px-3 py-2">Topic</th>
                <th className="px-3 py-2">Callback</th>
              </tr>
            </thead>
            <tbody>
              {whList.map((w) => (
                <tr key={w.id} className="border-t border-[#eeeeea]">
                  <td className="px-3 py-2 font-medium text-ink">{w.topic}</td>
                  <td className="px-3 py-2 text-[#6b6b66]">{w.callbackUrl ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : whList && !whLoading ? (
        <p className="text-[12.5px] text-[#8a8a84]">No webhooks returned from Shopify yet.</p>
      ) : null}
    </Card>
  );
}
