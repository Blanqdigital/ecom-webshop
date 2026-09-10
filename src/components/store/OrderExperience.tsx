import Image from "next/image";
import Link from "next/link";
import { COMPANY } from "@/lib/company";
import {
  trackingHref,
  type OrderStatusData,
  type OrderStatusItem,
} from "@/lib/order-status";
import { getProduct } from "@/lib/products";
import { fmtKr } from "@/lib/format";

const T = {
  eyebrow: "Bestilling bekreftet",
  statusEyebrow: "Din bestilling",
  thankYou: "Takk for bestillingen",
  intro:
    "Vi har mottatt bestillingen din. Bekreftelsen er sendt på e-post, og du får sporing når pakken sendes.",
  timeline: ["Bekreftet", "Behandles", "Sendt", "Levert"],
  status: {
    new: "Vi gjør bestillingen klar",
    shipped: "Pakken er sendt",
    delivered: "Pakken er levert",
    cancelled: "Bestillingen er kansellert",
  },
  statusBody: {
    new: "Bestillingen behandles nå og pakkes vanligvis innen én virkedag.",
    shipped: "Pakken er på vei. Bruk sporingslenken for siste oppdatering.",
    delivered: "Transportøren har registrert pakken som levert.",
    cancelled: "Ta kontakt dersom dette ikke stemmer, så hjelper vi deg.",
  },
  ordered: "Bestilt",
  orderId: "Ordre-ID",
  summary: "Ordresammendrag",
  items: "Varer",
  shipping: "Frakt",
  free: "Gratis",
  total: "Totalt",
  quantity: "Antall",
  freeItem: "Gratis",
  deal: "Tilbud",
  trackingNo: "Sporingsnummer",
  carrier: "Transportør",
  track: "Spor pakken",
  permanentLink: "Se bestillingen senere",
  permanentBody: "Den sikre ordrelenken er også sendt til e-postadressen din.",
  openOrder: "Åpne ordrelenken",
  help: "Trenger du hjelp?",
  shop: "Tilbake til butikken",
  empty: "Varelinjene registreres. Oppdater siden om et øyeblikk.",
} as const;

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function shortReference(reference: string): string {
  const clean = reference.replace(/^(pi_|cs_(test_|live_)?|free-)/, "");
  return `#${clean.slice(-8).toUpperCase()}`;
}

function ItemRow({ item }: { item: OrderStatusItem }) {
  const product = getProduct(item.slug ?? "");
  const color = product?.colors.find((c) => c.id === item.colorId);
  const name = product?.name ?? item.slug ?? "Produkt";
  const variant = color?.name ?? item.colorId ?? "";

  return (
    <li className="flex gap-4 py-4 first:pt-0 last:pb-0">
      <div className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-2xl border border-line bg-cream">
        {color?.image ? (
          <Image
            src={color.image}
            alt={`${name}${variant ? `, ${variant}` : ""}`}
            width={152}
            height={152}
            className="block h-full w-full object-cover"
            sizes="76px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[22px] text-faint">
            ·
          </div>
        )}
        <span className="absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-ink px-1.5 text-[11px] font-semibold text-cream">
          {item.qty ?? 1}
        </span>
      </div>
      <div className="min-w-0 flex-1 self-center">
        <div className="text-[15px] font-semibold text-ink">{name}</div>
        {variant && <div className="mt-1 text-[13px] text-muted-2">{variant}</div>}
        {(item.free || item.bump) && (
          <div className="mt-1 text-[12px] font-semibold text-clay">
            {item.free ? T.freeItem : T.deal}
          </div>
        )}
      </div>
    </li>
  );
}

