// ============================================================
// Tests: Order Book — Snapshot/Delta Synchronization & Recovery
//
// These tests mirror exactly what the frontend sync-manager does:
//  1. Subscribe to deltas (buffer them)
//  2. Fetch a snapshot with sequenceId N
//  3. Discard buffered deltas <= N
//  4. Apply remaining deltas in order
//  5. Detect gaps, trigger re-snapshot, repeat
// ============================================================

import { OrderBook } from '../src/market/orderbook.js';
import type { OrderBookDelta, OrderBookLevel, Trade } from '../src/types.js';

// ---- Helper: create a minimal fake Trade ----
function makeTrade(id: number, price: number): Trade {
  return {
    id,
    timestamp: Date.now() + id * 100,
    price,
    quantity: 1.0,
    side: 'buy',
  };
}

// ---- Simplified local order book (mirrors frontend logic) ----
class LocalOrderBook {
  private bids: Map<number, number> = new Map();
  private asks: Map<number, number> = new Map();
  private seqId: number = 0;

  applySnapshot(snapshot: { sequenceId: number; bids: OrderBookLevel[]; asks: OrderBookLevel[] }): void {
    this.bids = new Map(snapshot.bids.map(l => [l.price, l.quantity]));
    this.asks = new Map(snapshot.asks.map(l => [l.price, l.quantity]));
    this.seqId = snapshot.sequenceId;
  }

  applyDelta(delta: OrderBookDelta): 'ok' | 'gap' {
    // Gap detection: delta must be exactly seqId + 1
    if (delta.sequenceId !== this.seqId + 1) {
      return 'gap';
    }

    for (const level of delta.bids) {
      if (level.quantity === 0) this.bids.delete(level.price);
      else this.bids.set(level.price, level.quantity);
    }
    for (const level of delta.asks) {
      if (level.quantity === 0) this.asks.delete(level.price);
      else this.asks.set(level.price, level.quantity);
    }

    this.seqId = delta.sequenceId;
    return 'ok';
  }

  getBid(price: number): number | undefined {
    return this.bids.get(price);
  }

  getAsk(price: number): number | undefined {
    return this.asks.get(price);
  }

  get sequenceId(): number {
    return this.seqId;
  }

  get bidCount(): number {
    return this.bids.size;
  }

  get askCount(): number {
    return this.asks.size;
  }
}

// ============================================================

describe('OrderBook — snapshot', () => {
  it('returns a snapshot with correct structure', () => {
    const ob = new OrderBook();
    ob.update(makeTrade(1, 43000));

    const snap = ob.snapshot();
    expect(snap.sequenceId).toBeGreaterThan(0);
    expect(snap.bids).toHaveLength(10);
    expect(snap.asks).toHaveLength(10);
    expect(typeof snap.timestamp).toBe('number');
  });

  it('bids are sorted descending by price', () => {
    const ob = new OrderBook();
    ob.update(makeTrade(1, 43000));
    const snap = ob.snapshot();
    for (let i = 1; i < snap.bids.length; i++) {
      expect((snap.bids[i - 1] as OrderBookLevel).price).toBeGreaterThan((snap.bids[i] as OrderBookLevel).price);
    }
  });

  it('asks are sorted ascending by price', () => {
    const ob = new OrderBook();
    ob.update(makeTrade(1, 43000));
    const snap = ob.snapshot();
    for (let i = 1; i < snap.asks.length; i++) {
      expect((snap.asks[i - 1] as OrderBookLevel).price).toBeLessThan((snap.asks[i] as OrderBookLevel).price);
    }
  });

  it('best bid < best ask (valid spread)', () => {
    const ob = new OrderBook();
    ob.update(makeTrade(1, 43000));
    const snap = ob.snapshot();
    const bestBid = (snap.bids[0] as OrderBookLevel).price;
    const bestAsk = (snap.asks[0] as OrderBookLevel).price;
    expect(bestBid).toBeLessThan(bestAsk);
  });
});

describe('OrderBook — delta application', () => {
  it('emits deltas when updated', () => {
    const ob = new OrderBook();
    const deltas: OrderBookDelta[] = [];
    ob.onDelta(d => deltas.push(d));

    ob.update(makeTrade(1, 43000));
    expect(deltas.length).toBeGreaterThan(0);
  });

  it('delta sequenceId increments monotonically', () => {
    const ob = new OrderBook();
    const seqs: number[] = [];
    ob.onDelta(d => seqs.push(d.sequenceId));

    ob.update(makeTrade(1, 43000));
    ob.update(makeTrade(2, 43050));
    ob.update(makeTrade(3, 43100));

    for (let i = 1; i < seqs.length; i++) {
      expect((seqs[i] as number)).toBe((seqs[i - 1] as number) + 1);
    }
  });
});

