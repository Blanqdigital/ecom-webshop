import { getSupabaseAdmin } from "./supabase";
import { readOrderToken } from "./order-token";

export interface OrderStatusItem {
  slug?: string;
  colorId?: string;
  qty?: number;
  bump?: boolean;
  free?: boolean;
}

export interface OrderStatusData {
  reference: string;
  createdAt: string;
  status: "new" | "shipped" | "delivered" | "cancelled";
  items: OrderStatusItem[];
  amountTotal: number | null;
  currency: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  trackingCompany: string | null;
}

export function trackingHref(v: {
  trackingNumber: string | null;
  trackingUrl: string | null;
}): string | null {
  if (!v.trackingNumber) return null;
  if (v.trackingUrl && /^https?:\/\//i.test(v.trackingUrl)) return v.trackingUrl;
  return `https://t.17track.net/en#nums=${encodeURIComponent(v.trackingNumber)}`;
}

export async function getOrderStatus(
  token: string,
): Promise<OrderStatusData | null> {
  const reference = readOrderToken(token);
  if (!reference) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("orders")
    .select(
      "stripe_session_id,created_at,fulfillment_status,items,amount_total,currency,tracking_number,tracking_url,tracking_company",
    )
    .eq("stripe_session_id", reference)
    .maybeSingle();
  if (error || !data) return null;

  const status = data.fulfillment_status as string | null;
  return {
    reference: data.stripe_session_id,
    createdAt: data.created_at,
    status:
      status === "shipped" || status === "delivered" || status === "cancelled"
        ? status
        : "new",
    items: Array.isArray(data.items) ? (data.items as OrderStatusItem[]) : [],
    amountTotal: data.amount_total == null ? null : Number(data.amount_total),
    currency: (data.currency ?? "NOK").toUpperCase(),
    trackingNumber: data.tracking_number ?? null,
    trackingUrl: data.tracking_url ?? null,
    trackingCompany: data.tracking_company ?? null,
  };
}
