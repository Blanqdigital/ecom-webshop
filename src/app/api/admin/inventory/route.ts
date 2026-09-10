import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/supabase";
import { getInventorySnapshot, saveInventoryCount } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    return NextResponse.json({ inventory: await getInventorySnapshot() });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }
}

export async function PUT(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body)
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const inventory = await saveInventoryCount({
      key: String(body.key ?? ""),
      onHand: Number(body.onHand),
      restockDays: Number(body.restockDays),
    });
    return NextResponse.json({ inventory });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
