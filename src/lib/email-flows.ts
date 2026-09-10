import { COMPANY } from "./company";
import {
  type OrderEmailData,
  type SendResult,
  itemLines,
  itemLinesText,
  shell,
  textShell,
  send,
  emailCredentials,
} from "./email-shared";
import { orderStatusUrl, orderTokensConfigured } from "./order-token";

export interface ShippedEmailData {
  reference: string;
  email: string;
  name: string | null;
  items: OrderEmailData["items"];
  trackingNumber: string;
  trackingUrl?: string | null;
  trackingCompany?: string | null;
}

function trackingLink(o: ShippedEmailData): string {
  if (o.trackingUrl && /^https?:\/\//i.test(o.trackingUrl)) return o.trackingUrl;
  return `https://t.17track.net/en#nums=${encodeURIComponent(o.trackingNumber)}`;
}

/** Sent by the Shopify fulfillment webhook once tracking exists (claimed via shipped_email_sent_at). */
export async function sendShippedEmail(
  o: ShippedEmailData,
): Promise<SendResult> {
  const { key, from } = await emailCredentials();
  if (!key) return { ok: false, error: "RESEND_API_KEY not set" };
  if (!o.email) return { ok: false, error: "no recipient" };

  const firstName = o.name ? o.name.split(" ")[0] : "";
  const url = trackingLink(o);
  const carrier = o.trackingCompany?.trim() || null;
  const statusUrl = (await orderTokensConfigured())
    ? await orderStatusUrl(o.reference, COMPANY.url)
    : null;

  const subject = `Bestillingen din fra ${COMPANY.brand} er sendt 📦`;
  const title = "Pakken din er på vei!";
  const intro = `Hei ${firstName}, gode nyheter — bestillingen din har forlatt lageret og er på vei til deg.`;
  const patience =
    "Det kan ta en dag eller to før den første skanningen dukker opp hos transportøren — det er helt normalt og betyr ikke at noe er galt.";

  return send(
    key,
    {
      from,
      to: o.email,
      replyTo: COMPANY.email,
      subject,
      text: textShell(
        title,
        `${intro}\n\nSporingsnummer: ${o.trackingNumber}${
          carrier ? `\nTransportør: ${carrier}` : ""
        }\n\nSpor pakken: ${url}\n\nI denne sendingen:\n${itemLinesText(
          o.items,
        )}\n\n${patience}${
          statusUrl ? `\n\nDu kan også se statusen på bestillingen din her:\n${statusUrl}` : ""
        }\n\nSpørsmål? Bare svar på denne e-posten.`,
      ),
      html: shell(
        title,
        `<p style="font-size:14px;line-height:1.6">${intro}</p>
        <table style="font-size:14px;width:100%;background:#f7f1e8;border-radius:8px;margin:16px 0"><tbody>
          <tr><td style="color:#8a8a84;padding:12px 14px 3px">Sporingsnummer</td><td style="text-align:right;padding:12px 14px 3px;font-weight:600;font-family:ui-monospace,monospace">${o.trackingNumber}</td></tr>
          ${
            carrier
              ? `<tr><td style="color:#8a8a84;padding:3px 14px 12px">Transportør</td><td style="text-align:right;padding:3px 14px 12px">${carrier}</td></tr>`
              : `<tr><td style="padding:0 14px 12px"></td><td></td></tr>`
          }
        </tbody></table>
        <p style="margin:20px 0 0"><a href="${url}" style="display:inline-block;background:#1c1c1a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600">Spor pakken</a></p>
        <p style="font-size:13px;color:#8a8a84;margin:16px 0 4px">I denne sendingen</p>
        <table style="font-size:14px;width:100%"><tbody>${itemLines(o.items)}</tbody></table>
        <p style="font-size:13px;color:#8a8a84;line-height:1.6;margin-top:20px">${patience}</p>
        ${
          statusUrl
            ? `<p style="font-size:13px;color:#8a8a84;line-height:1.6">Du kan også se statusen på bestillingen din her:<br><a href="${statusUrl}" style="color:#8a8a84">${statusUrl}</a></p>`
            : ""
        }
        <p style="font-size:13px;color:#8a8a84;margin-top:16px">Spørsmål? Bare svar på denne e-posten.</p>`,
      ),
    },
    "order_shipped",
  );
}

/** First post-purchase welcome email (nb). Idempotency via email_log type welcome_1. */
export async function sendWelcomeEmail(o: {
  email: string;
  name?: string | null;
}): Promise<SendResult> {
  const { key, from } = await emailCredentials();
  if (!key) return { ok: false, error: "Email isn't configured." };

  const firstName = o.name?.trim().split(/\s+/)[0] || "";
  const subject = `Velkommen til ${COMPANY.brand} 🧡`;
  const title = `Velkommen til ${COMPANY.brand}`;
  const hello = `Hei${firstName ? ` ${firstName}` : ""},`;
  const intro = `Så hyggelig at du har handlet hos ${COMPANY.brand}. Mens du venter på pakken, er du alltid velkommen til å svare på denne e-posten om du har spørsmål.`;
  const shopUrl = COMPANY.url;

  return send(
    key,
    {
      from,
      to: o.email,
      replyTo: COMPANY.email,
      subject,
      text: textShell(
        title,
        `${hello}\n\n${intro}\n\nBesøk butikken: ${shopUrl}`,
      ),
      html: shell(
        title,
        `<p style="font-size:14px;line-height:1.65">${hello}</p>
        <p style="font-size:14px;line-height:1.65">${intro}</p>
        <p style="margin:22px 0"><a href="${shopUrl}" style="display:inline-block;background:#1c1c1a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600">Til butikken</a></p>`,
      ),
    },
    "welcome_1",
  );
}
