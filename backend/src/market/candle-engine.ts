// ============================================================
// Candle Engine
//
// Plain English:
//  A "candle" is a price summary for a time bucket (e.g. 1 minute).
//  For every trade we receive, we update the current (active) candle:
//    - Open:   price of the FIRST trade in this bucket
//    - High:   HIGHEST price seen so far
//    - Low:    LOWEST price seen so far
//    - Close:  price of the LATEST trade (updates every tick)
//    - Volume: total quantity of all trades in this bucket
//
//  When the bucket ends (e.g. a new minute starts), we "close" the
//  candle and start a fresh one. Candles are immutable once closed.
//
//  We track two intervals simultaneously: 1m and 5m.
// ============================================================

import type { Trade, OHLCVCandle, Interval } from '../types.js';

const INTERVAL_MS: Record<Interval, number> = {
  '1m': 60_000,
  '5m': 300_000,
};

/** Maximum closed candles to keep in memory per interval */
const MAX_HISTORY = 500;

export class CandleEngine {
  private candles: Map<Interval, OHLCVCandle[]> = new Map();
  private active: Map<Interval, OHLCVCandle | null> = new Map();
  private listeners: Map<Interval, Array<(candle: OHLCVCandle) => void>> = new Map();

  constructor() {
    const intervals: Interval[] = ['1m', '5m'];
    for (const interval of intervals) {
      this.candles.set(interval, []);
      this.active.set(interval, null);
      this.listeners.set(interval, []);
    }
  }

  /** Subscribe to live candle updates (active candle + closed candles) */
  onCandle(interval: Interval, listener: (candle: OHLCVCandle) => void): () => void {
    const list = this.listeners.get(interval) ?? [];
    list.push(listener);
    this.listeners.set(interval, list);
    return () => {
      const updated = this.listeners.get(interval) ?? [];
      this.listeners.set(interval, updated.filter(l => l !== listener));
    };
  }

  /** Process a trade — updates active candles for all intervals */
  processTrade(trade: Trade): void {
    for (const interval of ['1m', '5m'] as Interval[]) {
      this.processForInterval(interval, trade);
    }
  }

  /** Get the closed candle history for an interval */
  getHistory(interval: Interval, limit: number = MAX_HISTORY): OHLCVCandle[] {
    const closed = this.candles.get(interval) ?? [];
    const active = this.active.get(interval);
    const all = active ? [...closed, active] : closed;
    return all.slice(-limit);
  }

  /** Get only the currently open (active) candle */
  getActive(interval: Interval): OHLCVCandle | null {
    return this.active.get(interval) ?? null;
  }

  // ---- Private ----

  private processForInterval(interval: Interval, trade: Trade): void {
    const bucketMs = INTERVAL_MS[interval];
    const bucketStart = Math.floor(trade.timestamp / bucketMs) * bucketMs;

    let candle = this.active.get(interval) ?? null;

    if (candle === null) {
      // First ever trade — open the first candle
      candle = this.openCandle(bucketStart, trade);
      this.active.set(interval, candle);
    } else if (trade.timestamp >= candle.openTime + bucketMs) {
      // New time bucket — close current candle, open a new one
      const closed: OHLCVCandle = { ...candle, isClosed: true };
      const history = this.candles.get(interval) ?? [];
      history.push(closed);

      // Trim to max history
      if (history.length > MAX_HISTORY) {
        history.splice(0, history.length - MAX_HISTORY);
      }

      this.candles.set(interval, history);
      this.emit(interval, closed);

      // Fill any completely missed buckets with flat candles
      let nextBucketStart = candle.openTime + bucketMs;
      while (nextBucketStart < bucketStart) {
        const filler: OHLCVCandle = {
          openTime: nextBucketStart,
          open: closed.close,
          high: closed.close,
          low: closed.close,
          close: closed.close,
          volume: 0,
          isClosed: true,
        };
        const h = this.candles.get(interval) ?? [];
        h.push(filler);
        if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY);
        this.candles.set(interval, h);
        nextBucketStart += bucketMs;
      }

      candle = this.openCandle(bucketStart, trade);
      this.active.set(interval, candle);
    } else {
      // Same bucket — update the active candle in place
      candle.high = Math.max(candle.high, trade.price);
      candle.low = Math.min(candle.low, trade.price);
      candle.close = trade.price;
      candle.volume = Math.round((candle.volume + trade.quantity) * 10_000) / 10_000;
    }

    // Emit the live (active) candle after every update
    this.emit(interval, { ...candle });
  }

  private openCandle(openTime: number, trade: Trade): OHLCVCandle {
    return {
      openTime,
      open: trade.price,
      high: trade.price,
      low: trade.price,
      close: trade.price,
      volume: trade.quantity,
      isClosed: false,
    };
  }

  private emit(interval: Interval, candle: OHLCVCandle): void {
    const listeners = this.listeners.get(interval) ?? [];
    for (const listener of listeners) {
      listener(candle);
    }
  }
}
