import Link from "next/link";
import type { Metadata } from "next";
import Header from "../../components/Header";
import FaqSection from "./FaqSection";

export const metadata: Metadata = {
  title: "About & FAQ — Indian Actuarial Climate Index",
  description:
    "Methodology, climate components, datasets and frequently asked questions for the Indian Actuarial Climate Index (IACI).",
};

const atAGlance = [
  { value: "6", label: "Climate components" },
  { value: "1991–2020", label: "Baseline period" },
  { value: "36", label: "States & UTs" },
  { value: "782", label: "Districts" },
];

const pillars = [
  {
    n: "01",
    title: "Spatial framework",
    accent: "bg-accent/10 text-accent",
    body: (
      <>
        A <strong className="font-semibold">grid-cell-first</strong> architecture. Every component
        is computed independently for each ERA5 grid cell, then aggregated to district and state
        boundaries.
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
        WMO 30-year climate norm. Every output is a z-score.
      </>
    ),
  },
  {
    n: "03",
    title: "Reanalysis datasets",
    accent: "bg-blue-600/10 text-blue-600",
    body: (
      <>
        <strong className="font-semibold">ERA5-Land</strong> for temperature, precipitation, drought
        and wind, paired with <strong className="font-semibold">ORAS5</strong> for sea level.
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
    desc: "Unusually cold days and nights, below the 10th percentile of the baseline.",
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
  {
    symbol: "SS",
    title: "Sea level anomaly",
    badge: "Coastal",
    badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25",
    desc: "Monthly mean sea-level anomaly, applied to coastal states and districts only.",
  },
];

const team = [
  "Satya Sai Mudigonda",
  "Eswar Prem",
  "Ram Sai Deep V",
  "Dr. Rohan Yashraj Gupta",
  "Arunachala Sivateja Mudigonda",
];

/** Up to two initials, skipping honorifics so "Dr. Rohan …" reads as RG. */
function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter((p) => !/^(dr|prof|mr|ms|mrs)\.?$/i.test(p));
  const letters = parts.map((p) => p[0]).filter(Boolean);
  return (letters[0] ?? "") + (letters.length > 1 ? letters[letters.length - 1] : "");
}

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
      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight uppercase leading-tight">
        {title}
      </h2>
      {lede && <p className="text-sm text-foreground/60 leading-relaxed">{lede}</p>}
    </header>
  );
}

export default function AboutPage() {
  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col gap-20 sm:gap-28">
        {/* Hero */}
        <section className="hero-panel rounded-[1.75rem] px-6 py-10 sm:px-12 sm:py-14">
          <div className="hero-grid" />

          <div className="relative z-10 flex flex-col gap-10">
            <div className="max-w-2xl flex flex-col gap-5">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 w-fit">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
                  Actuarial climate intelligence
                </span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-black tracking-tight uppercase leading-[1.06]">
                About the index
              </h1>

              <p className="text-base sm:text-lg text-white/75 leading-relaxed font-light">
                A standardized, reproducible measure of climate extremes across India — built for
                risk management, insurance pricing and infrastructure planning.
              </p>

              <div className="flex flex-wrap gap-3 pt-1">
                <Link
                  href="/explore"
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
                  <dd className="text-2xl sm:text-3xl font-black tracking-tight text-white">
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
                  className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm ${pillar.accent}`}
                >
                  {pillar.n}
                </div>
                <h3 className="text-base font-bold uppercase tracking-tight">{pillar.title}</h3>
                <p className="text-sm text-foreground/65 leading-relaxed">{pillar.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Components */}
        <section className="flex flex-col gap-9">
          <SectionHeader
            eyebrow="Sub-index indicators"
            title="The six components"
            lede="Each measures a distinct physical hazard and is standardized the same way before the composite averages them."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {components.map((c) => (
              <article key={c.symbol} className="card p-7 flex flex-col gap-4">
                <div className="flex justify-between items-start gap-3">
                  <span className="text-lg font-black tracking-tight font-mono">{c.symbol}</span>
                  <span
                    className={`text-[9px] font-bold px-2.5 py-1 border rounded-full uppercase tracking-widest ${c.badgeClass}`}
                  >
                    {c.badge}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-tight">{c.title}</h3>
                  <p className="text-sm text-foreground/60 leading-relaxed">{c.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Formula & scope */}
        <section className="flex flex-col gap-9">
          <SectionHeader
            eyebrow="Putting it together"
            title="Composite & interpretation"
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-7 sm:p-8 flex flex-col gap-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-foreground/55">
                How the composite is formed
              </h3>

              <div className="flex flex-col gap-5">
                {[
                  {
                    label: "Coastal regions",
                    count: "6 components",
                    formula: "(T90S + T10S + PS + W + DS + SS) / 6",
                  },
                  {
                    label: "Inland regions",
                    count: "5 components",
                    formula: "(T90S + T10S + PS + W + DS) / 5",
                  },
                ].map((row) => (
                  <div key={row.label} className="flex flex-col gap-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold">{row.label}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-foreground/45">
                        {row.count}
                      </span>
                    </div>
                    <code className="text-xs text-accent font-mono font-bold bg-surface-muted px-3 py-2.5 rounded-lg border border-foreground/8 overflow-x-auto block">
                      {row.formula}
                    </code>
                  </div>
                ))}
              </div>

              <p className="text-sm text-foreground/60 leading-relaxed">
                Inland regions exclude sea level so they are not penalized for lacking a coastline.
              </p>
            </div>

            <div className="card p-7 sm:p-8 flex flex-col gap-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-foreground/55">
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
              </dl>
            </div>
          </div>
        </section>

        <FaqSection />

        {/* Team — kept last: the reader's-question sections (methodology,
            components, formula, FAQ) come first, and who built this comes as
            the closing note. */}
        <section className="flex flex-col gap-9">
          <SectionHeader
            eyebrow="Team involved"
            title="The people behind the index"
          />

          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {team.map((name) => (
              <li key={name} className="card p-6 flex items-center gap-4">
                <span
                  aria-hidden="true"
                  className="w-12 h-12 rounded-full bg-gradient-to-br from-accent/15 to-accent/5 border border-accent/20 text-accent flex items-center justify-center font-black text-sm flex-shrink-0"
                >
                  {initialsOf(name)}
                </span>
                <span className="text-sm font-bold leading-snug">{name}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
