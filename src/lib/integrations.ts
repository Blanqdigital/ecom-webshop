import { getSupabaseAdmin } from "@/lib/supabase";

// Store integration secrets + config in `store_settings`, editable from
// /admin → Integrations. Env vars (when set) ALWAYS win. Server-only —
// never import from client components. Secrets are never returned in full
// to the admin UI (only configured / envOverride / masked).

/** Keys that must never be echoed back to the browser. */
export const SECRET_KEYS = [
  "stripe_secret_key",
  "resend_api_key",
  "telegram_bot_token",
  "telegram_chat_id",
  "vipps_client_id",
  "vipps_client_secret",
  "vipps_subscription_key",
  "vipps_msn",
  "shopify_admin_token",
  "shopify_webhook_secret",
  "order_token_secret",
  "post_purchase_token_secret",
  "meta_capi_access_token",
  "meta_capi_test_event_code",
  "clarity_api_token",
] as const;

/** Non-secret config keys (safe to show in admin). */
export const CONFIG_KEYS = [
  "order_from",
  "order_notify_to",
  "vipps_env",
  "sale_ends_at",
  "shopify_store_domain",
  "vipps_enabled",
  "stripe_publishable_key",
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];
export type ConfigKey = (typeof CONFIG_KEYS)[number];
export type IntegrationKey = SecretKey | ConfigKey;

export const INTEGRATION_KEYS: IntegrationKey[] = [
  ...SECRET_KEYS,
  ...CONFIG_KEYS,
];

const SECRET_SET = new Set<string>(SECRET_KEYS);

/** Env var that overrides each DB setting. */
const ENV_OVERRIDE: Record<IntegrationKey, string | undefined> = {
  stripe_secret_key: process.env.STRIPE_SECRET_KEY,
  resend_api_key: process.env.RESEND_API_KEY,
  telegram_bot_token: process.env.TELEGRAM_BOT_TOKEN,
  telegram_chat_id: process.env.TELEGRAM_CHAT_ID,
  vipps_client_id: process.env.VIPPS_CLIENT_ID,
  vipps_client_secret: process.env.VIPPS_CLIENT_SECRET,
  vipps_subscription_key: process.env.VIPPS_SUBSCRIPTION_KEY,
  vipps_msn: process.env.VIPPS_MSN,
  shopify_admin_token: process.env.SHOPIFY_ADMIN_TOKEN,
  shopify_webhook_secret:
    process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET,
  order_token_secret: process.env.ORDER_TOKEN_SECRET,
  post_purchase_token_secret: process.env.POST_PURCHASE_TOKEN_SECRET,
  meta_capi_access_token: process.env.META_CAPI_ACCESS_TOKEN,
  meta_capi_test_event_code: process.env.META_CAPI_TEST_EVENT_CODE,
  clarity_api_token: process.env.CLARITY_API_TOKEN,
  order_from: process.env.ORDER_FROM,
  order_notify_to: process.env.ORDER_NOTIFY_TO,
  vipps_env: process.env.VIPPS_ENV,
  sale_ends_at: process.env.SALE_ENDS_AT,
  shopify_store_domain: process.env.SHOPIFY_STORE_DOMAIN,
  vipps_enabled: process.env.NEXT_PUBLIC_VIPPS_ENABLED,
  stripe_publishable_key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
};

export interface IntegrationStatus {
  configured: boolean;
  envOverride: boolean;
  /** Non-secrets only — full resolved value. */
  value?: string;
  /** Secrets only — masked hint when a value is set. */
  masked?: string;
}

// Tiny in-memory cache (same shape as settings.ts).
let cache: { at: number; values: Record<string, string> } | null = null;
const TTL_MS = 60_000;

async function dbValues(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;
  const values: Record<string, string> = {};
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from("store_settings")
      .select("key,value");
    if (!error) {
      for (const row of data ?? []) {
        if (row.key && row.value != null && String(row.value).length > 0) {
          values[row.key] = String(row.value).trim();
        }
      }
    }
  }
  cache = { at: Date.now(), values };
  return values;
}

/** Invalidate after an admin save so changes apply immediately. */
export function invalidateIntegrationsCache(): void {
  cache = null;
}

function envValue(key: IntegrationKey): string {
  return ENV_OVERRIDE[key]?.trim() ?? "";
}

/** Mask a secret for the admin UI (never the full value). */
function maskSecret(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (v.length <= 8) return "•••• set";
  return `••••${v.slice(-4)}`;
}

/**
 * Resolve one integration value: env override first, then the DB setting.
 * For stripe_secret_key, strips non printable-ASCII (copy-paste artefacts).
 */
export async function getIntegration(key: IntegrationKey): Promise<string> {
  const env = envValue(key);
  let value = env || (await dbValues())[key] || "";
  if (key === "stripe_secret_key" || key === "stripe_publishable_key") {
    value = value.replace(/[^\x21-\x7e]/g, "");
  }
  return value;
}

/** Public runtime flags for checkout (safe to expose). */
export async function getPublicPaymentConfig(): Promise<{
  vippsEnabled: boolean;
  stripePublishableKey: string;
}> {
  const [vipps, pk] = await Promise.all([
    getIntegration("vipps_enabled"),
    getIntegration("stripe_publishable_key"),
  ]);
  return {
    vippsEnabled: vipps === "1",
    stripePublishableKey: pk,
  };
}

/** Status map for the admin Integrations UI — secrets never include plaintext. */
export async function getIntegrationStatus(): Promise<
  Record<IntegrationKey, IntegrationStatus>
> {
  const db = await dbValues();
  const out = {} as Record<IntegrationKey, IntegrationStatus>;
  for (const key of INTEGRATION_KEYS) {
    const env = envValue(key);
    const dbVal = db[key] || "";
    const resolved = env || dbVal;
    const envOverride = !!env;
    if (SECRET_SET.has(key)) {
      out[key] = {
        configured: !!resolved,
        envOverride,
        ...(resolved ? { masked: maskSecret(resolved) } : {}),
      };
    } else {
      out[key] = {
        configured: !!resolved,
        envOverride,
        value: resolved,
      };
    }
  }
  return out;
}

/**
 * Upsert admin-edited integrations. Empty string deletes the row.
 * Only keys present in `updates` are touched (so unchanged secrets can be
 * omitted from the PUT body). Env-overridden keys are skipped.
 */
export async function saveIntegrations(
  updates: Partial<Record<IntegrationKey, string>>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Database isn't configured." };

  for (const key of INTEGRATION_KEYS) {
    const raw = updates[key];
    if (typeof raw !== "string") continue;
    // Never overwrite a value that's locked by an env var.
    if (envValue(key)) continue;
    const value = raw.trim().slice(0, 2000);
    const res = value
      ? await supabase
          .from("store_settings")
          .upsert({ key, value, updated_at: new Date().toISOString() })
      : await supabase.from("store_settings").delete().eq("key", key);
    if (res.error) return { ok: false, error: res.error.message };
  }
  invalidateIntegrationsCache();
  return { ok: true };
}

export function isSecretKey(key: string): key is SecretKey {
  return SECRET_SET.has(key);
}

export function isIntegrationKey(key: string): key is IntegrationKey {
  return (INTEGRATION_KEYS as string[]).includes(key);
}
