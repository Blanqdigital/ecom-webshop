// Sale window. When sale_ends_at (env SALE_ENDS_AT or Admin → Integrations) is
// set, the sale is only "live" before that instant — used to gate the
// abandoned-checkout reminder (never nudge with a dead offer) and to show the
// deadline in the email. Unset (or unparseable) = the sale is always live.
import { getIntegration } from "@/lib/integrations";

export interface SaleState {
  live: boolean;
  endsAt: Date | null;
}

export async function saleState(now: Date = new Date()): Promise<SaleState> {
  const raw = (await getIntegration("sale_ends_at")).trim();
  if (!raw) return { live: true, endsAt: null };
  const endsAt = new Date(raw);
  if (Number.isNaN(endsAt.getTime())) return { live: true, endsAt: null };
  return { live: now.getTime() < endsAt.getTime(), endsAt };
}

export async function saleIsLive(now?: Date): Promise<boolean> {
  return (await saleState(now)).live;
}
