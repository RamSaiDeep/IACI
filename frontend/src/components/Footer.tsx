import Image from "next/image";
import Link from "next/link";

const SUPPORT_EMAIL = "support@sssia.org";

const links = [
  { href: "/explore", label: "Explore" },
  { href: "/analyze", label: "Analyze" },
  { href: "/about", label: "About & FAQ" },
];

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-foreground/10 bg-surface-muted/50">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 sm:py-12 flex flex-col gap-8">
        {/* Wraps rather than overflows: at the md breakpoint the four columns
            want more width than a 768px window minus its scrollbar actually
            has, and the badges were pushing past the right edge. */}
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-start md:justify-between gap-8">
          <div className="flex flex-col gap-2 max-w-sm">
            <span className="text-sm font-black tracking-[0.2em] uppercase">SSSIA</span>
            <span className="text-xs text-foreground/60 leading-relaxed">
              Sri Sathya Sai Institute of Actuaries
            </span>
          </div>

          {/* National-initiative badges, set beside Support. Both PNGs carry
              their own alpha channel, so they float directly on the footer's
              ground rather than sitting in cards. Atmanirbhar Bharat is the
              larger, rotated seal; Made in India runs alongside it at a
              smaller but still generous size. */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[14px] font-bold uppercase tracking-widest text-foreground/45 justify-center">
              Proud initiatives
            </span>
            {/* The full-size pair only appears at lg, where there is room for
                it beside the other three columns. flex-shrink-0 is deliberately
                absent so a narrow window scales them down instead of clipping. */}
            <div className="flex items-end gap-4 max-w-full">
              <Image
                src="/badges/atmanirbhar-bharat-seal.png"
                alt="Atmanirbhar Bharat"
                width={142}
                height={142}
                sizes="(min-width: 1024px) 132px, 96px"
                className="w-24 h-24 lg:w-[132px] lg:h-[132px] object-contain drop-shadow-md"
                style={{ transform: "rotate(-4deg)" }}
              />
              <Image
                src="/badges/made-in-india-badge.png"
                alt="Made in India"
                width={224}
                height={112}
                sizes="(min-width: 1024px) 224px, 128px"
                className="w-auto h-16 lg:h-[112px] max-w-full object-contain drop-shadow-md"
              />
            </div>
          </div>

          <nav className="flex flex-col gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/45">
              Explore
            </span>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs font-semibold text-foreground/70 hover:text-accent transition-colors w-fit"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/45">
              Support
            </span>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-xs font-semibold text-accent hover:text-accent-strong transition-colors w-fit"
            >
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>

        <div className="pt-6 border-t border-foreground/8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-[11px] text-foreground/50">
            © 2026 sssia.org. All rights reserved.
          </span>
          <span className="text-[11px] text-foreground/40">
            Built on ECMWF ERA5-Land and ORAS5 reanalysis.
          </span>
        </div>
      </div>
    </footer>
  );
}
