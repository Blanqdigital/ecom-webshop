// Telegram order notifications. Sends the shop owner an instant message with the
// full order the moment it's recorded (fired from recordOrder, same as the
// emails). No-ops until telegram_bot_token + telegram_chat_id are set (env or
// Admin → Integrations).
//
// Setup: talk to @BotFather to create a bot; message the bot once, then get
// your chat id from https://api.telegram.org/bot<TOKEN>/getUpdates.
import type { OrderEmailData } from "./email";
import { COMPANY } from "./company";
import { getProduct } from "./products";
import { getIntegration } from "./integrations";

const money = (n: number, ccy: string) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: ccy || "NOK",
    maximumFractionDigits: 0,
  }).format(n || 0);

function methodLabel(method?: string): string {
  if (method === "vipps") return "Vipps";
  if (method === "card") return "Card";
  return "—";
}

/** Escape the five HTML entities Telegram's HTML parse_mode cares about. */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function itemLines(items: OrderEmailData["items"]): string {
  const rows = (Array.isArray(items) ? items : []).map((it) => {
    const p = getProduct(it.slug ?? "");
    const c = p?.colors.find((x) => x.id === it.colorId);
    return `• ${it.qty ?? 1} × ${esc(p?.name ?? it.slug ?? "Product")} — ${esc(
      c?.name ?? it.colorId ?? "",
    )}${it.bump ? " (deal −30%)" : ""}`;
  });
  return rows.join("\n") || "•";
}

function addressBlock(a: OrderEmailData["address"]): string {
  if (!a) return "—";
  return esc(
    [
      a.line1,
      a.line2,
      [a.postal_code, a.city].filter(Boolean).join(" "),
      a.country,
    ]
      .filter(Boolean)
      .join(", "),
  );
}

export interface TelegramResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/** Send any HTML-formatted message to the shop owner's Telegram chat. */
export async function sendTelegramMessage(
  text: string,
): Promise<TelegramResult> {
  const token = (await getIntegration("telegram_bot_token")).trim();
  const chatId = (await getIntegration("telegram_chat_id")).trim();
  if (!token || !chatId) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set" };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      },
    );
    if (!res.ok) {
      const error = (await res.text().catch(() => "")).slice(0, 300);
      console.error("[telegram] send failed:", res.status, error);
      return { ok: false, status: res.status, error };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    const error = (err as Error).message;
    console.error("[telegram] error:", error);
    return { ok: false, error };
  }
}

/** Send the shop owner a Telegram notification for a new paid order. */
export async function sendTelegramOrder(
  o: OrderEmailData,
): Promise<TelegramResult> {

  const total = money(o.amountTotal ?? 0, o.currency);
  const text = [
    `🎉 <b>New order · ${esc(total)}</b>`,
    ``,
    `<b>Customer:</b> ${esc(o.name ?? "—")}`,
    `<b>Email:</b> ${esc(o.email ?? "—")}`,
    `<b>Phone:</b> ${esc(o.phone ?? "—")}`,
    `<b>Payment:</b> ${esc(methodLabel(o.method))}`,
    ``,
    `<b>Items</b>`,
    itemLines(o.items),
    ``,
    `<b>Ship to</b>`,
    addressBlock(o.address),
    ``,
    `<a href="${COMPANY.url}/admin">Open admin</a>`,
  ].join("\n");

  return sendTelegramMessage(text);
}
