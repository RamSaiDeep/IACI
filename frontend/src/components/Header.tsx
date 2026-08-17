"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/analyze", label: "Analyze" },
  { href: "/about", label: "About & FAQ" },
];

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // The drawer's own links close it on click; keying the open state to the
  // current path also closes it when navigation comes from elsewhere (browser
  // back, for instance) without a state-syncing effect.
  const [openedAt, setOpenedAt] = useState(pathname);
  const isOpen = mobileMenuOpen && openedAt === pathname;

  const toggleMenu = () => {
    setOpenedAt(pathname);
    setMobileMenuOpen(!isOpen);
  };

  // Lock background scroll while the drawer is up, and put Escape back in the
  // user's hands. The previous inline value is restored rather than blanked, so
  // a lock owned by something else survives this one.
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
    // The blur lives on the layer below, never on <header> itself: an element
    // with a backdrop-filter becomes the containing block for its fixed-position
    // descendants, which would resolve the drawer's inset against this 4rem bar
    // instead of the viewport and collapse it to a sliver.
    <header className="sticky top-0 z-50 bg-header-bg text-header-fg border-b border-white/10 shadow-card-lg">

      <div className="mx-auto flex h-(--header-h) max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Logo and Brand Title */}
        <Link href="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3 group">
          {/* The source is a 640px lossy JPEG on a white field, so it is
              requested at 128px (srcset also emits 256px for retina) and at
              near-lossless quality — Next's default of 75 re-compresses an
              already-compressed logo and visibly muddies the fine detail.
              object-contain keeps the mark uncropped whatever its aspect. */}
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
          {/* The site's own name leads; SSSIA (the publishing institute) sits
              underneath as a small subtitle rather than as the brand itself.
              "IACI" stands in for the full name below sm, where there isn't
              room for "Indian Actuarial Climate Index" at a legible size. */}
          <span className="flex flex-col leading-none gap-1 min-w-0">
            <span className="font-semibold tracking-tight text-white group-hover:text-white/90 transition-colors uppercase text-base sm:text-lg lg:text-xl truncate">
              <span className="sm:hidden">IACI</span>
              <span className="hidden sm:inline">Indian  Actuarial  Climate  Index</span>
            </span>
            <span className="font-bold italic tracking-[0.05em] text-[9px] sm:text-[12px] text-white/55 uppercase">
              SSSIA
            </span>
          </span>
        </Link>

        {/* Desktop Navigation Links (md and above) */}
        <nav className="hidden md:flex items-center gap-6 lg:gap-8">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`relative text-xs lg:text-sm font-medium tracking-wider uppercase transition-colors duration-300 py-2 group ${isActive ? "text-white font-semibold" : "text-white/75 hover:text-white"
                  }`}
              >
                {link.label}
                <span
                  className={`absolute bottom-0 left-0 w-full h-[2px] bg-accent origin-left transition-transform duration-300 ${isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                    }`}
                />
              </Link>
            );
          })}
        </nav>

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

      {/* Mobile Drawer. Fixed to the viewport and offset by the same
          --header-h the bar above is sized from, so the two can never drift
          apart at a breakpoint. Opaque rather than blurred: it covers the page
          outright, so a full-screen backdrop-filter would cost a repaint of
          everything behind it for an effect nobody sees. */}
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
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-colors ${isActive
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
          </nav>

          {/* Quick info in mobile drawer footer */}
          <div className="mt-auto pt-8 border-t border-white/10 flex flex-col gap-2 text-white/60 text-xs">
            <span className="text-accent font-bold tracking-widest uppercase text-[10px]">
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
