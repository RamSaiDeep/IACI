"use client";

import RegionMap from "./RegionMap";
import CustomSelect from "./CustomSelect";
import { formatValue, indicator, severityOf } from "../lib/indicators";
import { MONTHS } from "../lib/climate";
import { geoJsonUrl, indicatorsFor } from "../lib/countryPortal";
import type { CountryConfig } from "../lib/countryPortal";
import type { Field, Values } from "../lib/climate";

/**
 * One side of a three-level country's comparison (country → top → child).
 *
 * A config-driven copy of NepalComparePanel with Nepal's fourth level removed.
 * It takes the country as a prop, so every three-level portal shares it.
 */

/** A panel's selections. `year`/`month` of null mean "follow the data". */
export interface PanelState {
  top: string | null;
  child: string | null;
  year: number | null;
  month: number | null;
  variable: Field;
}

export type ResolvedPanel = PanelState & { month: number };

export default function CountryComparePanel({
  country,
  label,
  chipClassName,
  panel,
  onChange,
  years,
  availableMonths,
  mapValues,
  values,
}: {
  country: CountryConfig;
  label: string;
  chipClassName: string;
  panel: ResolvedPanel;
  onChange: (next: Partial<PanelState>) => void;
  years: number[];
  availableMonths: Set<number>;
  mapValues: Record<string, number>;
  values: Values | null;
}) {
  const { top, child } = country;
  const scope = panel.child
    ? `${panel.child}, ${panel.top}`
    : panel.top || `${country.name} overall`;

  const active = values?.[panel.variable] ?? null;
  const severity = severityOf(active);

  // The map shows the top level until one is picked, then that region's children.
  const mapUrl = geoJsonUrl(country, panel.top);
  const mapLevelLabel = panel.top ? child.label : top.label;

  const handleSelect = (key: string, name: string) => {
    if (!panel.top) onChange({ top: name, child: null });
    else onChange({ child: panel.child === name ? null : name });
  };

  const stepBack = () => {
    if (panel.child) onChange({ child: null });
    else onChange({ top: null, child: null });
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
          {panel.top && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={stepBack}
                className="text-[10px] font-bold text-foreground/55 hover:text-foreground uppercase tracking-wider"
              >
                Back
              </button>
              <button
                onClick={() => onChange({ top: null, child: null })}
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
              options={indicatorsFor(country).map((option) => ({
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
        focusKey={panel.child ?? undefined}
        hint={
          panel.top
            ? `Tap a ${child.label.toLowerCase()} to focus it`
            : `Tap a ${top.label.toLowerCase()} to see its ${child.plural.toLowerCase()}`
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
            {panel.child || panel.top || `${country.name} average`}
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
