import { describe, it, expect } from 'vitest';
import { zeroPerFamily } from '@token-derby/shared';
import { nextLedgerBase, reconcileLedger, resolveLedger, type ResolvedLedger } from '../../src/lib/heartbeat-ledger.js';

const tokens = (anthropic: number, openai = 0, google = 0) => ({ anthropic, openai, google });

const ROOM = 5_000_000;

const ledgerOf = (counted: ReturnType<typeof tokens>, components = counted, seq = 1): ResolvedLedger => ({ seq, components, counted });

describe('resolveLedger', () => {
  describe('when the ledger is well formed', () => {
    it('resolves each family, whichever spelling the CLI used', () => {
      const actual = resolveLedger({ seq: 3, components: { claude: 10, codex: 5 }, counted: { anthropic: 40, openai: 5 } }, 10);
      expect(actual).toEqual({ seq: 3, components: tokens(10, 5), counted: tokens(40, 5) });
    });
  });

  describe('when it is missing or unusable', () => {
    it.each([
      ['absent', undefined],
      ['not an object', 'x' as any],
      ['a seq below one', { seq: 0, components: {}, counted: {} }],
      ['a non-numeric seq', { seq: 'a' as any, components: {}, counted: {} }],
      ['no counted', { seq: 1, components: {} } as any],
      ['no components', { seq: 1, counted: {} } as any],
    ])('returns null for %s', (_name, raw) => {
      expect(resolveLedger(raw, 10)).toBeNull();
    });

    it('accepts the last seq the server applied, and any before it', () => {
      expect(resolveLedger({ seq: 10, components: {}, counted: {} }, 10)?.seq).toBe(10);
      expect(resolveLedger({ seq: 4, components: {}, counted: {} }, 10)?.seq).toBe(4);
    });

    it('returns null for a seq beyond the last the server applied, which names a beat that has not happened', () => {
      expect(resolveLedger({ seq: 11, components: {}, counted: {} }, 10)).toBeNull();
    });

    it('counts a negative or non-finite figure as zero', () => {
      const actual = resolveLedger({ seq: 1, components: { anthropic: -5 }, counted: { anthropic: Number.NaN } }, 10);
      expect(actual?.components.anthropic).toBe(0);
      expect(actual?.counted.anthropic).toBe(0);
    });
  });
});

describe('reconcileLedger', () => {
  describe('when there is nothing to check against', () => {
    it('corrects nothing without a ledger', () => {
      const actual = reconcileLedger({ ledger: null, modelTokens: tokens(500), ledgerBase: tokens(0), headroom: ROOM });
      expect(actual.fix).toEqual(zeroPerFamily());
    });

    it('corrects nothing without a base', () => {
      const actual = reconcileLedger({ ledger: ledgerOf(tokens(100)), modelTokens: tokens(500), ledgerBase: undefined, headroom: ROOM });
      expect(actual.fix).toEqual(zeroPerFamily());
    });
  });

  describe('when the server and the CLI agree', () => {
    it('corrects nothing, whatever the base is', () => {
      const actual = reconcileLedger({ ledger: ledgerOf(tokens(100, 20)), modelTokens: tokens(1_100, 220), ledgerBase: tokens(1_000, 200), headroom: ROOM });
      expect(actual.drift).toEqual(zeroPerFamily());
      expect(actual.fix).toEqual(zeroPerFamily());
    });
  });

  describe('when the server holds tokens the CLI never counted', () => {
    it('removes them', () => {
      const actual = reconcileLedger({ ledger: ledgerOf(tokens(100)), modelTokens: tokens(5_100), ledgerBase: tokens(0), headroom: ROOM });
      expect(actual.drift.anthropic).toBe(-5_000);
      expect(actual.fix.anthropic).toBe(-5_000);
    });

    it('never removes more than the server holds', () => {
      const actual = reconcileLedger({ ledger: ledgerOf(tokens(0)), modelTokens: tokens(60), ledgerBase: tokens(-1_000), headroom: ROOM });
      expect(actual.drift.anthropic).toBe(-1_060);
      expect(actual.fix.anthropic).toBe(-60);
    });

    it('checks each family on its own', () => {
      const actual = reconcileLedger({ ledger: ledgerOf(tokens(100, 50)), modelTokens: tokens(100, 450), ledgerBase: tokens(0), headroom: ROOM });
      expect(actual.fix).toEqual(tokens(0, -400, 0));
    });
  });

  describe('when the CLI counted tokens the server never applied', () => {
    it('gives them back', () => {
      const actual = reconcileLedger({ ledger: ledgerOf(tokens(130), tokens(100)), modelTokens: tokens(100), ledgerBase: tokens(0), headroom: ROOM });
      expect(actual.fix.anthropic).toBe(30);
    });

    it('never gives back more than the room the request has left under the sanity cap', () => {
      const actual = reconcileLedger({ ledger: ledgerOf(tokens(1e12), tokens(1e12)), modelTokens: tokens(100), ledgerBase: tokens(0), headroom: 4_999_990 });
      expect(actual.fix.anthropic).toBe(4_999_990);
    });

    it('shares what room there is between families in proportion', () => {
      const actual = reconcileLedger({ ledger: ledgerOf(tokens(1_000, 3_000), tokens(1_000, 3_000)), modelTokens: tokens(0), ledgerBase: tokens(0), headroom: 2_000 });
      expect(actual.fix.anthropic).toBe(500);
      expect(actual.fix.openai).toBe(1_500);
    });

    it('gives nothing back when the request has no room left', () => {
      const actual = reconcileLedger({ ledger: ledgerOf(tokens(500), tokens(500)), modelTokens: tokens(0), ledgerBase: tokens(0), headroom: 0 });
      expect(actual.fix.anthropic).toBe(0);
    });

    it('never limits a removal by the room, since removing adds nothing', () => {
      const actual = reconcileLedger({ ledger: ledgerOf(tokens(100)), modelTokens: tokens(5_100), ledgerBase: tokens(0), headroom: 0 });
      expect(actual.fix.anthropic).toBe(-5_000);
    });

    it('never gives back more than the previous beat claimed', () => {
      const actual = reconcileLedger({ ledger: ledgerOf(tokens(1_000_100), tokens(100)), modelTokens: tokens(100), ledgerBase: tokens(0), headroom: ROOM });
      expect(actual.drift.anthropic).toBe(1_000_000);
      expect(actual.fix.anthropic).toBe(100);
    });
  });
});

describe('nextLedgerBase', () => {
  describe('when a beat was applied in full', () => {
    it('leaves the base where it was', () => {
      const actual = nextLedgerBase({ modelTokensAfter: tokens(1_150), ledger: ledgerOf(tokens(100)), claimed: tokens(50) });
      expect(actual).toEqual(tokens(1_000));
    });
  });

  describe('when it is a process\'s first beat', () => {
    it('measures from what the server held before the beat', () => {
      const actual = nextLedgerBase({ modelTokensAfter: tokens(1_050), ledger: null, claimed: tokens(50) });
      expect(actual).toEqual(tokens(1_000));
    });
  });

  describe('when the server applied less than was claimed', () => {
    it('absorbs the difference, so it is never read as drift later', () => {
      const base = nextLedgerBase({ modelTokensAfter: tokens(5_000_000), ledger: null, claimed: tokens(30_000_000) });
      const next = reconcileLedger({ ledger: ledgerOf(tokens(30_000_000)), modelTokens: tokens(5_000_000), ledgerBase: base, headroom: ROOM });
      expect(next.fix).toEqual(zeroPerFamily());
    });
  });
});
