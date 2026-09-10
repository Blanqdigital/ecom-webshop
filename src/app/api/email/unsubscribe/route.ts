import { verifyUnsub, suppressEmail } from "@/lib/abandoned";
import { COMPANY } from "@/lib/company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe for the abandoned-checkout reminder. The link carries an
 * HMAC token of the email (see abandoned.unsubToken) so it can't be enumerated.
 * On success it flips consent off for that address, stopping further reminders.
 */
function page(title: string, msg: string): Response {
  return new Response(
    `<!doctype html><html lang="nb"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · ${COMPANY.brand}</title>
     <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:16vh auto;padding:0 24px;text-align:center;color:#2a2622">
       <div style="font-size:22px;letter-spacing:.04em;font-weight:600;margin-bottom:18px">${COMPANY.brand}</div>
       <h1 style="font-size:20px;margin:0 0 10px;font-weight:600">${title}</h1>
       <p style="font-size:15px;color:#6e675e;line-height:1.6">${msg}</p>
       <p style="margin-top:24px"><a href="${COMPANY.url}" style="color:#be7e5e">Tilbake til butikken</a></p>
     </div></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get("e") ?? "";
  const token = url.searchParams.get("t") ?? "";

  if (!verifyUnsub(email, token)) {
    return page(
      "Ugyldig lenke",
      `Avmeldingslenken er ugyldig eller utløpt. Kontakt ${COMPANY.email} om du fortsatt vil melde deg av.`,
    );
  }

  await suppressEmail(email);
  return page(
    "Du er meldt av",
    "Du vil ikke lenger få påminnelser om handlekurven din. Takk!",
  );
}

/**
 * RFC 8058 one-click unsubscribe. Mailbox providers (Gmail, Apple Mail) POST
 * here directly from their native "Unsubscribe" button — no page is rendered,
 * just a 200. Same HMAC-token check as the GET link.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get("e") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (verifyUnsub(email, token)) await suppressEmail(email);
  // Always 200: the provider only needs to know the request was accepted, and
  // we never reveal whether the token/address was valid.
  return new Response(null, { status: 200 });
}
