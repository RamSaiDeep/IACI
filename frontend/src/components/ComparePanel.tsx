"use client";

import IndiaMap from "./IndiaMap";
import { INDICATORS, formatValue, indicator, severityOf } from "../lib/indicators";
import { MONTHS } from "../lib/climate";
import type { Field, Values } from "../lib/climate";

/** A panel's selections. `year`/`month` of null mean "follow the data". */
export interface PanelState {
  state: string | null;
  district: string | null;
  year: number | null;
  month: number | null;
  variable: Field;
}

/** A PanelState with the defaults filled in, which is what this panel renders. */
export type ResolvedPanel = PanelState & { month: number };

interface ComparePanelProps {
  label: string;
  /** Tailwind classes for the panel's identifying chip. */
  chipClassName: string;
  panel: ResolvedPanel;
  onChange: (next: Partial<PanelState>) => void;
  years: number[];
  availableMonths: Set<number>;
  mapValues: Record<string, number>;
  values: Values | null;
}

export default function ComparePanel({
  label,
  chipClassName,
  panel,
  onChange,
  years,
  availableMonths,
  mapValues,
  values,
}: ComparePanelProps) {
  const scope = panel.district
    ? `${panel.district}, ${panel.state}`
    : panel.state || "India Overall";
  const active = values?.[panel.variable] ?? null;
  const severity = severityOf(active);

  return (
    <div className="card card-lg p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex flex-col gap-3 pb-3 border-b border-foreground/8">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`px-2 py-0.5 rounded-md font-black text-[11px] tracking-wider ${chipClassName}`}
            >
              {label}
            </span>
            <span className="text-[11px] font-bold uppercase text-foreground/75 truncate">
              {scope}
            </span>
          </div>
          {(panel.state || panel.district) && (
            <button
              onClick={() => onChange({ state: null, district: null })}
              className="text-[10px] font-bold text-accent hover:underline uppercase tracking-wider flex-shrink-0"
            >
              Reset
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-foreground/50">
              Year
            </span>
            <select
              value={panel.year ?? ""}
              disabled={years.length === 0}
              onChange={(e) => onChange({ year: Number(e.target.value) })}
              className="field !py-1.5 !text-[11px]"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-foreground/50">
              Month
            </span>
            <select
              value={panel.month}
              disabled={availableMonths.size === 0}
              onChange={(e) => onChange({ month: Number(e.target.value) })}
              className="field !py-1.5 !text-[11px]"
            >
              {MONTHS.map((name, idx) => (
                <option key={name} value={idx + 1} disabled={!availableMonths.has(idx + 1)}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-foreground/50">
              Variable
            </span>
            <select
              value={panel.variable}
              onChange={(e) => onChange({ variable: e.target.value as Field })}
              className="field !py-1.5 !text-[11px]"
            >
              {INDICATORS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <IndiaMap
        selectedState={panel.state}
        setSelectedState={(state) => onChange({ state, district: null })}
        selectedDistrict={panel.district}
        setSelectedDistrict={(district) => onChange({ district })}
        mapValues={mapValues}
        selectedVariable={panel.variable}
        heightClassName="h-map [--map-vh:40] min-h-[280px] max-h-[460px] sm:h-[460px]"
      />

      <div className="p-3.5 rounded-xl bg-surface-muted/70 border border-foreground/8 flex justify-between items-center gap-3">
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/55 truncate">
            {panel.year === null ? "—" : `${MONTHS[panel.month - 1]} ${panel.year}`} ·{" "}
            {indicator(panel.variable).name}
          </span>
          <span className="text-xs font-bold truncate">
            {panel.district || panel.state || "India average"}
          </span>
        </div>
        <div className="text-right flex-shrink-0 flex items-baseline gap-1.5">
          <span className={`text-xl font-black ${severity.text}`}>{formatValue(active)}</span>
          <span className="text-[10px] text-foreground/45 font-semibold">z</span>
        </div>
      </div>
    </div>
  );
}
