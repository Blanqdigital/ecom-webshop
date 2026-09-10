import { OrderStatusView } from "@/components/store/OrderStatusView";

export const metadata = {
  title: "Din bestilling",
  robots: { index: false, follow: false },
};

export default async function OrdreStatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <OrderStatusView token={token} />;
}
