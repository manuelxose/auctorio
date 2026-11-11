import { clampDescription } from './seo.service';

describe('clampDescription', () => {
  it('returns short descriptions unchanged, with whitespace collapsed', () => {
    expect(clampDescription('  Plan,   draft and publish. ')).toBe('Plan, draft and publish.');
  });

  it('cuts long descriptions at a word boundary within 160 characters', () => {
    const long = 'word '.repeat(60).trim();

    const result = clampDescription(long);

    expect(result.length).toBeLessThanOrEqual(160);
    expect(result.endsWith('word…')).toBeTrue();
  });
});
