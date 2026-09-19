import { create, StateCreator } from 'zustand';
import type {
  Trade,
  OHLCVCandle,
  OrderBookLevel,
  Interval,
  DeliveryTier,
  ConnectionStatus,
} from '@/types';

// ============================================================
// Slice: Market (price + recent trades)
// ============================================================
interface MarketSlice {
  price: number | null;
  priceChange: number;       // absolute change since last update
  recentTrades: Trade[];
  setTrade: (trade: Trade) => void;
}

const createMarketSlice: StateCreator<AppStore, [], [], MarketSlice> = (set, get) => ({
  price: null,
  priceChange: 0,
  recentTrades: [],
  setTrade: (trade) => {
    const existing = get().recentTrades;
    // Deduplicate: drop if same ID already at the front (overlapping WS connections)
    if (existing.length > 0 && existing[0]?.id === trade.id) return;
    const prev = get().price;
    set({
      price: trade.price,
      priceChange: prev !== null ? trade.price - prev : 0,
      recentTrades: [trade, ...existing].slice(0, 50),
    });
  },
});

// ============================================================
// Slice: Order Book
// ============================================================
interface OrderBookSlice {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  obSequenceId: number;
  setOrderBook: (bids: OrderBookLevel[], asks: OrderBookLevel[], seqId: number) => void;
}

const createOrderBookSlice: StateCreator<AppStore, [], [], OrderBookSlice> = (set) => ({
  bids: [],
  asks: [],
  obSequenceId: 0,
  setOrderBook: (bids, asks, seqId) => set({ bids, asks, obSequenceId: seqId }),
});

// ============================================================
// Slice: Candles
// ============================================================
interface CandleSlice {
  candles1m: OHLCVCandle[];
  candles5m: OHLCVCandle[];
  activeInterval: Interval;
  setCandles: (interval: Interval, candles: OHLCVCandle[]) => void;
  updateActiveCandle: (interval: Interval, candle: OHLCVCandle) => void;
  setActiveInterval: (interval: Interval) => void;
}

const createCandleSlice: StateCreator<AppStore, [], [], CandleSlice> = (set, get) => ({
  candles1m: [],
  candles5m: [],
  activeInterval: '1m',
  setCandles: (interval, candles) =>
    set(interval === '1m' ? { candles1m: candles } : { candles5m: candles }),
  updateActiveCandle: (interval, candle) => {
    if (interval !== get().activeInterval) return;
    const key = interval === '1m' ? 'candles1m' : 'candles5m';
    const existing = get()[key];
    if (existing.length === 0) {
      set({ [key]: [candle] });
      return;
    }
    const last = existing[existing.length - 1]!;
    if (last.openTime === candle.openTime) {
      // update in place
      set({ [key]: [...existing.slice(0, -1), candle] });
    } else {
      // new bucket
      set({ [key]: [...existing, candle] });
    }
  },
  setActiveInterval: (interval) => set({ activeInterval: interval }),
});

// ============================================================
// Slice: Connection
// ============================================================
interface ConnectionSlice {
  status: ConnectionStatus;
  tier: DeliveryTier;
  effectiveRateMs: number;
  rtt: number;
  jitter: number;
  override: DeliveryTier | null;
  isStale: boolean;
  setStatus: (status: ConnectionStatus) => void;
  setTier: (tier: DeliveryTier, rateMs: number) => void;
  setLatency: (rtt: number, jitter: number) => void;
  setOverride: (tier: DeliveryTier | null) => void;
  setStale: (stale: boolean) => void;
}

const createConnectionSlice: StateCreator<AppStore, [], [], ConnectionSlice> = (set) => ({
  status: 'connecting',
  tier: 'full',
  effectiveRateMs: 0,
  rtt: 0,
  jitter: 0,
  override: null,
  isStale: false,
  setStatus: (status) => set({ status }),
  setTier: (tier, effectiveRateMs) => set({ tier, effectiveRateMs }),
  setLatency: (rtt, jitter) => set({ rtt, jitter }),
  setOverride: (override) => set({ override }),
  setStale: (isStale) => set({ isStale }),
});

// ============================================================
// Combined store
// ============================================================
type AppStore = MarketSlice & OrderBookSlice & CandleSlice & ConnectionSlice;

export const useStore = create<AppStore>()((...a) => ({
  ...createMarketSlice(...a),
  ...createOrderBookSlice(...a),
  ...createCandleSlice(...a),
  ...createConnectionSlice(...a),
}));
