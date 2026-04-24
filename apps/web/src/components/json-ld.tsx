import type { JsonLdObject } from '@/lib/seo';

/**
 * Escape characters that would let a payload break out of a `<script>` tag.
 * `JSON.stringify` does not escape `<`, `>`, `&`, U+2028, or U+2029, so a
 * user-supplied string containing e.g. `</script>` would otherwise close the
 * tag prematurely and enable arbitrary script injection. Values can reach
 * this component via trainer names, company descriptions, job titles, etc.
 */
function escapeForScriptTag(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

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
          dangerouslySetInnerHTML={{ __html: escapeForScriptTag(item) }}
        />
      ))}
    </>
  );
}
