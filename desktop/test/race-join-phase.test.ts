import { describe, it, expect } from 'vitest';
import { phaseAfterJoin, picksHorse } from '../src/screens/race-join.js';

describe('phaseAfterJoin', () => {
  it('goes straight to racing when the join resumed an existing horse', () => {
    expect(phaseAfterJoin({ resumed: true })).toEqual({ kind: 'racing' });
  });

  it('asks for a horse when the jockey is not in the race yet', () => {
    expect(phaseAfterJoin({ needsHorse: true })).toEqual({ kind: 'picker' });
  });

  it('carries the horse name into the take-over prompt', () => {
    expect(phaseAfterJoin({ needsConfirm: true, horseName: 'Thunder' })).toEqual({
      kind: 'confirm',
      horseName: 'Thunder',
    });
  });
});

describe('picksHorse', () => {
  it('shows the picker when joining a race the jockey is not in', () => {
    expect(picksHorse('join', { kind: 'picker' })).toBe(true);
  });

  it('never shows the picker while only watching', () => {
    // Watching someone else's race must not turn into joining it.
    expect(picksHorse('watch', { kind: 'picker' })).toBe(false);
  });

  it('does not show the picker for a resumed race', () => {
    expect(picksHorse('join', { kind: 'racing' })).toBe(false);
  });

  it('does not show the picker while awaiting take-over confirmation', () => {
    expect(picksHorse('join', { kind: 'confirm', horseName: 'Thunder' })).toBe(false);
  });

  it('does not show the picker before a join has been attempted', () => {
    expect(picksHorse('join', null)).toBe(false);
  });
});
