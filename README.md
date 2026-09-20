# Real-Time Cryptocurrency Trading Web App

A production-grade, full-stack cryptocurrency trading application built with **React / Next.js (TypeScript)** on the frontend and **Node.js (TypeScript)** on the backend. The system features a deterministic synthetic market-data generator, real-time order-book delta synchronization with snapshot recovery, adaptive delivery tiers driven by client-side RTT/jitter telemetry with hysteresis, and interactive TradingView-style candlestick charting.

---

## Architecture Overview

```
                          ┌────────────────────────────────────────┐
                          │         Render Web Service             │
                          │   (Node.js + Express + WebSocket)      │
                          │                                        │
                          │  ┌──────────────────────────────────┐  │
                          │  │ Synthetic Generator (Seed: 42)   │  │
                          │  └──────────────┬───────────────────┘  │
                          │                 ▼                      │
                          │  ┌──────────────┴───────────────────┐  │
                          │  │ OrderBook Engine & CandleEngine  │  │
                          │  └──────────────┬───────────────────┘  │
                          │                 ▼                      │
                          │  ┌──────────────────────────────────┐  │
                          │  │ Per-Client Tier State Machine    │  │
                          │  │ (Full: 0ms | Degraded: 1s | Min) │  │
                          │  └───────┬───────────────────┬──────┘  │
                          └──────────┼───────────────────┼─────────┘
                      REST Snapshot  │                   │ WebSocket
                       & Candles     │                   │ (Deltas, Candles, Pings)
                                     ▼                   ▼
                          ┌────────────────────────────────────────┐
                          │            Vercel Frontend             │
                          │         (Next.js App Router)           │
                          │                                        │
                          │  ┌──────────────────────────────────┐  │
                          │  │  OrderBookSyncManager (Buffered) │  │
                          │  └──────────────┬───────────────────┘  │
                          │  ┌──────────────┴───────────────────┐  │
                          │  │  Zustand Store (Modular Slices)  │  │
                          │  └──────────────┬───────────────────┘  │
                          │  ┌──────────────┴───────────────────┐  │
                          │  │  Lightweight Charts & UI Dock    │  │
                          │  └──────────────────────────────────┘  │
                          └────────────────────────────────────────┘
```

---

## 1. Deployment Guide: Render (Backend) + Vercel (Frontend)

This repository is configured as a monorepo containing both `/backend` and `/frontend`. Follow these steps to set up production deployment with automated CI/CD:

### Step 1: Deploy Backend to Render

1. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** → **Blueprint** (or **Web Service**).
2. Connect your GitHub repository.
3. **If using Blueprint**:
   - Render will automatically detect `render.yaml` in the repository root.
   - Click **Apply**.
4. **If configuring manually as a Web Service**:
   - **Name**: `crypto-trading-backend`
   - **Language/Runtime**: `Node`
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
   - **Environment Variables**:
     - `CORS_ORIGIN`: `*` (or your Vercel frontend URL once created)
     - `NODE_VERSION`: `20.18.0`
5. Click **Deploy Web Service**.
6. Note your Render URL (e.g., `https://crypto-trading-backend.onrender.com`).
   - REST endpoints: `https://<render-service>.onrender.com/api/candles`
   - WebSocket endpoint: `wss://<render-service>.onrender.com/ws`

### Step 2: Deploy Frontend to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New...** → **Project**.
2. Select your GitHub repository.
3. In the project setup screen:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: Click *Edit* and select `frontend`
   - **Build & Development Settings**: Leave default (`next build`)
   - **Environment Variables**:
     - `NEXT_PUBLIC_BACKEND_URL`: `https://<your-backend-app>.onrender.com`
     - `NEXT_PUBLIC_WS_URL`: `wss://<your-backend-app>.onrender.com/ws`
4. Click **Deploy**.
5. Vercel will build and assign your production URL (e.g., `https://crypto-trading-app.vercel.app`).

### Continuous Deployment (CI/CD)

- **Automatic redeployment**: Any new commit pushed to the `main` branch on GitHub automatically triggers builds on both Vercel and Render.
- **Render auto-deploy**: Detects changes in the `backend/` folder and rebuilds without downtime.
- **Vercel auto-deploy**: Detects changes in the `frontend/` folder and deploys preview or production URLs immediately.

---

## 2. Local Development

### Prerequisites
- Node.js >= 20.0.0
- npm >= 9.0.0

### Run Backend
```bash
cd backend
npm install
npm run dev
```
Backend starts on `http://localhost:3001` (WebSocket on `ws://localhost:3001/ws`).

