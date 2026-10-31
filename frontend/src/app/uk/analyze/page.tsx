"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Header from "../../../components/Header";
import CountryComparePanel, {
  type PanelState,
  type ResolvedPanel,
} from "../../../components/CountryComparePanel";
import ScaleLegend from "../../../components/ScaleLegend";
import TrendChart from "../../../components/TrendChart";
import { buildTrend } from "../../../lib/trend";
import { formatValue, severityOf } from "../../../lib/indicators";
import {
  MONTHS,
  choroplethValues,
  monthsIn,
  normalizeName,
  periodOf,
  yearsIn,
} from "../../../lib/climate";
import {
  indicatorsFor,
  loadChildLevel,
  loadCountrySeries,
  loadTopLevel,
} from "../../../lib/countryPortal";
// THE ONLY COUNTRY-SPECIFIC LINE. Point it at another config to reuse this page.
import { COUNTRY } from "../../../lib/countries/uk";
import type { RegionSeries, Series, Values } from "../../../lib/climate";

const INDICATORS = indicatorsFor(COUNTRY);

/** How far apart two z-scores must be before the delta is called a difference. */
const DELTA_THRESHOLD = 0.1;

const EMPTY: PanelState = {
  top: null,
  child: null,
  year: null,
  month: null,
  variable: COUNTRY.indexCode,
};

type Loaded = { parent: string; data: RegionSeries } | null;

/**
 * Analyze page for a three-level country: two panels side by side, each able to
 * sit anywhere in the hierarchy, with a component-by-component delta table.
 * A copy of Nepal's Analyze page with the fourth level removed.
 */
