"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Header from "../../../components/Header";
import RegionMap from "../../../components/RegionMap";
import ScaleLegend from "../../../components/ScaleLegend";
import CustomSelect from "../../../components/CustomSelect";
import { CompositeValue, ComponentBars } from "../../../components/ClimateReadout";
import TrendChart from "../../../components/TrendChart";
import { buildTrend } from "../../../lib/trend";
import {
  MONTHS,
  choroplethValues,
  monthsIn,
  normalizeName,
  periodOf,
  yearsIn,
} from "../../../lib/climate";
import {
  componentsFor,
  geoJsonUrl,
  indicatorsFor,
  loadChildLevel,
  loadCountrySeries,
  loadTopLevel,
} from "../../../lib/countryPortal";
// THE ONLY COUNTRY-SPECIFIC LINE. Point it at another config to reuse this page.
import { COUNTRY } from "../../../lib/countries/uk";
import type { Field, RegionSeries, Series } from "../../../lib/climate";

const INDICATORS = indicatorsFor(COUNTRY);
const COMPONENTS = componentsFor(COUNTRY);
const { top: TOP, child: CHILD } = COUNTRY;

/**
 * Explore page for a three-level country: country → top level → child level
 * (for the UK: United Kingdom → nation → county).
 *
 * A copy of Nepal's Explore page with the fourth level removed and every
 * country-specific word read from COUNTRY.
 */
