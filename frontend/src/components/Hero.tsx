import Link from "next/link";

const highlights = [
  { value: "1991–2026", label: "Monthly coverage" },
  { value: "6", label: "Climate components" },
  { value: "782", label: "Districts mapped" },
];

export default function Hero() {
  return (
    <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 flex flex-col justify-center py-12 sm:py-20 md:py-28">
      <div className="flex flex-col items-start gap-6 sm:gap-8 max-w-4xl">
        <div className="inline-flex items-center gap-2 text-[10px] sm:text-xs font-bold tracking-widest uppercase text-accent">
          <span className="w-2 h-2 bg-accent rounded-full" />
          Sri Sathya Sai Institute of Actuaries
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-[85px] font-black tracking-tight uppercase leading-[1.02] sm:leading-[0.95]">
          Indian Actuarial
          <br />
          Climate Index
        </h1>

        <div className="w-16 sm:w-20 h-[3px] bg-accent rounded-full" />

        <p className="text-sm sm:text-base text-foreground/70 leading-relaxed max-w-2xl">
          A standardized, reproducible measure of climate extremes across India — six hazard
          components, standardized against the 1991–2020 baseline and reported monthly for every
          state and district.
        </p>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/explore"
            className="inline-flex items-center justify-center px-7 py-3.5 text-xs sm:text-sm font-bold tracking-widest uppercase text-white bg-accent hover:bg-accent-strong rounded-lg transition-all duration-300 hover:-translate-y-0.5 shadow-card hover:shadow-card-lg"
          >
            Explore the index
          </Link>
          <Link
            href="/analyze"
            className="inline-flex items-center justify-center px-7 py-3.5 text-xs sm:text-sm font-bold tracking-widest uppercase border border-foreground/15 hover:bg-foreground/5 rounded-lg transition-colors"
          >
            Compare regions
          </Link>
          <Link
            href="/about"
            className="inline-flex items-center justify-center px-7 py-3.5 text-xs sm:text-sm font-bold tracking-widest uppercase text-foreground/70 hover:text-foreground transition-colors"
          >
            Methodology →
          </Link>
        </div>

        <dl className="grid grid-cols-3 gap-4 sm:gap-8 pt-6 sm:pt-8 border-t border-foreground/10 w-full max-w-2xl">
          {highlights.map((item) => (
            <div key={item.label} className="flex flex-col gap-1">
              <dt className="sr-only">{item.label}</dt>
              <dd className="text-xl sm:text-3xl font-black tracking-tight text-foreground">
                {item.value}
              </dd>
              <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-foreground/50">
                {item.label}
              </span>
            </div>
          ))}
        </dl>
      </div>
    </main>
  );
}
