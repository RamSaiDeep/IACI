import type { Metadata } from "next";

/**
 * The Nepal portal is unlisted, not private.
 *
 * Nothing on the site links to `/nepal` — the landing page's Nepal card is
 * deliberately inert — so the only way in is to be given the URL. This adds the
 * other half of that: `noindex, nofollow` keeps search engines from putting the
 * pages in results, which would otherwise make them findable by anyone despite
 * no link existing on the site itself.
 *
 * WHAT THIS IS NOT. It is not access control. The routes are built and served,
 * and `public/data/nepal/` is static, so anyone holding a URL can read it and
 * pass it on. It keeps Nepal out of the way of ordinary visitors; it does not
 * keep it from anyone determined.
 *
 * A `layout` rather than per-page metadata because Explore and Analyze are
 * client components and cannot export `metadata` themselves. This covers all
 * four routes at once.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function NepalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
