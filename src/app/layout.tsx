import type { Metadata } from "next";
import { Instrument_Serif, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/components/cart/CartProvider";
import { FunnelTracker } from "@/components/FunnelTracker";
import { TrackingScripts } from "@/components/TrackingScripts";
import { SITE, ogLocale } from "@/lib/site";

const grotesk = Schibsted_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

const DESCRIPTION = "Nøytral butikkmal. Tilpass produkt, merkevare og kjøpsvilkår før lansering.";
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url), title: { default: SITE.name, template: `%s | ${SITE.name}` },
  description: DESCRIPTION, robots: { index: false, follow: false },
  openGraph: { type: "website", siteName: SITE.name, locale: ogLocale(), title: SITE.name, description: DESCRIPTION },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang={SITE.language}
      className={`${grotesk.variable} ${instrument.variable}`}
    >
      <body>
        {/* Tracking runs for all visitors (no consent gate — small-shop
            decision). IDs come from the admin Settings tab via
            /api/site-config; env vars override. */}
        <FunnelTracker />
        <TrackingScripts />
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
