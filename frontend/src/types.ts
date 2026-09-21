// Shared types mirroring the backend — kept in sync manually.
// In a monorepo you'd share these directly.

export type Interval = "1m" | "5m";
export type DeliveryTier = "full" | "degraded" | "minimal";
export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "stale";

export interface Trade {
  id: number;
  timestamp: number;
  price: number;
  quantity: number;
  side: "buy" | "sell";
}

export interface OHLCVCandle {
  openTime: number; // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBookSnapshot {
  sequenceId: number;
  timestamp: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface OrderBookDelta {
  sequenceId: number;
  timestamp: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

// ---- WS message shapes (server → client) ----
export interface WsTradeMessage {
  type: "trade";
  data: Trade;
}
export interface WsCandleUpdate {
  type: "candle_update";
  interval: Interval;
  data: OHLCVCandle;
}
export interface WsOrderBookDelta {
  type: "orderbook_delta";
  data: OrderBookDelta;
}
export interface WsPongMessage {
  type: "pong";
  id: string;
  clientTs: number;
  serverTs: number;
}
export interface WsTierUpdate {
  type: "tier_update";
  tier: DeliveryTier;
  effectiveRateMs: number;
  rtt: number;
  jitter: number;
}
export interface WsConnectionReady {
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
  | WsCandleUpdate
  | WsOrderBookDelta
  | WsPongMessage
  | WsTierUpdate
  | WsConnectionReady
  | WsRecentTradesMessage;

// ---- WS message shapes (client → server) ----
export interface WsPingMessage {
  type: "ping";
  id: string;
  clientTs: number;
}
export interface WsLatencyReport {
  type: "latency_report";
  rtt: number;
  jitter: number;
}
export interface WsSubscribeMessage {
  type: "subscribe";
  interval: Interval;
}
export interface WsForceOverride {
  type: "force_tier";
  tier: DeliveryTier | null;
}

export type WsClientMessage =
  | WsPingMessage
  | WsLatencyReport
  | WsSubscribeMessage
  | WsForceOverride;
