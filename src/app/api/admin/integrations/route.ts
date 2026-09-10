import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/supabase";
import {
  INTEGRATION_KEYS,
  getIntegrationStatus,
  saveIntegrations,
  type IntegrationKey,
} from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current integration settings (secrets masked; never full secret values). */
export async function GET(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ integrations: await getIntegrationStatus() });
}

/**
 * Save pasted secrets/config. Body: partial map of integration keys → string.
 * Omit unchanged secrets. Empty string clears a key. Env-overridden keys ignored.
 */
export async function PUT(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const updates: Partial<Record<IntegrationKey, string>> = {};
  for (const key of INTEGRATION_KEYS) {
    if (typeof body[key] === "string") updates[key] = body[key] as string;
  }

  const res = await saveIntegrations(updates);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({
    ok: true,
    integrations: await getIntegrationStatus(),
  });
}
