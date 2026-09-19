// ============================================================
// Order Book Sync Manager
//
// Implements the snapshot + delta sync protocol:
//  1. Buffer incoming WS deltas
//  2. Fetch REST snapshot → apply it
//  3. Discard deltas older than snapshot sequenceId
//  4. Apply remaining deltas in order
//  5. Detect gap (missing sequenceId) → re-fetch snapshot
// ============================================================

import type { OrderBookDelta, OrderBookLevel, OrderBookSnapshot } from '@/types';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

export interface LocalBook {
  bids: Map<number, number>; // price → qty
  asks: Map<number, number>;
  sequenceId: number;
}

export class OrderBookSyncManager {
  private book: LocalBook = { bids: new Map(), asks: new Map(), sequenceId: 0 };
  private deltaBuffer: OrderBookDelta[] = [];
  private syncing = false;
  private onUpdate: (bids: OrderBookLevel[], asks: OrderBookLevel[], seqId: number) => void;

  constructor(onUpdate: (bids: OrderBookLevel[], asks: OrderBookLevel[], seqId: number) => void) {
    this.onUpdate = onUpdate;
  }

  /** Call this when a WS orderbook_delta message arrives */
  receiveDelta(delta: OrderBookDelta): void {
    if (this.syncing) {
      this.deltaBuffer.push(delta);
      return;
    }

    const result = this.applyDelta(delta);
    if (result === 'gap') {
      console.warn('[OrderBook] Gap detected at seq', delta.sequenceId, '— re-syncing');
      this.startSync();
    }
  }

  /** Start the sync process (also call on initial connect) */
  async startSync(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    this.deltaBuffer = [];

    try {
      const res = await fetch(`${BACKEND}/api/orderbook/snapshot`);
      if (!res.ok) throw new Error(`Snapshot fetch failed: ${res.status}`);
      const snapshot: OrderBookSnapshot = await res.json() as OrderBookSnapshot;

      // Apply snapshot
      this.book.bids = new Map(snapshot.bids.map(l => [l.price, l.quantity]));
      this.book.asks = new Map(snapshot.asks.map(l => [l.price, l.quantity]));
      this.book.sequenceId = snapshot.sequenceId;

      // Discard buffered deltas <= snapshot sequenceId
      const fresh = this.deltaBuffer.filter(d => d.sequenceId > snapshot.sequenceId);
      this.deltaBuffer = [];
      this.syncing = false;

      // Apply fresh deltas in order
      for (const delta of fresh) {
        const result = this.applyDelta(delta);
        if (result === 'gap') {
          console.warn('[OrderBook] Gap in fresh deltas — re-syncing again');
          await this.startSync();
          return;
        }
      }

      this.emit();
    } catch (err) {
      console.error('[OrderBook] Sync failed:', err);
      this.syncing = false;
      // Retry after 2s
      setTimeout(() => this.startSync(), 2000);
    }
  }

  reset(): void {
    this.book = { bids: new Map(), asks: new Map(), sequenceId: 0 };
    this.deltaBuffer = [];
    this.syncing = false;
  }

  // ---- Private ----

  private applyDelta(delta: OrderBookDelta): 'ok' | 'gap' {
    if (delta.sequenceId !== this.book.sequenceId + 1) {
      return 'gap';
    }

    for (const level of delta.bids) {
      if (level.quantity === 0) this.book.bids.delete(level.price);
      else this.book.bids.set(level.price, level.quantity);
    }
    for (const level of delta.asks) {
      if (level.quantity === 0) this.book.asks.delete(level.price);
      else this.book.asks.set(level.price, level.quantity);
    }

    this.book.sequenceId = delta.sequenceId;
    this.emit();
    return 'ok';
  }

  private emit(): void {
    const bids = Array.from(this.book.bids.entries())
      .map(([price, quantity]) => ({ price, quantity }))
      .sort((a, b) => b.price - a.price)
      .slice(0, 10);

    const asks = Array.from(this.book.asks.entries())
      .map(([price, quantity]) => ({ price, quantity }))
      .sort((a, b) => a.price - b.price)
      .slice(0, 10);

    this.onUpdate(bids, asks, this.book.sequenceId);
  }
}
