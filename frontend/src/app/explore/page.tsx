"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Header from "../../components/Header";
import IndiaMap from "../../components/IndiaMap";
import ScaleLegend from "../../components/ScaleLegend";
import { CompositeValue, ComponentBars } from "../../components/ClimateReadout";
import TrendChart from "../../components/TrendChart";
import { INDICATORS } from "../../lib/indicators";
import { buildTrend } from "../../lib/trend";
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
import type { Field, RegionSeries, Series } from "../../lib/climate";

export default function ExplorePage() {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  // null means "follow the data" — the newest year and month on offer. Both are
  // resolved below rather than seeded by an effect.
  const [yearChoice, setYearChoice] = useState<number | null>(null);
  const [monthChoice, setMonthChoice] = useState<number | null>(null);
  const [variable, setVariable] = useState<Field>("IACI");

  const [indiaSeries, setIndiaSeries] = useState<Series | null>(null);
  const [stateSeries, setStateSeries] = useState<RegionSeries | null>(null);
  const [districts, setDistricts] = useState<{ state: string; data: RegionSeries } | null>(
    null
  );

  const districtSeries =
    selectedState && districts?.state === selectedState ? districts.data : null;
  const loadingDistricts = Boolean(selectedState) && districtSeries === null;

  useEffect(() => {
    loadIndia()
      .then(setIndiaSeries)
      .catch((err) => console.error("Error loading India data:", err));
    loadStates()
      .then(setStateSeries)
      .catch((err) => console.error("Error loading state data:", err));
  }, []);

  useEffect(() => {
    if (!selectedState) return;

    let active = true;
    loadDistricts(selectedState)
      .then((data) => {
        if (active) setDistricts({ state: selectedState, data });
      })
      .catch((err) => console.error(err));

    return () => {
      active = false;
    };
  }, [selectedState]);

  // Year and month options come from the data itself, so a newly appended month
  // shows up without a code change and an empty one is never offered.
  const years = useMemo(
    () => (indiaSeries ? yearsIn(indiaSeries) : []),
    [indiaSeries]
  );

  // Default to the newest year, and fall back to it if the chosen one vanishes.
  const year = yearChoice != null && years.includes(yearChoice) ? yearChoice : years[0] ?? null;

  const availableMonths = useMemo(
    () => (indiaSeries && year !== null ? monthsIn(indiaSeries, year) : new Set<number>()),
    [indiaSeries, year]
  );

  // Keep the chosen month only while the selected year actually has it —
  // otherwise show that year's latest, so 2026 never lands on an empty month.
  const month =
    monthChoice != null && availableMonths.has(monthChoice)
      ? monthChoice
      : availableMonths.size > 0
        ? Math.max(...availableMonths)
        : 1;

  const period = year !== null ? periodOf(year, month) : 0;

  const activeValues = useMemo(() => {
    if (!period) return null;
    if (selectedDistrict) {
      return districtSeries?.get(normalizeName(selectedDistrict))?.get(period) ?? null;
    }
    if (selectedState) {
      return stateSeries?.get(normalizeName(selectedState))?.get(period) ?? null;
    }
    return indiaSeries?.get(period) ?? null;
  }, [period, selectedDistrict, selectedState, districtSeries, stateSeries, indiaSeries]);

  // Memoised so panning or hovering the map doesn't rebuild the whole lookup.
  const mapValues = useMemo(() => {
    if (!period) return {};
    const regions = selectedState ? districtSeries : stateSeries;
    return regions ? choroplethValues(regions, period, variable) : {};
  }, [period, selectedState, districtSeries, stateSeries, variable]);

  // The series for whichever region is in focus — the chart follows the map's
  // scope and the "shade map by" variable, not the year/month filter, which
  // only marks a position on the full history.
  const focusedSeries = useMemo(() => {
    if (selectedDistrict) return districtSeries?.get(normalizeName(selectedDistrict)) ?? null;
    if (selectedState) return stateSeries?.get(normalizeName(selectedState)) ?? null;
    return indiaSeries;
  }, [selectedDistrict, selectedState, districtSeries, stateSeries, indiaSeries]);

  const trend = useMemo(
    () => (focusedSeries ? buildTrend(focusedSeries, variable) : []),
    [focusedSeries, variable]
  );

  const resetMap = () => {
    setSelectedState(null);
    setSelectedDistrict(null);
  };

  const scopeLabel = selectedDistrict || selectedState || "India";
  const isLoading = !indiaSeries || !stateSeries || (Boolean(selectedState) && loadingDistricts);

  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header />

      <div className="flex-1 max-w-[100rem] mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 lg:py-8 flex flex-col gap-6 lg:gap-7">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-7">
        {/* Filters */}
        <aside className="w-full lg:w-64 xl:w-72 flex flex-col gap-5 flex-shrink-0">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase">
              <Link href="/" className="text-foreground/45 hover:text-foreground transition-colors">
                Home
              </Link>
              <span className="text-foreground/20">/</span>
              <button onClick={resetMap} className="text-accent hover:text-accent-strong transition-colors">
                Explore
              </button>
              {selectedState && (
                <>
                  <span className="text-foreground/20">/</span>
                  <span className="text-foreground/65 truncate max-w-[110px]">{selectedState}</span>
                </>
              )}
            </div>

            <div className="flex flex-col items-start gap-1.5">
              <div className="eyebrow inline-flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-accent rounded-full" />
                {selectedDistrict ? "District focus" : selectedState ? "District view" : "State view"}
              </div>
              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight uppercase leading-tight">
                {scopeLabel}
              </h1>
              <div className="w-10 h-[3px] bg-accent rounded-full" />
            </div>
          </div>

          {(selectedDistrict || selectedState) && (
            <button
              onClick={() => (selectedDistrict ? setSelectedDistrict(null) : resetMap())}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[11px] font-bold tracking-widest uppercase border border-accent/40 hover:bg-accent/5 text-accent rounded-lg transition-colors"
            >
              ← Back to {selectedDistrict ? selectedState : "India"}
            </button>
          )}

          <div className="card p-5 flex flex-col gap-5">
            <h2 className="text-[10px] font-bold tracking-widest uppercase text-foreground/55 border-b border-foreground/8 pb-2.5">
              Filter parameters
            </h2>

            <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold tracking-widest uppercase text-foreground/65">
                  Year
                </span>
                <select
                  value={year ?? ""}
                  disabled={years.length === 0}
                  onChange={(e) => setYearChoice(Number(e.target.value))}
                  className="field uppercase"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold tracking-widest uppercase text-foreground/65">
                  Month
                </span>
                <select
                  value={month}
                  disabled={availableMonths.size === 0}
                  onChange={(e) => setMonthChoice(Number(e.target.value))}
                  className="field uppercase"
                >
                  {MONTHS.map((name, idx) => {
                    const value = idx + 1;
                    const has = availableMonths.has(value);
                    return (
                      <option key={name} value={value} disabled={!has}>
                        {name}
                        {has ? "" : " — no data"}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-2 border-t border-foreground/8 pt-4">
              <span className="text-[10px] font-bold tracking-widest uppercase text-foreground/65">
                Shade map by
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2">
                {INDICATORS.map((option) => {
                  const isActive = variable === option.id;
                  return (
                    <button
                      key={option.id}
                      onClick={() => setVariable(option.id)}
                      aria-pressed={isActive}
                      className={`text-left p-2.5 rounded-lg border text-[11px] font-semibold transition-colors ${
                        isActive
                          ? "bg-accent border-accent text-white shadow-card"
                          : "bg-surface border-foreground/10 hover:border-foreground/25 hover:bg-foreground/3"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span className="truncate">{option.name}</span>
                        <span className={isActive ? "text-white/60" : "text-foreground/35"}>
                          {option.short}
                        </span>
                      </span>
                      <span
                        className={`block text-[9px] font-normal mt-0.5 leading-tight ${
                          isActive ? "text-white/75" : "text-foreground/55"
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
        <main className="flex-1 min-w-0 card card-lg p-4 sm:p-5 lg:p-6 flex flex-col">
          <IndiaMap
            selectedState={selectedState}
            setSelectedState={setSelectedState}
            selectedDistrict={selectedDistrict}
            setSelectedDistrict={setSelectedDistrict}
            mapValues={mapValues}
            selectedVariable={variable}
            heightClassName="h-map min-h-[300px] max-h-[560px] sm:h-[480px] md:h-[540px] lg:h-[650px] xl:h-[680px] lg:max-h-none"
          />
          <div className="mt-5">
            <ScaleLegend field={variable} />
          </div>
        </main>

        {/* Readout */}
        <section className="w-full lg:w-80 flex flex-col flex-shrink-0">
          <div className="card card-lg p-5 sm:p-6 flex flex-col h-full gap-5">
            <div>
              <h2 className="eyebrow">Climate insights</h2>
              <h3 className="text-lg font-extrabold tracking-tight uppercase leading-tight mt-1 truncate">
                {scopeLabel}
              </h3>
              <p className="text-[10px] text-foreground/55 tracking-widest uppercase font-semibold mt-0.5">
                {year === null ? "—" : `${MONTHS[month - 1]} ${year}`}
              </p>
            </div>

            {isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
                <span className="w-8 h-8 border-[3px] border-foreground/10 border-t-accent rounded-full animate-spin" />
                <span className="text-[11px] font-semibold tracking-widest text-foreground/55 uppercase">
                  Loading data
                </span>
              </div>
            ) : !activeValues ? (
              <div className="flex-1 flex items-center justify-center py-12 border border-dashed border-foreground/12 rounded-xl">
                <span className="text-[11px] font-semibold tracking-widest text-foreground/40 uppercase">
                  No data for this month
                </span>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-5 animate-rise">
                <CompositeValue value={activeValues.IACI} />
                <div className="flex justify-between items-center border-b border-foreground/8 pb-1.5">
                  <h4 className="text-[10px] font-bold tracking-widest uppercase text-foreground/65">
                    Component anomalies
                  </h4>
                  <span className="text-[8.5px] font-semibold text-foreground/40 uppercase tracking-widest">
                    z-score
                  </span>
                </div>
                <ComponentBars values={activeValues} />
              </div>
            )}
          </div>
        </section>
        </div>

        <TrendChart
          points={trend}
          field={variable}
          scope={scopeLabel}
          highlight={period || undefined}
          loading={isLoading}
        />
      </div>
    </div>
  );
}
