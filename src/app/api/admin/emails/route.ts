import { PRODUCTS } from "@/lib/products";
import { NextResponse } from "next/server";
import { authenticateAdmin, getSupabaseAdmin } from "@/lib/supabase";
import { buildAbandonedCartEmail } from "@/lib/email";
import { saleState } from "@/lib/sale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Outbound-email log for the admin Marketing tab.
 * GET                       → latest entries (without HTML, payload stays light)
 * GET ?id=<uuid>            → one entry including the rendered HTML, for preview.
 * GET ?template=<step-key>  → the CURRENT template rendered with a sample cart,
 *                             so the flow view can preview content before it's
 *                             ever sent (cart_reminder | cart_reminder_2).
 * Returns { ready:false } when the email_log table hasn't been created yet.
 */
export async function GET(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const template = new URL(req.url).searchParams.get("template");
  if (template === "cart_reminder" || template === "cart_reminder_2") {
    const { subject, html } = buildAbandonedCartEmail({
      email: "kunde@example.com",
      items: [{ slug: PRODUCTS[0].slug, colorId: PRODUCTS[0].colors[0].id, qty: 1 }],
      subtotal: PRODUCTS[0].priceNok,
      currency: "NOK",
      saleEndsAt: (await saleState()).endsAt,
      step: template === "cart_reminder_2" ? 2 : 1,
    });
    return NextResponse.json({ email: { subject, html } });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase)
    return NextResponse.json(
      { error: "Database isn't configured." },
      { status: 503 },
    );

  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const { data, error } = await supabase
      .from("email_log")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ email: data });
  }

  const { data, error } = await supabase
    .from("email_log")
    .select("id,type,recipient,subject,status,error,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    // Missing table (SQL not run yet) → tell the UI instead of erroring.
    if (/email_log/.test(error.message)) {
      return NextResponse.json({ ready: false, emails: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ready: true, emails: data ?? [] });
}