describe('LocalOrderBook — snapshot + delta sync', () => {
  it('can apply a snapshot and then deltas correctly', () => {
    const ob = new OrderBook();
    const local = new LocalOrderBook();

    const deltas: OrderBookDelta[] = [];
    ob.onDelta(d => deltas.push(d));

    ob.update(makeTrade(1, 43000));
    const snap = ob.snapshot();

    // Apply snapshot
    local.applySnapshot(snap);
    expect(local.sequenceId).toBe(snap.sequenceId);
    expect(local.bidCount).toBe(10);
    expect(local.askCount).toBe(10);

    // Apply subsequent delta
    ob.update(makeTrade(2, 43010));
    const newDelta = deltas[deltas.length - 1] as OrderBookDelta;

    const result = local.applyDelta(newDelta);
    expect(result).toBe('ok');
    expect(local.sequenceId).toBe(newDelta.sequenceId);
  });

  it('discards deltas with sequenceId <= snapshot sequenceId', () => {
    const ob = new OrderBook();
    const local = new LocalOrderBook();
    const deltas: OrderBookDelta[] = [];
    ob.onDelta(d => deltas.push(d));

    // Generate 3 updates (3 deltas buffered)
    ob.update(makeTrade(1, 43000));
    ob.update(makeTrade(2, 43010));
    ob.update(makeTrade(3, 43020));

    // Take snapshot now (sequenceId = 3)
    const snap = ob.snapshot();
    local.applySnapshot(snap);

    // All 3 deltas are older than snapshot — discard them
    const staleDelta = deltas[0] as OrderBookDelta; // seqId = 1
    const result = local.applyDelta(staleDelta);
    expect(result).toBe('gap'); // seqId 1 ≠ snap seqId+1

    // sequenceId should not have changed
    expect(local.sequenceId).toBe(snap.sequenceId);
  });
});

describe('LocalOrderBook — gap detection and recovery', () => {
  it('detects a gap when a delta is skipped', () => {
    const ob = new OrderBook();
    const local = new LocalOrderBook();
    const deltas: OrderBookDelta[] = [];
    ob.onDelta(d => deltas.push(d));

    ob.update(makeTrade(1, 43000));
    const snap = ob.snapshot();
    local.applySnapshot(snap);

    // Generate 3 more updates
    ob.update(makeTrade(2, 43010)); // delta seqId = snap.seqId + 1
    ob.update(makeTrade(3, 43020)); // delta seqId = snap.seqId + 2
    ob.update(makeTrade(4, 43030)); // delta seqId = snap.seqId + 3

    // Skip the first one (simulate a missed network packet)
    // seqId+1 is at deltas[deltas.length-3]
    const skipped = deltas[deltas.length - 2] as OrderBookDelta; // seqId+2
    const result = local.applyDelta(skipped);
    expect(result).toBe('gap');
  });

  it('recovers correctly after gap by applying fresh snapshot', () => {
    const ob = new OrderBook();
    const local = new LocalOrderBook();
    const deltas: OrderBookDelta[] = [];
    ob.onDelta(d => deltas.push(d));

    ob.update(makeTrade(1, 43000));
    const snap1 = ob.snapshot();
    local.applySnapshot(snap1);

    // Generate more updates
    ob.update(makeTrade(2, 43010));
    ob.update(makeTrade(3, 43020));

    // Simulate gap: skip first delta, apply second → triggers gap
    const gapResult = local.applyDelta(deltas[deltas.length - 1] as OrderBookDelta);
    expect(gapResult).toBe('gap');

    // Recovery: re-fetch snapshot
    const snap2 = ob.snapshot();
    local.applySnapshot(snap2);

    // Now sequenceId is current
    expect(local.sequenceId).toBe(snap2.sequenceId);
    expect(local.bidCount).toBe(10);
    expect(local.askCount).toBe(10);
  });

  it('applies deltas in sequence after recovery with no gaps', () => {
    const ob = new OrderBook();
    const local = new LocalOrderBook();
    const deltas: OrderBookDelta[] = [];
    ob.onDelta(d => deltas.push(d));

    ob.update(makeTrade(1, 43000));
    const snap = ob.snapshot();
    local.applySnapshot(snap);

    // Apply 5 consecutive deltas — all should be 'ok'
    for (let i = 2; i <= 6; i++) {
      ob.update(makeTrade(i, 43000 + i * 10));
    }

    const relevantDeltas = deltas.filter(d => d.sequenceId > snap.sequenceId);
    for (const delta of relevantDeltas) {
      const result = local.applyDelta(delta);
      expect(result).toBe('ok');
    }

    expect(local.sequenceId).toBe(deltas[deltas.length - 1]!.sequenceId);
  });
});

describe('OrderBook — price precision', () => {
  it('all price levels have at most 2 decimal places', () => {
    const ob = new OrderBook();
    ob.update(makeTrade(1, 43123.45));
    const snap = ob.snapshot();

    for (const level of [...snap.bids, ...snap.asks]) {
      const decimals = (level.price.toString().split('.')[1] ?? '').length;
      expect(decimals).toBeLessThanOrEqual(2);
    }
  });
});
