import { describe, it, expect, afterEach } from 'vitest';
import { PRIMARY_TOP_CONVERSATIONS, primaryConversationCap } from '../../src/tokens/primary-cap.js';

afterEach(() => { delete process.env.TOKEN_DERBY_PRIMARY_TOP5; });

describe('primaryConversationCap', () => {
  it('is Infinity (off) by default', () => {
    expect(primaryConversationCap()).toBe(Infinity);
  });
  it('is 5 when the flag is "1" or "true" (case-insensitive)', () => {
    for (const v of ['1', 'true', 'TRUE', ' True ']) {
      process.env.TOKEN_DERBY_PRIMARY_TOP5 = v;
      expect(primaryConversationCap()).toBe(PRIMARY_TOP_CONVERSATIONS);
    }
    expect(PRIMARY_TOP_CONVERSATIONS).toBe(5);
  });
  it('is Infinity for unrecognised values', () => {
    for (const v of ['0', 'false', 'yes', '']) {
      process.env.TOKEN_DERBY_PRIMARY_TOP5 = v;
      expect(primaryConversationCap()).toBe(Infinity);
    }
  });
});
