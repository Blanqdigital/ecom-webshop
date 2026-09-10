import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/supabase";
import { getIntegration, invalidateIntegrationsCache } from "@/lib/integrations";
import { getStripe } from "@/lib/stripe";
import { shopifyGraphql } from "@/lib/shopify-core-a";

export const dynamic = "force-dynamic";

/** Read-only provider checks. Never creates a charge, order or message. */
export async function POST(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => null);
  invalidateIntegrationsCache();
  try {
    let message: string;
    if (body?.provider === "stripe") {
      const balance = await (await getStripe()).balance.retrieve();
      const pk = await getIntegration("stripe_publishable_key");
      if (!pk.startsWith(balance.livemode ? "pk_live_" : "pk_test_")) {
        throw new Error("Publishable key is missing or uses a different payment mode.");
      }
      message = `Stripe API connected (${balance.livemode ? "live" : "test"}). Complete a test checkout to verify the key pair and webhook.`;
    } else if (body?.provider === "shopify") {
      const result = await shopifyGraphql<{ shop: { name: string } }>("query { shop { name } }");
      if (!result.ok || !result.data?.shop) throw new Error("Shopify connection failed. Check domain, token and app permissions.");
      message = `Connected to ${result.data.shop.name}. Verify variant mappings and fulfilment webhooks separately.`;
    } else if (body?.provider === "telegram") {
      const token = await getIntegration("telegram_bot_token");
      if (!token) throw new Error("Save a bot token first.");
      const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(10000), cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error("Telegram rejected the bot credentials.");
      message = "Bot credentials verified. Chat delivery has not been tested; no message was sent.";
    } else return NextResponse.json({ error: "Unknown connection test." }, { status: 400 });
    return NextResponse.json({ connected: true, message, checkedAt: new Date().toISOString() });
  } catch {
    // Provider exceptions can contain request URLs or sensitive headers.
    return NextResponse.json({ connected: false, message: "Connection check failed. Check saved credentials, provider permissions and payment mode. No orders or messages were created." }, { status: 422 });
  }
}
