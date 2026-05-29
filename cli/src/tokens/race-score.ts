export type RaceScoreState = {
  ackedReading: number;    // disk total the server has counted up to (advances on ack)
  lastGoodReading: number; // most recent successful disk total
  seq: number;             // last acknowledged heartbeat sequence
};

export type BeatSnapshot = { seq: number; delta: number; reading: number };

const STALL_THRESHOLD = 5;

export class RaceScoreTracker {
  private acked: number;
  private lastGood: number;
  private seq: number;
  private stalls = 0;

  constructor(init: RaceScoreState) {
    this.acked = init.ackedReading;
    this.lastGood = init.lastGoodReading;
    this.seq = init.seq;
  }

  /**
   * Record a scan result.
   * - `null` → scan failed/timed-out/missing dir: a stall (counts toward the warning), anchors untouched.
   * - `0` → readable but empty: the read mechanism works (resets the stall counter), but we never anchor to 0.
   * - `> 0` → real reading; follows up or down.
   */
  recordReading(reading: number | null): void {
    if (reading === null) { this.stalls += 1; return; }
    this.stalls = 0;
    if (reading > 0) this.lastGood = reading;
  }

  /** Frozen payload for the next heartbeat. Pure — call repeatedly for retries. */
  nextBeat(): BeatSnapshot {
    return { seq: this.seq + 1, delta: Math.max(0, this.lastGood - this.acked), reading: this.lastGood };
  }

  /** Commit a heartbeat the server accepted. `serverLastSeq` self-heals drift. */
  ack(snapshot: BeatSnapshot, serverLastSeq: number): void {
    this.acked = snapshot.reading;
    this.seq = Math.max(snapshot.seq, serverLastSeq);
  }

  /** Pin the anchor to the latest reading so the next delta is 0 (used while a race is pending). */
  reprime(): void {
    this.acked = this.lastGood;
  }

  get stalled(): boolean {
    return this.stalls >= STALL_THRESHOLD;
  }

  toState(): RaceScoreState {
    return { ackedReading: this.acked, lastGoodReading: this.lastGood, seq: this.seq };
  }
}
