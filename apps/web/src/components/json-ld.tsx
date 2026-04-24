import type { JsonLdObject } from '@/lib/seo';

/**
 * Renders one or more JSON-LD blobs as a `<script type="application/ld+json">`
 * tag. Safe to drop inside any server component — Next.js hoists scripts in
 * page/layout RSC output to the document body without hydration cost.
 */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  const payload = Array.isArray(data) ? data : [data];
  return (
    <>
      {payload.map((item, idx) => (
        <script
          // Each blob is a distinct schema entity; keying by position is fine
          // because the same page always emits the same ordered set.
          key={idx}
          type="application/ld+json"
          // JSON.stringify is safe because every helper in `@/lib/seo` builds
          // plain objects from server-side data that was already validated by
          // the API; no user-supplied HTML ever reaches this string.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  );
}
