import { describe, it, expect } from 'vitest';
import { sendsLedger } from '../../src/lib/version.js';

describe('sendsLedger', () => {
  describe('when the CLI is the release before the ledger', () => {
    it('is false', () => {
      expect(sendsLedger('4.0.0')).toBe(false);
    });
  });

  describe('when the CLI is older than that release', () => {
    it.each(['3.9.9', '2.10.0', '1.5.0'])('is false for %s', (version) => {
      expect(sendsLedger(version)).toBe(false);
    });
  });

  describe('when the CLI is newer than that release', () => {
    it.each(['4.0.1', '4.0.99', '4.1.0', '5.0.0'])('is true for %s', (version) => {
      expect(sendsLedger(version)).toBe(true);
    });
  });

  describe('when the version cannot be read', () => {
    it('is false rather than guessing', () => {
      expect(sendsLedger('not-a-version')).toBe(false);
    });
  });
});
