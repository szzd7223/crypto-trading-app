// ============================================================
// Shared TypeScript types for the entire backend
// ============================================================

// ---- Market primitives ----

export interface Trade {
  /** Monotonically increasing trade ID */
  id: number;
  timestamp: number; // Unix ms
  price: number;
  quantity: number;
  side: "buy" | "sell";
}

export interface OHLCVCandle {
  /** Unix ms — start of the candle's time bucket */
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** True while the bucket is still open */
  isClosed: boolean;
}

export type Interval = "1m" | "5m";

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBookSnapshot {
  /** Monotonically increasing sequence counter */
  sequenceId: number;
  timestamp: number;
  bids: OrderBookLevel[]; // sorted descending by price
  asks: OrderBookLevel[]; // sorted ascending by price
}

export interface OrderBookDelta {
  sequenceId: number;
  timestamp: number;
  /** Levels to update or remove (qty=0 means remove) */
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

// ---- WebSocket message types (server → client) ----

export type DeliveryTier = "full" | "degraded" | "minimal";

export interface WsTradeMessage {
  type: "trade";
  data: Trade;
}

export interface WsCandleUpdateMessage {
  type: "candle_update";
  interval: Interval;
  data: OHLCVCandle;
}

export interface WsOrderBookDeltaMessage {
  type: "orderbook_delta";
  data: OrderBookDelta;
}

export interface WsPongMessage {
  type: "pong";
  id: string;
  clientTs: number;
  serverTs: number;
}

export interface WsTierUpdateMessage {
  type: "tier_update";
  tier: DeliveryTier;
  effectiveRateMs: number; // ms between chart pushes
  rtt: number;
  jitter: number;
}

export interface WsConnectionReadyMessage {
  type: "connection_ready";
  tier: DeliveryTier;
  effectiveRateMs: number;
}

export interface WsRecentTradesMessage {
  type: "recent_trades";
  data: Trade[];
}

export type WsServerMessage =
  | WsTradeMessage
  | WsCandleUpdateMessage
  | WsOrderBookDeltaMessage
  | WsPongMessage
  | WsTierUpdateMessage
  | WsConnectionReadyMessage
  | WsRecentTradesMessage;

// ---- WebSocket message types (client → server) ----

export interface WsPingMessage {
  type: "ping";
  id: string;
  clientTs: number;
}

export interface WsLatencyReportMessage {
  type: "latency_report";
  rtt: number; // ms
  jitter: number; // ms (stddev of last N RTT samples)
}

export interface WsSubscribeMessage {
  type: "subscribe";
  interval: Interval;
}

export interface WsForceOverrideMessage {
  type: "force_tier";
  tier: DeliveryTier | null; // null = remove override
}

export type WsClientMessage =
  | WsPingMessage
  | WsLatencyReportMessage
  | WsSubscribeMessage
  | WsForceOverrideMessage;
