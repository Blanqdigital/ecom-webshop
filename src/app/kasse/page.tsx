import { COMPANY, companyOrgNr } from "@/lib/company";
import { SITE } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutPage } from "@/components/checkout/CheckoutPage";

export const metadata: Metadata = {
  title: "Kasse",
  robots: { index: false, follow: false },
};

export default function Kasse() {
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      {/* Minimal, distraction-free checkout header */}
      <header className="border-b border-line bg-cream">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between px-5 py-5 sm:px-7">
          <Link
            href="/"
            className="font-serif text-[26px] tracking-[0.04em] text-ink"
          >
            {SITE.name}
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            Sikker betaling
          </span>
        </div>
      </header>

      <div className="flex-1">
        <CheckoutPage />
      </div>

      {/* Minimal footer — trust + legal, no nav distractions */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1080px] flex-col items-center justify-between gap-3 px-5 py-6 text-[12.5px] text-muted sm:flex-row sm:px-7">
          <span>© {COMPANY.legalName} · Org.nr {companyOrgNr()}</span>
          <div className="flex gap-5">
            <Link href="/personvern" className="hover:text-ink">
              Personvern
            </Link>
            <Link href="/salgsvilkar" className="hover:text-ink">
              Salgsvilkår
            </Link>
            <Link href="/frakt" className="hover:text-ink">
              Frakt og retur
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
