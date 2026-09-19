// ============================================================
// Client Session
//
// One instance per connected WebSocket client. Manages:
//  1. Message parsing and routing
//  2. Ping/pong (latency measurement)
//  3. Tier decisions via TierManager
//  4. Scheduled chart update delivery per tier
//  5. Stale silence detection
// ============================================================

import { WebSocket } from 'ws';
import { TierManager, TIER_CONFIG } from './tier-manager.js';
import type {
  Trade,
  OHLCVCandle,
  OrderBookDelta,
  Interval,
  WsClientMessage,
  WsServerMessage,
  DeliveryTier,
} from '../types.js';

/** How often to check for missed latency reports */
const SILENCE_CHECK_INTERVAL_MS = 10_000;

export class ClientSession {
  private readonly id: string;
  private readonly ws: WebSocket;
  private readonly tierManager: TierManager;

  // Active interval subscription
  private subscribedInterval: Interval = '1m';

  // Pending chart update buffer for degraded/minimal tiers
  private pendingCandleUpdate: OHLCVCandle | null = null;
  private pendingTrades: Trade[] = [];

  // Timers
  private deliveryTimer: ReturnType<typeof setInterval> | null = null;
  private silenceTimer: ReturnType<typeof setInterval> | null = null;

  // Cleanup callbacks from subscriptions
  private cleanups: Array<() => void> = [];

  constructor(ws: WebSocket, id: string) {
    this.id = id;
    this.ws = ws;
    this.tierManager = new TierManager();

    this.tierManager.onChange((tier, rateMs) => {
      this.onTierChange(tier, rateMs);
    });

    this.setupDeliveryTimer();
    this.startSilenceCheck();

    // Tell the client what tier they start on
    this.send({
      type: 'connection_ready',
      tier: this.tierManager.currentTier,
      effectiveRateMs: this.tierManager.currentRateMs,
    });

    this.ws.on('message', (raw) => this.handleMessage(raw.toString()));
    this.ws.on('close', () => this.dispose());
    this.ws.on('error', () => this.dispose());
  }

  /** Called by server when a new trade arrives from the generator */
  pushTrade(trade: Trade): void {
    if (!this.isOpen()) return;

    const tier = this.tierManager.currentTier;

    if (tier === 'full') {
      // Send immediately
      this.send({ type: 'trade', data: trade });
    } else {
      // Buffer — will be flushed by delivery timer
      this.pendingTrades.push(trade);
      // Keep only last 20 buffered trades to avoid memory bloat
      if (this.pendingTrades.length > 20) {
        this.pendingTrades.splice(0, this.pendingTrades.length - 20);
      }
    }
  }

  /** Called by server when a candle update arrives */
  pushCandleUpdate(interval: Interval, candle: OHLCVCandle): void {
    if (!this.isOpen()) return;
    if (interval !== this.subscribedInterval) return;

    const tier = this.tierManager.currentTier;

    if (tier === 'full') {
      this.send({ type: 'candle_update', interval, data: candle });
    } else {
      // Buffer — only the latest candle state matters
      this.pendingCandleUpdate = candle;
    }
  }

  /** Called by server when an order book delta arrives */
  pushOrderBookDelta(delta: OrderBookDelta): void {
    if (!this.isOpen()) return;
    // Order book deltas are always sent immediately regardless of tier
    // (they are tiny and needed for correct sync)
    this.send({ type: 'orderbook_delta', data: delta });
  }

  /** Register a cleanup callback (for unsubscribing from market events) */
  addCleanup(fn: () => void): void {
    this.cleanups.push(fn);
  }

  get sessionId(): string {
    return this.id;
  }

  // ---- Private: Message handling ----

  private handleMessage(raw: string): void {
    let msg: WsClientMessage;
    try {
      msg = JSON.parse(raw) as WsClientMessage;
    } catch {
      console.warn(`[${this.id}] Invalid JSON:`, raw.slice(0, 100));
      return;
    }

    switch (msg.type) {
      case 'ping':
        this.send({
          type: 'pong',
          id: msg.id,
          clientTs: msg.clientTs,
          serverTs: Date.now(),
        });
        break;

      case 'latency_report':
        if (
          typeof msg.rtt === 'number' &&
          typeof msg.jitter === 'number' &&
          isFinite(msg.rtt) &&
          isFinite(msg.jitter)
        ) {
          const changed = this.tierManager.processReport(msg.rtt, msg.jitter);
          if (changed) {
            // Tier change is emitted via onChange — handled in onTierChange
          }
        }
        break;

      case 'subscribe':
        if (msg.interval === '1m' || msg.interval === '5m') {
          this.subscribedInterval = msg.interval;
          this.pendingCandleUpdate = null; // clear stale buffer
        }
        break;

      case 'force_tier':
        this.tierManager.setOverride(msg.tier);
        break;

      default:
        // Unknown message — ignore silently
        break;
    }
  }

  // ---- Private: Delivery ----

  private onTierChange(tier: DeliveryTier, rateMs: number): void {
    // Notify client of tier change
    this.send({
      type: 'tier_update',
      tier,
      effectiveRateMs: rateMs,
      rtt: 0,
      jitter: 0,
    });

    // Reset delivery timer to new rate
    this.setupDeliveryTimer();
  }

  /**
   * For FULL tier: no timer needed (pushes are immediate).
   * For DEGRADED/MINIMAL: flush buffered candle update on a schedule.
   */
  private setupDeliveryTimer(): void {
    if (this.deliveryTimer) {
      clearInterval(this.deliveryTimer);
      this.deliveryTimer = null;
    }

    const rateMs = this.tierManager.currentRateMs;
    if (rateMs === 0) return; // FULL tier — no timer

    this.deliveryTimer = setInterval(() => {
      this.flushBuffered();
    }, rateMs);
  }

  private flushBuffered(): void {
    if (!this.isOpen()) return;
    const interval = this.subscribedInterval;

    // Send the most recent buffered candle (incorporates all trades since last flush)
    if (this.pendingCandleUpdate) {
      this.send({ type: 'candle_update', interval, data: this.pendingCandleUpdate });
      this.pendingCandleUpdate = null;
    }

    // Send the most recent trade from the buffer
    const lastTrade = this.pendingTrades[this.pendingTrades.length - 1];
    if (lastTrade) {
      this.send({ type: 'trade', data: lastTrade });
      this.pendingTrades = [];
    }
  }

  // ---- Private: Silence detection ----

  private startSilenceCheck(): void {
    this.silenceTimer = setInterval(() => {
      const silentFor = Date.now() - this.tierManager.lastReportTs;
      if (silentFor > 30_000) {
        // Client hasn't sent a latency report in 30s — keep current tier
        // (spec: don't downgrade on silence)
        console.log(`[${this.id}] Silence for ${silentFor}ms — holding tier`);
      }
    }, SILENCE_CHECK_INTERVAL_MS);
  }

  // ---- Private: Utilities ----

  private send(msg: WsServerMessage): void {
    if (!this.isOpen()) return;
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      console.error(`[${this.id}] Send error:`, err);
    }
  }

  private isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  private dispose(): void {
    if (this.deliveryTimer) clearInterval(this.deliveryTimer);
    if (this.silenceTimer) clearInterval(this.silenceTimer);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    console.log(`[${this.id}] Session disposed`);
  }
}
