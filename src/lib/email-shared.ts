// Transactional email via Resend (https://resend.com). Plain fetch, no SDK.
// No-ops when resend_api_key is unset (env or Admin → Integrations), so the
// store runs without email until you add the key + a verified sending domain.
import { COMPANY } from "./company";
import { getProduct } from "./products";
import type { ProductColor } from "./products";
import { getSupabaseAdmin } from "./supabase";
import { getIntegration } from "./integrations";

export interface OrderEmailData {
  id: string;
  email: string | null;
  name: string | null;
  amountTotal: number | null;
  currency: string;
  items: { slug?: string; colorId?: string; qty?: number; bump?: boolean }[] | null;
  address: {
    line1?: string | null;
    line2?: string | null;
    postal_code?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  } | null;
  phone: string | null;
  /** "card" | "vipps" — shown in the admin alert. */
  method?: string;
}

/** Human label for the payment method used. */
export function methodLabel(method?: string): string {
  if (method === "vipps") return "Vipps";
  if (method === "card") return "Kort";
  return "—";
}

export const money = (n: number, ccy: string) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: ccy || "NOK",
    maximumFractionDigits: 0,
  }).format(n || 0);

export const dateNo = (d: Date) =>
  new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

/** Absolute URL for a /public asset, so email clients can load it.
 *  WebP is swapped for JPEG: the site serves .webp, but Outlook on Windows
 *  can't render it, so email points at the .jpg twin generated alongside it. */
