"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Header from "../../../components/Header";
import NepalComparePanel, {
  type NepalPanelState,
  type ResolvedNepalPanel,
} from "../../../components/NepalComparePanel";
import ScaleLegend from "../../../components/ScaleLegend";
import TrendChart from "../../../components/TrendChart";
import { buildTrend } from "../../../lib/trend";
import { NEPAL_INDICATORS, formatValue, severityOf } from "../../../lib/indicators";
import {
  MONTHS,
  choroplethValues,
  monthsIn,
  normalizeName,
  periodOf,
  yearsIn,
} from "../../../lib/climate";
import {
  NEPAL_INDEX,
  loadLocalLevels,
  loadNepal,
  loadNepalDistricts,
  loadProvinces,
} from "../../../lib/nepal";
import type { RegionSeries, Series, Values } from "../../../lib/climate";

/** How far apart two z-scores must be before the delta is called a difference. */
const DELTA_THRESHOLD = 0.1;

const EMPTY: NepalPanelState = {
  province: null,
  district: null,
  local: null,
  year: null,
  month: null,
  variable: NEPAL_INDEX,
};

/**
 * Nepal's Analyze page — the same side-by-side comparison as India's, one level
 * deeper. Each panel can sit anywhere in the hierarchy, so a local level can be
 * held against its own district, or two municipalities in different provinces
 * compared directly.
 */
