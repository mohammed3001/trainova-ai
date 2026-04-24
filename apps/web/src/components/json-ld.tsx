import type { JsonLdObject } from '@/lib/seo';

/**
 * Escape characters that would otherwise let attacker-controlled string fields
 * (company names, trainer bios, request descriptions, …) break out of the
 * inline `<script>` block and execute arbitrary markup. `JSON.stringify` does
 * not escape `<`, `>`, or `&`, so a field containing `</script>` — or `<!--`,
 * or `]]>` — would terminate the JSON-LD context in a browser's HTML parser.
 *
 * Escaping every `<`, `>`, and `&` to their `\uXXXX` form keeps the JSON valid
 * (any JSON parser accepts `\u003c` in string literals) while making the
 * payload inert inside an HTML script tag.
 */
function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (ch) => {
    switch (ch) {
      case '<':
        return '\\u003c';
      case '>':
        return '\\u003e';
      case '&':
        return '\\u0026';
      case '\u2028':
        return '\\u2028';
      case '\u2029':
        return '\\u2029';
      default:
        return ch;
    }
  });
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
          dangerouslySetInnerHTML={{ __html: safeJsonForScript(item) }}
        />
      ))}
    </>
  );
}
