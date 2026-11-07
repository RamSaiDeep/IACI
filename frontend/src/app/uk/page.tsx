import type { Metadata } from "next";
import Link from "next/link";
import Header from "../../components/Header";
// THE ONLY COUNTRY-SPECIFIC LINE. Point it at another config to reuse this page.
import { COUNTRY } from "../../lib/countries/uk";
import { componentsFor } from "../../lib/countryPortal";

export const metadata: Metadata = {
  title: COUNTRY.indexName,
  description: COUNTRY.tagline,
};

export default function CountryHomePage() {
  const base = `/${COUNTRY.slug}`;
  const components = componentsFor(COUNTRY);

  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header portal={COUNTRY.slug} />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col gap-14 sm:gap-20">
        <section className="hero-panel rounded-[1.75rem] px-6 py-10 sm:px-12 sm:py-14">
          <div className="hero-grid" />

          <div className="relative z-10 flex flex-col gap-5">
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
                {COUNTRY.indexCode}
              </span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.06]">
              {COUNTRY.indexName}
            </h1>

            <p className="text-base sm:text-lg text-white/75 leading-relaxed font-light">
              {COUNTRY.tagline}
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href={`${base}/explore`}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-white text-xs font-bold uppercase tracking-widest hover:bg-accent-strong transition-colors"
              >
                Explore the map →
              </Link>
              <Link
                href={`${base}/analyze`}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/20 hover:bg-white/10 text-xs font-bold uppercase tracking-widest text-white/85 transition-colors"
              >
                Compare regions
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-white/65 pt-1">
              <span>Geographical boundaries:</span>
              {COUNTRY.boundarySource.map((s, i) => (
                <span key={s.href}>
                  {i > 0 && "· "}
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:text-white/80 underline underline-offset-4 font-medium"
                  >
                    {s.label}
                  </a>
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {COUNTRY.facts.map((fact) => (
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
          <header className="flex flex-col gap-2.5 max-w-4xl">
            <span className="eyebrow">{components.length} Components</span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">
              What the index measures
            </h2>
            <p className="text-sm text-foreground/60 leading-relaxed">
              Each component is a standardized anomaly against 1991–2020, and the composite is
              their mean.
            </p>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {components.map((c) => (
              <div key={c.id} className="card p-6 flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-base font-bold tracking-tight">{c.name}</h3>
                  <span className="text-[11px] font-bold text-accent tracking-wider">{c.short}</span>
                </div>
                <p className="text-sm text-foreground/65 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
