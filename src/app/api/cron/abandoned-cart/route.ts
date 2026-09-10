import { NextResponse } from "next/server";
import { authorized, run } from "./runner";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
 if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (new URL(req.url).search) return NextResponse.json({ error: "Use admin tools for diagnostics." }, { status: 400 });
 return NextResponse.json(await run());
}
export const POST = GET;
