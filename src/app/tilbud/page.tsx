import { PostPurchaseOfferView } from "@/components/store/PostPurchaseOfferView";

export const metadata = {
  title: "Et tilbud til bestillingen din",
  robots: { index: false, follow: false },
};

export default async function OfferPage({
  searchParams,
}: {
  searchParams: Promise<{ payment_intent?: string }>;
}) {
  const { payment_intent } = await searchParams;
  return <PostPurchaseOfferView paymentIntent={payment_intent} />;
}
