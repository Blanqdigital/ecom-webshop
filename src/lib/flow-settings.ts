import "server-only";

import { getSupabaseAdmin } from "./supabase";

export interface FlowTimings {
  abandonedFirstMinutes: number;
  abandonedSecondMinutes: number;
  welcomeFirstMinutes: number;
}

export const DEFAULT_FLOW_TIMINGS: FlowTimings = {
  abandonedFirstMinutes: 30,
  abandonedSecondMinutes: 24 * 60,
  welcomeFirstMinutes: 2 * 24 * 60,
};

export const FLOW_TIMING_FIELDS = Object.keys(
  DEFAULT_FLOW_TIMINGS,
) as (keyof FlowTimings)[];

const KEY = "email_flow_timings";
const MIN_DELAY_MINUTES = 5;
const MAX_DELAY_MINUTES = 90 * 24 * 60;

function validMinutes(value: unknown): number | null {
  const minutes = Number(value);
  return Number.isInteger(minutes) &&
    minutes >= MIN_DELAY_MINUTES &&
    minutes <= MAX_DELAY_MINUTES
    ? minutes
    : null;
}

export function sanitizeFlowTimings(value: unknown): FlowTimings {
  const stored =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    abandonedFirstMinutes:
      validMinutes(stored.abandonedFirstMinutes) ??
      DEFAULT_FLOW_TIMINGS.abandonedFirstMinutes,
    abandonedSecondMinutes:
      validMinutes(stored.abandonedSecondMinutes) ??
      DEFAULT_FLOW_TIMINGS.abandonedSecondMinutes,
    welcomeFirstMinutes:
      validMinutes(stored.welcomeFirstMinutes) ??
      DEFAULT_FLOW_TIMINGS.welcomeFirstMinutes,
  };
}

export async function getFlowTimings(): Promise<FlowTimings> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return DEFAULT_FLOW_TIMINGS;
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();
  if (error) return DEFAULT_FLOW_TIMINGS;
  return sanitizeFlowTimings(data?.value);
}

export async function saveFlowTimings(
  timings: FlowTimings,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Database isn't configured." };
  const { error } = await supabase.from("app_settings").upsert({
    key: KEY,
    value: sanitizeFlowTimings(timings),
    updated_at: new Date().toISOString(),
  });
  return error
    ? { ok: false, error: "Couldn't save the flow timing." }
    : { ok: true };
}
