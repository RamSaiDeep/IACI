import Link from "next/link";
import type { Metadata } from "next";
import Header from "../../../components/Header";
import FaqSection from "./FaqSection";

export const metadata: Metadata = {
  title: "About & FAQ — Nepal Actuaries Climate Index",
  description:
    "Methodology, climate components, datasets and frequently asked questions for the Nepal Actuaries Climate Index (NACI).",
};

const atAGlance = [
  { value: "5", label: "Climate components" },
  { value: "1991–2020", label: "Baseline period" },
  { value: "77", label: "Districts" },
  { value: "750+", label: "Local levels" },
];

const pillars = [
  {
    n: "01",
    title: "Spatial framework",
    accent: "bg-accent/10 text-accent",
    body: (
      <>
        A <strong className="font-semibold">grid-cell-first</strong> architecture. Every component
        is computed independently for each ERA5 grid cell, then aggregated to provinces, districts
        and local levels — each level built straight from the grid, never from the level below.
      </>
    ),
  },
  {
    n: "02",
    title: "Reference period",
    accent: "bg-teal-600/10 text-teal-600",
    body: (
      <>
        Standardized against the <strong className="font-semibold">1991–2020 baseline</strong>, the
        WMO 30-year climate norm, per grid cell and per calendar month. Every output is a z-score.
      </>
    ),
  },
  {
    n: "03",
    title: "Reanalysis dataset",
    accent: "bg-blue-600/10 text-blue-600",
    body: (
      <>
        <strong className="font-semibold">ERA5-Land</strong> supplies temperature, precipitation,
        drought and wind. The ocean reanalysis used for sea level elsewhere is not read at all —
        Nepal has no coastline.
      </>
    ),
  },
];

const components = [
  {
    symbol: "T90S",
    title: "Warm temperature",
    badge: "Heat",
    badgeClass: "bg-orange-500/10 text-orange-600 border-orange-500/25",
    desc: "Unusually warm days and nights, above the 90th percentile of the baseline.",
  },
  {
    symbol: "T10S",
    title: "Cold temperature",
    badge: "Cold",
    badgeClass: "bg-teal-500/10 text-teal-700 border-teal-500/25",
    desc: "Unusually cold days and nights, below the 10th percentile of the baseline. Subtracted in the composite.",
  },
  {
    symbol: "PS",
    title: "Extreme precipitation",
    badge: "Rainfall",
    badgeClass: "bg-blue-500/10 text-blue-600 border-blue-500/25",
    desc: "Maximum consecutive five-day precipitation anomaly — flood and deluge potential.",
  },
  {
    symbol: "W",
    title: "Extreme wind",
    badge: "Wind",
    badgeClass: "bg-sky-500/10 text-sky-600 border-sky-500/25",
    desc: "Unusually high wind-speed days, above the 90th percentile of the record.",
  },
  {
    symbol: "DS",
    title: "Drought & dry spell",
    badge: "Drought",
    badgeClass: "bg-amber-500/10 text-amber-700 border-amber-500/25",
    desc: "Longest run of consecutive dry days — moisture deficit and drought stress.",
  },
];

const levels = [
  { count: "1", name: "Country", note: "Nepal as a whole" },
  { count: "7", name: "Provinces", note: "Koshi through Sudurpashchim" },
  { count: "77", name: "Districts", note: "Nested within provinces" },
  { count: "750+", name: "Local levels", note: "Gaunpalika and nagarpalika" },
];

/** Section heading with consistent spacing above and below. */
function SectionHeader({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
}) {
  return (
    <header className="flex flex-col gap-2.5 max-w-2xl">
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">{title}</h2>
      {lede && <p className="text-sm text-foreground/60 leading-relaxed">{lede}</p>}
    </header>
  );
}

