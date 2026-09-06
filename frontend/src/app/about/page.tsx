import Link from "next/link";
import type { Metadata } from "next";
import Header from "../../components/Header";

export const metadata: Metadata = {
  title: "About the Index — Actuaries Climate Index",
  description:
    "An objective, standardized measure of climate extremes and physical hazard variations across regions.",
};

const whyItMatters = [
  {
    title: "Objective Physical Grounding",
    desc: "Unlike subjective opinions or speculative economic forecasts, the index measures observational physical climate extremes derived directly from validated meteorological reanalysis.",
  },
  {
    title: "Actuarial & Underwriting Relevance",
    desc: "Extreme weather events drive the overwhelming share of catastrophic property losses, infrastructure failures, agricultural volatility, and mortality shocks.",
  },
  {
    title: "Cross-Regional Comparability",
    desc: "By converting disparate physical indicators (degrees, millimeters, meters per second) into standardized statistical units (z-scores), conditions across diverse ecological zones can be compared objectively.",
  },
  {
    title: "Informing Resilient Public Policy",
    desc: "Enables governments, multilateral institutions, and civil societies to design targeted adaptation strategies, disaster risk financing, and capital reserves.",
  },
];

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
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">
        {title}
      </h2>
      {lede && <p className="text-sm text-foreground/60 leading-relaxed">{lede}</p>}
    </header>
  );
}

export default function GeneralAboutPage() {
  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col gap-16 sm:gap-24">
        {/* Hero Section */}
        <section className="hero-panel rounded-[1.75rem] px-6 py-10 sm:px-12 sm:py-14">
          <div className="hero-grid" />

          <div className="relative z-10 flex flex-col gap-8">
            <div className="w-full flex flex-col gap-5">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 w-fit">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
                  Actuaries Climate Index
                </span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.06]">
                About the Index
              </h1>

              <p className="text-base sm:text-lg text-white/75 leading-relaxed font-light max-w-none">
                An objective, science-based composite metric tracking changes in extreme weather
                frequency and intensity over time — designed to inform actuarial risk analysis,
                financial solvency, and climate resilience.
              </p>

              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  href="/#countries"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-white text-xs font-bold uppercase tracking-widest hover:bg-accent-strong transition-colors"
                >
                  Explore Countries
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Why the Index Exists */}
        <section className="flex flex-col gap-9">
          <SectionHeader
            eyebrow="Motivation & Purpose"
            title="Why the Actuaries Climate Index Exists"
            lede="The actuarial discipline focuses on understanding, pricing, and managing risk to preserve financial and societal stability."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {whyItMatters.map((item) => (
              <div key={item.title} className="card p-7 flex flex-col gap-3">
                <h3 className="text-base font-bold tracking-tight text-foreground">
                  {item.title}
                </h3>
                <p className="text-sm text-foreground/65 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}