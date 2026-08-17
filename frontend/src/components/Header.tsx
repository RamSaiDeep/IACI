"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/explore", label: "Explore" },
    { href: "/analyze", label: "Analyze" },
    { href: "/about", label: "About" },
  ];

  return (
    <header className="sticky top-0 z-50 bg-header-bg text-header-fg border-b border-white/10 shadow-lg">
      <div className="mx-auto flex h-16 sm:h-20 max-w-7xl items-center justify-between px-4 sm:px-8">
        
        {/* Logo and Brand Title */}
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/" className="flex items-center gap-2.5 sm:gap-3 group">
            <div className="relative w-9 h-9 sm:w-12 sm:h-12 bg-white rounded-md overflow-hidden flex items-center justify-center shadow-inner border border-white/25 flex-shrink-0">
              <Image
                src="/sssia-logo.png"
                alt="SSSIA Logo"
                fill
                sizes="48px"
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                priority
              />
            </div>
            <span className="font-bold tracking-widest text-lg sm:text-xl text-white group-hover:text-white/90 transition-colors uppercase">
              SSSIA
            </span>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="flex items-center gap-3 sm:gap-6 md:gap-8">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative text-xs sm:text-sm font-medium tracking-wider uppercase transition-colors duration-300 py-1 sm:py-2 group ${
                  isActive ? "text-white font-semibold" : "text-white/80 hover:text-white"
                }`}
              >
                {link.label}
                <span
                  className={`absolute bottom-0 left-0 w-full h-[2px] bg-[#f26a21] origin-left transition-transform duration-300 ${
                    isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                  }`}
                />
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
