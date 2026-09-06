import type { Metadata } from "next";
import Link from "next/link";
import Header from "../../../components/Header";

export const metadata: Metadata = {
  title: "About the Index — Nepal Actuaries Climate Index",
  description:
    "How the Nepal Actuaries Climate Index is built: five standardized components, a 1991–2020 baseline, and four administrative levels.",
};

const LEVELS = [
  { name: "Country", count: "1", note: "Nepal as a whole" },
  { name: "Province", count: "7", note: "Koshi through Sudurpashchim" },
  { name: "District", count: "77", note: "Nested within provinces" },
  { name: "Local Level", count: "753", note: "Gaunpalika and nagarpalika" },
];

const NOTES = [
  {
    title: "No sea-level component",
    desc: "Nepal is landlocked. Sea level is not a null column here — it is absent from the index entirely, and the composite is the five-component equation at every location, which the methodology defines for exactly this case.",
  },
  {
    title: "Every level measured directly",
    desc: "A province is not the average of its districts, and a district is not the average of its local levels. Each level is computed straight from the underlying grid, so a large region and a small one never carry equal weight in their parent's value.",
  },
  {
    title: "Standardized per place and per month",
    desc: "Each component is compared against the 1991–2020 record for that same region and that same calendar month. A value of +1 means one standard deviation more extreme than that region's own normal, which is what makes a Terai district comparable with a mountain one.",
  },
  {
    title: "Protected areas are excluded",
    desc: "National parks and reserves are carved out of municipal territory rather than sitting inside it. They are not local governments, so they are excluded from the local level — which leaves about 3% of Nepal's area outside any local-level region, though it remains inside its district and province.",
  },
];

export default function NepalAboutPage() {
  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header portal="nepal" />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col gap-14 sm:gap-20">
        <section className="hero-panel rounded-[1.75rem] px-6 py-10 sm:px-12 sm:py-14">
          <div className="hero-grid" />

          <div className="relative z-10 flex flex-col gap-5">
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
                Nepal Actuaries Climate Index
              </span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.06]">
              About the Index
            </h1>

            <p className="text-base sm:text-lg text-white/75 leading-relaxed font-light max-w-none">
              NACI applies the Actuaries Climate Index methodology to Nepal: five physical
              measures of climate extremes, each standardized against the 1991–2020 record, then
              averaged into one monthly number for every administrative region.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/nepal/explore"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-white text-xs font-bold uppercase tracking-widest hover:bg-accent-strong transition-colors"
              >
                Explore the map →
              </Link>
              <Link
                href="/about"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/20 hover:bg-white/10 text-xs font-bold uppercase tracking-widest text-white/85 transition-colors"
              >
                The wider index
              </Link>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-8">
          <header className="flex flex-col gap-2.5 max-w-2xl">
            <span className="eyebrow">Coverage</span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">
              Four administrative levels
            </h2>
            <p className="text-sm text-foreground/60 leading-relaxed">
              Nepal is reported one level deeper than most country portals, down to individual
              municipalities.
            </p>
          </header>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {LEVELS.map((level) => (
              <div key={level.name} className="card p-5 flex flex-col gap-1.5">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-accent">
                  {level.count}
                </span>
                <span className="text-sm font-bold tracking-tight">{level.name}</span>
                <span className="text-xs text-foreground/55 leading-relaxed">{level.note}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-8">
          <header className="flex flex-col gap-2.5 max-w-2xl">
            <span className="eyebrow">Method Notes</span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">
              What is specific to Nepal
            </h2>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {NOTES.map((note) => (
              <div key={note.title} className="card p-7 flex flex-col gap-3">
                <h3 className="text-base font-bold tracking-tight text-foreground">
                  {note.title}
                </h3>
                <p className="text-sm text-foreground/65 leading-relaxed">{note.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <header className="flex flex-col gap-2.5 max-w-2xl">
            <span className="eyebrow">Reading a Value</span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">
              What the numbers mean
            </h2>
          </header>
          <div className="card p-7 flex flex-col gap-3 max-w-3xl">
            <p className="text-sm text-foreground/70 leading-relaxed">
              Every value is a standardized anomaly, not a physical unit. Zero is the 1991–2020
              average for that region and month; +1 is one standard deviation above it.
            </p>
            <p className="text-sm text-foreground/70 leading-relaxed">
              Positive always means <strong className="text-foreground">more extreme</strong> —
              including for cold, whose component is stored already sign-flipped. Because the
              composite is a mean, a component&apos;s distance from it is what tells you which
              hazard drove a given month.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