export function OrderExperience({
  order,
  variant = "status",
  statusUrl,
}: {
  order: OrderStatusData;
  variant?: "confirmation" | "status";
  statusUrl?: string | null;
}) {
  const stage =
    order.status === "delivered" ? 3 : order.status === "shipped" ? 2 : 1;
  const trackingUrl = trackingHref(order);

  return (
    <div className="min-h-[100dvh] bg-cream text-ink">
      <header className="border-b border-line/80 bg-cream">
        <div className="mx-auto flex h-[76px] w-full max-w-[1120px] items-center justify-between px-5 sm:px-8">
          <Link href="/" className="font-serif text-[30px] tracking-[0.04em]">
            {COMPANY.brand}
          </Link>
          <a
            href={`mailto:${COMPANY.email}`}
            className="text-[13px] text-muted-2 underline decoration-line underline-offset-4 hover:text-ink"
          >
            {T.help}
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] px-5 py-10 sm:px-8 sm:py-14">
        <section className="mb-9 max-w-[680px]">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-clay bg-white text-[24px] text-clay">
            ✓
          </div>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-clay">
            {variant === "confirmation" ? T.eyebrow : T.statusEyebrow}
          </div>
          <h1 className="max-w-[18ch] font-serif text-[clamp(34px,5vw,52px)] font-normal leading-[1.05]">
            {variant === "confirmation" ? T.thankYou : T.status[order.status]}
          </h1>
          <p className="mt-4 max-w-[60ch] text-[15px] leading-7 text-muted-2">
            {variant === "confirmation" ? T.intro : T.statusBody[order.status]}
          </p>
        </section>

        {order.status !== "cancelled" && (
          <section className="mb-8 rounded-[24px] border border-line bg-white px-5 py-6 sm:px-8">
            <div className="relative">
              <div className="absolute left-[12.5%] right-[12.5%] top-[14px] h-px bg-line" />
              <div
                className="absolute left-[12.5%] top-[14px] h-px bg-clay"
                style={{ width: `${(stage / 3) * 75}%` }}
              />
              <ol className="relative grid grid-cols-4">
                {T.timeline.map((label, index) => {
                  const reached = index <= stage;
                  const current = index === stage;
                  return (
                    <li key={label} className="flex min-w-0 flex-col items-center text-center">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold ${
                          reached
                            ? "border-clay bg-clay text-white"
                            : "border-line bg-white text-faint"
                        } ${current ? "ring-4 ring-clay/15" : ""}`}
                      >
                        {index < stage ? "✓" : index + 1}
                      </span>
                      <span className={`mt-3 text-[11px] sm:text-[12px] ${reached ? "font-semibold text-ink" : "text-faint"}`}>
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="space-y-6">
            <section className="rounded-[24px] border border-line bg-white p-6 sm:p-7">
              <h2 className="font-serif text-[27px] font-normal">{T.status[order.status]}</h2>
              <p className="mt-3 text-[14px] leading-6 text-muted-2">{T.statusBody[order.status]}</p>
              <dl className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-faint">{T.ordered}</dt>
                  <dd className="mt-1.5 text-[14px] font-semibold">{dateLabel(order.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-faint">{T.orderId}</dt>
                  <dd className="mt-1.5 font-mono text-[14px] font-semibold">{shortReference(order.reference)}</dd>
                </div>
              </dl>
              {(order.status === "shipped" || order.status === "delivered") &&
                order.trackingNumber && (
                <div className="mt-6 rounded-2xl bg-cream p-5">
                  <dl className="grid gap-3 text-[13px]">
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-2">{T.trackingNo}</dt>
                      <dd className="break-all font-mono font-semibold">{order.trackingNumber}</dd>
                    </div>
                    {order.trackingCompany && (
                      <div className="flex items-baseline justify-between gap-4">
                        <dt className="text-muted-2">{T.carrier}</dt>
                        <dd className="font-semibold">{order.trackingCompany}</dd>
                      </div>
                    )}
                  </dl>
                  {trackingUrl && (
                    <a
                      href={trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 block rounded-full bg-ink px-5 py-3 text-center text-[13px] font-semibold text-cream transition-colors hover:bg-clay"
                    >
                      {T.track}
                    </a>
                  )}
                </div>
              )}
            </section>

            {statusUrl && variant === "confirmation" && (
              <section className="rounded-[24px] border border-line bg-white p-6 sm:p-7">
                <h2 className="font-serif text-[24px] font-normal">{T.permanentLink}</h2>
                <p className="mt-2 text-[14px] leading-6 text-muted-2">{T.permanentBody}</p>
                <Link
                  href={statusUrl}
                  className="mt-5 inline-flex rounded-full border border-ink px-6 py-3 text-[13px] font-semibold text-ink transition-colors hover:bg-cream"
                >
                  {T.openOrder}
                </Link>
              </section>
            )}
          </div>

          <aside className="rounded-[24px] border border-line bg-white p-6 sm:p-7">
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <h2 className="font-serif text-[27px] font-normal">{T.summary}</h2>
              <span className="text-[12px] text-faint">{shortReference(order.reference)}</span>
            </div>
            {order.items.length ? (
              <ul className="divide-y divide-line">
                {order.items.map((item, index) => (
                  <ItemRow key={`${item.slug}-${item.colorId}-${index}`} item={item} />
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl bg-cream p-4 text-[13px] leading-5 text-muted-2">{T.empty}</p>
            )}
            <dl className="mt-6 space-y-3 border-t border-line pt-5 text-[14px]">
              <div className="flex items-baseline justify-between gap-4 text-muted-2">
                <dt>{T.shipping}</dt>
                <dd>{T.free}</dd>
              </div>
              {order.amountTotal != null && (
                <div className="flex items-baseline justify-between gap-4 pt-1 text-[16px] font-semibold text-ink">
                  <dt>{T.total}</dt>
                  <dd>{fmtKr(order.amountTotal)}</dd>
                </div>
              )}
            </dl>
          </aside>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/"
            className="rounded-full bg-ink px-7 py-3.5 text-[14px] font-semibold text-cream transition-colors hover:bg-clay"
          >
            {T.shop}
          </Link>
          <a
            href={`mailto:${COMPANY.email}`}
            className="text-[13px] text-muted-2 underline decoration-line underline-offset-4 hover:text-ink"
          >
            {COMPANY.email}
          </a>
        </div>
      </main>
    </div>
  );
}
