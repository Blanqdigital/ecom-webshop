"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "./CartProvider";
import { FreeShippingBar } from "./FreeShippingBar";
import { fmtKr } from "@/lib/format";

export function CartPageContent() {
  const cart = useCart();

  if (cart.items.length === 0) {
    return (
      <main className="mx-auto max-w-[1100px] px-7 pb-[100px] pt-[40px]">
        <h1 className="mb-6 font-serif text-[clamp(30px,4.5vw,46px)] font-normal">
          Handlekurv
        </h1>
        <div className="flex flex-col items-center gap-4 rounded-lg border border-line bg-linen py-[70px] text-center">
          <p className="text-[16px] text-muted">Handlekurven er tom.</p>
          <Link
            href="/"
            className="rounded-full bg-ink px-8 py-[14px] text-[15px] font-semibold text-cream transition-colors hover:bg-clay"
          >
            Se Bæreslyngen
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1100px] px-7 pb-[100px] pt-[40px]">
      <h1 className="mb-8 font-serif text-[clamp(30px,4.5vw,46px)] font-normal">
        Handlekurv
      </h1>

      <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
        {/* Line items */}
        <div className="flex-1">
          {cart.items.map((i) => (
            <div
              key={`${i.slug}-${i.colorId}-${i.free ? "free" : "paid"}`}
              className="flex gap-5 border-b border-line py-6 first:border-t"
            >
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border border-line bg-white">
                {i.colorImage && (
                  <Image
                    src={i.colorImage}
                    alt={i.colorName}
                    fill
                    className="object-contain p-1.5"
                    sizes="96px"
                  />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex justify-between gap-3">
                  <div className="text-[16px] font-semibold">
                    {i.name}
                    {i.free && (
                      <span className="ml-2 rounded-full bg-clay/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-clay">
                        Gratis
                      </span>
                    )}
                  </div>
                  <div className="text-[16px] font-semibold">
                    {i.free ? "Gratis" : fmtKr(i.priceNok * i.qty)}
                  </div>
                </div>
                <div className="mt-1 text-[13.5px] text-muted">
                  Mønster: {i.colorName}
                </div>
                <div className="mt-auto flex items-center justify-between pt-4">
                  {i.free ? (
                    <span className="text-[13px] text-faint">
                      Følger med kjøpet
                    </span>
                  ) : (
                    <div className="flex items-center rounded-full border border-line">
                      <button
                        onClick={() => cart.setQty(i.slug, i.colorId, i.qty - 1)}
                        aria-label="Færre"
                        className="px-3.5 py-1.5 text-muted hover:text-ink"
                      >
                        −
                      </button>
                      <span className="min-w-7 text-center text-[15px]">
                        {i.qty}
                      </span>
                      <button
                        onClick={() => cart.setQty(i.slug, i.colorId, i.qty + 1)}
                        aria-label="Flere"
                        className="px-3.5 py-1.5 text-muted hover:text-ink"
                      >
                        +
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => cart.remove(i.slug, i.colorId, i.free)}
                    className="text-[13px] text-faint hover:text-ink"
                  >
                    Fjern
                  </button>
                </div>
              </div>
            </div>
          ))}

          <Link
            href="/"
            className="mt-6 inline-block text-[14px] font-semibold text-clay hover:underline"
          >
            ← Fortsett å handle
          </Link>
        </div>

        {/* Summary */}
        <aside className="w-full lg:w-[360px] lg:shrink-0">
          <div className="rounded-lg border border-line bg-linen p-6">
            <h2 className="mb-4 font-serif text-[22px] font-normal">
              Oppsummering
            </h2>
            <div className="mb-4">
              <FreeShippingBar subtotal={cart.subtotal} />
            </div>
            <div className="mb-2 flex items-center justify-between text-[14px] text-muted">
              <span>Delsum</span>
              <span className="text-[16px] font-semibold text-ink">
                {fmtKr(cart.subtotal)}
              </span>
            </div>
            <p className="mb-5 text-[12.5px] text-faint">
              Frakt beregnes i kassen.
            </p>
            <Link
              href="/kasse"
              className="block w-full rounded-full bg-ink py-4 text-center text-[15px] font-semibold text-cream transition-colors hover:bg-clay"
            >
              Til kassen
            </Link>
            <p className="mt-3 text-center text-[12px] text-faint">
              Trygg og kryptert betaling
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
