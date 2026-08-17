import Link from "next/link";

export default function Hero() {
  return (
    <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 flex flex-col justify-center py-12 sm:py-20 md:py-32">
      <div className="flex flex-col items-start gap-5 sm:gap-8 max-w-4xl">
        {/* Accent Badge */}
        <div className="inline-flex items-center gap-2 text-[10px] sm:text-xs font-bold tracking-widest uppercase text-[#f26a21]">
          <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-[#f26a21] rounded-full animate-pulse"></span>
          Sri Sathya Sai Institute of Actuaries
        </div>
        
        {/* Main Hero Page Title */}
        <h1 className="text-3xl sm:text-5xl md:text-7xl lg:text-[85px] font-black tracking-tight uppercase text-foreground leading-[1.02] sm:leading-[0.95]">
          Indian Actuarial<br />
          Climate Index
        </h1>
        
        {/* Secondary Line */}
        <div className="w-16 sm:w-20 h-[3px] bg-[#f26a21] mt-2 sm:mt-4" />

        {/* Action Button */}
        <div className="mt-4 sm:mt-8 flex flex-wrap gap-3">
          <Link
            href="/explore"
            className="inline-flex items-center justify-center px-6 sm:px-8 py-3.5 sm:py-4 text-xs sm:text-sm font-bold tracking-widest uppercase text-white bg-[#f26a21] hover:bg-[#d65715] rounded-md transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 shadow-md"
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