export default function CountryExplorePage() {
  // Selection, held by region name. null = not selected.
  const [topSel, setTopSel] = useState<string | null>(null);
  const [childSel, setChildSel] = useState<string | null>(null);

  // null means "follow the data": the newest year and month on offer.
  const [yearChoice, setYearChoice] = useState<number | null>(null);
  const [monthChoice, setMonthChoice] = useState<number | null>(null);
  const [variable, setVariable] = useState<Field>(COUNTRY.indexCode);

  const [national, setNational] = useState<Series | null>(null);
  const [tops, setTops] = useState<RegionSeries | null>(null);
  const [children, setChildren] = useState<{ parent: string; data: RegionSeries } | null>(null);

  // Only use the loaded children if they belong to the selected parent.
  const childSeries = topSel && children?.parent === topSel ? children.data : null;

  // 1. On first load, fetch the national series and the top level.
  useEffect(() => {
    loadCountrySeries(COUNTRY).then(setNational).catch((e) => console.error(e));
    loadTopLevel(COUNTRY).then(setTops).catch((e) => console.error(e));
  }, []);

  // 2. When a top-level region is picked, fetch its children.
  useEffect(() => {
    if (!topSel) return;
    let active = true;
    loadChildLevel(COUNTRY, topSel)
      .then((data) => active && setChildren({ parent: topSel, data }))
      .catch((e) => console.error(e));
    return () => {
      active = false;
    };
  }, [topSel]);

  // Year and month options come from the data, so a new month shows up with no code change.
  const years = useMemo(() => (national ? yearsIn(national) : []), [national]);
  const year = yearChoice != null && years.includes(yearChoice) ? yearChoice : years[0] ?? null;

  const availableMonths = useMemo(
    () => (national && year !== null ? monthsIn(national, year) : new Set<number>()),
    [national, year]
  );
  const month =
    monthChoice != null && availableMonths.has(monthChoice)
      ? monthChoice
      : availableMonths.size > 0
        ? Math.max(...availableMonths)
        : 1;

  const period = year !== null ? periodOf(year, month) : 0;

  // The series for whatever is currently selected.
  const focusedSeries = useMemo(() => {
    if (childSel) return childSeries?.get(normalizeName(childSel)) ?? null;
    if (topSel) return tops?.get(normalizeName(topSel)) ?? null;
    return national;
  }, [childSel, topSel, childSeries, tops, national]);

  const activeValues = useMemo(
    () => (period ? focusedSeries?.get(period) ?? null : null),
    [focusedSeries, period]
  );

  // The map shades the level below the selection, so clicking drills in.
  const mapValues = useMemo(() => {
    if (!period) return {};
    const regions = topSel ? childSeries : tops;
    return regions ? choroplethValues(regions, period, variable) : {};
  }, [period, topSel, childSeries, tops, variable]);

  const mapUrl = geoJsonUrl(COUNTRY, topSel);
  const mapLevelLabel = topSel ? CHILD.label : TOP.label;

  const handleSelect = (_key: string, name: string) => {
    if (!topSel) setTopSel(name);
    else setChildSel((current) => (current === name ? null : name));
  };

  const trend = useMemo(
    () => (focusedSeries ? buildTrend(focusedSeries, variable) : []),
    [focusedSeries, variable]
  );

  const scopeLabel = childSel || topSel || COUNTRY.name;
  const isLoading = !national || !tops || (Boolean(topSel) && !childSeries);

  const goUp = () => {
    if (childSel) setChildSel(null);
    else setTopSel(null);
  };
  const reset = () => {
    setTopSel(null);
    setChildSel(null);
  };
  const upLabel = childSel ? topSel : COUNTRY.name;

  const viewLabel = childSel
    ? `${CHILD.label} focus`
    : topSel
      ? `${CHILD.label} view`
      : `${TOP.label} view`;

  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header portal={COUNTRY.slug} />

      <div className="flex-1 max-w-[105rem] mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 lg:py-5 flex flex-col gap-6 lg:gap-8">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] xl:grid-cols-[300px_1fr_345px] gap-4 xl:gap-5 items-stretch">
          {/* Filters */}
          <aside className="w-full flex flex-col gap-2.5 lg:min-h-[580px] xl:min-h-[600px] lg:h-[590px] xl:h-[610px]">
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase flex-wrap">
                <Link
                  href={`/${COUNTRY.slug}`}
                  className="text-foreground/45 hover:text-foreground transition-colors"
                >
                  {COUNTRY.name}
                </Link>
                <span className="text-foreground/20">/</span>
                <button onClick={reset} className="text-accent hover:text-accent-strong transition-colors">
                  Explore
                </button>
                {topSel && (
                  <>
                    <span className="text-foreground/20">/</span>
                    <button
                      onClick={() => setChildSel(null)}
                      className="text-foreground/70 truncate max-w-[110px] hover:text-foreground"
                    >
                      {topSel}
                    </button>
                  </>
                )}
              </div>

              <div className="flex flex-col items-start gap-0.5">
                <div className="eyebrow inline-flex items-center gap-1.5 text-xs">
                  <span className="w-1.5 h-1.5 bg-accent rounded-full" />
                  {viewLabel}
                </div>
                <h1 className="text-2xl lg:text-3xl font-bold tracking-tight leading-tight">
                  {scopeLabel}
                </h1>
                <div className="w-8 h-[2.5px] bg-accent rounded-full mt-0.5" />
              </div>
            </div>

            {topSel && (
              <button
                onClick={goUp}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold tracking-wider uppercase border border-accent/40 hover:bg-accent/5 text-accent rounded-lg transition-colors flex-shrink-0"
              >
                ← Back to {upLabel}
              </button>
            )}

            <div className="card p-3 sm:p-3.5 flex flex-col gap-2 flex-1 justify-between min-h-0 overflow-visible">
              <div>
                <h2 className="text-xs font-bold tracking-widest text-foreground/60 border-b border-foreground/8 pb-1.5">
                  Filter parameters
                </h2>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold tracking-wider uppercase text-foreground/70">
                      Year
                    </span>
                    <CustomSelect
                      value={year ?? undefined}
                      disabled={years.length === 0}
                      onChange={(y) => setYearChoice(Number(y))}
                      options={years.map((y) => ({ value: y, label: String(y) }))}
                      buttonClassName="uppercase !py-1.5 !text-xs font-bold"
                    />
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold tracking-wider uppercase text-foreground/70">
                      Month
                    </span>
                    <CustomSelect
                      value={month}
                      disabled={availableMonths.size === 0}
                      onChange={(m) => setMonthChoice(Number(m))}
                      options={MONTHS.map((name, idx) => {
                        const value = idx + 1;
                        const has = availableMonths.has(value);
                        return { value, label: has ? name : `${name} — no data`, disabled: !has };
                      })}
                      buttonClassName="uppercase !py-1.5 !text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-foreground/8 pt-2 min-h-0">
                <span className="text-xs font-bold tracking-wider uppercase text-foreground/70">
                  Shade map by
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1 lg:min-h-0 lg:overflow-y-auto">
                  {INDICATORS.map((option) => {
                    const isActive = variable === option.id;
                    return (
                      <button
                        key={option.id}
                        onClick={() => setVariable(option.id)}
                        aria-pressed={isActive}
                        className={`text-left px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                          isActive
                            ? "bg-accent border-accent text-white shadow-card"
                            : "bg-surface border-foreground/10 hover:border-foreground/25 hover:bg-foreground/3"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="truncate text-xs sm:text-[12px] font-bold leading-tight">
                            {option.name}
                          </span>
                          <span
                            className={`text-[10.5px] font-bold flex-shrink-0 ${
                              isActive ? "text-white/80" : "text-foreground/45"
                            }`}
                          >
                            {option.short}
                          </span>
                        </div>
                        <span
                          className={`block text-[9.5px] font-normal mt-0.5 leading-tight truncate ${
                            isActive ? "text-white/85" : "text-foreground/55"
                          }`}
                        >
                          {option.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>

          {/* Map */}
          <main className="min-w-0 card card-lg p-3.5 sm:p-4 flex flex-col justify-between h-full min-h-[440px] lg:min-h-[580px] xl:min-h-[600px] lg:h-[590px] xl:h-[610px]">
            <RegionMap
              url={mapUrl}
              values={mapValues}
              variable={variable}
              onSelect={handleSelect}
              levelLabel={mapLevelLabel}
              focusKey={childSel ?? undefined}
              hint={
                topSel
                  ? `Tap a ${CHILD.label.toLowerCase()} to focus it`
                  : `Tap a ${TOP.label.toLowerCase()} to see its ${CHILD.plural.toLowerCase()}`
              }
              className="flex-1 min-h-[340px] sm:min-h-[380px] lg:min-h-0"
            />
            <div className="mt-2 flex-shrink-0">
              <ScaleLegend field={variable} />
            </div>
          </main>

          {/* Readout */}
          <section className="w-full flex flex-col lg:min-h-[580px] xl:min-h-[600px] lg:h-[590px] xl:h-[610px]">
            <div className="card card-lg p-4 sm:p-4 flex flex-col h-full gap-3 justify-between overflow-hidden">
              <div className="flex-shrink-0 border-b border-foreground/8 pb-1.5">
                <h2 className="eyebrow text-xs">Climate insights</h2>
              </div>

              {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
                  <span className="w-8 h-8 border-[3px] border-foreground/10 border-t-accent rounded-full animate-spin" />
                  <span className="text-xs font-semibold tracking-widest text-foreground/55 uppercase">
                    Loading data
                  </span>
                </div>
              ) : !activeValues ? (
                <div className="flex-1 flex items-center justify-center py-12 border border-dashed border-foreground/12 rounded-xl">
                  <span className="text-xs font-semibold tracking-widest text-foreground/40 uppercase">
                    No data for this month
                  </span>
                </div>
              ) : (
                <div className="flex-1 flex flex-col gap-2.5 justify-between animate-rise min-h-0">
                  <CompositeValue
                    value={activeValues[COUNTRY.indexCode]}
                    label={`${COUNTRY.indexCode} Composite`}
                  />
                  <div className="flex flex-col gap-1.5 min-h-0">
                    <div className="flex justify-between items-center border-b border-foreground/8 pb-1">
                      <h4 className="text-xs font-bold tracking-wider uppercase text-foreground/70">
                        Component anomalies
                      </h4>
                      <span className="text-[10px] font-bold text-foreground/45 uppercase tracking-widest">
                        z-score
                      </span>
                    </div>
                    <ComponentBars values={activeValues} components={COMPONENTS} />
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="w-full">
          <TrendChart
            points={trend}
            field={variable}
            scope={scopeLabel}
            highlight={period || undefined}
            loading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