export default function CountryAnalyzePage() {
  const [national, setNational] = useState<Series | null>(null);
  const [tops, setTops] = useState<RegionSeries | null>(null);

  const [panelA, setPanelA] = useState<PanelState>(EMPTY);
  const [panelB, setPanelB] = useState<PanelState>(EMPTY);

  // Each panel loads its own children: the two can sit in different regions.
  const [childrenA, setChildrenA] = useState<Loaded>(null);
  const [childrenB, setChildrenB] = useState<Loaded>(null);

  const [syncVariable, setSyncVariable] = useState(true);

  useEffect(() => {
    loadCountrySeries(COUNTRY).then(setNational).catch((e) => console.error(e));
    loadTopLevel(COUNTRY).then(setTops).catch((e) => console.error(e));
  }, []);

  useEffect(() => {
    const parent = panelA.top;
    if (!parent) return;
    let active = true;
    loadChildLevel(COUNTRY, parent)
      .then((data) => active && setChildrenA({ parent, data }))
      .catch((e) => console.error(e));
    return () => {
      active = false;
    };
  }, [panelA.top]);

  useEffect(() => {
    const parent = panelB.top;
    if (!parent) return;
    let active = true;
    loadChildLevel(COUNTRY, parent)
      .then((data) => active && setChildrenB({ parent, data }))
      .catch((e) => console.error(e));
    return () => {
      active = false;
    };
  }, [panelB.top]);

  const childSeriesA = panelA.top && childrenA?.parent === panelA.top ? childrenA.data : null;
  const childSeriesB = panelB.top && childrenB?.parent === panelB.top ? childrenB.data : null;

  const years = useMemo(() => (national ? yearsIn(national) : []), [national]);

  /** Fill in a panel's unset year and month. Panel B opens on A's month, a year earlier. */
  const resolvePanel = useCallback(
    (panel: PanelState, defaultYear: number | null, preferredMonth: number | null) => {
      const year = panel.year != null && years.includes(panel.year) ? panel.year : defaultYear;
      const available = national && year !== null ? monthsIn(national, year) : new Set<number>();
      const wanted = panel.month ?? preferredMonth;
      const month =
        wanted != null && available.has(wanted)
          ? wanted
          : available.size > 0
            ? Math.max(...available)
            : 1;
      return { ...panel, year, month, available };
    },
    [national, years]
  );

  const resolvedA = resolvePanel(panelA, years[0] ?? null, null);
  const resolvedB = resolvePanel(panelB, years[1] ?? years[0] ?? null, resolvedA.month);

  const updatePanel = useCallback(
    (which: "A" | "B", next: Partial<PanelState>) => {
      const setSelf = which === "A" ? setPanelA : setPanelB;
      const setOther = which === "A" ? setPanelB : setPanelA;
      setSelf((prev) => ({ ...prev, ...next }));
      if (syncVariable && next.variable) {
        setOther((prev) => ({ ...prev, variable: next.variable! }));
      }
    },
    [syncVariable]
  );

  const seriesOf = useCallback(
    (panel: ResolvedPanel, children: RegionSeries | null) => {
      if (panel.child) return children?.get(normalizeName(panel.child)) ?? null;
      if (panel.top) return tops?.get(normalizeName(panel.top)) ?? null;
      return national;
    },
    [tops, national]
  );

  const valuesFor = (panel: ResolvedPanel, children: RegionSeries | null): Values | null =>
    panel.year === null
      ? null
      : seriesOf(panel, children)?.get(periodOf(panel.year, panel.month)) ?? null;

  const mapValuesFor = (panel: ResolvedPanel, children: RegionSeries | null) => {
    if (panel.year === null) return {};
    const regions = panel.top ? children : tops;
    return regions
      ? choroplethValues(regions, periodOf(panel.year, panel.month), panel.variable)
      : {};
  };

  const valuesA = valuesFor(resolvedA, childSeriesA);
  const valuesB = valuesFor(resolvedB, childSeriesB);
  const seriesForA = seriesOf(resolvedA, childSeriesA);
  const seriesForB = seriesOf(resolvedB, childSeriesB);

  const trendA = useMemo(
    () => (seriesForA ? buildTrend(seriesForA, resolvedA.variable) : []),
    [seriesForA, resolvedA.variable]
  );
  const trendB = useMemo(
    () => (seriesForB ? buildTrend(seriesForB, resolvedB.variable) : []),
    [seriesForB, resolvedB.variable]
  );

  const labelFor = (panel: ResolvedPanel) =>
    panel.year === null ? "—" : `${MONTHS[panel.month - 1].slice(0, 3)} ${panel.year}`;
  const scopeOf = (panel: ResolvedPanel) => panel.child || panel.top || COUNTRY.name;
  const isLoading = !national || !tops;

  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header portal={COUNTRY.slug} />

      <main className="flex-1 max-w-[100rem] mx-auto w-full px-4 sm:px-6 py-5 sm:py-6 flex flex-col gap-6">
        <div className="card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="eyebrow flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Comparative analytics
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight mt-1">
              Side-by-side hazard comparison
            </h1>
          </div>

          <button
            onClick={() => setSyncVariable(!syncVariable)}
            aria-pressed={syncVariable}
            className={`px-3.5 py-2 rounded-lg text-[11px] font-bold tracking-widest uppercase border transition-colors flex items-center gap-2 self-start ${
              syncVariable
                ? "bg-accent/12 text-accent border-accent/40"
                : "bg-foreground/4 text-foreground/55 border-foreground/12 hover:bg-foreground/8"
            }`}
          >
            Sync variable: {syncVariable ? "on" : "off"}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CountryComparePanel
            country={COUNTRY}
            label="PANEL A"
            chipClassName="bg-foreground text-white"
            panel={resolvedA}
            onChange={(next) => updatePanel("A", next)}
            years={years}
            availableMonths={resolvedA.available}
            mapValues={mapValuesFor(resolvedA, childSeriesA)}
            values={valuesA}
          />
          <CountryComparePanel
            country={COUNTRY}
            label="PANEL B"
            chipClassName="bg-accent text-white"
            panel={resolvedB}
            onChange={(next) => updatePanel("B", next)}
            years={years}
            availableMonths={resolvedB.available}
            mapValues={mapValuesFor(resolvedB, childSeriesB)}
            values={valuesB}
          />
        </div>

        <div className="card p-4 sm:p-5">
          <ScaleLegend field={resolvedA.variable} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <TrendChart
            points={trendA}
            field={resolvedA.variable}
            scope={`A · ${scopeOf(resolvedA)}`}
            highlight={resolvedA.year !== null ? periodOf(resolvedA.year, resolvedA.month) : undefined}
            loading={isLoading}
            height={280}
          />
          <TrendChart
            points={trendB}
            field={resolvedB.variable}
            scope={`B · ${scopeOf(resolvedB)}`}
            highlight={resolvedB.year !== null ? periodOf(resolvedB.year, resolvedB.month) : undefined}
            loading={isLoading}
            height={280}
          />
        </div>

        <div className="card card-lg p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1 border-b border-foreground/8 pb-3">
            <h2 className="eyebrow">Quantitative comparison</h2>
            <h3 className="text-lg sm:text-xl font-bold tracking-tight">
              Component breakdown &amp; delta (&Delta;)
            </h3>
          </div>

          <div className="overflow-x-auto -mx-5 sm:mx-0 px-5 sm:px-0">
            <table className="w-full text-left text-xs border-collapse min-w-[560px]">
              <thead>
                <tr className="border-b border-foreground/10 text-foreground/55 uppercase text-[10px] tracking-widest">
                  <th className="py-2.5 px-3 font-bold">Component</th>
                  <th className="py-2.5 px-3 font-bold text-center">A · {labelFor(resolvedA)}</th>
                  <th className="py-2.5 px-3 font-bold text-center">B · {labelFor(resolvedB)}</th>
                  <th className="py-2.5 px-3 font-bold text-center">&Delta;</th>
                  <th className="py-2.5 px-3 font-bold">Direction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {INDICATORS.map((row) => {
                  const a = valuesA?.[row.id] ?? null;
                  const b = valuesB?.[row.id] ?? null;
                  const delta = a != null && b != null ? b - a : null;
                  const isComposite = row.id === COUNTRY.indexCode;

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-foreground/2 transition-colors ${isComposite ? "bg-accent/4" : ""}`}
                    >
                      <td className="py-3 px-3">
                        <div className={`font-bold text-xs ${isComposite ? "text-accent" : "text-foreground"}`}>
                          {row.name}
                          <span className="text-foreground/40 ml-1.5 font-semibold">{row.short}</span>
                        </div>
                        <div className="text-[9.5px] text-foreground/50">{row.desc}</div>
                      </td>
                      <td className={`py-3 px-3 text-center font-mono font-bold text-xs ${severityOf(a).text}`}>
                        {formatValue(a)}
                      </td>
                      <td className={`py-3 px-3 text-center font-mono font-bold text-xs ${severityOf(b).text}`}>
                        {formatValue(b)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {delta == null ? (
                          <span className="text-foreground/35">—</span>
                        ) : (
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full font-mono font-bold text-[11px] ${
                              delta > DELTA_THRESHOLD
                                ? "bg-rose-500/12 text-rose-700"
                                : delta < -DELTA_THRESHOLD
                                  ? "bg-teal-500/12 text-teal-700"
                                  : "bg-foreground/6 text-foreground/65"
                            }`}
                          >
                            {formatValue(delta)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-[11px] font-semibold">
                        {delta == null ? (
                          <span className="text-foreground/40 font-normal">Insufficient data</span>
                        ) : delta > DELTA_THRESHOLD ? (
                          <span className="text-rose-700">Higher hazard in B ({formatValue(delta)}&sigma;)</span>
                        ) : delta < -DELTA_THRESHOLD ? (
                          <span className="text-teal-700">Lower hazard in B ({formatValue(delta)}&sigma;)</span>
                        ) : (
                          <span className="text-foreground/55 font-medium">
                            Comparable (&plusmn;{DELTA_THRESHOLD}&sigma;)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