export function emailImageUrl(path: string): string {
  if (!path) return "";
  const jpg = path.replace(/\.webp$/i, ".jpg");
  if (/^https?:\/\//i.test(jpg)) return jpg;
  return `${COMPANY.url}${jpg.startsWith("/") ? "" : "/"}${jpg}`;
}

/** Thumbnail cell for a variant, or an empty spacer when no image is known.
 *  Width/height are set as attributes AND inline styles for Outlook, which
 *  ignores CSS sizing on <img>. */
export function thumbCell(c: ProductColor | undefined, alt: string): string {
  if (!c?.image) {
    return `<td width="56" style="width:56px"></td>`;
  }
  return `<td width="56" style="width:56px;vertical-align:top">
    <img src="${emailImageUrl(c.image)}" width="56" height="56" alt="${alt}"
      style="width:56px;height:56px;object-fit:cover;border-radius:8px;display:block;border:1px solid #eee" />
  </td>`;
}

/** Order/cart line items as table rows, each with the variant thumbnail.
 *  Rows are dropped into a `<table><tbody>…</tbody></table>` by the caller. */
export function itemLines(items: OrderEmailData["items"]): string {
  const rows = (Array.isArray(items) ? items : []).map((it) => {
    const p = getProduct(it.slug ?? "");
    const c = p?.colors.find((x) => x.id === it.colorId);
    const name = p?.name ?? it.slug ?? "Produkt";
    const variant = c?.name ?? it.colorId ?? "";
    return `<tr>
      ${thumbCell(c, `${name} — ${variant}`)}
      <td style="padding:8px 0 8px 12px;vertical-align:top">
        <div style="font-weight:600">${name}</div>
        <div style="color:#8a8a84;font-size:13px">${variant}${
          it.bump ? " · tilbud −30%" : ""
        }</div>
      </td>
      <td style="padding:8px 0;text-align:right;vertical-align:top;white-space:nowrap;color:#8a8a84">× ${
        it.qty ?? 1
      }</td>
    </tr>`;
  });
  return rows.join("") || `<tr><td style="padding:8px 0">—</td></tr>`;
}

export function addressBlock(a: OrderEmailData["address"]): string {
  if (!a) return "—";
  return [
    a.line1,
    a.line2,
    [a.postal_code, a.city].filter(Boolean).join(" "),
    a.country,
  ]
    .filter(Boolean)
    .join("<br>");
}

export function shell(title: string, body: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1c1c1a">
    <div style="font-size:22px;letter-spacing:.04em;font-weight:600;padding:8px 0 16px">${COMPANY.brand}</div>
    <h1 style="font-size:19px;margin:0 0 16px">${title}</h1>
    ${body}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:12px;color:#8a8a84">${COMPANY.legalName} · Org.nr ${COMPANY.orgNr} · ${COMPANY.email}</p>
  </div>`;
}

// --- Plain-text alternatives -------------------------------------------------
// Every email ships a hand-written text/plain part alongside the HTML. Letting
// Resend auto-derive it from the HTML tables produced run-on garbage, which
// spam filters penalise; a clean text part improves inbox placement.

/** Line items as plain text, one per line: "1 × Bæreslyngen — Sort". */
export function itemLinesText(items: OrderEmailData["items"]): string {
  const rows = (Array.isArray(items) ? items : []).map((it) => {
    const p = getProduct(it.slug ?? "");
    const c = p?.colors.find((x) => x.id === it.colorId);
    const name = p?.name ?? it.slug ?? "Produkt";
    const variant = c?.name ?? it.colorId ?? "";
    return `${it.qty ?? 1} × ${name}${variant ? ` — ${variant}` : ""}${
      it.bump ? " (tilbud −30%)" : ""
    }`;
  });
  return rows.join("\n") || "—";
}

export function addressText(a: OrderEmailData["address"]): string {
  if (!a) return "—";
  return [
    a.line1,
    a.line2,
    [a.postal_code, a.city].filter(Boolean).join(" "),
    a.country,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Wrap a plain-text body with the same brand header + legal footer as shell(). */
export function textShell(title: string, body: string): string {
  return `${COMPANY.brand}\n\n${title}\n\n${body}\n\n—\n${COMPANY.legalName} · Org.nr ${COMPANY.orgNr} · ${COMPANY.email}`;
}

export interface SendResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/** Email categories recorded in the admin's Marketing log. */
export type EmailType =
  | "order_confirmation"
  | "order_admin"
  | "cart_reminder"
  | "cart_reminder_2";

/** Record every outbound email in email_log for the admin Marketing tab.
 *  Best-effort: a missing table or DB hiccup must never block sending. */
export async function logEmail(
  type: EmailType,
  p: { to: string; subject: string; html: string },
  r: SendResult,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return;
    await supabase.from("email_log").insert({
      type,
      recipient: p.to,
      subject: p.subject,
      html: p.html,
      status: r.ok ? "sent" : "failed",
      error: r.error ?? null,
    });
  } catch {
    /* never interfere with delivery */
  }
}

export async function send(
  key: string,
  payload: {
    from: string;
    to: string;
    subject: string;
    html: string;
    /** Plain-text alternative — always set, for deliverability. */
    text?: string;
    /** Where replies should go (we send from ordre@, replies want hei@). */
    replyTo?: string;
    /** Extra SMTP headers, e.g. List-Unsubscribe on marketing mail. */
    headers?: Record<string, string>;
  },
  type: EmailType,
): Promise<SendResult> {
  let result: SendResult;
  try {
    // Resend uses snake_case for reply_to; map our camelCase payload to it.
    const { replyTo, ...rest } = payload;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(replyTo ? { ...rest, reply_to: replyTo } : rest),
    });
    if (!res.ok) {
      const error = (await res.text()).slice(0, 300);
      console.error("[email] resend failed:", res.status, error);
      result = { ok: false, status: res.status, error };
    } else {
      result = { ok: true, status: res.status };
    }
  } catch (err) {
    const error = (err as Error).message;
    console.error("[email] resend error:", error);
    result = { ok: false, error };
  }
  await logEmail(type, payload, result);
  return result;
}

export async function emailCredentials(): Promise<{
  key: string;
  from: string;
  notifyTo: string;
}> {
  const key = (await getIntegration("resend_api_key")).trim();
  const from =
    (await getIntegration("order_from")).trim() ||
    `${COMPANY.brand} <onboarding@resend.dev>`;
  const notifyTo =
    (await getIntegration("order_notify_to")).trim() || COMPANY.email;
  return { key, from, notifyTo };
}
