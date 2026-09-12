/**
 * A URL-safe short name from a display name: 'Khalifa Bin Salman Port' →
 * 'khalifa-bin-salman-port'. Falls back to 'organization' for a name made of
 * nothing but symbols, so a slug is never empty.
 */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');

  return slug.length > 0 ? slug : 'organization';
}
