import {
  dueAbandonedCarts,
  dueSecondReminders,
  markReminderSent,
  markReminder2Sent,
} from "@/lib/abandoned";
import { sendAbandonedCartEmail } from "@/lib/email";
import { getSupabaseAdmin } from "@/lib/supabase";
import { saleState } from "@/lib/sale";

/**
 * Abandoned-cart cron helpers. Kept separate so the route file can await
 * async integrations (saleState / getStripe / shopifyConfigured) cleanly.
 */
export function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false; // fail closed until configured
  const auth = req.headers.get("authorization") ?? "";
  const bearer = /^bearer /i.test(auth) ? auth.slice(7).trim() : "";
  const key = new URL(req.url).searchParams.get("key") ?? "";
  return bearer === secret || key === secret;
}

export async function run() {
  const { live, endsAt } = await saleState();
  if (!live) return { skipped: "sale ended", due: 0, sent: 0 };

  const due = await dueAbandonedCarts(30, 100);
  let sent = 0;
  for (const c of due) {
    if (!c.consent) {
      await markReminderSent(c.id);
      continue;
    }
    const res = await sendAbandonedCartEmail({
      email: c.email,
      items: c.items,
      subtotal: c.subtotal,
      currency: c.currency ?? "NOK",
      saleEndsAt: endsAt,
      step: 1,
    });
    if (res.ok) {
      await markReminderSent(c.id);
      sent++;
    }
  }

  const due2 = await dueSecondReminders(24, 100);
  let sent2 = 0;
  for (const c of due2) {
    if (!c.consent) {
      await markReminder2Sent(c.id);
      continue;
    }
    const res = await sendAbandonedCartEmail({
      email: c.email,
      items: c.items,
      subtotal: c.subtotal,
      currency: c.currency ?? "NOK",
      saleEndsAt: endsAt,
      step: 2,
    });
    if (res.ok) {
      await markReminder2Sent(c.id);
      sent2++;
    }
  }

  return { due: due.length, sent, due2: due2.length, sent2 };
}

export async function sweep(dry: boolean) {
  const { live, endsAt } = await saleState();
  if (!live) return { skipped: "sale ended", audience: 0, sent: 0 };

  const supabase = getSupabaseAdmin();
  if (!supabase) return { error: "Database isn't configured." };

  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: carts, error } = await supabase
    .from("abandoned_carts")
    .select("*")
    .is("converted_at", null)
    .eq("consent", true)
    .lte("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(500);
  if (error) return { error: error.message };

  const { data: orderRows } = await supabase
    .from("orders")
    .select("email,payment_status")
    .limit(10000);
  const buyers = new Set(
    (orderRows ?? [])
      .filter((o) => (o.payment_status ?? "").toLowerCase() === "paid")
      .map((o) => (o.email ?? "").trim().toLowerCase())
      .filter(Boolean),
  );

  const audience = (carts ?? []).filter(
    (c) => !buyers.has(c.email.trim().toLowerCase()),
  );

  if (dry) {
    return {
      dry: true,
      audience: audience.length,
      recipients: audience.map((c) => ({
        email: c.email,
        items: Array.isArray(c.items) ? c.items.length : 0,
        subtotal: c.subtotal,
        captured: c.created_at,
        remindedBefore: !!c.reminder_sent_at,
      })),
    };
  }

  let sent = 0;
  const failed: string[] = [];
  for (const c of audience) {
    const res = await sendAbandonedCartEmail({
      email: c.email,
      items: c.items,
      subtotal: c.subtotal,
      currency: c.currency ?? "NOK",
      saleEndsAt: endsAt,
    });
    if (res.ok) {
      await markReminderSent(c.id);
      sent++;
    } else {
      failed.push(c.email);
    }
  }
  return { audience: audience.length, sent, failed };
}

export async function testSend(email: string) {
  const { endsAt } = await saleState();
  const res = await sendAbandonedCartEmail({
    email,
    items: [{ slug: "baereslyngen", colorId: "aztec", qty: 1 }],
    subtotal: 590,
    currency: "NOK",
    saleEndsAt: endsAt,
  });
  return { test: email, ...res };
}
