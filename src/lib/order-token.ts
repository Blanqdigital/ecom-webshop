import { createHmac, timingSafeEqual } from "crypto";

// Signed link to a customer's own order status page (/ordre/<token>).
// Secret: ORDER_TOKEN_SECRET, else EMAIL_UNSUB_SECRET / CRON_SECRET /
// STRIPE_WEBHOOK_SECRET. With none set, links are omitted from emails.

function secret(): string {
  return (
    process.env.ORDER_TOKEN_SECRET?.trim() ||
    process.env.EMAIL_UNSUB_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.STRIPE_WEBHOOK_SECRET?.trim() ||
    ""
  ).replace(/[^\x21-\x7e]/g, "");
}

export function orderTokensConfigured(): boolean {
  return secret().length > 0;
}

function sign(reference: string): string {
  return createHmac("sha256", secret())
    .update(reference)
    .digest("base64url")
    .slice(0, 24);
}

export function orderToken(reference: string): string {
  return `${Buffer.from(reference).toString("base64url")}.${sign(reference)}`;
}

export function readOrderToken(token: string): string | null {
  if (!token || !orderTokensConfigured()) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  let reference: string;
  try {
    reference = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!reference) return null;

  const provided = token.slice(dot + 1);
  const expected = sign(reference);
  if (provided.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
      return null;
    }
  } catch {
    return null;
  }
  return reference;
}

/** Absolute status-page URL for an order (Norwegian storefront). */
export function orderStatusUrl(reference: string, baseUrl: string): string {
  return `${baseUrl}/ordre/${orderToken(reference)}`;
}
