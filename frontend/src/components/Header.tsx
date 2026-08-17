"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/explore", label: "Explore" },
    { href: "/analyze", label: "Analyze" },
    { href: "/about", label: "About" },
    { href: "/faq", label: "FAQ" },
  ];

  // Close mobile menu on page navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Prevent background scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [mobileMenuOpen]);

  return (
    <header className="sticky top-0 z-50 bg-header-bg text-header-fg border-b border-white/10 shadow-lg">
      <div className="mx-auto flex h-16 sm:h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Logo and Brand Title */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 sm:gap-3 group">
            <div className="relative w-9 h-9 sm:w-11 sm:h-11 bg-white rounded-md overflow-hidden flex items-center justify-center shadow-inner border border-white/25 flex-shrink-0">
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

        {/* Desktop Navigation Links (md and above) */}
        <nav className="hidden md:flex items-center gap-6 lg:gap-8">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative text-xs lg:text-sm font-medium tracking-wider uppercase transition-colors duration-300 py-2 group ${
                  isActive ? "text-white font-semibold" : "text-white/75 hover:text-white"
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

        {/* Mobile Hamburger Button (below md) */}
        <div className="flex md:hidden items-center">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="p-2 rounded-lg text-white hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26a21]"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer / Slide-Down Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-16 bottom-0 z-40 bg-[#0b2b5f]/95 backdrop-blur-xl border-t border-white/10 flex flex-col p-6 overflow-y-auto animate-in fade-in slide-in-from-top-4 duration-200">
          <nav className="flex flex-col gap-2">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-4 py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
                    isActive
                      ? "bg-[#f26a21] text-white shadow-lg shadow-[#f26a21]/20"
                      : "text-white/80 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <span>{link.label}</span>
                  {isActive ? (
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  ) : (
                    <svg className="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Quick info in mobile drawer footer */}
          <div className="mt-auto pt-8 border-t border-white/10 flex flex-col gap-2 text-white/60 text-xs">
            <span className="text-[#f26a21] font-bold tracking-widest uppercase text-[10px]">
              Sri Sathya Sai Institute of Actuaries
            </span>
            <span className="text-white/50 text-[11px]">
              Indian Actuarial Climate Index (IACI)
            </span>
          </div>
        </div>
      )}
    </header>
  );
}
