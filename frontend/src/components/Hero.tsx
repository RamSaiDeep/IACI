import Link from "next/link";

export default function Hero() {
  return (
    <main className="flex-1 max-w-7xl mx-auto w-full px-6 sm:px-8 flex flex-col justify-center py-20 md:py-32">
      <div className="flex flex-col items-start gap-8 max-w-4xl">
        {/* Accent Badge */}
        <div className="inline-flex items-center gap-2.5 text-xs font-bold tracking-widest uppercase text-[#f26a21]">
          <span className="w-2.5 h-2.5 bg-[#f26a21] rounded-full animate-pulse"></span>
          Sri Sathya Sai Institute of Actuaries
        </div>
        
        {/* Main Hero Page Title */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[85px] font-bold tracking-tight uppercase text-foreground leading-[0.95]">
          Indian Actuarial<br />
          Climate Index
        </h1>
        
        {/* Secondary Line */}
        <div className="w-20 h-[3px] bg-[#f26a21] mt-4" />

        {/* Action Button */}
        <div className="mt-8">
          <Link
            href="/explore"
            className="inline-flex items-center justify-center px-8 py-4 text-sm font-bold tracking-widest uppercase text-white bg-[#f26a21] hover:bg-[#d65715] rounded-md transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
          >
            Explore the index
          </Link>
        </div>
      </div>
    </main>
  );
}
