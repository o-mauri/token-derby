import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Guards the highest-risk detail in the CLAIM mechanic: the hat-editor's
// own serializer and catalog copy must round-trip `rollable`, or an export
// silently wipes the flag from every hat when pasted over shared/src/hats.ts.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const sharedHats = readFileSync(
  path.join(__dirname, '..', '..', 'shared', 'src', 'hats.ts'),
  'utf8'
);

// Both fmtVariant and fmtHatLine are top-level functions whose closing
// brace sits at column 0, so a non-greedy match to the next bare `}` line
// isolates each one cleanly from the surrounding browser script.
function extractFunction(src, name) {
  const re = new RegExp(`^function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`, 'm');
  const match = src.match(re);
  if (!match) throw new Error(`could not find function ${name}() in index.html`);
  return match[0];
}

const fmtVariantSrc = extractFunction(html, 'fmtVariant');
const fmtHatLineSrc = extractFunction(html, 'fmtHatLine');
const migrateHatSrc = extractFunction(html, 'migrateHat');

// fmtHatLine calls fmtVariant for non-legendary hats, so evaluate both
// declarations in one scope and hand back the one under test.
const { fmtHatLine } = new Function(
  `${fmtVariantSrc}\n${fmtHatLineSrc}\nreturn { fmtVariant, fmtHatLine };`
)();

// migrateHat references the grid/rarity constants it pads legacy hats
// against, so declare those in scope before evaluating the function body.
const { migrateHat } = new Function(
  `const HAT_WIDTH = 11;\nconst HAT_HEIGHT = 10;\n${migrateHatSrc}\nreturn { migrateHat };`
)();

const baseRows = Array.from({ length: 10 }, () => '.'.repeat(11));

const nonLegendaryHat = {
  id: 'test_hat',
  name: 'Test Hat',
  rarity: 'common',
  width: 11,
  anchor_x: 23,
  rows: baseRows,
  variants: [{ A: '#123456' }],
  rollable: true,
};

const legendaryHat = {
  id: 'test_legend',
  name: 'Test Legend',
  rarity: 'legendary',
  width: 11,
  anchor_x: 23,
  rows: baseRows,
  colors: { A: '#111111', Q: '#222222' },
  animation: { type: 'cycle', frames: ['#111111', '#222222'], fps: 5 },
  rollable: true,
};

describe('fmtHatLine (extracted from tools/hat-editor/index.html)', () => {
  it('emits rollable: true for a non-legendary hat', () => {
    const line = fmtHatLine(nonLegendaryHat);
    expect(line).toContain('variants:');
    expect(line).toContain('rollable: true');
  });

  it('emits rollable: false when the input says so', () => {
    const line = fmtHatLine({ ...nonLegendaryHat, rollable: false });
    expect(line).toContain('rollable: false');
  });

  it('emits rollable on the legendary (colors + animation) branch', () => {
    const line = fmtHatLine(legendaryHat);
    expect(line).toContain('colors:');
    expect(line).toContain('animation:');
    expect(line).toContain('rollable: true');
  });

  it('emits rollable: false on the legendary branch too', () => {
    const line = fmtHatLine({ ...legendaryHat, rollable: false });
    expect(line).toContain('rollable: false');
  });
});

describe('migrateHat (extracted from tools/hat-editor/index.html)', () => {
  it('defaults a missing rollable to true rather than leaving it undefined', () => {
    const legacyHat = {
      id: 'legacy_hat',
      name: 'Legacy Hat',
      rarity: 'common',
      width: 11,
      anchor_x: 23,
      rows: baseRows,
      variants: [{ A: '#123456' }],
      // no rollable field — mirrors pre-existing v5 localStorage entries
    };
    const migrated = migrateHat(legacyHat);
    expect(migrated.rollable).toBe(true);
  });

  it('leaves an explicit rollable: false untouched', () => {
    const hat = {
      id: 'exclusive_hat',
      name: 'Exclusive Hat',
      rarity: 'common',
      width: 11,
      anchor_x: 23,
      rows: baseRows,
      variants: [{ A: '#123456' }],
      rollable: false,
    };
    const migrated = migrateHat(hat);
    expect(migrated.rollable).toBe(false);
  });
});

describe('ORIGINAL_HATS (editor catalog copy)', () => {
  const arrayMatch = html.match(/const ORIGINAL_HATS = (\[[\s\S]*?\n\]);/);
  if (!arrayMatch) throw new Error('could not find ORIGINAL_HATS in index.html');
  const originalHats = new Function(`return ${arrayMatch[1]};`)();

  it('has rollable on every entry', () => {
    expect(Array.isArray(originalHats)).toBe(true);
    expect(originalHats.length).toBeGreaterThan(0);
    for (const hat of originalHats) {
      expect(typeof hat.rollable, `${hat.id} is missing a boolean rollable field`).toBe('boolean');
    }
  });

  it("matches shared/src/hats.ts's count of 40", () => {
    const sharedHatCount = sharedHats.match(/^\s*\{ id: /gm)?.length ?? 0;
    expect(sharedHatCount).toBe(40);
    expect(originalHats.length).toBe(sharedHatCount);
  });
});