### Run Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on `http://localhost:3000`.

---

## 3. Architecture & Design Choices

### Frontend Architecture (Next.js App Router)
- **Framework Choice**: Next.js App Router was chosen for first-class TypeScript support, built-in route optimization, automatic code splitting, and zero-config deployment on Vercel.
- **Client-Side Rendering (CSR)**: Real-time trading screens require client-side WebSockets, high-frequency canvas/DOM updates, and browser event listeners. The chart component is dynamically loaded with `{ ssr: false }` to avoid SSR hydration mismatches with TradingView canvas rendering.
- **Decoupled Layers**:
  - `src/lib/ws-client.ts`: Connection lifecycle, heartbeat pings, and telemetry dispatch.
  - `src/lib/orderbook-sync.ts`: Snapshot/delta reconciliation and gap detection logic.
  - `src/lib/latency-tracker.ts`: Latency and jitter calculations.
  - `src/store/index.ts`: Modular Zustand state management.
  - `src/components/*`: Pure reactive UI components subscribing to selective store state.

### Backend Architecture (Express + ws)
- **Node.js + TypeScript**: Provides non-blocking event-driven I/O ideal for handling persistent WebSocket connections and high-throughput trade events.
- **Modular Subsystems**:
  - `TradeGenerator`: Deterministic geometric Brownian motion + jump diffusion trade feed.
  - `OrderBook`: Maintains limit order book state with price level aggregation and monotonic sequence IDs.
  - `CandleEngine`: Aggregates trades into discrete OHLCV candles (1m and 5m intervals) and calculates real-time candle metrics.
  - `TierManager`: Per-client adaptive rate-limiting state machine with dual-direction hysteresis.
  - `ClientSession`: Per-connection queue and delivery throttler for trades, candles, and order-book deltas.

---

## 4. State Management (Zustand)

Zustand was chosen over Redux or React Context because:
1. **Zero Unnecessary Rerenders**: Fine-grained slice subscriptions (e.g., `useStore(state => state.price)`) ensure only relevant components rerender during high-frequency updates.
2. **Outside-React Access**: Allows WebSocket callbacks (`wsClient`) and sync managers (`OrderBookSyncManager`) to dispatch actions directly using `useStore.getState()` without React context wrappers.
3. **Modular Slices**:
   - `MarketSlice`: Latest price, 24h price movement, and recent trades array.
   - `OrderBookSlice`: Top bids and asks, sequence ID.
   - `CandleSlice`: Selected interval, historical candles, and active live candle.
   - `ConnectionSlice`: Connection status (`connecting`, `connected`, `disconnected`), stale data indicator, RTT, jitter, delivery tier, effective update rate, and manual tier override.

---

## 5. Protocols & Generated Market Data

### REST Endpoints
- `GET /health` — Returns status code 200 and server timestamp for liveness probes and free-tier container wakeups.
- `GET /api/candles?interval=1m|5m&limit=200` — Returns historical OHLCV candle arrays.
- `GET /api/orderbook/snapshot` — Returns snapshot containing current top 20 bids and asks with `sequenceId` and timestamp.

### WebSocket Feeds (`ws://.../ws`)
- **Client → Server**:
  - `{ type: "subscribe", interval: "1m" | "5m" }`
  - `{ type: "ping", id: string, clientTs: number }`
  - `{ type: "latency_report", rtt: number, jitter: number }`
  - `{ type: "tier_override", tier: "full" | "degraded" | "minimal" | null }`
- **Server → Client**:
  - `{ type: "connection_ready", sessionId: string, tier: string, effectiveRateMs: number }`
  - `{ type: "pong", id: string, clientTs: number, serverTs: number }`
  - `{ type: "trade", data: Trade }`
  - `{ type: "candle_update", interval: string, data: OHLCVCandle }`
  - `{ type: "orderbook_delta", data: OrderBookDelta }`
  - `{ type: "tier_update", tier: string, effectiveRateMs: number }`

---

## 6. Chart & Order-Book Synchronization

### Order-Book Snapshot + Delta Reconciliation
1. On WebSocket connection, the client marks state as `syncing` and begins buffering incoming WebSocket deltas in memory.
2. The client fetches the REST snapshot (`/api/orderbook/snapshot`).
3. Upon receiving the snapshot:
   - Sets the local book to the snapshot's state and records `sequenceId = S`.
   - Discards all buffered deltas with `sequenceId <= S`.
   - Applies all remaining buffered deltas with `sequenceId > S` sequentially.
