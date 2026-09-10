import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/supabase";
import {
  FLOW_TIMING_FIELDS,
  getFlowTimings,
  sanitizeFlowTimings,
  saveFlowTimings,
} from "@/lib/flow-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ timings: await getFlowTimings() });
}

export async function PUT(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const current = await getFlowTimings();
  const next = sanitizeFlowTimings({ ...current, ...body });
  for (const field of FLOW_TIMING_FIELDS) {
    if (!(field in body)) continue;
    const submitted = Number(body[field]);
    if (!Number.isInteger(submitted) || submitted !== next[field]) {
      return NextResponse.json(
        { error: "Choose a delay between 5 minutes and 90 days." },
        { status: 400 },
      );
    }
  }

  const result = await saveFlowTimings(next);
  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ timings: next });
}
