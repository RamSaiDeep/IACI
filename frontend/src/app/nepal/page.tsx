import type { Metadata } from "next";
import Link from "next/link";
import Header from "../../components/Header";

export const metadata: Metadata = {
  title: "Nepal Actuaries Climate Index",
  description:
    "A monthly, standardized measure of climate extremes for Nepal — nationally, and for all 7 provinces, 77 districts and 750+ local levels.",
};

const FACTS = [
  { value: "7", label: "Provinces" },
  { value: "77", label: "Districts" },
  { value: "750+", label: "Local Levels" },
  { value: "1991–2026", label: "Monthly Record" },
];

const COMPONENTS = [
  { short: "T90S", name: "Hot Extreme", desc: "Frequency of unusually hot days" },
  { short: "T10S", name: "Cold Extreme", desc: "Frequency of unusually cold days" },
  { short: "PS", name: "Precipitation", desc: "Maximum 5-day rainfall" },
  { short: "DS", name: "Dry Spell", desc: "Longest run of consecutive dry days" },
  { short: "W", name: "Wind", desc: "Frequency of high wind speeds" },
];

export default function NepalPortalPage() {
  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header portal="nepal" />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col gap-14 sm:gap-20">
        <section className="hero-panel rounded-[1.75rem] px-6 py-10 sm:px-12 sm:py-14">
          <div className="hero-grid" />

          <div className="relative z-10 flex flex-col gap-8">
            <div className="w-full flex flex-col gap-5">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 w-fit">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
                  Nepal Actuaries Climate Index
                </span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.06]">
                Nepal Actuaries Climate Index
              </h1>

              <p className="text-base sm:text-lg text-white/75 leading-relaxed font-light max-w-none">
                A monthly, standardized measure of climate extremes, reported from the country
                down to every one of Nepal&apos;s 750+ local levels — built on the same
                methodology as the Indian index, on a 1991–2020 baseline.
              </p>

              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  href="/nepal/explore"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-white text-xs font-bold uppercase tracking-widest hover:bg-accent-strong transition-colors"
                >
                  Explore the map →
                </Link>
                <Link
                  href="/nepal/analyze"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/20 hover:bg-white/10 text-xs font-bold uppercase tracking-widest text-white/85 transition-colors"
                >
                  Compare regions
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {FACTS.map((fact) => (
            <div key={fact.label} className="card p-5 flex flex-col gap-1">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-accent">
                {fact.value}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-foreground/55">
                {fact.label}
              </span>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-8">
          <header className="flex flex-col gap-2.5 max-w-2xl">
            <span className="eyebrow">Five Components</span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">
              What the index measures
            </h2>
            <p className="text-sm text-foreground/60 leading-relaxed">
              Each component is a standardized anomaly against 1991–2020, and the composite is
              their mean. Nepal is landlocked, so the sea-level component of the wider index does
              not apply and the five-component equation is used everywhere.
            </p>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {COMPONENTS.map((component) => (
              <div key={component.short} className="card p-6 flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-base font-bold tracking-tight">{component.name}</h3>
                  <span className="text-[11px] font-bold text-accent tracking-wider">
                    {component.short}
                  </span>
                </div>
                <p className="text-sm text-foreground/65 leading-relaxed">{component.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
