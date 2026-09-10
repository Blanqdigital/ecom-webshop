"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { fmtKr } from "@/lib/format";
import { getStripeBrowser } from "@/lib/stripe-browser";
import type { PostPurchaseOfferOption } from "@/lib/post-purchase";

export function PostPurchaseUpsell({
  token,
  offers,
  continueHref,
}: {
  token: string;
  offers: PostPurchaseOfferOption[];
  continueHref: string;
}) {
  const router = useRouter();
  const [selectedSlug, setSelectedSlug] = useState(offers[0]?.slug ?? "");
  const [state, setState] = useState<"offer" | "busy" | "success">("offer");
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(
    () => offers.find((offer) => offer.slug === selectedSlug) ?? offers[0],
    [offers, selectedSlug],
  );

  if (!selected) return null;

  async function accept() {
    if (state !== "offer") return;
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/post-purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, offer: selected.slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "payment_failed");
      if (data.status === "requires_action" && data.clientSecret) {
        const stripe = await getStripeBrowser();
        if (!stripe) throw new Error("stripe_unavailable");
        const result = await stripe.handleNextAction({ clientSecret: data.clientSecret });
        if (result.error || result.paymentIntent?.status !== "succeeded") {
          throw new Error(result.error?.message || "payment_failed");
        }
      }
      setState("success");
      router.replace(continueHref);
    } catch {
      setError("Vi kunne ikke bekrefte tillegget. Prøv igjen, eller gå videre til bestillingen din.");
      setState("offer");
    }
  }

  return (
    <section className="mx-auto grid w-full max-w-[1180px] lg:min-h-[calc(100dvh-73px)] lg:grid-cols-[minmax(0,0.94fr)_minmax(440px,1.06fr)]">
      <div className="relative min-h-[180px] overflow-hidden bg-[#e8ebe9] sm:min-h-[300px] lg:min-h-full">
        {selected.image ? (
          <Image
            key={selected.image}
            src={selected.image}
            alt={selected.name}
            fill
            className="object-contain p-6 mix-blend-multiply sm:p-10 lg:p-16"
            sizes="(min-width: 1024px) 48vw, 100vw"
            loading="eager"
          />
        ) : null}
      </div>

      <div className="flex flex-col justify-center px-5 py-6 sm:px-10 sm:py-10 lg:px-14 lg:py-12">
        <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-clay">
          Kun tilgjengelig nå
        </div>
        <h1 className="mt-3 max-w-[13ch] font-serif text-[clamp(34px,4vw,52px)] font-normal leading-[1.03]">
          Vil du legge til én ting til?
        </h1>
        <p className="mt-3 max-w-[48ch] text-[14px] leading-6 text-muted-2 sm:text-[15px]">
          Velg ett tilbud. Vi bruker samme kort, så du slipper å fylle det inn på nytt.
        </p>

        <fieldset className="mt-6">
          <legend className="mb-3 text-[13px] font-semibold text-muted-2">Velg tilbud</legend>
          <div className="grid gap-3" role="radiogroup">
            {offers.map((offer) => {
              const active = offer.slug === selected.slug;
              return (
                <button
                  key={offer.slug}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelectedSlug(offer.slug)}
                  disabled={state === "busy"}
                  className={`grid min-h-[104px] grid-cols-[76px_1fr] items-center gap-4 rounded-[18px] border p-3 text-left transition-[border-color,background-color,transform] active:scale-[0.99] ${
                    active ? "border-ink bg-white" : "border-line bg-white/55 hover:border-faint"
                  }`}
                >
                  <span className="relative block aspect-square overflow-hidden rounded-[12px] bg-white">
                    {offer.image ? (
                      <Image src={offer.image} alt="" fill className="object-contain p-1" sizes="76px" />
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold text-clay">
                      {offer.discountPercent} % rabatt
                    </span>
                    <span className="mt-1 block text-[15px] font-semibold leading-5">
                      {offer.name}
                    </span>
                    <span className="mt-2 flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[17px] font-semibold">{fmtKr(offer.price)}</span>
                      <span className="text-[12px] text-faint line-through">{fmtKr(offer.compareAt)}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <p className="mt-4 hidden min-h-12 text-[13px] leading-5 text-muted-2 sm:block">
          {selected.body}
        </p>

        <button
          onClick={accept}
          disabled={state === "busy"}
          className="mt-5 w-full rounded-full bg-ink px-5 py-4 text-center text-[14px] font-semibold text-cream transition-colors hover:bg-clay active:translate-y-px disabled:opacity-60 sm:mt-3"
        >
          {state === "busy" ? "Legger til …" : `Legg til · ${fmtKr(selected.price)}`}
        </button>

        <button
          onClick={() => router.replace(continueHref)}
          disabled={state === "busy"}
          className="mt-4 w-full text-center text-[13px] text-muted-2 underline decoration-line underline-offset-4"
        >
          Nei takk, vis bestillingen min
        </button>

        <p className="mt-4 text-center text-[11px] leading-4 text-faint">
          Ett klikk belaster samme kort. Ingen ny utsjekk.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-center text-[12px] leading-5 text-red-700">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
