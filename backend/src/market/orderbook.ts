// ============================================================
// Order Book Engine
//
// Plain English:
//  Maintains 10 buy offers (bids) and 10 sell offers (asks).
//  Every time a trade happens, prices shift slightly and we
//  publish a "delta" — a small update saying which levels changed.
//  This lets the frontend keep a local copy in sync without
//  re-fetching the whole book every tick.
// ============================================================

import type {
  OrderBookLevel,
  OrderBookSnapshot,
  OrderBookDelta,
  Trade,
} from '../types.js';

const LEVELS = 10;
const SPREAD_PCT = 0.0002; // ~0.02% spread between best bid and best ask
const LEVEL_STEP_PCT = 0.0003; // ~0.03% between consecutive levels
const MAX_QTY = 15;
const MIN_QTY = 0.5;

export class OrderBook {
  private bids: Map<number, number> = new Map(); // price → qty
  private asks: Map<number, number> = new Map();
  private sequenceId: number = 0;
  private listeners: Array<(delta: OrderBookDelta) => void> = [];

  constructor() {
    // Initialised lazily on first update
  }

  /** Subscribe to order book deltas */
  onDelta(listener: (delta: OrderBookDelta) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /** Called by TradeGenerator on every new trade */
  update(trade: Trade): void {
    const midPrice = trade.price;
    const bestBid = midPrice * (1 - SPREAD_PCT / 2);
    const bestAsk = midPrice * (1 + SPREAD_PCT / 2);

    const newBids = this.buildLevels(bestBid, -1, trade.id); // descending
    const newAsks = this.buildLevels(bestAsk, +1, trade.id); // ascending

    const deltaBids = this.computeDelta(this.bids, newBids);
    const deltaAsks = this.computeDelta(this.asks, newAsks);

    this.bids = newBids;
    this.asks = newAsks;
    this.sequenceId++;

    const delta: OrderBookDelta = {
      sequenceId: this.sequenceId,
      timestamp: trade.timestamp,
      bids: deltaBids,
      asks: deltaAsks,
    };

    this.emitDelta(delta);
  }

  /** Full snapshot — used for REST endpoint and initial sync */
  snapshot(): OrderBookSnapshot {
    return {
      sequenceId: this.sequenceId,
      timestamp: Date.now(),
      bids: this.sortedLevels(this.bids, 'desc'),
      asks: this.sortedLevels(this.asks, 'asc'),
    };
  }

  // ---- Private ----

  /**
   * Build N price levels starting from `bestPrice`.
   * direction: -1 → go down (bids), +1 → go up (asks)
   * Using trade.id as seed offset for consistent but varied quantities.
   */
  private buildLevels(
    bestPrice: number,
    direction: -1 | 1,
    seed: number,
  ): Map<number, number> {
    const levels = new Map<number, number>();
    for (let i = 0; i < LEVELS; i++) {
      const price = bestPrice * (1 + direction * i * LEVEL_STEP_PCT);
      const roundedPrice = Math.round(price * 100) / 100;
      // Deterministic qty variation per level
      const qty = MIN_QTY + ((seed + i * 7) % 100) / 100 * (MAX_QTY - MIN_QTY);
      levels.set(roundedPrice, Math.round(qty * 10_000) / 10_000);
    }
    return levels;
  }

  /**
   * Compute the minimal set of level changes between old and new book.
   * Returns only levels that actually changed (new, modified, or deleted).
   */
  private computeDelta(
    oldMap: Map<number, number>,
    newMap: Map<number, number>,
  ): OrderBookLevel[] {
    const delta: OrderBookLevel[] = [];

    // New or modified
    for (const [price, qty] of newMap) {
      if (oldMap.get(price) !== qty) {
        delta.push({ price, quantity: qty });
      }
    }

    // Removed (old levels that are no longer present)
    for (const price of oldMap.keys()) {
      if (!newMap.has(price)) {
        delta.push({ price, quantity: 0 }); // qty=0 signals removal
      }
    }

    return delta;
  }

  private sortedLevels(
    map: Map<number, number>,
    order: 'asc' | 'desc',
  ): OrderBookLevel[] {
    const entries = Array.from(map.entries()).map(([price, quantity]) => ({
      price,
      quantity,
    }));
    return entries.sort((a, b) =>
      order === 'asc' ? a.price - b.price : b.price - a.price,
    );
  }

  private emitDelta(delta: OrderBookDelta): void {
    for (const listener of this.listeners) {
      listener(delta);
    }
  }
}