4. Subsequent live deltas are applied directly.
5. **Gap Recovery**: If an incoming delta arrives where `delta.sequenceId !== currentSequenceId + 1`, a sequence gap is detected. The manager immediately clears its book and triggers a full resynchronization.

### Candle History & Live Active Candle Updates
- On interval selection (`1m` or `5m`), the client fetches the last 200 historical candles via REST.
- As new trades execute, the backend candle engine updates the active open candle and streams it to subscribed clients.
- If a candle's timestamp moves to a new interval bucket, the previous candle closes and a new active candle opens seamlessly.

---

## 7. Adaptive Live Chart Delivery & Hysteresis

### Latency and Jitter Measurement (RFC 3550 standard)
- Every 5 seconds, the frontend sends a ping containing a UUID and client timestamp.
- On pong reply:
  - $\text{RTT} = \text{now} - \text{clientTs}$
  - Difference $D = |\text{RTT} - \text{smoothedRTT}|$
  - Jitter is updated using an Exponential Moving Average: $\text{Jitter} = \text{Jitter} + \frac{D - \text{Jitter}}{16}$
- Telemetry is reported to the backend via `latency_report`.

### Delivery Tiers & Target Rates
| Tier | Target Delivery Interval | Downgrade Criteria | Upgrade Criteria |
| :--- | :--- | :--- | :--- |
| **FULL** | **0 ms** (immediate / live) | RTT > 150ms OR Jitter > 40ms | Baseline |
| **DEGRADED** | **1,000 ms** (batched 1s) | RTT > 350ms OR Jitter > 100ms | 3 consecutive reports with RTT < 100ms & Jitter < 25ms |
| **MINIMAL** | **5,000 ms** (batched 5s) | Severe latency / packet drop | 3 consecutive reports with RTT < 250ms & Jitter < 70ms |

### Hysteresis & Fallback
- **Dual-direction Hysteresis**: Downgrades occur after 2 consecutive degraded reports to prevent transient network spikes from flipping tiers. Upgrades require 3 consecutive healthy reports before recovering to a higher tier.
- **Missing-Report Fallback**: If the client fails to send latency reports for 15 seconds, the backend automatically steps down the tier and marks delivery as degraded.
- **Data Integrity**: Slower delivery tiers only throttle the frequency of WebSocket emissions. The underlying engine processes 100% of trades and OHLCV math remains mathematically exact across all tiers.

---

## 8. Reconnect, Lifecycle & Stale-State Handling

- **Exponential Backoff**: If disconnected, reconnection attempts start at 1s, doubling up to a maximum of 30s.
- **Stale State UI**: While disconnected or reconnecting, previous order book, trades, and chart data are visually tagged with a yellow `STALE` indicator.
- **Browser Lifecycle**: Pings are paused when `document.visibilityState === 'hidden'` to preserve bandwidth, and automatically resume when the tab becomes active.

---

## 9. Debug Controls

A dedicated telemetry bar is embedded at the bottom of the interface:
- **Network Status & Tier Badge**: Displays active tier (`FULL`, `DEGRADED`, `MINIMAL`) and current update rate in milliseconds.
- **Live Latency & Jitter**: Real-time RTT and jitter metrics.
- **Manual Tier Override Buttons**: Allows forcing connection into `FULL`, `DEGRADED`, or `MINIMAL` to demonstrate throttling behavior on good networks.
- **Simulate Disconnect**: Disconnects the socket to demonstrate stale data display and exponential backoff recovery.

---

## 10. Automated Tests

The test suite includes end-to-end tests for the adaptive delivery state machine and the order-book synchronization engine:

1. **Tier Hysteresis Tests** (`backend/tests/tier-hysteresis.test.ts`):
   - Confirms initial `FULL` tier.
   - Tests that single latency spikes do not cause immediate downgrades.
   - Verifies 2-step downgrade to `DEGRADED` and `MINIMAL`.
   - Tests 3-step recovery requirement for upgrades.
   - Tests manual debug overrides and reset behavior.
   - Tests 15-second heartbeat missing-report fallback.

2. **Order-Book Synchronization Tests** (`backend/tests/orderbook-sync.test.ts`):
   - Tests deterministic snapshot application.
   - Verifies delta buffering and sequence ID gap recovery.
   - Tests discard of duplicate or stale sequence deltas.

---

## 11. Known Limitations

- **Simulated Symbol**: Uses a single synthetic market pair (`BTC/USDT`).
- **Render Free Tier Cold-Start**: Free instances on Render spin down after 15 minutes of inactivity. When visiting the frontend after inactivity, the backend may take 30–50 seconds to boot. The frontend includes automatic health probes and exponential backoff retry to handle this gracefully.
