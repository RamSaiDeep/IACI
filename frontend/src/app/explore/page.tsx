"use client";

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import IndiaMap from "../../components/IndiaMap";
import Link from "next/link";

interface ClimateDataRow {
  year: number;
  month: number;
  ACI: number;
  DS: number;
  PS: number;
  T10S: number;
  T90S: number;
  W: number;
}

export default function ExplorePage() {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState("2025");
  const [selectedMonth, setSelectedMonth] = useState("December");
  const [selectedVariable, setSelectedVariable] = useState("ACI");

  // Real climate dataset states
  const [indiaData, setIndiaData] = useState<ClimateDataRow[]>([]);
  const [stateData, setStateData] = useState<{ [key: string]: ClimateDataRow[] }>({});
  const [districtData, setDistrictData] = useState<{ [key: string]: ClimateDataRow[] }>({});
  const [loadingData, setLoadingData] = useState(false);

  // Years from 1991 to 2026
  const years = Array.from({ length: 2026 - 1991 + 1 }, (_, i) => String(2026 - i));
  
  // Months from January to December
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const monthMap: { [key: string]: number } = {
    "January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6,
    "July": 7, "August": 8, "September": 9, "October": 10, "November": 11, "December": 12
  };

  const variables = [
    { id: "ACI", name: "IACI (Index)", shortName: "IACI", desc: "Indian Actuarial Climate Index" },
    { id: "DS", name: "DS (Dry Spell)", shortName: "DS", desc: "Consecutive Dry Days Anomaly", disabled: true },
    { id: "PS", name: "PS (Precipitation)", shortName: "PS", desc: "Extreme Precipitation Anomaly" },
    { id: "T10S", name: "T10S (Cold Extreme)", shortName: "T10S", desc: "Extreme Cold Temperature Anomaly" },
    { id: "T90S", name: "T90S (Hot Extreme)", shortName: "T90S", desc: "Extreme Hot Temperature Anomaly" },
    { id: "W", name: "W (Wind Anomaly)", shortName: "W", desc: "Extreme Wind Speed Anomaly" },
  ];

  // Helper to normalize names
  const normalizeName = (name: string | null) => {
    if (!name) return "";
    return name.trim().toUpperCase();
  };

  // Fetch India and State data on load
  useEffect(() => {
    fetch("/data/india_data.json")
      .then((r) => r.json())
      .then((data) => setIndiaData(data))
      .catch((err) => console.error("Error loading India data:", err));
      
    fetch("/data/state_data.json")
      .then((r) => r.json())
      .then((data) => setStateData(data))
      .catch((err) => console.error("Error loading State data:", err));
  }, []);

  // Fetch District data when a state is selected
  useEffect(() => {
    if (!selectedState) {
      setDistrictData({});
      return;
    }
    
    setLoadingData(true);
    const safeName = selectedState
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
       
    fetch(`/data/districts/${safeName}.json`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load district data");
        return r.json();
      })
      .then((data) => {
        setDistrictData(data);
        setLoadingData(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadingData(false);
      });
  }, [selectedState]);

  // Helper to reset map parameters completely
  const resetMap = () => {
    setSelectedState(null);
    setSelectedDistrict(null);
  };

  const activeYearNum = parseInt(selectedYear);
  const activeMonthNum = monthMap[selectedMonth] || 1;

  // Calculate active lookup values for insights
  const getActiveData = (): ClimateDataRow | null => {
    if (selectedDistrict) {
      const list = (districtData && districtData[normalizeName(selectedDistrict)]) || [];
      return list.find((r) => r.year === activeYearNum && r.month === activeMonthNum) || null;
    } else if (selectedState) {
      const list = (stateData && stateData[normalizeName(selectedState)]) || [];
      return list.find((r) => r.year === activeYearNum && r.month === activeMonthNum) || null;
    } else {
      return (indiaData && indiaData.find((r) => r.year === activeYearNum && r.month === activeMonthNum)) || null;
    }
  };

  const activeData = getActiveData();

  // Compute map values dictionary for choropleth rendering
  const mapValues: { [key: string]: number } = {};
  if (selectedState) {
    if (districtData) {
      Object.entries(districtData).forEach(([dName, list]) => {
        if (list && Array.isArray(list)) {
          const row = list.find((r) => r.year === activeYearNum && r.month === activeMonthNum);
          if (row) {
            mapValues[normalizeName(dName)] = (row as any)[selectedVariable] ?? 0;
          }
        }
      });
    }
  } else {
    if (stateData) {
      Object.entries(stateData).forEach(([sName, list]) => {
        if (list && Array.isArray(list)) {
          const row = list.find((r) => r.year === activeYearNum && r.month === activeMonthNum);
          if (row) {
            mapValues[normalizeName(sName)] = (row as any)[selectedVariable] ?? 0;
          }
        }
      });
    }
  }

  // Get color and severity labels based on z-score value
  const getAnomalyStatus = (val: number) => {
    if (val < -1) return { label: "Below Normal", color: "bg-teal-600/15 text-teal-800 border-teal-600/30", barColor: "bg-teal-600" };
    if (val <= 0) return { label: "Near Normal", color: "bg-teal-400/20 text-teal-700 border-teal-400/30", barColor: "bg-teal-400" };
    if (val <= 1) return { label: "Moderate", color: "bg-amber-400/20 text-amber-700 border-amber-400/30", barColor: "bg-amber-400" };
    if (val <= 2) return { label: "Elevated", color: "bg-orange-500/20 text-orange-600 border-orange-500/30", barColor: "bg-orange-500" };
    if (val <= 3.5) return { label: "Severe", color: "bg-rose-600/20 text-rose-700 border-rose-600/30", barColor: "bg-rose-600" };
    return { label: "Extreme", color: "bg-rose-950/20 text-rose-950 border-rose-950/30", barColor: "bg-rose-950" };
  };

  const activeStatus = activeData ? getAnomalyStatus(activeData.ACI) : null;

  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      {/* Navigation Header */}
      <Header />
      
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-6 lg:py-8 flex flex-col lg:flex-row gap-6 lg:gap-8">
        
        {/* PART 1: Left Sidebar / Mobile Filter & Context Bar */}
        <aside className="w-full lg:w-64 xl:w-72 flex flex-col gap-4 sm:gap-5 flex-shrink-0">
          
          {/* Breadcrumbs & Dynamic Map Heading */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/"
                className="text-[10px] font-bold tracking-widest uppercase text-foreground/50 hover:text-foreground transition-colors"
              >
                Home
              </Link>
              <span className="text-[10px] text-foreground/20">/</span>
              <button
                onClick={resetMap}
                className="text-[10px] font-bold tracking-widest uppercase text-[#f26a21] hover:text-[#d65715] transition-colors"
              >
                Explore
              </button>
              {selectedState && (
                <>
                  <span className="text-[10px] text-foreground/20">/</span>
                  <span className="text-[10px] font-semibold uppercase text-foreground/70 truncate max-w-[120px]">
                    {selectedState}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-col items-start gap-1 sm:gap-1.5">
              <div className="inline-flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase text-[#f26a21]">
                <span className="w-2 h-2 bg-accent rounded-full animate-pulse"></span>
                {selectedDistrict 
                  ? "District Focus" 
                  : selectedState 
                    ? "District Boundaries" 
                    : "State Boundaries"
                }
              </div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight uppercase text-foreground leading-tight">
                {selectedDistrict 
                  ? `${selectedDistrict}` 
                  : selectedState 
                    ? `${selectedState}` 
                    : "India Map"
                }
              </h1>
              <div className="w-12 h-[2.5px] bg-accent mt-0.5" />
            </div>
          </div>

          {/* Dynamic Back button based on depth */}
          {selectedDistrict ? (
            <button
              onClick={() => setSelectedDistrict(null)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 text-xs font-bold tracking-widest uppercase border border-[#f26a21] hover:bg-accent/5 text-[#f26a21] rounded-md transition-all duration-300 shadow-sm"
            >
              ← Back to {selectedState}
            </button>
          ) : selectedState ? (
            <button
              onClick={resetMap}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 text-xs font-bold tracking-widest uppercase border border-[#f26a21] hover:bg-accent/5 text-[#f26a21] rounded-md transition-all duration-300 shadow-sm"
            >
              ← Back to India Map
            </button>
          ) : null}

          {/* Filters Card */}
          <div className="border border-foreground/10 rounded-xl bg-foreground/2 p-4 sm:p-5 flex flex-col gap-4 sm:gap-5 shadow-sm">
            <h3 className="text-xs font-bold tracking-wider uppercase text-foreground/60 border-b border-foreground/10 pb-2">
              Filter Parameters
            </h3>
            
            {/* Year & Month Dropdowns (Side by side on mobile/tablet, stacked on desktop sidebar) */}
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
              {/* Year Dropdown */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold tracking-wider uppercase text-foreground/70">
                  Select Year
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full px-3 py-2 bg-surface text-foreground border border-foreground/10 hover:border-foreground/30 focus:border-[#f26a21] focus:ring-1 focus:ring-[#f26a21] rounded-md outline-none transition-colors duration-200 text-xs font-semibold tracking-wider uppercase"
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              {/* Month Dropdown */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold tracking-wider uppercase text-foreground/70">
                  Select Month
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full px-3 py-2 bg-surface text-foreground border border-foreground/10 hover:border-foreground/30 focus:border-[#f26a21] focus:ring-1 focus:ring-[#f26a21] rounded-md outline-none transition-colors duration-200 text-xs font-semibold tracking-wider uppercase"
                >
                  {months.map((month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Shade Map Selector */}
            <div className="flex flex-col gap-2 border-t border-foreground/10 pt-3">
              <label className="text-[10px] font-bold tracking-wider uppercase text-foreground/70">
                Shade Map By
              </label>
              {/* Responsive Grid for mobile / tablet, vertical list on desktop sidebar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2">
                {variables.map((v) => {
                  const isDisabled = (v as any).disabled;
                  return (
                    <button
                      key={v.id}
                      disabled={isDisabled}
                      onClick={() => !isDisabled && setSelectedVariable(v.id)}
                      className={`text-left p-2.5 rounded-md border text-xs font-semibold transition-all duration-200 flex flex-col justify-between ${
                        isDisabled
                          ? "opacity-60 cursor-not-allowed bg-foreground/5 border-dashed border-amber-500/30 text-foreground/50"
                          : selectedVariable === v.id
                            ? "bg-accent border-[#f26a21] text-[#fcfcfa] shadow-sm"
                            : "bg-surface border-foreground/10 hover:bg-foreground/5 text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate">{v.name}</span>
                        {isDisabled && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-800 uppercase tracking-wider flex-shrink-0">
                            Upgrade
                          </span>
                        )}
                      </div>
                      <div className={`text-[9px] font-normal mt-0.5 line-clamp-2 ${
                        isDisabled ? "text-amber-800/70" : selectedVariable === v.id ? "text-white/80" : "text-foreground/60"
                      }`}>
                        {isDisabled ? "Pipeline upgrade in progress" : v.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* PART 2: Center Pane - Map component container and Legend */}
        <main className="flex-1 min-w-0 bg-surface rounded-2xl shadow-xl border border-foreground/5 p-3.5 sm:p-5 lg:p-6 flex flex-col relative overflow-hidden">
          <IndiaMap 
            selectedState={selectedState} 
            setSelectedState={setSelectedState} 
            selectedDistrict={selectedDistrict}
            setSelectedDistrict={setSelectedDistrict}
            mapValues={mapValues}
            selectedVariable={selectedVariable}
            heightClassName="h-[45vh] min-h-[300px] max-h-[560px] sm:h-[480px] md:h-[540px] lg:h-[650px] xl:h-[680px] lg:max-h-none"
          />

          {/* Gradient Legend */}
          <div className="mt-4 sm:mt-5 flex flex-col items-center gap-2 border-t border-foreground/10 pt-3.5 sm:pt-4">
            <div className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase text-foreground/60 text-center">
              {variables.find((v) => v.id === selectedVariable)?.name} — z-score scale
            </div>

            {/* Gradient bar */}
            <div className="w-full max-w-lg flex flex-col gap-1 px-1 sm:px-0">
              <div
                className="w-full h-3.5 sm:h-4 rounded-full shadow-inner"
                style={{
                  background: "linear-gradient(to right, rgba(15,118,110,0.95), rgba(20,184,166,0.7), rgba(94,234,212,0.45), rgba(254,240,138,0.5) 50%, rgba(251,146,60,0.45), rgba(225,29,72,0.7), rgba(136,19,55,0.95))"
                }}
              />

              {/* Zero-Centered & Extreme values only */}
              <div className="relative w-full h-4 mt-0.5">
                <div className="absolute left-0 flex flex-col items-start">
                  <div className="w-px h-1 bg-foreground/30 ml-0.5" />
                  <span className="text-[9px] sm:text-[10px] font-semibold text-foreground/70">-4</span>
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
                  <div className="w-px h-1.5 bg-foreground/50" />
                  <span className="text-[9px] sm:text-[10px] font-bold text-foreground/90">0</span>
                </div>
                <div className="absolute right-0 flex flex-col items-end">
                  <div className="w-px h-1 bg-foreground/30 mr-0.5" />
                  <span className="text-[9px] sm:text-[10px] font-semibold text-foreground/70">+4</span>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* PART 3: Right Pane - Climate Insights / Component values */}
        <section className="w-full lg:w-80 xl:w-84 flex flex-col gap-4 sm:gap-6 flex-shrink-0">
          <div className="border border-foreground/10 rounded-2xl bg-surface shadow-xl p-4 sm:p-6 flex flex-col h-full gap-4 sm:gap-5">
            <div>
              <h2 className="text-[10px] sm:text-xs font-bold tracking-widest uppercase text-[#f26a21]">
                Climate Insights
              </h2>
              <h3 className="text-base sm:text-lg font-extrabold tracking-tight uppercase text-foreground leading-tight mt-0.5 sm:mt-1 truncate">
                {selectedDistrict 
                  ? `${selectedDistrict}` 
                  : selectedState 
                    ? `${selectedState}` 
                    : "INDIA OVERALL"
                }
              </h3>
              <p className="text-[10px] text-foreground/60 tracking-wider uppercase font-semibold mt-0.5">
                {selectedMonth} {selectedYear}
              </p>
            </div>

            {loadingData ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8 sm:py-12">
                <div className="w-8 h-8 border-4 border-foreground/10 border-t-[#f26a21] rounded-full animate-spin"></div>
                <span className="text-xs font-semibold tracking-wider text-foreground/60 uppercase">Loading Data...</span>
              </div>
            ) : !activeData ? (
              <div className="flex-1 flex items-center justify-center py-8 sm:py-12 border border-dashed border-foreground/10 rounded-xl bg-foreground/2">
                <span className="text-xs font-semibold tracking-wider text-foreground/40 uppercase">No Data Available</span>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4 sm:gap-5">
                {/* Main ACI Index Value */}
                <div className="border border-[#f26a21]/20 rounded-xl bg-accent/5 p-3.5 sm:p-4 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold tracking-wider uppercase text-foreground/70">
                      IACI Index (ACI)
                    </span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 border rounded-full uppercase tracking-wider ${activeStatus?.color}`}>
                      {activeStatus?.label.split(" ")[0]}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-black text-[#f26a21] tracking-tight">
                      {activeData.ACI.toFixed(3)}
                    </span>
                    <span className="text-xs text-foreground/60 font-semibold uppercase tracking-wider">
                      z-score
                    </span>
                  </div>
                </div>

                {/* 5 Components Header */}
                <div className="flex justify-between items-center border-b border-foreground/10 pb-1 mt-0.5">
                  <h4 className="text-[10px] font-bold tracking-wider uppercase text-foreground/70">
                    Climate Components Anomaly
                  </h4>
                  <span className="text-[8px] font-semibold text-foreground/40 uppercase tracking-wider">
                    z-score (0-centered)
                  </span>
                </div>

                {/* The 5 component rows */}
                <div className="flex flex-col gap-3.5 sm:gap-4">
                  {[
                    { id: "DS", name: "Dry Spell (DS)", val: activeData.DS, desc: "Consecutive Dry Days anomaly", isUnderUpgrade: true },
                    { id: "PS", name: "Precipitation (PS)", val: activeData.PS, desc: "Extreme Precipitation Spell anomaly" },
                    { id: "T10S", name: "Cold Extreme (T10S)", val: activeData.T10S, desc: "Extreme Cold Temperature anomaly" },
                    { id: "T90S", name: "Hot Extreme (T90S)", val: activeData.T90S, desc: "Extreme Hot Temperature anomaly" },
                    { id: "W", name: "Wind Anomaly (W)", val: activeData.W, desc: "Extreme Wind Speed anomaly" }
                  ].map((comp) => {
                    if (comp.isUnderUpgrade) {
                      return (
                        <div key={comp.id} className="flex flex-col gap-1.5 border-b border-foreground/5 pb-2.5 sm:pb-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-foreground/70 tracking-wide uppercase">
                              {comp.name}
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-[8.5px] sm:text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-amber-500/10 text-amber-700 border border-amber-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                              Upgrade in Progress
                            </span>
                          </div>
                          <div className="p-2 sm:p-2.5 rounded-lg bg-foreground/3 border border-dashed border-amber-500/30 flex items-center gap-2">
                            <span className="text-sm">⚙️</span>
                            <div className="text-[9.5px] sm:text-[10px] text-foreground/60 leading-tight">
                              Drought &amp; Dry Spell (DS) anomaly metric is undergoing pipeline &amp; recalibration upgrade. Values are temporarily hidden.
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const status = getAnomalyStatus(comp.val);
                    const maxScale = 4.0; // scale from -4.0 to +4.0
                    const clampedVal = Math.max(-maxScale, Math.min(maxScale, comp.val));
                    const widthPct = (Math.abs(clampedVal) / maxScale) * 50; // max 50% width on either side of center
                    const isNegative = comp.val < 0;
                    
                    return (
                      <div key={comp.id} className="flex flex-col gap-1 border-b border-foreground/5 pb-2 sm:pb-2.5">
                        <div className="flex justify-between items-baseline">
                          <div>
                            <span className="text-xs font-bold text-foreground/80 tracking-wide uppercase">
                              {comp.name}
                            </span>
                          </div>
                          <span className={`text-xs font-black tracking-tight ${
                            comp.val < -1 ? "text-teal-700" :
                            comp.val <= 0 ? "text-teal-500" :
                            comp.val <= 1 ? "text-amber-600" :
                            comp.val <= 2 ? "text-orange-500" :
                            comp.val <= 3.5 ? "text-rose-600" : "text-rose-950"
                          }`}>
                            {comp.val >= 0 ? "+" : ""}{comp.val.toFixed(2)}
                          </span>
                        </div>
                        
                        <div className="text-[9px] text-foreground/50 normal-case">
                          {comp.desc}
                        </div>

                        {/* Zero-Centered Diverging Progress Bar Container */}
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <div className="w-full h-2.5 bg-foreground/5 rounded-full overflow-hidden relative flex items-center">
                            {/* Center Zero Baseline Indicator */}
                            <div className="absolute left-1/2 top-0 bottom-0 w-[1.5px] bg-foreground/25 z-10 -translate-x-1/2" />

                            {/* Negative (Left) or Positive (Right) Bar */}
                            <div 
                              className={`h-full absolute transition-all duration-300 ${status.barColor} ${
                                isNegative ? "rounded-l-full" : "rounded-r-full"
                              }`}
                              style={{ 
                                left: isNegative ? `${50 - widthPct}%` : "50%",
                                width: `${widthPct}%` 
                              }}
                            />
                          </div>

                          {/* Zero-Centered Axis Scale Markers: Extreme and Centre values only */}
                          <div className="flex justify-between text-[7.5px] font-semibold text-foreground/45 px-0.5">
                            <span>-4</span>
                            <span className="text-foreground/70 font-bold">0</span>
                            <span>+4</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
