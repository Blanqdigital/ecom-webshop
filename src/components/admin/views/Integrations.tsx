"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "../ui";

type IntegrationKey =
  | "stripe_secret_key"
  | "stripe_publishable_key"
  | "vipps_client_id"
  | "vipps_client_secret"
  | "vipps_subscription_key"
  | "vipps_msn"
  | "vipps_env"
  | "vipps_enabled"
  | "resend_api_key"
  | "order_from"
  | "order_notify_to"
  | "telegram_bot_token"
  | "telegram_chat_id"
  | "shopify_admin_token"
  | "shopify_store_domain"
  | "meta_capi_access_token"
  | "meta_capi_test_event_code"
  | "clarity_api_token"
  | "sale_ends_at";

interface IntegrationStatus {
  configured: boolean;
  envOverride: boolean;
  value?: string;
  masked?: string;
}

const SECRET_KEYS = new Set<IntegrationKey>([
  "stripe_secret_key",
  "resend_api_key",
  "telegram_bot_token",
  "telegram_chat_id",
  "vipps_client_id",
  "vipps_client_secret",
  "vipps_subscription_key",
  "vipps_msn",
  "shopify_admin_token",
  "meta_capi_access_token",
  "meta_capi_test_event_code",
  "clarity_api_token",
]);

type Field = {
  key: IntegrationKey;
  label: string;
  placeholder?: string;
  hint?: string;
  type?: "text" | "password" | "select" | "toggle";
  options?: { value: string; label: string }[];
};

const GROUPS: { title: string; blurb: string; fields: Field[] }[] = [
  {
    title: "Payments — Stripe",
    blurb: "Secret key stays server-only. Publishable key is exposed via /api/site-config for checkout.",
    fields: [
      {
        key: "stripe_secret_key",
        label: "Stripe secret key",
        placeholder: "sk_live_… or sk_test_…",
        hint: "Dashboard → Developers → API keys.",
      },
      {
        key: "stripe_publishable_key",
        label: "Stripe publishable key",
        placeholder: "pk_live_… or pk_test_…",
        hint: "Safe to expose — used by Stripe.js on /kasse.",
      },
    ],
  },
  {
    title: "Payments — Vipps",
    blurb: "All four credentials required. Toggle enables the Vipps button on checkout (no redeploy).",
    fields: [
      { key: "vipps_enabled", label: "Show Vipps at checkout", type: "toggle", hint: 'Stores "1" when enabled.' },
      { key: "vipps_client_id", label: "Client ID", placeholder: "…" },
      { key: "vipps_client_secret", label: "Client secret", placeholder: "…" },
      { key: "vipps_subscription_key", label: "Subscription key", placeholder: "…" },
      { key: "vipps_msn", label: "Merchant serial number (MSN)", placeholder: "…" },
      {
        key: "vipps_env",
        label: "Environment",
        type: "select",
        options: [
          { value: "test", label: "test" },
          { value: "production", label: "production" },
        ],
      },
    ],
  },
  {
    title: "Email — Resend",
    blurb: "Order confirmations + admin alerts. From must be on a verified Resend domain.",
    fields: [
      { key: "resend_api_key", label: "Resend API key", placeholder: "re_…" },
      {
        key: "order_from",
        label: "From address",
        placeholder: 'YOUR BRAND <ordre@yourshop.example>',
      },
      {
        key: "order_notify_to",
        label: "Notify admin at",
        placeholder: "hei@yourshop.example",
        hint: "Defaults to company support email when empty.",
      },
    ],
  },
  {
    title: "Telegram",
    blurb: "Instant order pings. Message the bot once, then paste chat id from getUpdates.",
    fields: [
      { key: "telegram_bot_token", label: "Bot token", placeholder: "123456:ABC…" },
      { key: "telegram_chat_id", label: "Chat ID", placeholder: "-100… or 123…" },
    ],
  },
  {
    title: "Shopify fulfilment",
    blurb: "Dropship sync. Also fill SHOPIFY_VARIANT_MAP in src/lib/shopify.ts (match by image).",
    fields: [
      { key: "shopify_admin_token", label: "Admin API token", placeholder: "shpat_…" },
      {
        key: "shopify_store_domain",
        label: "Store domain",
        placeholder: "your-store.myshopify.com",
      },
    ],
  },
  {
    title: "Meta Conversions API",
    blurb: "Server-side events. Pixel ID still lives under Settings → Tracking.",
    fields: [
      { key: "meta_capi_access_token", label: "Access token", placeholder: "…" },
      {
        key: "meta_capi_test_event_code",
        label: "Test event code",
        placeholder: "TEST12345",
        hint: "Optional — Events Manager → Test events.",
      },
    ],
  },
  {
    title: "Microsoft Clarity API",
    blurb: "Powers the Clarity panel in Insights (Data export token).",
    fields: [
      { key: "clarity_api_token", label: "Clarity API token", placeholder: "…" },
    ],
  },
  {
    title: "Sale window",
    blurb: "Gates abandoned-cart reminders when the sale has ended.",
    fields: [
      {
        key: "sale_ends_at",
        label: "Sale ends at (ISO 8601)",
        placeholder: "2026-09-30T23:59:59+02:00",
        hint: "Empty = sale always live.",
      },
    ],
  },
];

