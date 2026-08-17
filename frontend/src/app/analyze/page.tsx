"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Header from "../../components/Header";
import ComparePanel, {
  type PanelState,
  type ResolvedPanel,
} from "../../components/ComparePanel";
import ScaleLegend from "../../components/ScaleLegend";
import TrendChart from "../../components/TrendChart";
import { buildTrend } from "../../lib/trend";
import { INDICATORS, formatValue, severityOf } from "../../lib/indicators";
import {
  MONTHS,
  choroplethValues,
  loadDistricts,
  loadIndia,
  loadStates,
  monthsIn,
  normalizeName,
  periodOf,
  yearsIn,
} from "../../lib/climate";
import type { RegionSeries, Series, Values } from "../../lib/climate";

/** How far apart two z-scores must be before the delta is called a difference. */
const DELTA_THRESHOLD = 0.1;

export default function AnalyzePage() {
  const [indiaSeries, setIndiaSeries] = useState<Series | null>(null);
  const [stateSeries, setStateSeries] = useState<RegionSeries | null>(null);

  // `year`/`month` of null mean "follow the data"; both are resolved below.
  const [panelA, setPanelA] = useState<PanelState>({
    state: null,
    district: null,
    year: null,
    month: null,
    variable: "IACI",
  });
  const [panelB, setPanelB] = useState<PanelState>({
    state: null,
    district: null,
    year: null,
    month: null,
    variable: "IACI",
  });

  const [districtsA, setDistrictsA] = useState<{ state: string; data: RegionSeries } | null>(
    null
  );
  const [districtsB, setDistrictsB] = useState<{ state: string; data: RegionSeries } | null>(
    null
  );
  const [syncVariable, setSyncVariable] = useState(true);

  const seriesA = panelA.state && districtsA?.state === panelA.state ? districtsA.data : null;
  const seriesB = panelB.state && districtsB?.state === panelB.state ? districtsB.data : null;

  useEffect(() => {
    loadIndia()
      .then(setIndiaSeries)
      .catch((err) => console.error("Error loading India data:", err));
    loadStates()
      .then(setStateSeries)
      .catch((err) => console.error("Error loading state data:", err));
  }, []);

  const years = useMemo(
    () => (indiaSeries ? yearsIn(indiaSeries) : []),
    [indiaSeries]
  );

  /**
   * Fill in a panel's unset year and month. `preferredMonth` lets panel B open
   * on the same month as panel A, so the default view compares like with like
   * a year apart rather than two arbitrary months.
   */
  const resolvePanel = useCallback(
    (panel: PanelState, defaultYear: number | null, preferredMonth: number | null) => {
      const year =
        panel.year != null && years.includes(panel.year) ? panel.year : defaultYear;
      const available =
        indiaSeries && year !== null ? monthsIn(indiaSeries, year) : new Set<number>();
      const wanted = panel.month ?? preferredMonth;
      const month =
        wanted != null && available.has(wanted)
          ? wanted
          : available.size > 0
            ? Math.max(...available)
            : 1;
      return { ...panel, year, month, available };
    },
    [indiaSeries, years]
  );

  const resolvedA = resolvePanel(panelA, years[0] ?? null, null);
  const resolvedB = resolvePanel(panelB, years[1] ?? years[0] ?? null, resolvedA.month);

  useEffect(() => {
    if (!panelA.state) return;
    const state = panelA.state;
    let active = true;
    loadDistricts(state)
      .then((data) => {
        if (active) setDistrictsA({ state, data });
      })
      .catch((err) => console.error(err));
    return () => {
      active = false;
    };
  }, [panelA.state]);

  useEffect(() => {
    if (!panelB.state) return;
    const state = panelB.state;
    let active = true;
    loadDistricts(state)
      .then((data) => {
        if (active) setDistrictsB({ state, data });
      })
      .catch((err) => console.error(err));
    return () => {
      active = false;
    };
  }, [panelB.state]);

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

  const valuesFor = useCallback(
    (panel: ResolvedPanel, districts: RegionSeries | null): Values | null => {
      if (panel.year === null) return null;
      const period = periodOf(panel.year, panel.month);
      if (panel.district) {
        return districts?.get(normalizeName(panel.district))?.get(period) ?? null;
      }
      if (panel.state) {
        return stateSeries?.get(normalizeName(panel.state))?.get(period) ?? null;
      }
      return indiaSeries?.get(period) ?? null;
    },
    [stateSeries, indiaSeries]
  );

  const mapValuesFor = useCallback(
    (panel: ResolvedPanel, districts: RegionSeries | null): Record<string, number> => {
      if (panel.year === null) return {};
      const regions = panel.state ? districts : stateSeries;
      return regions
        ? choroplethValues(regions, periodOf(panel.year, panel.month), panel.variable)
        : {};
    },
    [stateSeries]
  );

  const valuesA = valuesFor(resolvedA, seriesA);
  const valuesB = valuesFor(resolvedB, seriesB);
  const mapValuesA = mapValuesFor(resolvedA, seriesA);
  const mapValuesB = mapValuesFor(resolvedB, seriesB);

  const labelFor = (panel: ResolvedPanel) =>
    panel.year === null ? "—" : `${MONTHS[panel.month - 1].slice(0, 3)} ${panel.year}`;

  const scopeOf = (panel: ResolvedPanel) =>
    panel.district || panel.state || "India";

  const seriesOf = useCallback(
    (panel: ResolvedPanel, districts: RegionSeries | null) => {
      if (panel.district) return districts?.get(normalizeName(panel.district)) ?? null;
      if (panel.state) return stateSeries?.get(normalizeName(panel.state)) ?? null;
      return indiaSeries;
    },
    [stateSeries, indiaSeries]
  );

  const seriesForA = seriesOf(resolvedA, seriesA);
  const seriesForB = seriesOf(resolvedB, seriesB);
  const variableA = resolvedA.variable;
  const variableB = resolvedB.variable;

  const trendA = useMemo(
    () => (seriesForA ? buildTrend(seriesForA, variableA) : []),
    [seriesForA, variableA]
  );
  const trendB = useMemo(
    () => (seriesForB ? buildTrend(seriesForB, variableB) : []),
    [seriesForB, variableB]
  );

  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-[100rem] mx-auto w-full px-4 sm:px-6 py-5 sm:py-6 flex flex-col gap-6">
        <div className="card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="eyebrow flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Comparative analytics
            </div>
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight mt-1">
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
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
              />
            </svg>
            Sync variable: {syncVariable ? "on" : "off"}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ComparePanel
            label="PANEL A"
            chipClassName="bg-foreground text-white"
            panel={resolvedA}
            onChange={(next) => updatePanel("A", next)}
            years={years}
            availableMonths={resolvedA.available}
            mapValues={mapValuesA}
            values={valuesA}
          />
          <ComparePanel
            label="PANEL B"
            chipClassName="bg-accent text-white"
            panel={resolvedB}
            onChange={(next) => updatePanel("B", next)}
            years={years}
            availableMonths={resolvedB.available}
            mapValues={mapValuesB}
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
            loading={!indiaSeries || !stateSeries}
            height={280}
          />
          <TrendChart
            points={trendB}
            field={resolvedB.variable}
            scope={`B · ${scopeOf(resolvedB)}`}
            highlight={resolvedB.year !== null ? periodOf(resolvedB.year, resolvedB.month) : undefined}
            loading={!indiaSeries || !stateSeries}
            height={280}
          />
        </div>

        <div className="card card-lg p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1 border-b border-foreground/8 pb-3">
            <h2 className="eyebrow">Quantitative comparison</h2>
            <h3 className="text-lg sm:text-xl font-extrabold uppercase tracking-tight">
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
                  const isComposite = row.id === "IACI";

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-foreground/2 transition-colors ${
                        isComposite ? "bg-accent/4" : ""
                      }`}
                    >
                      <td className="py-3 px-3">
                        <div
                          className={`font-bold text-xs ${isComposite ? "text-accent" : "text-foreground"}`}
                        >
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
                          <span className="text-rose-700">
                            Higher hazard in B ({formatValue(delta)}&sigma;)
                          </span>
                        ) : delta < -DELTA_THRESHOLD ? (
                          <span className="text-teal-700">
                            Lower hazard in B ({formatValue(delta)}&sigma;)
                          </span>
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
