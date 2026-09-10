// Transactional email via Resend (https://resend.com). Plain fetch, no SDK.
// No-ops when resend_api_key is unset (env or Admin → Integrations), so the
// store runs without email until you add the key + a verified sending domain.
import { COMPANY } from "./company";
import { getProduct } from "./products";
import type { ProductColor } from "./products";
import { getSupabaseAdmin } from "./supabase";
import { unsubToken, type AbandonedItem } from "./abandoned";
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
function methodLabel(method?: string): string {
  if (method === "vipps") return "Vipps";
  if (method === "card") return "Kort";
  return "—";
}

const money = (n: number, ccy: string) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: ccy || "NOK",
    maximumFractionDigits: 0,
  }).format(n || 0);

const dateNo = (d: Date) =>
  new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

/** Absolute URL for a /public asset, so email clients can load it.
 *  WebP is swapped for JPEG: the site serves .webp, but Outlook on Windows
 *  can't render it, so email points at the .jpg twin generated alongside it. */
function emailImageUrl(path: string): string {
  if (!path) return "";
  const jpg = path.replace(/\.webp$/i, ".jpg");
  if (/^https?:\/\//i.test(jpg)) return jpg;
  return `${COMPANY.url}${jpg.startsWith("/") ? "" : "/"}${jpg}`;
}

/** Thumbnail cell for a variant, or an empty spacer when no image is known.
 *  Width/height are set as attributes AND inline styles for Outlook, which
 *  ignores CSS sizing on <img>. */
function thumbCell(c: ProductColor | undefined, alt: string): string {
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
function itemLines(items: OrderEmailData["items"]): string {
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

function addressBlock(a: OrderEmailData["address"]): string {
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

function shell(title: string, body: string): string {
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
function itemLinesText(items: OrderEmailData["items"]): string {
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

function addressText(a: OrderEmailData["address"]): string {
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
function textShell(title: string, body: string): string {
  return `${COMPANY.brand}\n\n${title}\n\n${body}\n\n—\n${COMPANY.legalName} · Org.nr ${COMPANY.orgNr} · ${COMPANY.email}`;
}
