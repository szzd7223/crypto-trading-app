/**
 * Centralized endpoint configuration for REST and WebSocket connections.
 * Normalizes URLs and automatically infers WebSocket URLs if omitted.
 */

export function getBackendUrl(): string {
  const envUrl = process.env['NEXT_PUBLIC_BACKEND_URL'];
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'http://localhost:3001';
}

export function getWsUrl(): string {
  const envWs = process.env['NEXT_PUBLIC_WS_URL'];
  if (envWs && envWs.trim().length > 0) {
    return envWs.trim().replace(/\/+$/, '');
  }

  // Derive WebSocket URL from the backend URL
  const backend = getBackendUrl();
  const wsProto = backend.startsWith('https://') ? 'wss://' : 'ws://';
  const host = backend.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `${wsProto}${host}/ws`;
}
