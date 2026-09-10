import "server-only";

import { sendWelcomeEmail } from "./email";
import { getFlowTimings } from "./flow-settings";
import { getSupabaseAdmin } from "./supabase";

/** Only orders placed after this timestamp enter the welcome flow. */
export const WELCOME_FLOW_PUBLISHED_AT = "2026-09-10T00:00:00.000Z";

interface WelcomeOrder {
  email: string | null;
  customer_name: string | null;
  locale: string | null;
}

export async function runWelcomeFlow() {
  const supabase = getSupabaseAdmin();
  if (!supabase)
    return { ready: false, due: 0, sent: 0, error: "Database isn't configured." };

  const { welcomeFirstMinutes } = await getFlowTimings();
  const dueBefore = new Date(
    Date.now() - welcomeFirstMinutes * 60_000,
  ).toISOString();

  const { data, error } = await supabase
    .from("orders")
    .select("email,customer_name,locale")
    .eq("payment_status", "paid")
    .not("email", "is", null)
    .gte("created_at", WELCOME_FLOW_PUBLISHED_AT)
    .lte("created_at", dueBefore)
    .order("created_at", { ascending: true })
    .limit(250);
  if (error) return { ready: false, due: 0, sent: 0, error: error.message };

  const customers = new Map<string, WelcomeOrder>();
  for (const order of (data ?? []) as WelcomeOrder[]) {
    const email = order.email?.trim().toLowerCase();
    if (email && !customers.has(email)) customers.set(email, order);
  }

  const { data: prior, error: priorError } = await supabase
    .from("email_log")
    .select("recipient")
    .eq("type", "welcome_1")
    .eq("status", "sent")
    .gte("created_at", WELCOME_FLOW_PUBLISHED_AT)
    .limit(10000);
  if (priorError)
    return { ready: false, due: customers.size, sent: 0, error: priorError.message };

  const alreadySent = new Set(
    (prior ?? []).map((row) => String(row.recipient).trim().toLowerCase()),
  );
  const due = [...customers.entries()].filter(([email]) => !alreadySent.has(email));
  let sent = 0;
  const failed: string[] = [];

  for (const [email, order] of due) {
    const result = await sendWelcomeEmail({
      email,
      name: order.customer_name,
    });
    if (result.ok) sent++;
    else failed.push(email);
  }

  return { ready: true, due: due.length, sent, failed };
}
