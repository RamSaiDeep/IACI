"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface HeaderProps {
  portal?: "global" | "india" | "nepal";
}

export default function Header({ portal }: HeaderProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Portal mode comes from the prop, or from the path when none is given.
  // India's routes are top-level for historical reasons (/explore, /analyze);
  // every country added since is namespaced under its own slug.
  const activePortal: "global" | "india" | "nepal" =
    portal ??
    (pathname.startsWith("/nepal")
      ? "nepal"
      : pathname.startsWith("/india") || pathname === "/explore" || pathname === "/analyze"
        ? "india"
        : "global");

  const isIndiaPortal = activePortal === "india";
  const isNepalPortal = activePortal === "nepal";

  const homeHref = isIndiaPortal ? "/india" : isNepalPortal ? "/nepal" : "/";
  const brandTitleMobile = isIndiaPortal ? "IACI v1" : isNepalPortal ? "NACI v1" : "ACI";
  const brandTitleDesktop = isIndiaPortal
    ? "Indian Actuaries Climate Index v1"
    : isNepalPortal
      ? "Nepal Actuaries Climate Index v1"
      : "Actuaries Climate Index";
  const portalSubtitle = isIndiaPortal
    ? "Indian Actuaries Climate Index (IACI)"
    : isNepalPortal
      ? "Nepal Actuaries Climate Index (NACI)"
      : "Actuaries Climate Index (ACI)";

  const navLinks = isIndiaPortal
    ? [
        { href: "/india", label: "Home" },
        { href: "/explore", label: "Explore" },
        { href: "/analyze", label: "Analyze" },
        { href: "/india/about", label: "About the Index" },
      ]
    : isNepalPortal
      ? [
          { href: "/nepal", label: "Home" },
          { href: "/nepal/explore", label: "Explore" },
          { href: "/nepal/analyze", label: "Analyze" },
          { href: "/nepal/about", label: "About the Index" },
        ]
      : [
          { href: "/", label: "Home" },
          { href: "/about", label: "About the Index" },
        ];

  // The drawer's own links close it on click; keying the open state to the
  // current path also closes it when navigation comes from elsewhere
  const [openedAt, setOpenedAt] = useState(pathname);
  const isOpen = mobileMenuOpen && openedAt === pathname;

  const toggleMenu = () => {
    setOpenedAt(pathname);
    setMobileMenuOpen(!isOpen);
  };

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);

    drawerRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <header className="sticky top-0 z-50 bg-header-bg text-header-fg border-b border-white/10 shadow-card-lg">
      <div className="mx-auto flex h-(--header-h) max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Logo and Brand Title */}
        <Link href={homeHref} className="flex min-w-0 items-center gap-2.5 sm:gap-3 group">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-lg overflow-hidden flex items-center justify-center ring-1 ring-white/30 flex-shrink-0 shadow-sm">
            <Image
              src="/sssia-logo.png"
              alt="Sri Sathya Sai Institute of Actuaries"
              width={128}
              height={128}
              sizes="48px"
              quality={95}
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
              priority
            />
          </div>

          <span className="flex flex-col leading-none gap-1 min-w-0">
            <span className="font-semibold tracking-tight text-white group-hover:text-white/90 transition-colors uppercase text-base sm:text-lg lg:text-xl truncate">
              <span className="sm:hidden">{brandTitleMobile}</span>
              <span className="hidden sm:inline">{brandTitleDesktop}</span>
            </span>
            <span className="font-semibold tracking-[0.14em] text-[9px] sm:text-[11px] text-white/55 uppercase">
              SSSIA
            </span>
          </span>
        </Link>

        {/* Desktop Navigation Links (md and above) */}
        <div className="hidden md:flex items-center gap-5 lg:gap-8">
          <nav className="flex items-center gap-6 lg:gap-8">
            {navLinks.map((link) => {
              const isActive =
                link.href === "/" || link.href === "/india" || link.href === "/nepal"
                  ? pathname === link.href
                  : pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative text-sm lg:text-[0.9375rem] font-medium tracking-normal transition-colors duration-300 py-2 group ${
                    isActive ? "text-white font-semibold" : "text-white/75 hover:text-white"
                  }`}
                >
                  {link.label}
                  <span
                    className={`absolute bottom-0 left-0 w-full h-[2px] bg-accent origin-left transition-transform duration-300 ${
                      isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                    }`}
                  />
                </Link>
              );
            })}
          </nav>

          {/* Quick country switcher button when in country portal */}
          {(isIndiaPortal || isNepalPortal) && (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-[11px] font-bold text-white/90 uppercase tracking-widest transition-all duration-200 hover:scale-105"
              title="Return to All Countries Overview"
            >
              <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>All Countries</span>
            </Link>
          )}
        </div>

        {/* Mobile Hamburger Button (below md) */}
        <button
          type="button"
          onClick={toggleMenu}
          aria-label="Toggle navigation menu"
          aria-expanded={isOpen}
          aria-controls="mobile-nav"
          className="md:hidden inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-white hover:bg-white/10 transition-colors"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
            />
          </svg>
        </button>
      </div>

      {/* Mobile Drawer */}
      {isOpen && (
        <div
          id="mobile-nav"
          ref={drawerRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          className="md:hidden fixed inset-x-0 top-(--header-h) bottom-0 z-40 bg-header-bg border-t border-white/10 flex flex-col p-6 overflow-y-auto overscroll-contain animate-drawer outline-none"
        >
          <nav className="flex flex-col gap-2">
            {navLinks.map((link) => {
              const isActive =
                link.href === "/" || link.href === "/india" || link.href === "/nepal"
                  ? pathname === link.href
                  : pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-colors ${
                    isActive
                      ? "bg-accent text-white shadow-lg shadow-accent/20"
                      : "text-white/80 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <span>{link.label}</span>
                  {isActive ? (
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  ) : (
                    <svg
                      className="w-4 h-4 text-white/40"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  )}
                </Link>
              );
            })}

            {(isIndiaPortal || isNepalPortal) && (
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-2 flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-white/20 text-xs font-bold uppercase tracking-wider text-white/90 hover:bg-white/10 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Switch to All Countries</span>
                </span>
                <span className="text-[10px] text-white/50">Overview →</span>
              </Link>
            )}
          </nav>

          {/* Quick info in mobile drawer footer */}
          <div className="mt-auto pt-8 border-t border-white/10 flex flex-col gap-2 text-white/60 text-xs">
            <span className="text-accent font-bold tracking-widest uppercase text-[10px]">
              Sri Sathya Sai Institute of Actuaries
            </span>
            <span className="text-white/50 text-[11px]">
              {portalSubtitle}
            </span>
          </div>
        </div>
      )}
    </header>
  );
}
