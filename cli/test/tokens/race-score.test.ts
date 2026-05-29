import { describe, it, expect } from 'vitest';
import { RaceScoreTracker } from '../../src/tokens/race-score.js';

function fresh(diskNow: number) {
  // Mirrors join-time priming: anchors = current disk, seq from server.
  return new RaceScoreTracker({ ackedReading: diskNow, lastGoodReading: diskNow, seq: 0 });
}

describe('RaceScoreTracker', () => {
  it('credits genuine growth as a non-negative delta and advances on ack', () => {
    const t = fresh(100);
    t.recordReading(130);
    const b1 = t.nextBeat();
    expect(b1).toEqual({ seq: 1, delta: 30, reading: 130 });
    t.ack(b1, 1);
    t.recordReading(175);
    const b2 = t.nextBeat();
    expect(b2).toEqual({ seq: 2, delta: 45, reading: 175 });
  });

  it('does not advance the anchor until ack (retries resend the same delta)', () => {
    const t = fresh(100);
    t.recordReading(130);
    const a = t.nextBeat();
    const b = t.nextBeat(); // retry, no ack between
    expect(a).toEqual(b);
  });

  it('treats a failed scan (null) as a stall: no delta, no anchor move', () => {
    const t = fresh(100);
    t.recordReading(200); const b = t.nextBeat(); t.ack(b, 1); // anchor at 200
    t.recordReading(null);
    expect(t.nextBeat().delta).toBe(0);
  });

  it('ignores a zero reading (never anchors to 0)', () => {
    const t = fresh(500);
    t.recordReading(600); t.ack(t.nextBeat(), 1);
    t.recordReading(0); // e.g. empty dir
    expect(t.nextBeat().delta).toBe(0);
    expect(t.nextBeat().reading).toBe(600);
  });

  it('follows a real deletion down so new work credits from the new floor', () => {
    const t = fresh(0);
    t.recordReading(1000); t.ack(t.nextBeat(), 1); // acked 1000
    t.recordReading(400);                          // deletion (positive, real)
    const b = t.nextBeat();
    expect(b.delta).toBe(0);
    t.ack(b, 2);                                   // acked follows down to 400
    t.recordReading(450);
    expect(t.nextBeat().delta).toBe(50);
  });

  it('self-heals seq from the server on ack', () => {
    const t = fresh(0);
    t.recordReading(10);
    const b = t.nextBeat();          // seq 1
    t.ack(b, 7);                     // server says last_seq 7
    t.recordReading(20);
    expect(t.nextBeat().seq).toBe(8);
  });

  it('reprime() pins the anchor to the latest reading (pending → no credit)', () => {
    const t = fresh(0);
    t.recordReading(5000);
    t.reprime();
    expect(t.nextBeat().delta).toBe(0);
  });

  it('flags a stall only after 5 consecutive failed scans; resets on success', () => {
    const t = fresh(100);
    for (let i = 0; i < 4; i++) t.recordReading(null);
    expect(t.stalled).toBe(false);
    t.recordReading(null);
    expect(t.stalled).toBe(true);
    t.recordReading(120); // a successful read resets it
    expect(t.stalled).toBe(false);
  });

  it('a successful zero read resets the stall counter (read mechanism works)', () => {
    const t = fresh(100);
    for (let i = 0; i < 5; i++) t.recordReading(null);
    expect(t.stalled).toBe(true);
    t.recordReading(0);
    expect(t.stalled).toBe(false);
  });

  it('round-trips persisted state', () => {
    const t = fresh(0);
    t.recordReading(300); t.ack(t.nextBeat(), 4);
    const s = t.toState();
    expect(s).toEqual({ ackedReading: 300, lastGoodReading: 300, seq: 4 });
    const t2 = new RaceScoreTracker(s);
    t2.recordReading(350);
    expect(t2.nextBeat()).toEqual({ seq: 5, delta: 50, reading: 350 });
  });
});
