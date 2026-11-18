// Synthetic fixtures only. These URLs are not live product evidence.
export const EXAMPLE_NOW = Date.parse('2026-11-11T12:00:00Z');

export function verifiedPart(category, socket = 'AM5', now = Date.now(), suffix = '') {
  const sourceUrl = `https://example.invalid/products/${category}${suffix}`;
  return {id: category + suffix, name: `Selected ${category}${suffix}`, category,
    sourceUrl, specs: {socket, socketProvenance: {
      sourceUrl, sourceField: 'CPU Socket', rawValue: socket, method: 'explicit_product_spec',
      verifiedAt: new Date(now - 1000).toISOString(),
      expiresAt: new Date(now + 3599000).toISOString(),
    }}};
}
