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
    { id: "ACI", name: "IACI (Index)", desc: "Indian Actuarial Climate Index" },
    { id: "DS", name: "DS (Dry Spell)", desc: "Consecutive Dry Days Anomaly" },
    { id: "PS", name: "PS (Precipitation)", desc: "Extreme Precipitation Anomaly" },
    { id: "T10S", name: "T10S (Cold Extreme)", desc: "Extreme Cold Temperature Anomaly" },
    { id: "T90S", name: "T90S (Hot Extreme)", desc: "Extreme Hot Temperature Anomaly" },
    { id: "W", name: "W (Wind Anomaly)", desc: "Extreme Wind Speed Anomaly" },
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
      
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 sm:px-8 py-8 flex flex-col lg:flex-row gap-8">
        
        {/* PART 1: Left Sidebar - Controls, Filters, Map Shading */}
        <aside className="w-full lg:w-64 flex flex-col gap-6 py-2 flex-shrink-0">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-3">
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
          </div>

          {/* Dynamic Map Heading context */}
          <div className="flex flex-col items-start gap-2">
            <div className="inline-flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase text-[#f26a21]">
              <span className="w-2 h-2 bg-[#f26a21] rounded-full animate-pulse"></span>
              {selectedDistrict 
                ? "District Focus" 
                : selectedState 
                  ? "District Boundaries" 
                  : "State Boundaries"
              }
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight uppercase text-foreground leading-none">
              {selectedDistrict 
                ? `${selectedDistrict}` 
                : selectedState 
                  ? `${selectedState}` 
                  : "India Map"
              }
            </h1>
            <div className="w-12 h-[2.5px] bg-[#f26a21] mt-1" />
          </div>

          {/* Dynamic Back button based on depth */}
          {selectedDistrict ? (
            <button
              onClick={() => setSelectedDistrict(null)}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-bold tracking-widest uppercase border border-[#f26a21] hover:bg-[#f26a21]/5 text-[#f26a21] rounded-md transition-all duration-300"
            >
              ← Back to {selectedState}
            </button>
          ) : selectedState ? (
            <button
              onClick={resetMap}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-bold tracking-widest uppercase border border-[#f26a21] hover:bg-[#f26a21]/5 text-[#f26a21] rounded-md transition-all duration-300"
            >
              ← Back to India Map
            </button>
          ) : null}

          {/* Filters Card */}
          <div className="border border-foreground/10 rounded-xl bg-foreground/2 p-5 flex flex-col gap-5">
            <h3 className="text-xs font-bold tracking-wider uppercase text-foreground/60 border-b border-foreground/10 pb-2">
              Filter Parameters
            </h3>
            
            {/* Year Dropdown */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold tracking-wider uppercase text-foreground/70">
                Select Year
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#fcfcfa] text-foreground border border-foreground/10 hover:border-foreground/30 focus:border-[#f26a21] focus:ring-1 focus:ring-[#f26a21] rounded-md outline-none transition-colors duration-200 text-xs font-semibold tracking-wider uppercase"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            {/* Month Dropdown */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold tracking-wider uppercase text-foreground/70">
                Select Month
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#fcfcfa] text-foreground border border-foreground/10 hover:border-foreground/30 focus:border-[#f26a21] focus:ring-1 focus:ring-[#f26a21] rounded-md outline-none transition-colors duration-200 text-xs font-semibold tracking-wider uppercase"
              >
                {months.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </div>

            {/* Shade Map Selector */}
            <div className="flex flex-col gap-2 border-t border-foreground/10 pt-4 mt-2">
              <label className="text-[10px] font-bold tracking-wider uppercase text-foreground/70">
                Shade Map By
              </label>
              <div className="flex flex-col gap-1.5">
                {variables.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariable(v.id)}
                    className={`w-full text-left px-3 py-2 rounded-md border text-xs font-semibold transition-all duration-200 ${
                      selectedVariable === v.id
                        ? "bg-[#f26a21] border-[#f26a21] text-[#fcfcfa]"
                        : "bg-[#fcfcfa] border-foreground/10 hover:bg-foreground/5 text-foreground"
                    }`}
                  >
                    <div>{v.name}</div>
                    <div className={`text-[9px] font-normal mt-0.5 ${
                      selectedVariable === v.id ? "text-white/80" : "text-foreground/60"
                    }`}>
                      {v.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* PART 2: Center Pane - Map component container and Legend */}
        <main className="flex-grow bg-[#fcfcfa] rounded-2xl shadow-xl border border-foreground/5 p-6 flex flex-col relative overflow-hidden min-w-[300px]">
          <IndiaMap 
            selectedState={selectedState} 
            setSelectedState={setSelectedState} 
            selectedDistrict={selectedDistrict}
            setSelectedDistrict={setSelectedDistrict}
            mapValues={mapValues}
            selectedVariable={selectedVariable}
          />

          {/* Gradient Legend */}
          <div className="mt-5 flex flex-col items-center gap-2 border-t border-foreground/10 pt-4">
            <div className="text-[10px] font-bold tracking-wider uppercase text-foreground/60">
              {variables.find((v) => v.id === selectedVariable)?.name} — z-score scale
            </div>

            {/* Gradient bar */}
            <div className="w-full max-w-lg flex flex-col gap-1">
              <div
                className="w-full h-4 rounded-full shadow-inner"
                style={{
                  background: "linear-gradient(to right, rgba(15,118,110,0.95), rgba(20,184,166,0.7), rgba(94,234,212,0.45), rgba(254,240,138,0.5) 50%, rgba(251,146,60,0.45), rgba(225,29,72,0.7), rgba(136,19,55,0.95))"
                }}
              />

              {/* Zero-Centered & Extreme values only */}
              <div className="relative w-full h-4 mt-0.5">
                <div className="absolute left-0 flex flex-col items-start">
                  <div className="w-px h-1 bg-foreground/30 ml-0.5" />
                  <span className="text-[10px] font-semibold text-foreground/70">-4</span>
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
                  <div className="w-px h-1.5 bg-foreground/50" />
                  <span className="text-[10px] font-bold text-foreground/90">0</span>
                </div>
                <div className="absolute right-0 flex flex-col items-end">
                  <div className="w-px h-1 bg-foreground/30 mr-0.5" />
                  <span className="text-[10px] font-semibold text-foreground/70">+4</span>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* PART 3: Right Pane - Climate Insights / Component values */}
        <section className="w-full lg:w-80 flex flex-col gap-6 py-2 flex-shrink-0">
          <div className="border border-foreground/10 rounded-2xl bg-[#fcfcfa] shadow-xl p-6 flex flex-col h-full gap-5">
            <div>
              <h2 className="text-xs font-bold tracking-widest uppercase text-[#f26a21]">
                Climate Insights
              </h2>
              <h3 className="text-lg font-extrabold tracking-tight uppercase text-foreground leading-tight mt-1">
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
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
                <div className="w-8 h-8 border-4 border-foreground/10 border-t-[#f26a21] rounded-full animate-spin"></div>
                <span className="text-xs font-semibold tracking-wider text-foreground/60 uppercase">Loading Data...</span>
              </div>
            ) : !activeData ? (
              <div className="flex-1 flex items-center justify-center py-12 border border-dashed border-foreground/10 rounded-xl bg-foreground/2">
                <span className="text-xs font-semibold tracking-wider text-foreground/40 uppercase">No Data Available</span>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-5">
                {/* Main ACI Index Value */}
                <div className="border border-[#f26a21]/20 rounded-xl bg-[#f26a21]/5 p-4 flex flex-col gap-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold tracking-wider uppercase text-foreground/70">
                      IACI Index (ACI)
                    </span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 border rounded-full uppercase tracking-wider ${activeStatus?.color}`}>
                      {activeStatus?.label.split(" ")[0]}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-[#f26a21] tracking-tight">
                      {activeData.ACI.toFixed(3)}
                    </span>
                    <span className="text-xs text-foreground/60 font-semibold uppercase tracking-wider">
                      z-score
                    </span>
                  </div>
                </div>

                {/* 5 Components Header */}
                <div className="flex justify-between items-center border-b border-foreground/10 pb-1 mt-1">
                  <h4 className="text-[10px] font-bold tracking-wider uppercase text-foreground/70">
                    Climate Components Anomaly
                  </h4>
                  <span className="text-[8px] font-semibold text-foreground/40 uppercase tracking-wider">
                    z-score (0-centered)
                  </span>
                </div>

                {/* The 5 component rows */}
                <div className="flex flex-col gap-4">
                  {[
                    { id: "DS", name: "Dry Spell (DS)", val: activeData.DS, desc: "Consecutive Dry Days anomaly" },
                    { id: "PS", name: "Precipitation (PS)", val: activeData.PS, desc: "Extreme Precipitation Spell anomaly" },
                    { id: "T10S", name: "Cold Extreme (T10S)", val: activeData.T10S, desc: "Extreme Cold Temperature anomaly" },
                    { id: "T90S", name: "Hot Extreme (T90S)", val: activeData.T90S, desc: "Extreme Hot Temperature anomaly" },
                    { id: "W", name: "Wind Anomaly (W)", val: activeData.W, desc: "Extreme Wind Speed anomaly" }
                  ].map((comp) => {
                    const status = getAnomalyStatus(comp.val);
                    const maxScale = 4.0; // scale from -4.0 to +4.0
                    const clampedVal = Math.max(-maxScale, Math.min(maxScale, comp.val));
                    const widthPct = (Math.abs(clampedVal) / maxScale) * 50; // max 50% width on either side of center
                    const isNegative = comp.val < 0;
                    
                    return (
                      <div key={comp.id} className="flex flex-col gap-1 border-b border-foreground/5 pb-2.5">
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
