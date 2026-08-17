import Link from "next/link";

export default function Hero() {
  return (
    <main className="surface-grid relative flex-1 mx-auto flex w-full max-w-7xl flex-col justify-center overflow-hidden px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="pointer-events-none absolute right-[-8rem] top-1/2 hidden h-96 w-96 -translate-y-1/2 rounded-full border border-teal/20 lg:block" />
      <div className="pointer-events-none absolute right-8 top-1/2 hidden h-72 w-72 -translate-y-1/2 rounded-full border border-accent/25 lg:block" />
      <div className="relative flex max-w-4xl flex-col items-start gap-5 sm:gap-8">
        {/* Accent Badge */}
        <div className="inline-flex items-center gap-2 text-[10px] sm:text-xs font-bold tracking-widest uppercase text-[#f26a21]">
          <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-accent rounded-full animate-pulse"></span>
          Sri Sathya Sai Institute of Actuaries
        </div>
        
        {/* Main Hero Page Title */}
        <h1 className="text-3xl sm:text-5xl md:text-7xl lg:text-[85px] font-black tracking-tight uppercase text-foreground leading-[1.02] sm:leading-[0.95]">
          Indian Actuarial<br />
          Climate Index
        </h1>
        
        {/* Secondary Line */}
        <div className="mt-2 h-[3px] w-16 bg-accent sm:mt-4 sm:w-20" />
        <p className="max-w-2xl text-sm leading-6 text-muted sm:text-base sm:leading-7">
          A climate-risk intelligence workspace for exploring regional signals, comparing variables, and grounding actuarial decisions in India&apos;s changing climate.
        </p>

        {/* Action Button */}
        <div className="mt-4 sm:mt-8 flex flex-wrap gap-3">
          <Link
            href="/explore"
            className="inline-flex items-center justify-center px-6 sm:px-8 py-3.5 sm:py-4 text-xs sm:text-sm font-bold tracking-widest uppercase text-white bg-accent hover:bg-accent/85 rounded-md transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 shadow-md"
          >
            Explore the index
          </Link>
          <Link
            href="/about"
            className="inline-flex items-center justify-center px-6 sm:px-8 py-3.5 sm:py-4 text-xs sm:text-sm font-bold tracking-widest uppercase text-foreground border border-foreground/15 hover:bg-foreground/5 rounded-md transition-all duration-300"
          >
            Learn More
          </Link>
        </div>
      </div>
    </main>
  );
}
