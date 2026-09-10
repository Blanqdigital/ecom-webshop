import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/supabase";
import {
  listShopifyWebhooks,
  registerShopifyWebhooks,
  shopifyConfigured,
  shopifyWebhookConfigured,
} from "@/lib/shopify";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CALLBACK = `${SITE.url}/api/webhooks/shopify`;

export async function POST(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!(await shopifyConfigured())) {
    return NextResponse.json(
      { error: "SHOPIFY_ADMIN_TOKEN not set" },
      { status: 503 },
    );
  }
  if (!(await shopifyWebhookConfigured())) {
    return NextResponse.json(
      {
        error:
          "Shopify webhook secret not set — add it under Integrations (or SHOPIFY_WEBHOOK_SECRET).",
      },
      { status: 503 },
    );
  }

  const results = await registerShopifyWebhooks(CALLBACK);
  return NextResponse.json({
    ok: results.every((r) => r.ok),
    callbackUrl: CALLBACK,
    results,
  });
}

export async function GET(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!(await shopifyConfigured())) {
    return NextResponse.json(
      { error: "SHOPIFY_ADMIN_TOKEN not set" },
      { status: 503 },
    );
  }
  const result = await listShopifyWebhooks();
  return NextResponse.json({
    callbackUrl: CALLBACK,
    secretConfigured: await shopifyWebhookConfigured(),
    ...result,
  });
}
