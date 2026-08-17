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
        {/* Main Footer Row: Left (Notice & SSSIA), Center (Proud Initiatives), Right (Explore) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-start gap-8 lg:gap-12">
          {/* Left Column: Educational Notice & SSSIA */}
          <div className="flex flex-col gap-2.5 max-w-lg">
            <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/45">
              Educational, Research & Organizational Use
            </span>
            <div className="flex flex-col gap-2 text-xs text-foreground/65 leading-relaxed">
              <p className="font-medium text-foreground/80">
                This index is provided for educational and research purposes.
              </p>
              <p>
                If you would like to explore the Indian Actuaries Climate Index (IACI) as part of your organization’s risk assessment, we can provide a more detailed version of the index, fine-tuned to your specific requirements and intended application.
              </p>
              <p>
                For further information, please contact{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-accent hover:text-accent-strong font-medium underline underline-offset-2 transition-colors"
                >
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </div>

            <a
              href="https://www.sssia.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-0.5 group w-fit pt-1"
            >
              <span className="text-sm font-black tracking-[0.2em] uppercase group-hover:text-accent transition-colors">
                SSSIA
              </span>
              <span className="text-xs text-foreground/60 group-hover:text-foreground/90 leading-relaxed transition-colors">
                Sri Sathya Sai Institute of Actuaries
              </span>
            </a>
          </div>

          {/* Center Column: Proud Initiatives */}
          <div className="flex flex-col items-center justify-start gap-2.5 text-center justify-self-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/45">
              Proud initiatives
            </span>
            <div className="flex items-center justify-center gap-4 sm:gap-5 max-w-full">
              <Image
                src="/badges/atmanirbhar-bharat-seal.png"
                alt="Atmanirbhar Bharat"
                width={142}
                height={142}
                sizes="(min-width: 1024px) 132px, 96px"
                className="w-20 h-20 sm:w-24 sm:h-24 lg:w-[124px] lg:h-[124px] object-contain drop-shadow-md"
                style={{ transform: "rotate(0deg)" }}
              />
              <Image
                src="/badges/made-in-india-badge.png"
                alt="Made in India"
                width={224}
                height={112}
                sizes="(min-width: 1024px) 224px, 128px"
                className="w-auto h-14 sm:h-16 lg:h-[96px] max-w-full object-contain drop-shadow-md"
              />
            </div>
          </div>

          {/* Right Column: Explore Links */}
          <nav className="flex flex-col gap-2.5 lg:items-end lg:justify-self-end">
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
        </div>

        <div className="pt-6 border-t border-foreground/8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-[11px] text-foreground/50">
            © 2026{" "}
            <a
              href="https://www.sssia.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition-colors"
            >
              sssia.org
            </a>
            . All rights reserved.
          </span>
          <span className="text-[11px] text-foreground/40">
            Built on ECMWF ERA5-Land and ORAS5 reanalysis.
          </span>
        </div>
      </div>
    </footer>
  );
}
