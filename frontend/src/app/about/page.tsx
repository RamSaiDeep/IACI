import Header from "../../components/Header";
import Link from "next/link";

export default function AboutPage() {
  const components = [
    {
      id: "T90S",
      title: "Warm Temperature",
      symbol: "T90S",
      badge: "Heat Extreme",
      desc: "Frequency of unusually warm days and nights exceeding the 90th percentile of baseline historical temperatures.",
      color: "from-orange-500/10 to-rose-500/10 border-orange-500/30 text-orange-600",
      accent: "#f97316"
    },
    {
      id: "T10S",
      title: "Cold Temperature",
      symbol: "T10S",
      badge: "Cold Extreme",
      desc: "Frequency of unusually cold days and nights falling below the 10th percentile of baseline historical temperatures.",
      color: "from-teal-500/10 to-cyan-500/10 border-teal-500/30 text-teal-600",
      accent: "#0d9488"
    },
    {
      id: "P",
      title: "Extreme Precipitation",
      symbol: "P / PS",
      badge: "Heavy Rainfall",
      desc: "Monthly maximum consecutive five-day precipitation volume anomaly reflecting intense flood and deluge potential.",
      color: "from-blue-500/10 to-indigo-500/10 border-blue-500/30 text-blue-600",
      accent: "#2563eb"
    },
    {
      id: "D",
      title: "Drought & Dry Spell",
      symbol: "D / DS",
      badge: "Dry Spell",
      desc: "Maximum number of consecutive dry days within each observation window representing moisture deficit and drought stress.",
      color: "from-amber-500/10 to-yellow-500/10 border-amber-500/30 text-amber-600",
      accent: "#d97706"
    },
    {
      id: "W",
      title: "Extreme Wind",
      symbol: "W",
      badge: "Wind Speed",
      desc: "Frequency of unusually high wind-speed days exceeding the 90th percentile of climatological records.",
      color: "from-sky-500/10 to-blue-500/10 border-sky-500/30 text-sky-600",
      accent: "#0284c7"
    },
    {
      id: "SS",
      title: "Sea Level Anomaly",
      symbol: "SS",
      badge: "Coastal Only",
      desc: "Monthly mean sea-level anomaly derived from oceanic reanalysis (applied exclusively to coastal states and districts).",
      color: "from-emerald-500/10 to-teal-500/10 border-emerald-500/30 text-emerald-600",
      accent: "#059669"
    }
  ];

  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 sm:px-8 py-10 flex flex-col gap-12">
        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b2b5f] via-[#103b7b] to-[#071d42] text-white p-8 sm:p-12 shadow-2xl border border-white/10">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-[#f26a21]/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl flex flex-col gap-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 w-fit">
              <span className="w-2 h-2 rounded-full bg-[#f26a21] animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest text-[#f26a21]">
                Actuarial Climate Intelligence
              </span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black tracking-tight uppercase leading-tight">
              About the Indian Actuarial Climate Index (IACI)
            </h1>

            <p className="text-sm sm:text-base text-white/80 leading-relaxed font-light">
              The <strong className="text-white font-semibold">Indian Actuarial Climate Index (IACI)</strong> is a standardized, reproducible framework designed to quantify climate extremes for actuarial applications, including <span className="text-white font-medium">risk management</span>, <span className="text-white font-medium">insurance pricing</span>, and <span className="text-white font-medium">infrastructure planning</span> across India.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#f26a21] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#d65715] transition-all shadow-lg hover:shadow-[#f26a21]/30 hover:-translate-y-0.5"
              >
                Explore Interactive Map
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
          </div>
        </section>

        {/* Core Methodology Pillars */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-1 border-b border-foreground/10 pb-3">
            <h2 className="text-xs font-bold tracking-widest uppercase text-[#f26a21]">
              Scientific Foundations
            </h2>
            <h3 className="text-2xl font-extrabold tracking-tight uppercase text-foreground">
              Core Methodology
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Pillar 1 */}
            <div className="p-6 rounded-2xl bg-[#fcfcfa] border border-foreground/10 shadow-lg flex flex-col gap-3 relative overflow-hidden group hover:border-[#f26a21]/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#f26a21]/10 text-[#f26a21] flex items-center justify-center font-black text-sm">
                01
              </div>
              <h4 className="text-base font-bold uppercase text-foreground tracking-tight">
                Spatial Framework
              </h4>
              <p className="text-xs text-foreground/70 leading-relaxed">
                Utilizes a rigorous <strong>&ldquo;grid-cell-first&rdquo;</strong> architecture. Climate extreme components are computed independently for every ERA5 high-resolution grid cell before being aggregated to administrative district and state boundaries.
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="p-6 rounded-2xl bg-[#fcfcfa] border border-foreground/10 shadow-lg flex flex-col gap-3 relative overflow-hidden group hover:border-[#f26a21]/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-teal-600/10 text-teal-600 flex items-center justify-center font-black text-sm">
                02
              </div>
              <h4 className="text-base font-bold uppercase text-foreground tracking-tight">
                Reference Period
              </h4>
              <p className="text-xs text-foreground/70 leading-relaxed">
                Standardized against the <strong>1991–2020 climatological baseline reference period</strong> (WMO standard 30-year climate norm). Every index output reflects normalized statistical anomalies (<span className="italic">z-scores</span>).
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="p-6 rounded-2xl bg-[#fcfcfa] border border-foreground/10 shadow-lg flex flex-col gap-3 relative overflow-hidden group hover:border-[#f26a21]/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center font-black text-sm">
                03
              </div>
              <h4 className="text-base font-bold uppercase text-foreground tracking-tight">
                Reanalysis Datasets
              </h4>
              <p className="text-xs text-foreground/70 leading-relaxed">
                Leverages <strong>ECMWF ERA5-Land</strong> reanalysis data for high-resolution temperature, precipitation, drought, and wind dynamics, paired with <strong>ORAS5</strong> global ocean reanalysis for sea-level anomalies.
              </p>
            </div>
          </div>
        </section>

        {/* The 6 Standardized Climate Components */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-1 border-b border-foreground/10 pb-3">
            <h2 className="text-xs font-bold tracking-widest uppercase text-[#f26a21]">
              Sub-Index Indicators
            </h2>
            <h3 className="text-2xl font-extrabold tracking-tight uppercase text-foreground">
              The 6 Climate Components
            </h3>
            <p className="text-xs text-foreground/60">
              The IACI harmonizes six independently calculated standardized components measuring distinct physical climate hazards.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {components.map((c) => (
              <div
                key={c.id}
                className="p-5 rounded-2xl bg-[#fcfcfa] border border-foreground/10 shadow-md flex flex-col gap-3 hover:shadow-xl transition-all"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black tracking-wider uppercase px-2.5 py-1 rounded-md bg-foreground/5 text-foreground">
                    {c.symbol}
                  </span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 border rounded-full uppercase tracking-wider ${c.color}`}>
                    {c.badge}
                  </span>
                </div>

                <div>
                  <h4 className="text-sm font-bold uppercase text-foreground tracking-tight">
                    {c.title}
                  </h4>
                  <p className="text-xs text-foreground/70 leading-relaxed mt-1">
                    {c.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Composite Calculation & Interpretation */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Composite Index Calculation Card */}
          <div className="p-8 rounded-3xl bg-[#fcfcfa] border border-foreground/10 shadow-xl flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-xs font-bold tracking-widest uppercase text-[#f26a21]">
                Mathematical Aggregation
              </h2>
              <h3 className="text-xl font-extrabold tracking-tight uppercase text-foreground">
                Composite Index Formulation
              </h3>
            </div>

            <div className="flex flex-col gap-4 text-xs text-foreground/80 leading-relaxed">
              <div className="p-4 rounded-xl bg-foreground/5 border border-foreground/10 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground uppercase tracking-wide">Coastal Regions</span>
                  <span className="text-[10px] font-semibold text-foreground/50">6 Components</span>
                </div>
                <code className="text-xs text-[#f26a21] font-mono font-bold bg-white/70 px-2 py-1 rounded border border-foreground/5">
                  IACI = (T90S + T10S + P + D + W + SS) / 6
                </code>
                <p className="text-[11px] text-foreground/60">
                  Calculated as the arithmetic mean of all six standardized components, including oceanic sea-level anomaly.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-foreground/5 border border-foreground/10 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground uppercase tracking-wide">Inland Regions</span>
                  <span className="text-[10px] font-semibold text-foreground/50">5 Components</span>
                </div>
                <code className="text-xs text-[#f26a21] font-mono font-bold bg-white/70 px-2 py-1 rounded border border-foreground/5">
                  IACI = (T90S + T10S + P + D + W) / 5
                </code>
                <p className="text-[11px] text-foreground/60">
                  Computed as the mean of the five land-based components, ensuring inland areas are not unfairly penalized for lacking a coastline.
                </p>
              </div>
            </div>
          </div>

          {/* Interpretation & Limitations Card */}
          <div className="p-8 rounded-3xl bg-[#fcfcfa] border border-foreground/10 shadow-xl flex flex-col gap-5 justify-between">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-xs font-bold tracking-widest uppercase text-[#f26a21]">
                  Analytical Scope
                </h2>
                <h3 className="text-xl font-extrabold tracking-tight uppercase text-foreground">
                  Interpretation &amp; Scope
                </h3>
              </div>

              <div className="flex flex-col gap-3 text-xs text-foreground/75 leading-relaxed">
                <p>
                  <strong className="text-foreground">Standardized Departures:</strong> The IACI measures standardized departures from historical norms. Larger positive values indicate that multiple climate hazards are simultaneously exceeding historical baseline behavior.
                </p>
                <p>
                  <strong className="text-foreground">Physical Hazard vs. Economic Impact:</strong> The IACI quantifies <em>physical climate hazard intensity</em>, not direct economic loss, insurance claim payouts, or societal vulnerability.
                </p>
                <p>
                  <strong className="text-foreground">Complementary Component Reporting:</strong> The composite index is intended for use in conjunction with individual component reporting to pinpoint the specific meteorological drivers of change across any region.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[11px] text-amber-900 leading-snug font-medium">
                IACI relies on continuous state-of-the-art reanalysis models (ERA5 &amp; ORAS5) to provide objective, reproducible, and verifiable climate metrics.
              </span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
