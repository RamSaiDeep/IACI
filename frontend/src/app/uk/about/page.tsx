import type { Metadata } from "next";
import Link from "next/link";
import Header from "../../../components/Header";
import { SCALE_GRADIENT } from "../../../lib/indicators";
import { componentsFor } from "../../../lib/countryPortal";
// THE ONLY COUNTRY-SPECIFIC LINE. Point it at another config to reuse this page.
import { COUNTRY } from "../../../lib/countries/uk";

export const metadata: Metadata = {
  title: `About the ${COUNTRY.indexName}`,
  description: COUNTRY.tagline,
};

/**
 * About page for a config-driven country portal.
 *
 * Shorter than India's and Nepal's on purpose: everything here is generated
 * from COUNTRY, so it stays correct when copied. Country-specific prose (data
 * sources, caveats) goes in `COUNTRY.notes`. If the country needs a full FAQ,
 * copy app/nepal/about/FaqSection.tsx next to this file and rewrite it.
 */

const STEPS = [
  {
    n: "01",
    title: "Daily weather to monthly counts",
    body: "Hourly reanalysis data is turned into daily values. For each month, each component counts or measures the extreme days at every grid cell.",
  },
  {
    n: "02",
    title: "Standardize against 1991–2020",
    body: "Each monthly value is compared with the same calendar month in the 1991–2020 reference period. The result is a z-score: how many standard deviations above or below normal.",
  },
  {
    n: "03",
    title: "Average into regions and a composite",
    body: "Grid cells are averaged into each region. The composite is the mean of the component z-scores, so a value of +1 means extremes were one standard deviation more frequent than normal.",
  },
];

const BANDS = [
  { range: "below −1", label: "Below normal" },
  { range: "−1 to 0", label: "Near normal" },
  { range: "0 to +1", label: "Moderate" },
  { range: "+1 to +2", label: "Elevated" },
  { range: "+2 to +3.5", label: "Severe" },
  { range: "above +3.5", label: "Extreme" },
];

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="flex flex-col gap-2.5 max-w-4xl">
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">{title}</h2>
    </header>
  );
}

export default function CountryAboutPage() {
  const components = componentsFor(COUNTRY);

  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header portal={COUNTRY.slug} />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col gap-16 sm:gap-24">
        <section className="hero-panel rounded-[1.75rem] px-6 py-10 sm:px-12 sm:py-14">
          <div className="hero-grid" />
          <div className="relative z-10 flex flex-col gap-5">
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
                {COUNTRY.indexName}
              </span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.06]">
              About the index
            </h1>
            <p className="text-base sm:text-lg text-white/75 leading-relaxed font-light">
              {COUNTRY.tagline}
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link
                href={`/${COUNTRY.slug}/explore`}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-white text-xs font-bold uppercase tracking-widest hover:bg-accent-strong transition-colors"
              >
                Explore the map →
              </Link>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-9">
          <SectionHeader eyebrow="Method" title="How the index is built" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {STEPS.map((s) => (
              <article key={s.n} className="card p-7 flex flex-col gap-3">
                <span className="text-accent font-bold text-sm">{s.n}</span>
                <h3 className="text-base font-bold tracking-tight">{s.title}</h3>
                <p className="text-sm text-foreground/65 leading-relaxed">{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-9">
          <SectionHeader eyebrow="Coverage" title="Where it is reported" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { name: COUNTRY.name, desc: "One national series." },
              { name: COUNTRY.top.plural, desc: `Each ${COUNTRY.top.label.toLowerCase()} separately.` },
              { name: COUNTRY.child.plural, desc: `Every ${COUNTRY.child.label.toLowerCase()} within each ${COUNTRY.top.label.toLowerCase()}.` },
            ].map((l) => (
              <article key={l.name} className="card p-6 flex flex-col gap-1.5">
                <h3 className="text-sm font-bold tracking-tight">{l.name}</h3>
                <p className="text-sm text-foreground/65">{l.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-9">
          <SectionHeader eyebrow={`${components.length} components`} title="What each part measures" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {components.map((c) => (
              <article key={c.id} className="card p-6 flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold tracking-tight">{c.name}</h3>
                  <span className="text-[11px] font-bold tracking-wider" style={{ color: c.accent }}>
                    {c.short}
                  </span>
                </div>
                <p className="text-sm text-foreground/65 leading-relaxed">{c.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-9">
          <SectionHeader eyebrow="Reading the numbers" title="Interpretation" />
          <div className="card p-7 flex flex-col gap-5">
            <div className="h-3 rounded-full" style={{ background: SCALE_GRADIENT }} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {BANDS.map((b) => (
                <div key={b.label} className="flex flex-col">
                  <span className="text-xs font-bold">{b.label}</span>
                  <span className="text-xs text-foreground/55 font-mono">{b.range}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-9">
          <SectionHeader eyebrow="Notes" title="Data and boundaries" />
          <div className="card p-7 flex flex-col gap-4 text-sm text-foreground/70 leading-relaxed">
            {COUNTRY.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
            <p>
              Boundaries:{" "}
              {COUNTRY.boundarySource.map((s, i) => (
                <span key={s.href}>
                  {i > 0 && "; "}
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">
                    {s.label}
                  </a>
                </span>
              ))}
              .
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
