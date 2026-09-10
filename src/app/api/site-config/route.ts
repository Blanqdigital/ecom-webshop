import { NextResponse } from "next/server";
import { getTrackingConfig } from "@/lib/settings";
import { getPublicPaymentConfig } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, cacheable storefront config. Tracking IDs + payment runtime flags
 * (Vipps toggle, Stripe publishable key) — never secrets. Env vars win over
 * Admin → Integrations / Settings. CDN-cached for 5 minutes.
 */
export async function GET() {
  const [tracking, payment] = await Promise.all([
    getTrackingConfig(),
    getPublicPaymentConfig(),
  ]);
  return NextResponse.json(
    { ...tracking, ...payment },
    {
      headers: {
        "cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
