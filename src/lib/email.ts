import { COMPANY } from "./company";
import { unsubToken, type AbandonedItem } from "./abandoned";
import { orderStatusUrl, orderTokensConfigured } from "./order-token";
import {
  type OrderEmailData,
  type SendResult,
  money,
  dateNo,
  methodLabel,
  itemLines,
  itemLinesText,
  addressBlock,
  addressText,
  shell,
  textShell,
  send,
  emailCredentials,
} from "./email-shared";

export type { OrderEmailData, SendResult, EmailType } from "./email-shared";
export { sendShippedEmail, sendWelcomeEmail } from "./email-flows";

/** Send the admin new-order alert and the customer confirmation (best-effort). */
export async function sendOrderEmails(o: OrderEmailData): Promise<void> {
  const { key, from, notifyTo } = await emailCredentials();
  if (!key) return;

  const total = money(o.amountTotal ?? 0, o.currency);
  const items = itemLines(o.items);
  const itemsText = itemLinesText(o.items);
  const replyTo = COMPANY.email;

  await send(key, {
    from,
    to: notifyTo,
    replyTo,
    subject: `Ny ordre · ${total}${o.name ? ` · ${o.name}` : ""}`,
    text: textShell(
      "Ny ordre 🎉",
      `Kunde: ${o.name ?? "—"}\nE-post: ${o.email ?? "—"}\nTelefon: ${
        o.phone ?? "—"
      }\nBetaling: ${methodLabel(o.method)}\nBeløp: ${total}\n\nVarer:\n${itemsText}\n\nLeveringsadresse:\n${addressText(
        o.address,
      )}\n\nÅpne admin: ${COMPANY.url}/admin`,
    ),
    html: shell(
      "Ny ordre 🎉",
      `<table style="font-size:14px;width:100%"><tbody>
        <tr><td style="color:#8a8a84;padding:3px 0">Kunde</td><td style="text-align:right">${o.name ?? "—"}</td></tr>
        <tr><td style="color:#8a8a84;padding:3px 0">E-post</td><td style="text-align:right">${o.email ?? "—"}</td></tr>
        <tr><td style="color:#8a8a84;padding:3px 0">Telefon</td><td style="text-align:right">${o.phone ?? "—"}</td></tr>
        <tr><td style="color:#8a8a84;padding:3px 0">Betaling</td><td style="text-align:right">${methodLabel(o.method)}</td></tr>
        <tr><td style="color:#8a8a84;padding:3px 0">Beløp</td><td style="text-align:right;font-weight:600">${total}</td></tr>
      </tbody></table>
      <p style="font-size:13px;color:#8a8a84;margin:16px 0 4px">Varer</p>
      <table style="font-size:14px;width:100%"><tbody>${items}</tbody></table>
      <p style="font-size:13px;color:#8a8a84;margin:16px 0 4px">Leveringsadresse</p>
      <p style="font-size:14px;margin:0">${addressBlock(o.address)}</p>
      <p style="margin:20px 0 0"><a href="${COMPANY.url}/admin" style="display:inline-block;background:#1c1c1a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Åpne admin</a></p>`,
    ),
  }, "order_admin");

  if (o.email) {
    const firstName = o.name ? o.name.split(" ")[0] : "";
    const statusUrl = (await orderTokensConfigured())
      ? await orderStatusUrl(o.id, COMPANY.url)
      : null;
    const statusText = statusUrl
      ? `\n\nFølg bestillingen: ${statusUrl}`
      : "";
    const statusHtml = statusUrl
      ? `<p style="margin:20px 0 0"><a href="${statusUrl}" style="display:inline-block;background:#1c1c1a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Følg bestillingen</a></p>`
      : "";
    await send(key, {
      from,
      to: o.email,
      replyTo,
      subject: `Takk for bestillingen din hos ${COMPANY.brand}`,
      text: textShell(
        "Takk for bestillingen!",
        `Hei ${firstName}, vi har mottatt bestillingen din og pakker den snart. Du får sporing på e-post når den sendes.\n\nDin bestilling:\n${itemsText}\n\nFrakt: Gratis\nTotalt: ${total}${statusText}\n\nSpørsmål? Svar på denne e-posten eller kontakt ${COMPANY.email}.`,
      ),
      html: shell(
        "Takk for bestillingen!",
        `<p style="font-size:14px;line-height:1.6">Hei ${
          o.name ? o.name.split(" ")[0] : ""
        }, vi har mottatt bestillingen din og pakker den snart. Du får sporing på e-post når den sendes.</p>
        <p style="font-size:13px;color:#8a8a84;margin:16px 0 4px">Din bestilling</p>
        <table style="font-size:14px;width:100%"><tbody>${items}</tbody></table>
        <table style="font-size:14px;width:100%;margin-top:8px"><tbody>
          <tr><td style="color:#8a8a84;padding:3px 0">Frakt</td><td style="text-align:right">Gratis</td></tr>
          <tr><td style="padding:3px 0;font-weight:600">Totalt</td><td style="text-align:right;font-weight:600">${total}</td></tr>
        </tbody></table>
        ${statusHtml}
        <p style="font-size:13px;color:#8a8a84;margin-top:20px">Spørsmål? Svar på denne e-posten eller kontakt ${COMPANY.email}.</p>`,
      ),
    }, "order_confirmation");
  }
}

