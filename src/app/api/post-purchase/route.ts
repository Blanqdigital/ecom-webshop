import { NextResponse } from "next/server";
import { chargePostPurchaseOffer } from "@/lib/post-purchase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const offer = typeof body?.offer === "string" ? body.offer : "";
  if (!token) {
    return NextResponse.json({ error: "Mangler tilbudstoken." }, { status: 400 });
  }
  try {
    return NextResponse.json(await chargePostPurchaseOffer(token, offer));
  } catch (error) {
    const code = error instanceof Error ? error.message : "payment_failed";
    const status = code === "invalid_offer" || code === "offer_unavailable" ? 409 : 402;
    return NextResponse.json({ error: code }, { status });
  }
}
