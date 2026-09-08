import { slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Khalifa Bin Salman Port', 'khalifa-bin-salman-port'],
    ['  Gulf   Aerial  Survey ', 'gulf-aerial-survey'],
    ['North Terminal (Berth 4)', 'north-terminal-berth-4'],
    ['Aéroport Zürich', 'aeroport-zurich'],
    ['---', 'organization'],
    ['', 'organization'],
  ])('%j → %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('caps the length without leaving a trailing dash', () => {
    const slug = slugify('a'.repeat(47) + ' b');
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith('-')).toBe(false);
  });
});
