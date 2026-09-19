// ============================================================
// Express + WebSocket Server
// ============================================================

import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';

import { TradeGenerator } from './market/generator.js';
import { OrderBook } from './market/orderbook.js';
import { CandleEngine } from './market/candle-engine.js';
import { ClientSession } from './ws/client-session.js';
import { buildCandlesRouter } from './routes/candles.js';
import { buildSnapshotRouter } from './routes/snapshot.js';

const PORT = process.env['PORT'] ? parseInt(process.env['PORT']) : 3001;
const CORS_ORIGIN = process.env['CORS_ORIGIN'] ?? 'http://localhost:3000';

// ---- Market subsystems ----
const generator = new TradeGenerator({ seed: 42 });
const orderBook = new OrderBook();
const candleEngine = new CandleEngine();

// Wire market subsystems together
generator.onTrade((trade) => {
  orderBook.update(trade);
  candleEngine.processTrade(trade);
});

// ---- Express app ----
const app = express();

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// REST routes
app.use('/api/candles', buildCandlesRouter(candleEngine));
app.use('/api/orderbook/snapshot', buildSnapshotRouter(orderBook));

// ---- HTTP + WebSocket server ----
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const activeSessions = new Map<string, ClientSession>();

wss.on('connection', (ws: WebSocket) => {
  const sessionId = randomUUID();
  console.log(`[WS] Client connected: ${sessionId}`);

  const session = new ClientSession(ws, sessionId);
  activeSessions.set(sessionId, session);

  // Subscribe session to market events
  const unsubTrade = generator.onTrade((trade) => {
    session.pushTrade(trade);
  });

  const unsub1m = candleEngine.onCandle('1m', (candle) => {
    session.pushCandleUpdate('1m', candle);
  });

  const unsub5m = candleEngine.onCandle('5m', (candle) => {
    session.pushCandleUpdate('5m', candle);
  });

  const unsubOB = orderBook.onDelta((delta) => {
    session.pushOrderBookDelta(delta);
  });

  session.addCleanup(() => {
    unsubTrade();
    unsub1m();
    unsub5m();
    unsubOB();
    activeSessions.delete(sessionId);
    console.log(`[WS] Client disconnected: ${sessionId} (${activeSessions.size} remaining)`);
  });
});

// ---- Start ----
export function startServer(): http.Server {
  generator.start();
  server.listen(PORT, () => {
    console.log(`✅ Backend running on http://localhost:${PORT}`);
    console.log(`   REST: http://localhost:${PORT}/api/candles?interval=1m`);
    console.log(`   REST: http://localhost:${PORT}/api/orderbook/snapshot`);
    console.log(`   WS:   ws://localhost:${PORT}/ws`);
  });
  return server;
}

export function stopServer(): Promise<void> {
  generator.stop();
  return new Promise((resolve, reject) => {
    wss.close(() => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

export { app, server, wss };
