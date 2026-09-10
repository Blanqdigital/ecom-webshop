import { getIntegration } from "./integrations";
import { createHmac, timingSafeEqual } from "crypto";

// Signed link to a customer's own order status page (/ordre/<token>).
// Secret: ORDER_TOKEN_SECRET, else EMAIL_UNSUB_SECRET / CRON_SECRET /
// STRIPE_WEBHOOK_SECRET. With none set, links are omitted from emails.

async function secret(): Promise<string> {
  return (
    (await getIntegration("order_token_secret")) ||
    process.env.EMAIL_UNSUB_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.STRIPE_WEBHOOK_SECRET?.trim() ||
    ""
  ).replace(/[^\x21-\x7e]/g, "");
}

export async function orderTokensConfigured(): Promise<boolean> {
  return (await secret()).length > 0;
}

async function sign(reference: string): Promise<string> {
  return createHmac("sha256", await secret())
    .update(reference)
    .digest("base64url")
    .slice(0, 24);
}

export async function orderToken(reference: string): Promise<string> {
  if (!(await orderTokensConfigured())) throw new Error("Order token secret is not configured");
  return `${Buffer.from(reference).toString("base64url")}.${await sign(reference)}`;
}

export async function readOrderToken(token: string): Promise<string | null> {
  if (!token || !(await orderTokensConfigured())) return null;
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
  const expected = await sign(reference);
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
export async function orderStatusUrl(reference: string, baseUrl: string): Promise<string> {
  return `${baseUrl}/ordre/${await orderToken(reference)}`;
}
