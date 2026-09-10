"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "../ui";

interface FlowTimings {
  abandonedFirstMinutes: number;
  abandonedSecondMinutes: number;
  welcomeFirstMinutes: number;
}

type TimingField = keyof FlowTimings;
type DelayUnit = "minutes" | "hours" | "days";

const DEFAULT_TIMINGS: FlowTimings = {
  abandonedFirstMinutes: 30,
  abandonedSecondMinutes: 24 * 60,
  welcomeFirstMinutes: 2 * 24 * 60,
};

function splitDelay(minutes: number): { value: number; unit: DelayUnit } {
  if (minutes % (24 * 60) === 0) return { value: minutes / (24 * 60), unit: "days" };
  if (minutes % 60 === 0) return { value: minutes / 60, unit: "hours" };
  return { value: minutes, unit: "minutes" };
}

export function FlowTimings({ token }: { token: string }) {
  const [timings, setTimings] = useState<FlowTimings>(DEFAULT_TIMINGS);
  const [saving, setSaving] = useState<TimingField | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/flow-settings", {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.timings) setTimings(data.timings);
    } catch {
      /* best-effort */
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveTiming(field: TimingField, minutes: number) {
    setSaving(field);
    setError(null);
    try {
      const res = await fetch("/api/admin/flow-settings", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ [field]: minutes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save the timing.");
      setTimings(data.timings);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold text-ink">Email flow timing</h2>
        <p className="mt-1 text-[12.5px] text-[#8a8a84]">
          Delays for abandoned-cart reminders and the post-purchase welcome email (cron).
          Range: 5 minutes–90 days.
        </p>
      </div>
      <div className="space-y-3">
        <TimingRow
          label="Abandoned cart — email 1"
          field="abandonedFirstMinutes"
          minutes={timings.abandonedFirstMinutes}
          saving={saving === "abandonedFirstMinutes"}
          onSave={saveTiming}
        />
        <TimingRow
          label="Abandoned cart — email 2"
          field="abandonedSecondMinutes"
          minutes={timings.abandonedSecondMinutes}
          saving={saving === "abandonedSecondMinutes"}
          onSave={saveTiming}
        />
        <TimingRow
          label="Welcome email after paid order"
          field="welcomeFirstMinutes"
          minutes={timings.welcomeFirstMinutes}
          saving={saving === "welcomeFirstMinutes"}
          onSave={saveTiming}
        />
      </div>
      {error && <p className="mt-3 text-[12.5px] text-[#9a2820]">{error}</p>}
    </Card>
  );
}

function TimingRow({
  label,
  field,
  minutes,
  saving,
  onSave,
}: {
  label: string;
  field: TimingField;
  minutes: number;
  saving: boolean;
  onSave: (field: TimingField, minutes: number) => Promise<void>;
}) {
  const initial = splitDelay(minutes);
  const [value, setValue] = useState(initial.value);
  const [unit, setUnit] = useState<DelayUnit>(initial.unit);
  const factor = unit === "days" ? 24 * 60 : unit === "hours" ? 60 : 1;
  const nextMinutes = value * factor;
  const valid =
    Number.isInteger(nextMinutes) &&
    nextMinutes >= 5 &&
    nextMinutes <= 90 * 24 * 60;
  const changed = valid && nextMinutes !== minutes;

  useEffect(() => {
    const next = splitDelay(minutes);
    setValue(next.value);
    setUnit(next.unit);
  }, [minutes]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#eeeeea] px-3 py-2.5">
      <span className="min-w-[200px] flex-1 text-[13px] font-medium text-ink">{label}</span>
      <input
        type="number"
        min="1"
        max="129600"
        step="1"
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        aria-label={`${label} amount`}
        className="w-16 rounded-md border border-[#dcdcd6] bg-white px-2 py-1 text-[12px] font-medium text-ink outline-none focus:border-ink"
      />
      <select
        value={unit}
        onChange={(e) => setUnit(e.target.value as DelayUnit)}
        aria-label={`${label} unit`}
        className="rounded-md border border-[#dcdcd6] bg-white px-2 py-1 text-[12px] font-medium text-ink outline-none focus:border-ink"
      >
        <option value="minutes">minutes</option>
        <option value="hours">hours</option>
        <option value="days">days</option>
      </select>
      {changed && (
        <button
          onClick={() => onSave(field, nextMinutes)}
          disabled={saving}
          className="rounded-md bg-ink px-2.5 py-1 text-[11.5px] font-semibold text-cream disabled:opacity-50"
        >
          {saving ? "Saving …" : "Save"}
        </button>
      )}
      {!valid && <span className="text-[11.5px] text-[#9a2820]">5 minutes–90 days</span>}
    </div>
  );
}
