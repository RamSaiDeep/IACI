"use client";

import RegionMap from "./RegionMap";
import CustomSelect from "./CustomSelect";
import { NEPAL_INDICATORS, formatValue, indicator, severityOf } from "../lib/indicators";
import { MONTHS } from "../lib/climate";
import { nepalGeoJsonUrl } from "../lib/nepal";
import type { Field, Values } from "../lib/climate";

/**
 * One side of Nepal's comparison.
 *
 * The counterpart of `ComparePanel`, differing in the two places Nepal does:
 * the selection is three deep rather than two (province → district → local),
 * and the variable list omits sea level, which is not part of a landlocked
 * country's index.
 */

/** A panel's selections. `year`/`month` of null mean "follow the data". */
export interface NepalPanelState {
  province: string | null;
  district: string | null;
  local: string | null;
  year: number | null;
  month: number | null;
  variable: Field;
}

/** A NepalPanelState with the defaults filled in, which is what this renders. */
export type ResolvedNepalPanel = NepalPanelState & { month: number };

export default function NepalComparePanel({
  label,
  chipClassName,
  panel,
  onChange,
  years,
  availableMonths,
  mapValues,
  values,
}: {
  label: string;
  /** Tailwind classes for the panel's identifying chip. */
  chipClassName: string;
  panel: ResolvedNepalPanel;
  onChange: (next: Partial<NepalPanelState>) => void;
  years: number[];
  availableMonths: Set<number>;
  mapValues: Record<string, number>;
  values: Values | null;
}) {
  const scope = panel.local
    ? `${panel.local}, ${panel.district}`
    : panel.district
      ? `${panel.district}, ${panel.province}`
      : panel.province || "Nepal Overall";

  const active = values?.[panel.variable] ?? null;
  const severity = severityOf(active);

  // The map always shows one level below the selection, so a click drills in.
  const mapUrl = panel.district
    ? nepalGeoJsonUrl("local", panel.district)
    : panel.province
      ? nepalGeoJsonUrl("district", panel.province)
      : nepalGeoJsonUrl("province");

  const mapLevelLabel = panel.district ? "Local Level" : panel.province ? "District" : "Province";

  const handleSelect = (name: string) => {
    if (!panel.province) onChange({ province: name, district: null, local: null });
    else if (!panel.district) onChange({ district: name, local: null });
    else onChange({ local: panel.local === name ? null : name });
  };

  const stepBack = () => {
    if (panel.local) onChange({ local: null });
    else if (panel.district) onChange({ district: null, local: null });
    else onChange({ province: null, district: null, local: null });
  };

  return (
    <div className="card card-lg p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex flex-col gap-3 pb-3 border-b border-foreground/8">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`px-2 py-0.5 rounded-md font-bold text-[11px] tracking-wider ${chipClassName}`}
            >
              {label}
            </span>
            <span className="text-[11px] font-bold uppercase text-foreground/75 truncate">
              {scope}
            </span>
          </div>
          {panel.province && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={stepBack}
                className="text-[10px] font-bold text-foreground/55 hover:text-foreground uppercase tracking-wider"
              >
                Back
              </button>
              <button
                onClick={() => onChange({ province: null, district: null, local: null })}
                className="text-[10px] font-bold text-accent hover:underline uppercase tracking-wider"
              >
                Reset
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-foreground/50">
              Year
            </span>
            <CustomSelect
              value={panel.year ?? undefined}
              disabled={years.length === 0}
              onChange={(y) => onChange({ year: Number(y) })}
              options={years.map((y) => ({ value: y, label: String(y) }))}
              buttonClassName="!py-2 !text-[11px] min-h-[40px]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-foreground/50">
              Month
            </span>
            <CustomSelect
              value={panel.month}
              disabled={availableMonths.size === 0}
              onChange={(m) => onChange({ month: Number(m) })}
              options={MONTHS.map((name, idx) => ({
                value: idx + 1,
                label: name,
                disabled: !availableMonths.has(idx + 1),
              }))}
              buttonClassName="!py-2 !text-[11px] min-h-[40px]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-foreground/50">
              Variable
            </span>
            <CustomSelect
              value={panel.variable}
              onChange={(v) => onChange({ variable: v as Field })}
              options={NEPAL_INDICATORS.map((option) => ({
                value: option.id,
                label: option.name,
              }))}
              buttonClassName="!py-2 !text-[11px] min-h-[40px]"
              dropdownClassName="min-w-[200px]"
            />
          </div>
        </div>
      </div>

      <RegionMap
        url={mapUrl}
        values={mapValues}
        variable={panel.variable}
        onSelect={handleSelect}
        levelLabel={mapLevelLabel}
        focusName={panel.local}
        hint={
          panel.district
            ? "Tap a local level to focus it"
            : panel.province
              ? "Tap a district to see its local levels"
              : "Tap a province to see its districts"
        }
        heightClassName="h-map [--map-vh:40] min-h-[280px] max-h-[460px] sm:h-[460px]"
      />

      <div className="p-3.5 rounded-xl bg-surface-muted/70 border border-foreground/8 flex justify-between items-center gap-3">
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/55 truncate">
            {panel.year === null ? "—" : `${MONTHS[panel.month - 1]} ${panel.year}`} ·{" "}
            {indicator(panel.variable).name}
          </span>
          <span className="text-xs font-bold truncate">
            {panel.local || panel.district || panel.province || "Nepal average"}
          </span>
        </div>
        <div className="text-right flex-shrink-0 flex items-baseline gap-1.5">
          <span className={`text-xl font-bold ${severity.text}`}>{formatValue(active)}</span>
          <span className="text-[10px] text-foreground/45 font-semibold">z</span>
        </div>
      </div>
    </div>
  );
}
