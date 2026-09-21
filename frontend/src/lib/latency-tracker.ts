// ============================================================
// Latency Tracker
//
// Measures RTT (round-trip time) by sending pings and receiving pongs.
// Jitter = rolling standard deviation of the last N RTT samples.
// ============================================================

const SAMPLE_SIZE = 5;
/** Pending pings older than this are considered lost and removed */
const PING_EXPIRY_MS = 30_000;

export class LatencyTracker {
  private samples: number[] = [];
  private pendingPings = new Map<string, number>(); // id → sentTs

  recordPing(id: string): void {
    this.pendingPings.set(id, Date.now());
  }

  recordPong(
    id: string,
    _clientTs: number,
  ): { rtt: number; jitter: number } | null {
    // Sweep expired pings to prevent unbounded Map growth on packet loss
    const now = Date.now();
    for (const [pendingId, sentTs] of this.pendingPings) {
      if (now - sentTs > PING_EXPIRY_MS) this.pendingPings.delete(pendingId);
    }

    const sentTs = this.pendingPings.get(id);
    if (sentTs === undefined) return null;

    this.pendingPings.delete(id);
    const rtt = now - sentTs;

    this.samples.push(rtt);
    if (this.samples.length > SAMPLE_SIZE) {
      this.samples.shift();
    }

    return { rtt, jitter: this.computeJitter() };
  }

  private computeJitter(): number {
    if (this.samples.length < 2) return 0;
    const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    const variance =
      this.samples.reduce((sum, s) => sum + (s - mean) ** 2, 0) /
      this.samples.length;
    return Math.round(Math.sqrt(variance));
  }
}
