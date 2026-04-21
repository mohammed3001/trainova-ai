export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
  return base || `item-${Date.now()}`;
}

export function randomSuffix(len = 5): string {
  return Math.random().toString(36).slice(2, 2 + len);
}