export function Integrations({ token }: { token: string }) {
  const [status, setStatus] = useState<Record<
    IntegrationKey,
    IntegrationStatus
  > | null>(null);
  // Draft holds typed values. Secrets start empty; only dirty secrets are PUT.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirtySecrets, setDirtySecrets] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/integrations", {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load integrations.");
      const integrations = data.integrations as Record<
        IntegrationKey,
        IntegrationStatus
      >;
      setStatus(integrations);
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(integrations)) {
        if (SECRET_KEYS.has(k as IntegrationKey)) {
          next[k] = ""; // never prefill secrets
        } else if (k === "vipps_enabled") {
          next[k] = v.value === "1" ? "1" : "";
        } else {
          next[k] = v.value ?? "";
        }
      }
      setDraft(next);
      setDirtySecrets(new Set());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  function setField(key: IntegrationKey, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
    if (SECRET_KEYS.has(key)) {
      setDirtySecrets((s) => new Set(s).add(key));
    }
  }

  async function save() {
    if (!status) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const body: Record<string, string> = {};
      for (const group of GROUPS) {
        for (const f of group.fields) {
          if (status[f.key]?.envOverride) continue;
          if (SECRET_KEYS.has(f.key)) {
            if (dirtySecrets.has(f.key)) body[f.key] = draft[f.key] ?? "";
          } else {
            body[f.key] = draft[f.key] ?? "";
          }
        }
      }
      const res = await fetch("/api/admin/integrations", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save.");
      setStatus(data.integrations);
      setDirtySecrets(new Set());
      // Clear secret inputs after save (they're configured now).
      setDraft((d) => {
        const next = { ...d };
        for (const k of SECRET_KEYS) {
          if (body[k] !== undefined) next[k] = "";
        }
        return next;
      });
      setMessage("Saved — live within ~60s on warm instances (cache TTL).");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="p-5">
        <p className="text-[13.5px] leading-relaxed text-[#6b6b66]">
          Paste API keys and config here — stored in{" "}
          <code className="rounded bg-[#eee] px-1 py-0.5 text-[12px]">
            store_settings
          </code>{" "}
          (service-role only). Env vars always win and lock the field. Bootstrap
          secrets (Supabase, ADMIN_EMAILS, CRON_SECRET, webhook secrets) stay in
          Vercel.
        </p>
      </Card>

      {error && (
        <p className="text-[13px] text-[#9a2820]">{error}</p>
      )}
      {!status && !error ? (
        <p className="text-[13.5px] text-[#8a8a84]">Loading …</p>
      ) : status ? (
        <>
          {GROUPS.map((g) => (
            <Card key={g.title} className="p-6">
              <h2 className="mb-1 text-[15px] font-semibold text-ink">
                {g.title}
              </h2>
              <p className="mb-4 text-[12.5px] text-[#8a8a84]">{g.blurb}</p>
              <div className="space-y-4">
                {g.fields.map((f) => {
                  const st = status[f.key];
                  const locked = !!st?.envOverride;
                  const isSecret = SECRET_KEYS.has(f.key);
                  return (
                    <div key={f.key}>
                      <label className="mb-1 block text-[13px] font-medium text-ink">
                        {f.label}
                        {locked && (
                          <span className="ml-2 rounded bg-[#f3ead9] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#8a6a2f]">
                            set by env var — field disabled
                          </span>
                        )}
                        {!locked && isSecret && st?.configured && (
                          <span className="ml-2 rounded bg-[#eef0ee] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#4a4a45]">
                            {st.masked || "•••• set"}
                          </span>
                        )}
                      </label>
                      {f.type === "toggle" ? (
                        <label className="flex items-center gap-2 text-[13.5px] text-ink">
                          <input
                            type="checkbox"
                            checked={(draft[f.key] ?? "") === "1"}
                            disabled={locked}
                            onChange={(e) =>
                              setField(f.key, e.target.checked ? "1" : "")
                            }
                            className="h-4 w-4 rounded border-[#e2e2dd]"
                          />
                          Enabled
                        </label>
                      ) : f.type === "select" ? (
                        <select
                          value={draft[f.key] || "test"}
                          disabled={locked}
                          onChange={(e) => setField(f.key, e.target.value)}
                          className="w-full rounded-lg border border-[#e2e2dd] px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink disabled:bg-[#f3f3ef] disabled:text-[#8a8a84]"
                        >
                          {(f.options ?? []).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={isSecret ? "password" : "text"}
                          value={draft[f.key] ?? ""}
                          placeholder={
                            isSecret && st?.configured && !dirtySecrets.has(f.key)
                              ? "•••• set — type to replace"
                              : f.placeholder
                          }
                          disabled={locked}
                          autoComplete="off"
                          onChange={(e) => setField(f.key, e.target.value)}
                          className="w-full rounded-lg border border-[#e2e2dd] px-3 py-2 text-[13.5px] text-ink outline-none transition-colors focus:border-ink disabled:bg-[#f3f3ef] disabled:text-[#8a8a84]"
                        />
                      )}
                      {f.hint && (
                        <p className="mt-1 text-[11.5px] text-[#a3a39c]">
                          {f.hint}
                        </p>
                      )}
                      {isSecret && !locked && (
                        <p className="mt-1 text-[11px] text-[#a3a39c]">
                          Leave blank and save to clear. Unchanged secrets are
                          not sent.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}

          <div className="flex items-center gap-3 pb-8">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-ink px-4 py-2 text-[13.5px] font-semibold text-cream transition-colors hover:bg-clay disabled:opacity-50"
            >
              {saving ? "Saving …" : "Save integrations"}
            </button>
            {message && (
              <span className="text-[12.5px] text-[#1f7a4d]">{message}</span>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
