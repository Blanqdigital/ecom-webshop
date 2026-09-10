import { NextResponse } from "next/server";
import { getSupabaseAdmin, authenticateAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The standard new-store checklist (mirrors docs/SETUP.md). Loaded into the
// table via POST { seed: true } so each store manages its own live copy.
const SETUP_CHECKLIST = [
  "Edit src/lib/company.ts — brand, legal entity, org.nr, address, support email/phone, URL",
  "Edit src/lib/products.ts + offers.ts — product, variants, prices, order bump",
  "Replace public/images/ and rewrite storefront copy (homepage, PDP, FAQ, emails)",
  "Supabase: new project, run all of supabase/schema.sql",
  "Vercel: set bootstrap env (Supabase URL/anon/service-role, ADMIN_EMAILS, CRON_SECRET, STRIPE_WEBHOOK_SECRET) and deploy",
  "GitHub: gh variable set SITE_URL + gh secret set CRON_SECRET (Actions crons)",
  "Admin → Integrations: paste Stripe keys, Resend, Vipps, Telegram, Shopify, Meta CAPI, Clarity API (env still wins if set)",
  "Stripe: webhook → /api/webhooks/stripe with checkout.session.completed AND payment_intent.succeeded",
  "Resend: verify domain; set From + notify in Integrations; create a real support mailbox",
  "Paste Meta Pixel / Google Tag / Clarity IDs in Settings → Tracking",
  "Optional: enable Vipps toggle in Integrations (or NEXT_PUBLIC_VIPPS_ENABLED=1)",
  "Optional: Shopify fulfilment — token + domain in Integrations, update SHOPIFY_VARIANT_MAP by IMAGE",
  "Legal pages match company.ts (vilkår, personvern, angrerett)",
  "Grep for leftover template brand strings",
  "Test order end-to-end: admin, emails, Telegram, Shopify — then cancel the test order",
  "Go live: live Stripe keys + live webhook secret, 1 kr test order + refund",
];
