import crypto from "crypto";
import { getTrackingId } from "@/lib/settings";
import { getIntegration } from "@/lib/integrations";

// Meta Conversions API (server-side events). Sends a server copy of browser
// pixel events straight to Meta, deduplicated with the browser pixel via a
// shared event_id. No-ops if meta_capi_access_token is not configured
// (env or Admin → Integrations).
const GRAPH_VERSION = "v21.0";

/** Meta requires user identifiers to be SHA-256 hashed (normalized first). */
function hash(value: string): string {
  return crypto
    .createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex");
}

interface CapiUser {
  email?: string | null;
  phone?: string | null;
  /** _fbp cookie (browser pixel id), sent raw. */
  fbp?: string | null;
  /** _fbc cookie (click id), sent raw. */
  fbc?: string | null;
  /** Visitor IP address, taken from the request headers. Improves match rate. */
  clientIpAddress?: string | null;
  /** Visitor user-agent, taken from the request headers. Improves match rate. */
  clientUserAgent?: string | null;
}

interface CapiEvent {
  /** e.g. "PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase". */
  eventName: string;
  /** Same id used by the browser pixel so Meta deduplicates the pair. */
  eventId: string;
  eventSourceUrl?: string;
  user: CapiUser;
  value?: number;
  currency?: string;
  contentIds?: string[];
  contentName?: string;
  numItems?: number;
}

/** Send any standard e-commerce event to the Conversions API. */
export async function sendCapiEvent(e: CapiEvent): Promise<void> {
  const token = (await getIntegration("meta_capi_access_token")).trim();
  if (!token) return; // not configured yet — no-op
  // Pixel ID comes from the admin Settings tab (env var overrides).
  const pixelId = await getTrackingId("meta_pixel_id");
  if (!pixelId) return;

  const user_data: Record<string, unknown> = {};
  if (e.user.email) user_data.em = [hash(e.user.email)];
  if (e.user.phone) user_data.ph = [hash(e.user.phone.replace(/[^0-9]/g, ""))];
  if (e.user.fbp) user_data.fbp = e.user.fbp;
  if (e.user.fbc) user_data.fbc = e.user.fbc;
  if (e.user.clientIpAddress) user_data.client_ip_address = e.user.clientIpAddress;
  if (e.user.clientUserAgent) user_data.client_user_agent = e.user.clientUserAgent;

  const custom_data: Record<string, unknown> = {};
  if (e.currency) custom_data.currency = e.currency;
  if (e.value != null) custom_data.value = e.value;
  if (e.contentIds?.length) {
    custom_data.content_ids = e.contentIds;
    custom_data.content_type = "product";
  }
  if (e.contentName) custom_data.content_name = e.contentName;
  if (e.numItems != null) custom_data.num_items = e.numItems;

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: e.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: e.eventId,
        action_source: "website",
        ...(e.eventSourceUrl ? { event_source_url: e.eventSourceUrl } : {}),
        user_data,
        ...(Object.keys(custom_data).length ? { custom_data } : {}),
      },
    ],
  };
  // Optional: route to Events Manager "Test events" while validating.
  const testCode = (await getIntegration("meta_capi_test_event_code")).trim();
  if (testCode) {
    body.test_event_code = testCode;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      console.error(
        `[capi] ${e.eventName} failed:`,
        res.status,
        await res.text().catch(() => ""),
      );
    }
  } catch (err) {
    console.error(`[capi] ${e.eventName} error:`, (err as Error).message);
  }
}

interface CapiPurchase {
  /** Same id used by the browser pixel so Meta deduplicates. */
  eventId: string;
  value: number;
  currency: string;
  contentIds: string[];
  eventSourceUrl?: string;
  user: CapiUser;
}

/**
 * Server-side Purchase — a thin wrapper over sendCapiEvent, kept so the order
 * pipeline (which owns the authoritative sale) has a dedicated entry point.
 */
export async function sendCapiPurchase(p: CapiPurchase): Promise<void> {
  await sendCapiEvent({
    eventName: "Purchase",
    eventId: p.eventId,
    value: p.value,
    currency: p.currency,
    contentIds: p.contentIds,
    eventSourceUrl: p.eventSourceUrl,
    user: p.user,
  });
}
