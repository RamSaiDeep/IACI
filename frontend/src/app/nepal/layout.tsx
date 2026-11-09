/**
 * Nepal portal layout.
 *
 * The portal is now linked from the landing page and open to search engines:
 * the earlier `noindex, nofollow` robots metadata has been removed. To make it
 * unlisted again, re-add a `metadata` export with `robots: { index: false,
 * follow: false }` here; this layout covers all Nepal routes (Explore and
 * Analyze are client components and cannot export `metadata` themselves).
 */
export default function NepalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
