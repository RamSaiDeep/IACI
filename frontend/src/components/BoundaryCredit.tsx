/** Source credit for the boundary geometry, shown under India's maps. */
export default function BoundaryCredit({ className = "" }: { className?: string }) {
  return (
    <p className={`flex items-center gap-1 text-[11px] text-foreground/55 ${className}`}>
      Geographical Boundary:
      <a
        href="https://onlinemaps.surveyofindia.gov.in/Digital_Product_Show.aspx"
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent hover:text-accent-strong underline underline-offset-4 transition-colors font-medium inline-flex items-center gap-1"
      >
        Survey of India
        <svg
          className="w-3 h-3 opacity-70"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
    </p>
  );
}
