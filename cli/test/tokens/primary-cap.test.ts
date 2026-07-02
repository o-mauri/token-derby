import { describe, it, expect } from 'vitest';
import { PRIMARY_TOP_CONVERSATIONS, primaryConversationCap } from '../../src/tokens/primary-cap.js';

describe('primaryConversationCap', () => {
  it('is Infinity (off) when disabled', () => {
    expect(primaryConversationCap(false)).toBe(Infinity);
  });
  it('is PRIMARY_TOP_CONVERSATIONS (5) when enabled', () => {
    expect(primaryConversationCap(true)).toBe(PRIMARY_TOP_CONVERSATIONS);
    expect(PRIMARY_TOP_CONVERSATIONS).toBe(5);
  });
});
