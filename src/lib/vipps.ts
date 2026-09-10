import { recordOrder, type OrderAddress } from "./orders";
import { getIntegration } from "./integrations";

// Server-only Vipps (Vipps MobilePay) ePayment API client.
// Docs: https://developer.vippsmobilepay.com/docs/APIs/epayment-api/
//
// Flow: get access token -> create WEB_REDIRECT payment -> customer approves in
// the Vipps app -> we finalise (GET the authoritative payment, capture, record).
// The webhook and the /takk return URL both call finalizeVippsPayment(), which
// is idempotent, so an order is recorded once regardless of which arrives first.
//
// No-ops (vippsConfigured() === false) until the four credentials are set
// (env or Admin → Integrations), so the store runs without Vipps until on.

const TEST_BASE = "https://apitest.vipps.no";
const PROD_BASE = "https://api.vipps.no";

// Identifies our integration to Vipps (recommended on every request).
const SYSTEM_HEADERS: Record<string, string> = {
  "Vipps-System-Name": "ecom-webshop",
  "Vipps-System-Version": "1.0.0",
  "Vipps-System-Plugin-Name": "ecom-nextjs",
  "Vipps-System-Plugin-Version": "1.0.0",
};

export class VippsError extends Error {}

/** Strip stray non printable-ASCII chars a dashboard copy-paste can inject. */
const clean = (v?: string) => v?.replace(/[^\x21-\x7e]/g, "") ?? "";

async function config() {
  const [clientId, clientSecret, subKey, msn, env] = await Promise.all([
    getIntegration("vipps_client_id"),
    getIntegration("vipps_client_secret"),
    getIntegration("vipps_subscription_key"),
    getIntegration("vipps_msn"),
    getIntegration("vipps_env"),
  ]);
  return {
    clientId: clean(clientId),
    clientSecret: clean(clientSecret),
    subKey: clean(subKey),
    msn: clean(msn),
    env: (env || "test").trim().toLowerCase(),
  };
}

export async function vippsConfigured(): Promise<boolean> {
  const c = await config();
  return !!(c.clientId && c.clientSecret && c.subKey && c.msn);
}

async function requireConfig() {
  const c = await config();
  if (!c.clientId || !c.clientSecret || !c.subKey || !c.msn) {
    throw new VippsError("Vipps er ikke konfigurert.");
  }
  return c;
}

async function baseUrl(): Promise<string> {
  const c = await config();
  return c.env === "production" ? PROD_BASE : TEST_BASE;
}