export default function NepalAboutPage() {
  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header portal="nepal" />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col gap-20 sm:gap-28">
        {/* Hero */}
        <section className="hero-panel rounded-[1.75rem] px-6 py-10 sm:px-12 sm:py-14">
          <div className="hero-grid" />

          <div className="relative z-10 flex flex-col gap-10">
            <div className="max-w-2xl flex flex-col gap-5">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 w-fit">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
                  Nepal Actuaries Climate Index
                </span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.06]">
                About the index
              </h1>

              <p className="text-base sm:text-lg text-white/75 leading-relaxed font-light">
                A standardized, reproducible measure of climate extremes across Nepal — reported
                nationally, for all 7 provinces and 77 districts, and down to individual
                municipalities.
              </p>

              <div className="flex flex-wrap gap-3 pt-1">
                <Link
                  href="/nepal/explore"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-white text-xs font-bold uppercase tracking-widest hover:bg-accent-strong transition-colors"
                >
                  Explore the map
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                </Link>
                <a
                  href="#faq"
                  className="inline-flex items-center px-5 py-3 rounded-xl border border-white/25 text-white text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-colors"
                >
                  Read the FAQ
                </a>
              </div>
            </div>

            {/* The four numbers a first-time reader most needs, so the page can
                be understood before any prose is read. */}
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-7 pt-8 border-t border-white/15">
              {atAGlance.map((item) => (
                <div key={item.label} className="flex flex-col gap-1.5">
                  <dd className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                    {item.value}
                  </dd>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">
                    {item.label}
                  </dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Methodology */}
        <section className="flex flex-col gap-9">
          <SectionHeader
            eyebrow="Scientific foundations"
            title="Core methodology"
            lede="Three choices define how every number on this site is produced."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pillars.map((pillar) => (
              <article key={pillar.n} className="card p-7 flex flex-col gap-4">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm ${pillar.accent}`}
                >
                  {pillar.n}
                </div>
                <h3 className="text-base font-bold tracking-tight">{pillar.title}</h3>
                <p className="text-sm text-foreground/65 leading-relaxed">{pillar.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Coverage */}
        <section className="flex flex-col gap-9">
          <SectionHeader
            eyebrow="Coverage"
            title="Four administrative levels"
            lede="Nepal is reported one level deeper than most country portals. Each level is aggregated directly from the grid, so the values are independent of one another rather than nested averages."
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {levels.map((level) => (
              <article key={level.name} className="card p-6 flex flex-col gap-1.5">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-accent">
                  {level.count}
                </span>
                <h3 className="text-sm font-bold tracking-tight">{level.name}</h3>
                <p className="text-xs text-foreground/55 leading-relaxed">{level.note}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Components */}
        <section className="flex flex-col gap-9">
          <SectionHeader
            eyebrow="Sub-index indicators"
            title="The five components"
            lede="Each measures a distinct physical hazard and is standardized the same way before the composite averages them."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {components.map((c) => (
              <article key={c.symbol} className="card p-7 flex flex-col gap-4">
                <div className="flex justify-between items-start gap-3">
                  <span className="text-lg font-bold tracking-tight font-mono">{c.symbol}</span>
                  <span
                    className={`text-[9px] font-bold px-2.5 py-1 border rounded-full uppercase tracking-widest ${c.badgeClass}`}
                  >
                    {c.badge}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-bold tracking-tight">{c.title}</h3>
                  <p className="text-sm text-foreground/60 leading-relaxed">{c.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Formula & scope */}
        <section className="flex flex-col gap-9">
          <SectionHeader eyebrow="Putting it together" title="Composite & interpretation" />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-7 sm:p-8 flex flex-col gap-6">
              <h3 className="text-sm font-bold tracking-widest text-foreground/55">
                How the composite is formed
              </h3>

              <div className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold">Everywhere in Nepal</span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-foreground/45">
                    5 components
                  </span>
                </div>
                <code className="text-xs text-accent font-mono font-bold bg-surface-muted px-3 py-2.5 rounded-lg border border-foreground/8 overflow-x-auto block">
                  (T90S − T10S + PS + DS + W) / 5
                </code>
              </div>

              <p className="text-sm text-foreground/60 leading-relaxed">
                One formula for every region, because no part of a landlocked country has a
                sea-level component. This is the same equation the wider framework applies to any
                inland region.
              </p>

              <div className="p-3.5 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs text-amber-900 leading-relaxed">
                <strong>Cold is subtracted, not added.</strong> T10S counts unusually cold days, so
                the composite measures the warm-minus-cold asymmetry: more cold extremes pull the
                index down, more warm extremes push it up. The other four components are added.
              </div>
            </div>

            <div className="card p-7 sm:p-8 flex flex-col gap-6">
              <h3 className="text-sm font-bold tracking-widest text-foreground/55">
                What the values mean
              </h3>

              <dl className="flex flex-col gap-5 text-sm leading-relaxed">
                <div className="flex flex-col gap-1">
                  <dt className="font-bold">Standardized departures</dt>
                  <dd className="text-foreground/60">
                    Larger positive values mean several hazards are exceeding their historical
                    baseline at once.
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="font-bold">Hazard, not loss</dt>
                  <dd className="text-foreground/60">
                    The index measures physical hazard intensity — not economic loss, claims, or
                    vulnerability.
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="font-bold">Read with the components</dt>
                  <dd className="text-foreground/60">
                    The composite tells you something changed; the components tell you which driver
                    changed.
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="font-bold">Mind the grid at local level</dt>
                  <dd className="text-foreground/60">
                    A local level averages about six grid cells, and the smallest sit inside one or
                    two. At that scale the value reflects a few grid points rather than variation
                    within the municipality.
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <FaqSection />
      </main>
    </div>
  );
}
