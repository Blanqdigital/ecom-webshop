import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/supabase";
import { getIntegration } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Microsoft Clarity "Data Export" live-insights endpoint. Returns aggregated
// metrics for the last 1–3 days. Auth is a project-scoped Bearer token
// (env CLARITY_API_TOKEN or Admin → Integrations).
const CLARITY_API =
  "https://www.clarity.ms/export-data/api/v1/project-live-insights";

// Clarity rate-limits this API to 10 requests/day PER PROJECT. Admin refreshes
// (and multiple admins) would blow through that fast, so we serve a cached copy
// for a while. Module scope means it survives across requests on a warm server
// instance — best-effort on serverless, but it meaningfully cuts calls.
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const cache = new Map<number, { at: number; payload: unknown }>();

type ClarityMetric = {
  metricName?: string;
  information?: Array<Record<string, unknown>>;
};

/** Parse Clarity's stringy numbers ("1234", "66.35") into a number or null. */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Sum a field across a metric's `information` rows (nulls skipped). */
function sumField(rows: Array<Record<string, unknown>> | undefined, key: string) {
  if (!rows?.length) return null;
  let total = 0;
  let seen = false;
  for (const row of rows) {
    const n = num(row[key]);
    if (n !== null) {
      total += n;
      seen = true;
    }
  }
  return seen ? total : null;
}

// Behavioural / frustration signals. Keys are Clarity metric names; each row
// carries a `sessionsCount`. Labels are what we render in the admin.
const SIGNALS: { metric: string; key: string; label: string }[] = [
  { metric: "DeadClickCount", key: "deadClicks", label: "Dead clicks" },
  { metric: "RageClickCount", key: "rageClicks", label: "Rage clicks" },
  { metric: "ExcessiveScroll", key: "excessiveScroll", label: "Excessive scrolling" },
  { metric: "QuickbackClick", key: "quickBacks", label: "Quick backs" },
  { metric: "ScriptErrorCount", key: "scriptErrors", label: "Script errors" },
  { metric: "ErrorClickCount", key: "errorClicks", label: "Error clicks" },
];

/** Fold Clarity's array-of-metrics payload into a compact summary for the UI. */
function summarize(payload: unknown) {
  const metrics = Array.isArray(payload) ? (payload as ClarityMetric[]) : [];
  const by = (name: string) =>
    metrics.find((m) => m.metricName === name)?.information;

  const traffic = by("Traffic")?.[0] ?? {};
  const engagement = by("EngagementTime")?.[0] ?? {};
  const totalTime = num(engagement.totalTime);
  const activeTime = num(engagement.activeTime);

  return {
    traffic: {
      sessions: num(traffic.totalSessionCount),
      botSessions: num(traffic.totalBotSessionCount),
      distinctUsers: num(traffic.distinctUserCount),
      pagesPerSession: num(traffic.pagesPerSessionPercentage),
    },
    scrollDepth: num(by("ScrollDepth")?.[0]?.averageScrollDepth),
    // Unit-independent: what share of session time was active vs idle.
    activeTimePct:
      totalTime && activeTime !== null && totalTime > 0
        ? (activeTime / totalTime) * 100
        : null,
    signals: SIGNALS.map((s) => ({
      key: s.key,
      label: s.label,
      sessions: sumField(by(s.metric), "sessionsCount"),
    })),
  };
}

export async function GET(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const token = (await getIntegration("clarity_api_token")).trim();
  // Mirror the funnel's "ready" pattern: a 200 with configured:false lets the UI
  // show a setup hint instead of a scary error.
  if (!token) return NextResponse.json({ configured: false });

  const { searchParams } = new URL(req.url);
  const days = Math.min(3, Math.max(1, Number(searchParams.get("days")) || 3));

  const cached = cache.get(days);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({
      configured: true,
      days,
      cached: true,
      fetchedAt: new Date(cached.at).toISOString(),
      summary: summarize(cached.payload),
    });
  }

  let res: Response;
  try {
    res = await fetch(`${CLARITY_API}?numOfDays=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach Microsoft Clarity." },
      { status: 502 },
    );
  }

  if (res.status === 401 || res.status === 403)
    return NextResponse.json(
      { error: "Clarity rejected the API token. Generate a new one in Settings → Data export." },
      { status: 502 },
    );
  if (res.status === 429)
    return NextResponse.json(
      { error: "Clarity's daily API limit (10/day) is reached. Try again later." },
      { status: 429 },
    );
  if (!res.ok)
    return NextResponse.json(
      { error: `Clarity returned an error (${res.status}).` },
      { status: 502 },
    );

  const payload = await res.json().catch(() => null);
  if (payload === null)
    return NextResponse.json(
      { error: "Clarity returned an unreadable response." },
      { status: 502 },
    );

  cache.set(days, { at: Date.now(), payload });

  return NextResponse.json({
    configured: true,
    days,
    cached: false,
    fetchedAt: new Date().toISOString(),
    summary: summarize(payload),
  });
}