// --- Access token (cached in-memory, refreshed a minute before expiry) --------

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  const c = await requireConfig();
  const res = await fetch(`${await baseUrl()}/accesstoken/get`, {
    method: "POST",
    headers: {
      client_id: c.clientId,
      client_secret: c.clientSecret,
      "Ocp-Apim-Subscription-Key": c.subKey,
      "Merchant-Serial-Number": c.msn,
      ...SYSTEM_HEADERS,
    },
  });
  if (!res.ok) {
    throw new VippsError(`token ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in?: string | number };
  const expiresIn = Number(data.expires_in) || 3600;
  tokenCache = { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return tokenCache.token;
}

async function apiHeaders(token: string): Promise<Record<string, string>> {
  const c = await requireConfig();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "Ocp-Apim-Subscription-Key": c.subKey,
    "Merchant-Serial-Number": c.msn,
    ...SYSTEM_HEADERS,
  };
}

// --- Payment operations -------------------------------------------------------

interface VippsAmount {
  currency: string;
  value: number;
}

interface VippsPayment {
  reference?: string;
  state?: string;
  amount?: VippsAmount;
  aggregate?: {
    authorizedAmount?: VippsAmount;
    capturedAmount?: VippsAmount;
    refundedAmount?: VippsAmount;
    cancelledAmount?: VippsAmount;
  };
  metadata?: Record<string, string>;
  profile?: { sub?: string };
  userDetails?: {
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
    mobileNumber?: string;
    phoneNumber?: string;
    addresses?: Array<Record<string, string>>;
  };
}

/** Create a WEB_REDIRECT payment. Returns the URL to send the customer to. */
export async function createVippsPayment(input: {
  amountOre: number;
  reference: string;
  returnUrl: string;
  description: string;
  metadata?: Record<string, string>;
}): Promise<{ redirectUrl: string; reference: string }> {
  const token = await getAccessToken();
  const body = {
    amount: { currency: "NOK", value: input.amountOre },
    paymentMethod: { type: "WALLET" },
    userFlow: "WEB_REDIRECT",
    returnUrl: input.returnUrl,
    reference: input.reference,
    paymentDescription: input.description,
    profile: { scope: "name phoneNumber email address" },
    ...(input.metadata && Object.keys(input.metadata).length
      ? { metadata: input.metadata }
      : {}),
  };
  const res = await fetch(`${await baseUrl()}/epayment/v1/payments`, {
    method: "POST",
    headers: { ...(await apiHeaders(token)), "Idempotency-Key": input.reference },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new VippsError(`create ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { redirectUrl: string; reference?: string };
  return { redirectUrl: data.redirectUrl, reference: data.reference ?? input.reference };
}

async function getVippsPayment(reference: string): Promise<VippsPayment> {
  const token = await getAccessToken();
  const res = await fetch(
    `${await baseUrl()}/epayment/v1/payments/${encodeURIComponent(reference)}`,
    { method: "GET", headers: await apiHeaders(token) },
  );
  if (!res.ok) {
    throw new VippsError(`get ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

async function captureVippsPayment(reference: string, amountOre: number) {
  const token = await getAccessToken();
  const res = await fetch(
    `${await baseUrl()}/epayment/v1/payments/${encodeURIComponent(reference)}/capture`,
    {
      method: "POST",
      headers: { ...(await apiHeaders(token)), "Idempotency-Key": `capture-${reference}` },
      body: JSON.stringify({
        modificationAmount: { currency: "NOK", value: amountOre },
      }),
    },
  );
  if (!res.ok) {
    throw new VippsError(`capture ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

export interface VippsFinalizeResult {
  recorded: boolean;
  state: string;
  amountOre: number;
  currency: string;
  cartRaw?: string;
}

export async function finalizeVippsPayment(
  reference: string,
): Promise<VippsFinalizeResult> {
  const payment = await getVippsPayment(reference);
  const state = payment.state ?? "UNKNOWN";
  const authAmount = payment.aggregate?.authorizedAmount;
  const authorized = authAmount?.value ?? payment.amount?.value ?? 0;
  const currency = (authAmount?.currency ?? payment.amount?.currency ?? "NOK").toUpperCase();

  if (state === "AUTHORIZED") {
    try {
      await captureVippsPayment(reference, authorized);
    } catch (e) {
      console.error("[vipps] capture failed:", (e as Error).message);
    }
  } else if (state !== "CAPTURED") {
    return { recorded: false, state, amountOre: 0, currency };
  }

  const u = extractUser(payment);
  await recordOrder({
    id: reference,
    email: u.email,
    name: u.name,
    phone: u.phone,
    amountTotal: authorized / 100,
    currency,
    paymentStatus: "paid",
    address: u.address,
    cart: payment.metadata?.cart,
    method: "vipps",
  });

  return {
    recorded: true,
    state: "CAPTURED",
    amountOre: authorized,
    currency,
    cartRaw: payment.metadata?.cart,
  };
}

function extractUser(payment: VippsPayment): {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: OrderAddress | null;
} {
  const ud = payment.userDetails ?? {};
  const name =
    [ud.firstName, ud.lastName].filter(Boolean).join(" ") || ud.name || null;
  const a = Array.isArray(ud.addresses) ? ud.addresses[0] : undefined;
  const address: OrderAddress | null = a
    ? {
        line1: a.streetAddress ?? a.street ?? a.addressLine1 ?? null,
        postal_code: a.postalCode ?? a.postCode ?? a.zipCode ?? null,
        city: a.city ?? a.region ?? null,
        country: a.country ?? null,
      }
    : null;
  return {
    name,
    email: ud.email ?? null,
    phone: ud.mobileNumber ?? ud.phoneNumber ?? null,
    address,
  };
}

export async function registerVippsWebhook(url: string) {
  const token = await getAccessToken();
  const res = await fetch(`${await baseUrl()}/webhooks/v1/webhooks`, {
    method: "POST",
    headers: await apiHeaders(token),
    body: JSON.stringify({
      url,
      events: [
        "epayments.payment.authorized.v1",
        "epayments.payment.captured.v1",
      ],
    }),
  });
  if (!res.ok) {
    throw new VippsError(`register ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

export async function listVippsWebhooks() {
  const token = await getAccessToken();
  const res = await fetch(`${await baseUrl()}/webhooks/v1/webhooks`, {
    headers: await apiHeaders(token),
  });
  if (!res.ok) {
    throw new VippsError(`list ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return res.json();
}
