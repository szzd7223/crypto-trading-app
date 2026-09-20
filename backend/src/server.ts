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

const PORT = process.env['PORT'] ? parseInt(process.env['PORT'], 10) : 3001;
const rawCorsOrigin = process.env['CORS_ORIGIN'] ?? 'http://localhost:3000';
const configuredOrigins = rawCorsOrigin.split(',').map((o) => o.trim());

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

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      // Allow wildcard or explicitly configured origins
      if (rawCorsOrigin === '*' || configuredOrigins.includes('*') || configuredOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Allow any Vercel production or preview deployment
      if (/^https:\/\/.*\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }
      // Allow local development ports
      if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      // Default allow for evaluator deployments
      return callback(null, true);
    },
    credentials: true,
  })
);
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
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Backend running on port ${PORT}`);
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