export default function NepalAnalyzePage() {
  const [nepal, setNepal] = useState<Series | null>(null);
  const [provinces, setProvinces] = useState<RegionSeries | null>(null);

  const [panelA, setPanelA] = useState<NepalPanelState>(EMPTY);
  const [panelB, setPanelB] = useState<NepalPanelState>(EMPTY);

  // Each panel loads its own children, since the two can sit in different
  // provinces and must not overwrite each other's data.
  const [districtsA, setDistrictsA] = useState<{ parent: string; data: RegionSeries } | null>(null);
  const [districtsB, setDistrictsB] = useState<{ parent: string; data: RegionSeries } | null>(null);
  const [localsA, setLocalsA] = useState<{ parent: string; data: RegionSeries } | null>(null);
  const [localsB, setLocalsB] = useState<{ parent: string; data: RegionSeries } | null>(null);

  const [syncVariable, setSyncVariable] = useState(true);

  useEffect(() => {
    loadNepal().then(setNepal).catch((e) => console.error(e));
    loadProvinces().then(setProvinces).catch((e) => console.error(e));
  }, []);

  const useChildren = (
    parent: string | null,
    load: (name: string) => Promise<RegionSeries>,
    set: (v: { parent: string; data: RegionSeries } | null) => void
  ) => {
    useEffect(() => {
      if (!parent) return;
      let active = true;
      load(parent)
        .then((data) => active && set({ parent, data }))
        .catch((e) => console.error(e));
      // Ignore a slow response for a region the panel has moved away from.
      return () => {
        active = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parent]);
  };

  useChildren(panelA.province, loadNepalDistricts, setDistrictsA);
  useChildren(panelB.province, loadNepalDistricts, setDistrictsB);
  useChildren(panelA.district, loadLocalLevels, setLocalsA);
  useChildren(panelB.district, loadLocalLevels, setLocalsB);

  const districtSeriesA =
    panelA.province && districtsA?.parent === panelA.province ? districtsA.data : null;
  const districtSeriesB =
    panelB.province && districtsB?.parent === panelB.province ? districtsB.data : null;
  const localSeriesA =
    panelA.district && localsA?.parent === panelA.district ? localsA.data : null;
  const localSeriesB =
    panelB.district && localsB?.parent === panelB.district ? localsB.data : null;

  const years = useMemo(() => (nepal ? yearsIn(nepal) : []), [nepal]);

  /**
   * Fill in a panel's unset year and month. `preferredMonth` lets panel B open
   * on the same month as panel A, so the default view compares like with like
   * a year apart rather than two arbitrary months.
   */
  const resolvePanel = useCallback(
    (panel: NepalPanelState, defaultYear: number | null, preferredMonth: number | null) => {
      const year = panel.year != null && years.includes(panel.year) ? panel.year : defaultYear;
      const available = nepal && year !== null ? monthsIn(nepal, year) : new Set<number>();
      const wanted = panel.month ?? preferredMonth;
      const month =
        wanted != null && available.has(wanted)
          ? wanted
          : available.size > 0
            ? Math.max(...available)
            : 1;
      return { ...panel, year, month, available };
    },
    [nepal, years]
  );

  const resolvedA = resolvePanel(panelA, years[0] ?? null, null);
  const resolvedB = resolvePanel(panelB, years[1] ?? years[0] ?? null, resolvedA.month);

  const updatePanel = useCallback(
    (which: "A" | "B", next: Partial<NepalPanelState>) => {
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
    (panel: ResolvedNepalPanel, districts: RegionSeries | null, locals: RegionSeries | null) => {
      if (panel.local) return locals?.get(normalizeName(panel.local.key)) ?? null;
      if (panel.district) return districts?.get(normalizeName(panel.district)) ?? null;
      if (panel.province) return provinces?.get(normalizeName(panel.province)) ?? null;
      return nepal;
    },
    [provinces, nepal]
  );

  const valuesFor = useCallback(
    (
      panel: ResolvedNepalPanel,
      districts: RegionSeries | null,
      locals: RegionSeries | null
    ): Values | null => {
      if (panel.year === null) return null;
      return seriesOf(panel, districts, locals)?.get(periodOf(panel.year, panel.month)) ?? null;
    },
    [seriesOf]
  );

  const mapValuesFor = useCallback(
    (
      panel: ResolvedNepalPanel,
      districts: RegionSeries | null,
      locals: RegionSeries | null
    ): Record<string, number> => {
      if (panel.year === null) return {};
      const regions = panel.district ? locals : panel.province ? districts : provinces;
      return regions
        ? choroplethValues(regions, periodOf(panel.year, panel.month), panel.variable)
        : {};
    },
    [provinces]
  );

  const valuesA = valuesFor(resolvedA, districtSeriesA, localSeriesA);
  const valuesB = valuesFor(resolvedB, districtSeriesB, localSeriesB);

  const seriesForA = seriesOf(resolvedA, districtSeriesA, localSeriesA);
  const seriesForB = seriesOf(resolvedB, districtSeriesB, localSeriesB);

  const trendA = useMemo(
    () => (seriesForA ? buildTrend(seriesForA, resolvedA.variable) : []),
    [seriesForA, resolvedA.variable]
  );
  const trendB = useMemo(
    () => (seriesForB ? buildTrend(seriesForB, resolvedB.variable) : []),
    [seriesForB, resolvedB.variable]
  );

  const labelFor = (panel: ResolvedNepalPanel) =>
    panel.year === null ? "—" : `${MONTHS[panel.month - 1].slice(0, 3)} ${panel.year}`;

  const scopeOf = (panel: ResolvedNepalPanel) =>
    panel.local?.name || panel.district || panel.province || "Nepal";

  const isLoading = !nepal || !provinces;

  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header portal="nepal" />

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
          <NepalComparePanel
            label="PANEL A"
            chipClassName="bg-foreground text-white"
            panel={resolvedA}
            onChange={(next) => updatePanel("A", next)}
            years={years}
            availableMonths={resolvedA.available}
            mapValues={mapValuesFor(resolvedA, districtSeriesA, localSeriesA)}
            values={valuesA}
          />
          <NepalComparePanel
            label="PANEL B"
            chipClassName="bg-accent text-white"
            panel={resolvedB}
            onChange={(next) => updatePanel("B", next)}
            years={years}
            availableMonths={resolvedB.available}
            mapValues={mapValuesFor(resolvedB, districtSeriesB, localSeriesB)}
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
            highlight={
              resolvedA.year !== null ? periodOf(resolvedA.year, resolvedA.month) : undefined
            }
            loading={isLoading}
            height={280}
          />
          <TrendChart
            points={trendB}
            field={resolvedB.variable}
            scope={`B · ${scopeOf(resolvedB)}`}
            highlight={
              resolvedB.year !== null ? periodOf(resolvedB.year, resolvedB.month) : undefined
            }
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
                {NEPAL_INDICATORS.map((row) => {
                  const a = valuesA?.[row.id] ?? null;
                  const b = valuesB?.[row.id] ?? null;
                  const delta = a != null && b != null ? b - a : null;
                  const isComposite = row.id === NEPAL_INDEX;

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-foreground/2 transition-colors ${
                        isComposite ? "bg-accent/4" : ""
                      }`}
                    >
                      <td className="py-3 px-3">
                        <div
                          className={`font-bold text-xs ${
                            isComposite ? "text-accent" : "text-foreground"
                          }`}
                        >
                          {row.name}
                          <span className="text-foreground/40 ml-1.5 font-semibold">
                            {row.short}
                          </span>
                        </div>
                        <div className="text-[9.5px] text-foreground/50">{row.desc}</div>
                      </td>

                      <td
                        className={`py-3 px-3 text-center font-mono font-bold text-xs ${severityOf(a).text}`}
                      >
                        {formatValue(a)}
                      </td>
                      <td
                        className={`py-3 px-3 text-center font-mono font-bold text-xs ${severityOf(b).text}`}
                      >
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
