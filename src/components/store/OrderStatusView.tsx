import Link from "next/link";
import { COMPANY } from "@/lib/company";
import { getOrderStatus } from "@/lib/order-status";
import { OrderExperience } from "@/components/store/OrderExperience";

export async function OrderStatusView({ token }: { token: string }) {
  const order = await getOrderStatus(token);
  if (order) return <OrderExperience order={order} />;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center bg-cream px-5 py-16 text-center text-ink">
      <Link href="/" className="mb-10 font-serif text-[34px] tracking-[0.04em]">
        {COMPANY.brand}
      </Link>
      <div className="w-full max-w-[520px] rounded-[24px] border border-line bg-white p-7 sm:p-9">
        <h1 className="font-serif text-[30px] font-normal">Fant ikke bestillingen</h1>
        <p className="mt-4 text-[14px] leading-6 text-muted-2">
          Lenken er ugyldig. Åpne den sikre lenken i ordrebekreftelsen på e-post, eller kontakt oss så hjelper vi deg.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex rounded-full bg-ink px-6 py-3 text-[14px] font-semibold text-cream"
        >
          Tilbake til butikken
        </Link>
      </div>
      <a
        href={`mailto:${COMPANY.email}`}
        className="mt-8 text-[13px] text-clay underline underline-offset-4"
      >
        {COMPANY.email}
      </a>
    </div>
  );
}
