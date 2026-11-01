import Link from "next/link";
import Image from "next/image";

export default function GeneralHero() {
  return (
    <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 flex flex-col justify-center py-10 sm:py-16 md:py-20 gap-16 sm:gap-24">
      {/* Top Hero Section */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-10 lg:gap-14 w-full">
        <div className="flex flex-col items-start gap-6 sm:gap-7 max-w-3xl xl:max-w-4xl flex-1">
          <div className="inline-flex items-center gap-2 text-[10px] sm:text-xs font-bold tracking-widest uppercase text-accent">
            <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
            Sri Sathya Sai Institute of Actuaries
          </div>

          <h1 className="text-2xl min-[400px]:text-3xl sm:text-4xl md:text-5xl lg:text-[52px] xl:text-[62px] font-semibold tracking-tight leading-tight sm:leading-none sm:whitespace-nowrap">
            Actuaries Climate Index
          </h1>

          <div className="w-16 sm:w-20 h-[3px] bg-accent rounded-full" />

          <p className="text-sm sm:text-base text-foreground/75 leading-relaxed max-w-2xl">
            An objective, standardized measure of climate extremes and physical hazard variations.
            Developed to empower actuaries, risk professionals, insurers, and policymakers with
            reproducible, science-based climate intelligence.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/about"
              className="inline-flex items-center justify-center px-7 py-3.5 text-xs sm:text-sm font-bold tracking-widest uppercase text-white bg-accent hover:bg-accent-strong rounded-lg transition-all duration-300 hover:-translate-y-0.5 shadow-card hover:shadow-card-lg"
            >
              About the Index →
            </Link>
            <a
              href="#countries"
              className="inline-flex items-center justify-center px-7 py-3.5 text-xs sm:text-sm font-bold tracking-widest uppercase border border-foreground/15 hover:bg-foreground/5 rounded-lg transition-colors"
            >
              Select Country ↓
            </a>
          </div>
        </div>

        {/* Brand & Initiative Seals */}
        <div className="hidden lg:flex flex-col items-center justify-center flex-shrink-0 animate-rise">
          <div className="relative p-6 sm:p-8 rounded-3xl bg-surface border border-foreground/8 shadow-card hover:shadow-card-lg transition-all duration-300 flex flex-col items-center gap-4">
            <Image
              src="/badges/atmanirbhar-bharat-seal.png"
              alt="Atmanirbhar Bharat Logo"
              width={240}
              height={240}
              className="w-48 h-48 xl:w-56 xl:h-56 object-contain"
              priority
            />
            <div className="flex flex-col items-center text-center">
              <span className="text-[11px] font-bold tracking-widest uppercase text-foreground/75">
                Atmanirbhar Bharat
              </span>
              <span className="text-[9px] font-semibold tracking-wider uppercase text-foreground/45">
                Sri Sathya Sai Institute of Actuaries
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Country Selection Section */}
      <section id="countries" className="flex flex-col gap-8 scroll-mt-24">
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 text-[10px] sm:text-xs font-bold tracking-widest uppercase text-accent">
            <span className="w-1.5 h-1.5 bg-accent rounded-full" />
            Regional Portals
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Select Country Portal
          </h2>
          <p className="text-sm text-foreground/60 max-w-xl">
            Access country-specific climate extreme indicators, interactive district-level maps,
            historical timeseries, and comparative analytics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8">
          {/* India Card - Active */}
          <div className="card p-7 sm:p-8 flex flex-col justify-between gap-6 border-2 border-accent/20 hover:border-accent/60 transition-all duration-300 hover:shadow-card-lg group relative overflow-hidden bg-gradient-to-br from-surface to-accent/[0.03]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-[10px] font-bold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-accent" />
                  Active Portal
                </div>
                <span className="text-xs font-bold text-foreground/40 uppercase tracking-widest">
                  Version 1.0
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground group-hover:text-accent transition-colors">
                  India
                </h3>
                <span className="text-xs font-bold uppercase tracking-wider text-accent">
                  Indian Actuaries Climate Index (IACI)
                </span>
              </div>



              <div className="flex flex-wrap gap-2 pt-2">
                {["780+ Districts", "30+ States & UTs", "6 Climate Hazards", "Interactive Map"].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-md bg-foreground/5 text-foreground/70 text-[10px] font-bold uppercase tracking-wider border border-foreground/5"
                    >
                      {tag}
                    </span>
                  )
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-foreground/8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Link
                href="/india"
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-white text-xs font-bold uppercase tracking-widest hover:bg-accent-strong transition-all duration-200 shadow-md hover:shadow-lg group-hover:scale-[1.01]"
              >
                <span>Explore India Portal</span>
                <svg
                  className="w-4 h-4 transition-transform group-hover:translate-x-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </Link>
              <Link
                href="/explore"
                className="inline-flex items-center justify-center px-4 py-3.5 rounded-xl border border-foreground/15 hover:bg-foreground/5 text-xs font-bold uppercase tracking-widest text-foreground/75 transition-colors"
                title="Direct link to interactive map"
              >
                Map View
              </Link>
            </div>
          </div>

          {/* UK card. The portal is available directly at /uk, but is not
              promoted as active from the main page while it remains in development. */}
          <div className="card p-7 sm:p-8 flex flex-col justify-between gap-6 border border-foreground/10 bg-surface/50 relative overflow-hidden cursor-default">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-foreground/6 border border-foreground/12 text-foreground/55 text-[10px] font-bold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-foreground/30" />
                  In Development
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  United Kingdom
                </h3>
                <span className="text-xs font-bold uppercase tracking-wider text-foreground/45">
                  UK Actuaries Climate Index (UKACI)
                </span>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {["4 Nations", "218 Counties & UAs", "6 Climate Hazards", "Interactive Map"].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-md bg-foreground/5 text-foreground/55 text-[10px] font-bold uppercase tracking-wider border border-foreground/5"
                    >
                      {tag}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>
          {/* Nepal card. Present so the roadmap is visible, but inert: the
              portal is not published yet, so there is deliberately nothing to
              click and no action control to imply otherwise. */}
          <div className="card p-7 sm:p-8 flex flex-col justify-between gap-6 border border-foreground/10 bg-surface/50 relative overflow-hidden cursor-default">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-foreground/6 border border-foreground/12 text-foreground/55 text-[10px] font-bold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-foreground/30" />
                  In Development
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground group-hover:text-accent transition-colors">
                  Nepal
                </h3>
                <span className="text-xs font-bold uppercase tracking-wider text-foreground/45">
                  Nepal Actuaries Climate Index (NACI)
                </span>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {["7 Provinces", "77 Districts", "750+ Local Levels", "5 Climate Hazards"].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-md bg-foreground/5 text-foreground/55 text-[10px] font-bold uppercase tracking-wider border border-foreground/5"
                    >
                      {tag}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
