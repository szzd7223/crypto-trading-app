// ============================================================
// Delivery Tier Manager — Hysteresis State Machine
//
// Plain English:
//  Watches the client's reported latency (ping time) and decides
//  how often to send chart updates. Uses "hysteresis" to avoid
//  constantly switching tiers when the connection is borderline.
//
//  Think of it like a thermostat with two thresholds — it won't
//  turn on heat the moment temp drops 0.1°, only after it's been
//  cold for a while.
//
// Tiers:
//  FULL     — real-time, every trade event
//  DEGRADED — batch every 2 seconds
//  MINIMAL  — batch every 10 seconds
//
// Tier change rules:
//  Upgrade (e.g. DEGRADED → FULL): 3 consecutive good reports
//  Downgrade (e.g. FULL → DEGRADED): 2 consecutive bad reports
//  No report for 30s: stay at current tier (don't punish silence)
//  On connect: start at FULL
// ============================================================

import type { DeliveryTier } from '../types.js';

export interface TierThresholds {
  rttMs: number;
  jitterMs: number;
}

export const TIER_CONFIG: Record<DeliveryTier, { rateMs: number; thresholds: TierThresholds }> = {
  full:     { rateMs: 0,      thresholds: { rttMs: 150,  jitterMs: 50  } },
  degraded: { rateMs: 2_000,  thresholds: { rttMs: 500,  jitterMs: 150 } },
  minimal:  { rateMs: 10_000, thresholds: { rttMs: Infinity, jitterMs: Infinity } },
};

/** Number of consecutive bad reports needed to downgrade */
const DOWNGRADE_THRESHOLD = 2;
/** Number of consecutive good reports needed to upgrade */
const UPGRADE_THRESHOLD = 3;
/** If no report for this long, keep current tier */
const MAX_SILENCE_MS = 30_000;

export interface TierManagerState {
  tier: DeliveryTier;
  rateMs: number;
  consecutiveBad: number;
  consecutiveGood: number;
  lastReportTs: number;
  override: DeliveryTier | null;
}

export class TierManager {
  private state: TierManagerState = {
    tier: 'full',
    rateMs: TIER_CONFIG.full.rateMs,
    consecutiveBad: 0,
    consecutiveGood: 0,
    lastReportTs: Date.now(),
    override: null,
  };

  private listeners: Array<(tier: DeliveryTier, rateMs: number) => void> = [];

  /** Subscribe to tier change events */
  onChange(listener: (tier: DeliveryTier, rateMs: number) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  get currentTier(): DeliveryTier {
    return this.state.override ?? this.state.tier;
  }

  get currentRateMs(): number {
    const effective = this.state.override ?? this.state.tier;
    return TIER_CONFIG[effective].rateMs;
  }

  get lastReportTs(): number {
    return this.state.lastReportTs;
  }

  /**
   * Call this whenever a LATENCY_REPORT is received from the client.
   * Returns true if the tier changed.
   */
  processReport(rtt: number, jitter: number): boolean {
    this.state.lastReportTs = Date.now();

    // If an override is active, still track state but don't emit changes
    const isBad = this.classifyReport(rtt, jitter);

    if (isBad) {
      this.state.consecutiveBad++;
      this.state.consecutiveGood = 0;
    } else {
      this.state.consecutiveGood++;
      this.state.consecutiveBad = 0;
    }

    const previousTier = this.state.tier;
    this.evaluateTier();

    const tierChanged = this.state.tier !== previousTier;
    if (tierChanged && !this.state.override) {
      this.emit();
    }

    return tierChanged;
  }

  /**
   * Force a specific tier override (debug control).
   * Pass null to remove the override and return to automatic.
   */
  setOverride(tier: DeliveryTier | null): void {
    this.state.override = tier;
    this.emit();
  }

  /** Snapshot of internal state — useful for debugging and tests */
  getState(): Readonly<TierManagerState> {
    return { ...this.state };
  }

  /** Reset to initial state (e.g. after reconnect) */
  reset(): void {
    this.state = {
      tier: 'full',
      rateMs: TIER_CONFIG.full.rateMs,
      consecutiveBad: 0,
      consecutiveGood: 0,
      lastReportTs: Date.now(),
      override: null,
    };
    this.emit();
  }

  // ---- Private ----

  /**
   * Returns true if rtt/jitter exceeds the CURRENT tier's upper threshold.
   * This defines "bad" relative to what we're already doing.
   */
  private classifyReport(rtt: number, jitter: number): boolean {
    const tier = this.state.tier;
    const thresholds = TIER_CONFIG[tier].thresholds;
    return rtt > thresholds.rttMs || jitter > thresholds.jitterMs;
  }

  private evaluateTier(): void {
    const { tier, consecutiveBad, consecutiveGood } = this.state;

    // Downgrade path
    if (consecutiveBad >= DOWNGRADE_THRESHOLD) {
      if (tier === 'full') {
        this.state.tier = 'degraded';
        this.state.rateMs = TIER_CONFIG.degraded.rateMs;
        this.state.consecutiveBad = 0;
      } else if (tier === 'degraded') {
        this.state.tier = 'minimal';
        this.state.rateMs = TIER_CONFIG.minimal.rateMs;
        this.state.consecutiveBad = 0;
      }
      // Already minimal — no further downgrade
    }

    // Upgrade path
    if (consecutiveGood >= UPGRADE_THRESHOLD) {
      if (tier === 'minimal') {
        this.state.tier = 'degraded';
        this.state.rateMs = TIER_CONFIG.degraded.rateMs;
        this.state.consecutiveGood = 0;
      } else if (tier === 'degraded') {
        this.state.tier = 'full';
        this.state.rateMs = TIER_CONFIG.full.rateMs;
        this.state.consecutiveGood = 0;
      }
      // Already full — no further upgrade
    }
  }

  private emit(): void {
    const effective = this.state.override ?? this.state.tier;
    const rateMs = TIER_CONFIG[effective].rateMs;
    for (const listener of this.listeners) {
      listener(effective, rateMs);
    }
  }
}