export interface AbandonedEmailData {
  email: string;
  items: AbandonedItem[] | null;
  subtotal: number | null;
  currency: string;
  saleEndsAt: Date | null;
  step?: 1 | 2;
}

export function buildAbandonedCartEmail(o: AbandonedEmailData): {
  subject: string;
  title: string;
  html: string;
  text: string;
  unsubUrl: string;
} {
  const step = o.step === 2 ? 2 : 1;
  const items = itemLines(o.items);
  const total = money(o.subtotal ?? 0, o.currency);
  const checkoutUrl = `${COMPANY.url}/kasse`;
  const unsubUrl = `${COMPANY.url}/api/email/unsubscribe?e=${encodeURIComponent(
    o.email,
  )}&t=${unsubToken(o.email)}`;

  const urgencyText = o.saleEndsAt
    ? `🔥 Sommersalget varer bare til ${dateNo(
        o.saleEndsAt,
      )}. Fullfør nå for å sikre deg tilbudsprisen.`
    : `Slyngene våre selges raskt — sikre din før favorittmønsteret blir utsolgt.`;
  const urgency = `<p style="font-size:14px;line-height:1.6;background:#f7f1e8;border-radius:8px;padding:12px 14px;margin:16px 0">${
    o.saleEndsAt
      ? urgencyText.replace(
          dateNo(o.saleEndsAt),
          `<strong>${dateNo(o.saleEndsAt)}</strong>`,
        )
      : urgencyText
  }</p>`;

  const subject =
    step === 2
      ? `Tilbudet ditt står fortsatt hos ${COMPANY.brand} 🧡`
      : `Du glemte noe hos ${COMPANY.brand} 🧡`;
  const title =
    step === 2 ? "Tilbudet ditt står fortsatt" : "Handlekurven venter på deg";
  const intro =
    step === 2
      ? "Hei! Vi holder fortsatt av handlekurven din, og prisene og fri frakt gjelder fortsatt. Dette er den siste påminnelsen fra oss — etterpå lar vi deg være i fred."
      : "Hei! Vi tok vare på handlekurven din. Den ligger klar – fullfør bestillingen når det passer deg.";
  const footer =
    step === 2
      ? "Dette er den siste e-posten fra oss om denne handlekurven."
      : "";

  const text = textShell(
    title,
    `${intro.replace(/<[^>]+>/g, "")}\n\nI handlekurven din:\n${itemLinesText(
      o.items,
    )}\n\nFrakt: Gratis\nSum: ${total}\n\n${urgencyText}\n\nFullfør bestillingen: ${checkoutUrl}\n${
      footer ? `\n${footer}\n` : ""
    }\nDu får denne e-posten fordi du la igjen e-postadressen din i kassen hos ${COMPANY.brand}. Meld deg av: ${unsubUrl}`,
  );

  const html = shell(
    title,
    `<p style="font-size:14px;line-height:1.6">${intro}</p>
    <p style="font-size:13px;color:#8a8a84;margin:16px 0 4px">I handlekurven din</p>
    <table style="font-size:14px;width:100%"><tbody>${items}</tbody></table>
    <table style="font-size:14px;width:100%;margin-top:8px"><tbody>
      <tr><td style="color:#8a8a84;padding:3px 0">Frakt</td><td style="text-align:right">Gratis</td></tr>
      <tr><td style="padding:3px 0;font-weight:600">Sum</td><td style="text-align:right;font-weight:600">${total}</td></tr>
    </tbody></table>
    ${urgency}
    <p style="margin:22px 0 0"><a href="${checkoutUrl}" style="display:inline-block;background:#1c1c1a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600">Fullfør bestillingen</a></p>
    ${
      footer
        ? `<p style="font-size:12px;color:#8a8a84;margin-top:20px">${footer}</p>`
        : ""
    }
    <p style="font-size:11px;color:#8a8a84;margin-top:${footer ? "8" : "24"}px">Du får denne e-posten fordi du la igjen e-postadressen din i kassen hos ${COMPANY.brand}. Vil du ikke ha flere påminnelser? <a href="${unsubUrl}" style="color:#8a8a84">Meld deg av her</a>.</p>`,
  );

  return { subject, title, html, text, unsubUrl };
}

export async function sendAbandonedCartEmail(
  o: AbandonedEmailData,
): Promise<SendResult> {
  const { key, from } = await emailCredentials();
  if (!key) return { ok: false, error: "RESEND_API_KEY not set" };
  if (!o.email) return { ok: false, error: "no recipient" };

  const { subject, html, text, unsubUrl } = buildAbandonedCartEmail(o);

  return send(key, {
    from,
    to: o.email,
    subject,
    replyTo: COMPANY.email,
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    text,
    html,
  }, o.step === 2 ? "cart_reminder_2" : "cart_reminder");
}
