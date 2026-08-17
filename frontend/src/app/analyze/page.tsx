"use client";

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import IndiaMap from "../../components/IndiaMap";

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

export default function AnalyzePage() {
  // Common Climate Datasets
  const [indiaData, setIndiaData] = useState<ClimateDataRow[]>([]);
  const [stateData, setStateData] = useState<{ [key: string]: ClimateDataRow[] }>({});

  // Panel A State
  const [stateA, setStateA] = useState<string | null>(null);
  const [districtA, setDistrictA] = useState<string | null>(null);
  const [yearA, setYearA] = useState("2024");
  const [monthA, setMonthA] = useState("July");
  const [variableA, setVariableA] = useState("ACI");
  const [districtDataA, setDistrictDataA] = useState<{ [key: string]: ClimateDataRow[] }>({});

  // Panel B State
  const [stateB, setStateB] = useState<string | null>(null);
  const [districtB, setDistrictB] = useState<string | null>(null);
  const [yearB, setYearB] = useState("2004");
  const [monthB, setMonthB] = useState("July");
  const [variableB, setVariableB] = useState("ACI");
  const [districtDataB, setDistrictDataB] = useState<{ [key: string]: ClimateDataRow[] }>({});

  // Sync mode options
  const [syncVariable, setSyncVariable] = useState(true);

  // Years from 1991 to 2026
  const years = Array.from({ length: 2026 - 1991 + 1 }, (_, i) => String(2026 - i));

  // Months
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
    { id: "DS", name: "DS (Dry Spell) [Upgrade in Progress]", desc: "Consecutive Dry Days Anomaly", disabled: true },
    { id: "PS", name: "PS (Precipitation)", desc: "Extreme Precipitation Anomaly" },
    { id: "T10S", name: "T10S (Cold Extreme)", desc: "Extreme Cold Temperature Anomaly" },
    { id: "T90S", name: "T90S (Hot Extreme)", desc: "Extreme Hot Temperature Anomaly" },
    { id: "W", name: "W (Wind Anomaly)", desc: "Extreme Wind Speed Anomaly" },
  ];

  const normalizeName = (name: string | null) => {
    if (!name) return "";
    return name.trim().toUpperCase();
  };

  // Fetch baseline dataset on load
  useEffect(() => {
    fetch("/data/india_data.json")
      .then((r) => r.json())
      .then((data) => setIndiaData(data))
      .catch((err) => console.error("Error loading India data:", err));

    fetch("/data/state_data.json")
      .then((r) => r.json())
      .then((data) => {
        setStateData(data);
      })
      .catch((err) => console.error("Error loading State data:", err));
  }, []);

  // Fetch District data for Panel A
  useEffect(() => {
    if (!stateA) {
      setDistrictDataA({});
      return;
    }
    const safeName = stateA.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    fetch(`/data/districts/${safeName}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        setDistrictDataA(data);
      })
      .catch(() => {});
  }, [stateA]);

  // Fetch District data for Panel B
  useEffect(() => {
    if (!stateB) {
      setDistrictDataB({});
      return;
    }
    const safeName = stateB.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    fetch(`/data/districts/${safeName}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        setDistrictDataB(data);
      })
      .catch(() => {});
  }, [stateB]);

  // Handle variable sync
  const handleVariableChangeA = (v: string) => {
    setVariableA(v);
    if (syncVariable) setVariableB(v);
  };

  const handleVariableChangeB = (v: string) => {
    setVariableB(v);
    if (syncVariable) setVariableA(v);
  };

  // Calculate Active Data for Panel A
  const activeYearA = parseInt(yearA);
  const activeMonthA = monthMap[monthA] || 1;
  const getActiveDataA = (): ClimateDataRow | null => {
    if (districtA) {
      const list = districtDataA[normalizeName(districtA)] || [];
      return list.find((r) => r.year === activeYearA && r.month === activeMonthA) || null;
    } else if (stateA) {
      const list = stateData[normalizeName(stateA)] || [];
      return list.find((r) => r.year === activeYearA && r.month === activeMonthA) || null;
    } else {
      return indiaData.find((r) => r.year === activeYearA && r.month === activeMonthA) || null;
    }
  };
  const dataA = getActiveDataA();

  // Calculate Map Values for Panel A
  const mapValuesA: { [key: string]: number } = {};
  if (stateA) {
    Object.entries(districtDataA).forEach(([dName, list]) => {
      const row = list?.find((r) => r.year === activeYearA && r.month === activeMonthA);
      if (row) mapValuesA[normalizeName(dName)] = (row as any)[variableA] ?? 0;
    });
  } else {
    Object.entries(stateData).forEach(([sName, list]) => {
      const row = list?.find((r) => r.year === activeYearA && r.month === activeMonthA);
      if (row) mapValuesA[normalizeName(sName)] = (row as any)[variableA] ?? 0;
    });
  }

  // Calculate Active Data for Panel B
  const activeYearB = parseInt(yearB);
  const activeMonthB = monthMap[monthB] || 1;
  const getActiveDataB = (): ClimateDataRow | null => {
    if (districtB) {
      const list = districtDataB[normalizeName(districtB)] || [];
      return list.find((r) => r.year === activeYearB && r.month === activeMonthB) || null;
    } else if (stateB) {
      const list = stateData[normalizeName(stateB)] || [];
      return list.find((r) => r.year === activeYearB && r.month === activeMonthB) || null;
    } else {
      return indiaData.find((r) => r.year === activeYearB && r.month === activeMonthB) || null;
    }
  };
  const dataB = getActiveDataB();

  // Calculate Map Values for Panel B
  const mapValuesB: { [key: string]: number } = {};
  if (stateB) {
    Object.entries(districtDataB).forEach(([dName, list]) => {
      const row = list?.find((r) => r.year === activeYearB && r.month === activeMonthB);
      if (row) mapValuesB[normalizeName(dName)] = (row as any)[variableB] ?? 0;
    });
  } else {
    Object.entries(stateData).forEach(([sName, list]) => {
      const row = list?.find((r) => r.year === activeYearB && r.month === activeMonthB);
      if (row) mapValuesB[normalizeName(sName)] = (row as any)[variableB] ?? 0;
    });
  }

  // Comparison metrics definition
  const comparisonRows = [
    { key: "ACI", name: "IACI Index", desc: "Composite Climate Hazard" },
    { key: "T90S", name: "Warm Extreme (T90S)", desc: "Hot Days & Nights Anomaly" },
    { key: "T10S", name: "Cold Extreme (T10S)", desc: "Cold Days & Nights Anomaly" },
    { key: "PS", name: "Precipitation (PS)", desc: "Consecutive Heavy Rainfall Anomaly" },
    { key: "DS", name: "Dry Spell (DS)", desc: "Consecutive Dry Days Anomaly", isUnderUpgrade: true },
    { key: "W", name: "Wind Anomaly (W)", desc: "Extreme Wind Speed Anomaly" },
  ];

  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      <Header />

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-3.5 sm:px-6 py-4 sm:py-6 flex flex-col gap-5 sm:gap-6">
        
        {/* Top Control Bar */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-[#fcfcfa] border border-foreground/10 shadow-lg">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#f26a21] animate-pulse" />
              <h1 className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#f26a21]">
                Comparative Analytics
              </h1>
            </div>
            <h2 className="text-lg sm:text-2xl font-black uppercase text-foreground tracking-tight mt-0.5">
              Side-by-Side Climate Hazard Comparison
            </h2>
          </div>

          {/* Quick Comparison Options */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSyncVariable(!syncVariable)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase border transition-all flex items-center gap-1.5 ${
                syncVariable
                  ? "bg-[#f26a21]/15 text-[#f26a21] border-[#f26a21]/40"
                  : "bg-foreground/5 text-foreground/60 border-foreground/10 hover:bg-foreground/10"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Sync Variable: {syncVariable ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Dual Side-by-Side Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
          
          {/* ================= PANEL A ================= */}
          <div className="flex flex-col gap-3.5 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-[#fcfcfa] border border-foreground/10 shadow-xl">
            {/* Header & Controls Panel A */}
            <div className="flex flex-col gap-2.5 sm:gap-3 pb-3 border-b border-foreground/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-[#0b2b5f] text-white font-black text-[11px] sm:text-xs">
                    PANEL A
                  </span>
                  <span className="text-xs font-bold uppercase text-foreground/80 truncate max-w-[200px]">
                    {districtA ? `${districtA}, ${stateA}` : stateA ? `${stateA}` : "India Overall"}
                  </span>
                </div>
                {(stateA || districtA) && (
                  <button
                    onClick={() => {
                      setStateA(null);
                      setDistrictA(null);
                    }}
                    className="text-[10px] font-bold text-[#f26a21] hover:underline uppercase"
                  >
                    Reset Map
                  </button>
                )}
              </div>

              {/* Filter Dropdowns for Panel A */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[8.5px] sm:text-[9px] font-bold uppercase text-foreground/50">Year</label>
                  <select
                    value={yearA}
                    onChange={(e) => setYearA(e.target.value)}
                    className="w-full bg-white border border-foreground/15 rounded-lg px-2 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:border-[#f26a21]"
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[8.5px] sm:text-[9px] font-bold uppercase text-foreground/50">Month</label>
                  <select
                    value={monthA}
                    onChange={(e) => setMonthA(e.target.value)}
                    className="w-full bg-white border border-foreground/15 rounded-lg px-2 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:border-[#f26a21]"
                  >
                    {months.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[8.5px] sm:text-[9px] font-bold uppercase text-foreground/50">Variable</label>
                  <select
                    value={variableA}
                    onChange={(e) => handleVariableChangeA(e.target.value)}
                    className="w-full bg-white border border-foreground/15 rounded-lg px-2 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:border-[#f26a21]"
                  >
                    {variables.map((v) => (
                      <option key={v.id} value={v.id} disabled={(v as any).disabled}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Map Container Panel A */}
            <div className="relative">
              <IndiaMap
                selectedState={stateA}
                setSelectedState={setStateA}
                selectedDistrict={districtA}
                setSelectedDistrict={setDistrictA}
                mapValues={mapValuesA}
                selectedVariable={variableA}
                heightClassName="h-[40vh] min-h-[280px] max-h-[460px] sm:h-[460px]"
              />
            </div>

            {/* Quick Metrics Panel A */}
            <div className="p-3 rounded-xl bg-foreground/3 border border-foreground/10 flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase text-foreground/60 truncate max-w-[220px]">
                  {monthA} {yearA} — {variables.find((v) => v.id === variableA)?.name}
                </span>
                <span className="text-xs font-bold text-foreground truncate max-w-[220px]">
                  {districtA || stateA || "India Average"}
                </span>
              </div>
              <div className="text-right flex-shrink-0">
                <span className="text-lg sm:text-xl font-black text-[#f26a21]">
                  {dataA ? (dataA as any)[variableA]?.toFixed(2) : "—"}
                </span>
                <span className="text-[10px] text-foreground/50 ml-1">z</span>
              </div>
            </div>
          </div>

          {/* ================= PANEL B ================= */}
          <div className="flex flex-col gap-3.5 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-[#fcfcfa] border border-foreground/10 shadow-xl">
            {/* Header & Controls Panel B */}
            <div className="flex flex-col gap-2.5 sm:gap-3 pb-3 border-b border-foreground/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-[#f26a21] text-white font-black text-[11px] sm:text-xs">
                    PANEL B
                  </span>
                  <span className="text-xs font-bold uppercase text-foreground/80 truncate max-w-[200px]">
                    {districtB ? `${districtB}, ${stateB}` : stateB ? `${stateB}` : "India Overall"}
                  </span>
                </div>
                {(stateB || districtB) && (
                  <button
                    onClick={() => {
                      setStateB(null);
                      setDistrictB(null);
                    }}
                    className="text-[10px] font-bold text-[#f26a21] hover:underline uppercase"
                  >
                    Reset Map
                  </button>
                )}
              </div>

              {/* Filter Dropdowns for Panel B */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[8.5px] sm:text-[9px] font-bold uppercase text-foreground/50">Year</label>
                  <select
                    value={yearB}
                    onChange={(e) => setYearB(e.target.value)}
                    className="w-full bg-white border border-foreground/15 rounded-lg px-2 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:border-[#f26a21]"
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[8.5px] sm:text-[9px] font-bold uppercase text-foreground/50">Month</label>
                  <select
                    value={monthB}
                    onChange={(e) => setMonthB(e.target.value)}
                    className="w-full bg-white border border-foreground/15 rounded-lg px-2 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:border-[#f26a21]"
                  >
                    {months.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[8.5px] sm:text-[9px] font-bold uppercase text-foreground/50">Variable</label>
                  <select
                    value={variableB}
                    onChange={(e) => handleVariableChangeB(e.target.value)}
                    className="w-full bg-white border border-foreground/15 rounded-lg px-2 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:border-[#f26a21]"
                  >
                    {variables.map((v) => (
                      <option key={v.id} value={v.id} disabled={(v as any).disabled}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Map Container Panel B */}
            <div className="relative">
              <IndiaMap
                selectedState={stateB}
                setSelectedState={setStateB}
                selectedDistrict={districtB}
                setSelectedDistrict={setDistrictB}
                mapValues={mapValuesB}
                selectedVariable={variableB}
                heightClassName="h-[40vh] min-h-[280px] max-h-[460px] sm:h-[460px]"
              />
            </div>

            {/* Quick Metrics Panel B */}
            <div className="p-3 rounded-xl bg-foreground/3 border border-foreground/10 flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase text-foreground/60 truncate max-w-[220px]">
                  {monthB} {yearB} — {variables.find((v) => v.id === variableB)?.name}
                </span>
                <span className="text-xs font-bold text-foreground truncate max-w-[220px]">
                  {districtB || stateB || "India Average"}
                </span>
              </div>
              <div className="text-right flex-shrink-0">
                <span className="text-lg sm:text-xl font-black text-[#f26a21]">
                  {dataB ? (dataB as any)[variableB]?.toFixed(2) : "—"}
                </span>
                <span className="text-[10px] text-foreground/50 ml-1">z</span>
              </div>
            </div>
          </div>

        </div>

        {/* Symmetrical Color Scale Legend */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-[#fcfcfa] border border-foreground/10 shadow-md flex flex-col items-center gap-2">
          <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-foreground/60 text-center">
            Harmonized Zero-Centered Anomaly Scale (z-score)
          </span>
          <div className="w-full max-w-md flex flex-col gap-1 px-1">
            <div
              className="w-full h-3 rounded-full shadow-inner"
              style={{
                background: "linear-gradient(to right, rgba(15,118,110,0.95), rgba(20,184,166,0.7), rgba(94,234,212,0.45), rgba(254,240,138,0.5) 50%, rgba(251,146,60,0.45), rgba(225,29,72,0.7), rgba(136,19,55,0.95))"
              }}
            />
            <div className="flex justify-between text-[8px] sm:text-[9px] font-semibold text-foreground/70 px-0.5">
              <span>-4 (Below Baseline)</span>
              <span className="font-bold text-foreground/90">0</span>
              <span>+4 (Above Baseline)</span>
            </div>
          </div>
        </div>

        {/* Detailed Side-by-Side Component Delta Analysis Table */}
        <div className="p-4 sm:p-6 rounded-2xl bg-[#fcfcfa] border border-foreground/10 shadow-xl flex flex-col gap-3.5 sm:gap-4">
          <div className="flex flex-col gap-1 border-b border-foreground/10 pb-3">
            <h3 className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#f26a21]">
              Quantitative Anomaly Comparison
            </h3>
            <h4 className="text-base sm:text-xl font-extrabold uppercase text-foreground">
              Climate Hazard Components Breakdown &amp; Delta (&Delta;)
            </h4>
          </div>

          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
            <table className="w-full text-left text-xs border-collapse min-w-[550px]">
              <thead>
                <tr className="border-b border-foreground/10 text-foreground/60 uppercase text-[9px] sm:text-[10px] tracking-wider">
                  <th className="py-2 px-2.5 sm:px-3">Climate Component</th>
                  <th className="py-2 px-2.5 sm:px-3 text-center">
                    Panel A ({monthA.slice(0, 3)} {yearA})
                  </th>
                  <th className="py-2 px-2.5 sm:px-3 text-center">
                    Panel B ({monthB.slice(0, 3)} {yearB})
                  </th>
                  <th className="py-2 px-2.5 sm:px-3 text-center">
                    Delta (&Delta;)
                  </th>
                  <th className="py-2 px-2.5 sm:px-3">Hazard Direction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {comparisonRows.map((comp) => {
                  if ((comp as any).isUnderUpgrade) {
                    return (
                      <tr key={comp.key} className="bg-amber-500/5 hover:bg-amber-500/10 transition-colors">
                        <td className="py-2.5 px-2.5 sm:px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-foreground/70 text-xs">{comp.name}</span>
                            <span className="inline-flex items-center gap-1 text-[7.5px] sm:text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider bg-amber-500/15 text-amber-700 border border-amber-500/30">
                              <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse"></span>
                              Upgrade
                            </span>
                          </div>
                          <div className="text-[9.5px] text-foreground/50">{comp.desc}</div>
                        </td>
                        <td colSpan={4} className="py-2.5 px-2.5 sm:px-3 text-center">
                          <span className="text-[10px] sm:text-[11px] font-medium text-amber-800/80 italic inline-flex items-center justify-center gap-1">
                            <span>🛠️</span> Drought &amp; Dry Spell data model is undergoing upgrade
                          </span>
                        </td>
                      </tr>
                    );
                  }

                  const valA = dataA ? (dataA as any)[comp.key] : null;
                  const valB = dataB ? (dataB as any)[comp.key] : null;
                  const hasBoth = valA !== null && valB !== null && valA !== undefined && valB !== undefined;
                  const delta = hasBoth ? valB - valA : null;

                  return (
                    <tr key={comp.key} className="hover:bg-foreground/2 transition-colors">
                      <td className="py-2.5 px-2.5 sm:px-3">
                        <div className="font-bold text-foreground text-xs">{comp.name}</div>
                        <div className="text-[9.5px] text-foreground/50">{comp.desc}</div>
                      </td>

                      <td className="py-2.5 px-2.5 sm:px-3 text-center font-mono font-bold text-xs text-foreground">
                        {valA !== null && valA !== undefined ? (
                          <span className={valA < 0 ? "text-teal-700" : "text-rose-700"}>
                            {valA >= 0 ? "+" : ""}{valA.toFixed(2)}
                          </span>
                        ) : "—"}
                      </td>

                      <td className="py-2.5 px-2.5 sm:px-3 text-center font-mono font-bold text-xs text-foreground">
                        {valB !== null && valB !== undefined ? (
                          <span className={valB < 0 ? "text-teal-700" : "text-rose-700"}>
                            {valB >= 0 ? "+" : ""}{valB.toFixed(2)}
                          </span>
                        ) : "—"}
                      </td>

                      <td className="py-2.5 px-2.5 sm:px-3 text-center">
                        {delta !== null ? (
                          <span className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full font-mono font-bold text-[10px] sm:text-[11px] ${
                            delta > 0.1
                              ? "bg-rose-500/15 text-rose-700"
                              : delta < -0.1
                                ? "bg-teal-500/15 text-teal-700"
                                : "bg-foreground/5 text-foreground/70"
                          }`}>
                            {delta >= 0 ? "+" : ""}{delta.toFixed(2)}
                          </span>
                        ) : "—"}
                      </td>

                      <td className="py-2.5 px-2.5 sm:px-3">
                        {delta !== null ? (
                          delta > 0.1 ? (
                            <span className="text-[10px] sm:text-[11px] font-semibold text-rose-700">
                              Higher hazard in Panel B (+{delta.toFixed(2)} &sigma;)
                            </span>
                          ) : delta < -0.1 ? (
                            <span className="text-[10px] sm:text-[11px] font-semibold text-teal-700">
                              Lower hazard in Panel B ({delta.toFixed(2)} &sigma;)
                            </span>
                          ) : (
                            <span className="text-[10px] sm:text-[11px] font-medium text-foreground/60">
                              Comparable baseline (&plusmn;0.1 &sigma;)
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] text-foreground/40">Insufficient data</span>
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
