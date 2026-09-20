'use client';

import { useState } from 'react';
import { useStore } from '@/store';
import { wsClient } from '@/lib/ws-client';
import type { DeliveryTier } from '@/types';

const TIERS: DeliveryTier[] = ['full', 'degraded', 'minimal'];

const RATE_LABEL: Record<number, string> = {
  0:     'Real-time (0ms)',
  2000:  'Batched (2s)',
  10000: 'Throttled (10s)',
};

export default function DebugPanel() {
  const tier          = useStore(s => s.tier);
  const effectiveRate = useStore(s => s.effectiveRateMs);
  const rtt           = useStore(s => s.rtt);
  const jitter        = useStore(s => s.jitter);
  const override      = useStore(s => s.override);
  const setOverride   = useStore(s => s.setOverride);
  const status        = useStore(s => s.status);
  const isStale       = useStore(s => s.isStale);

  const [expanded, setExpanded] = useState(false);

  function handleOverride(t: DeliveryTier | null) {
    setOverride(t);
    wsClient.sendOverride(t);
  }

  const tierColor =
    tier === 'full'     ? 'text-[#0ecb81]' :
    tier === 'degraded' ? 'text-[#f59e0b]' :
    /* minimal */         'text-[#f6465d]';

  const tierBadgeBg =
    tier === 'full'     ? 'bg-[#0ecb81]/15 border-[#0ecb81]/30 text-[#0ecb81]' :
    tier === 'degraded' ? 'bg-[#f59e0b]/15 border-[#f59e0b]/30 text-[#f59e0b]' :
    /* minimal */         'bg-[#f6465d]/15 border-[#f6465d]/30 text-[#f6465d]';

  return (
    <footer className="bg-[#121721] rounded-xl border border-[#1e2638] shadow-md select-none shrink-0 z-30 transition-all">
      {/* Primary Telemetry Bar */}
      <div className="flex flex-wrap items-center justify-between px-5 py-2.5 min-h-[52px] text-sm font-mono gap-3">
        {/* Left: Telemetry Indicators */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <span className="text-[#848e9c] uppercase font-bold text-xs tracking-wider">Network</span>
            <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase border ${tierBadgeBg}`}>
              {tier}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs sm:text-sm text-[#848e9c]">
            <span className="text-[#94a3b8] font-medium">Rate:</span>
            <span className="text-white font-semibold">{RATE_LABEL[effectiveRate] ?? `${effectiveRate}ms`}</span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs sm:text-sm text-[#848e9c]">
            <span className="text-[#94a3b8] font-medium">RTT:</span>
            <span className="text-white font-semibold">{rtt !== null ? `${rtt} ms` : '—'}</span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs sm:text-sm text-[#848e9c]">
            <span className="text-[#94a3b8] font-medium">Jitter:</span>
            <span className="text-white font-semibold">{jitter !== null ? `${jitter} ms` : '—'}</span>
          </div>
        </div>

        {/* Right: Force Tier Simulation Controls */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#94a3b8] font-semibold hidden lg:inline">Simulate Tier:</span>

          <div className="inline-flex items-center gap-1 rounded-lg bg-[#181e2b] p-1 border border-[#1e2638]">
            <button
              onClick={() => handleOverride(null)}
              className={`px-3 py-1 text-xs sm:text-sm rounded-md transition-all cursor-pointer font-bold ${
                override === null
                  ? 'bg-[#2563eb] text-white shadow-sm'
                  : 'text-[#848e9c] hover:text-white hover:bg-[#202838]'
              }`}
            >
              Auto
            </button>

            {TIERS.map(t => {
              const isActive = override === t;
              const activeClass =
                t === 'full'     ? 'bg-[#0ecb81] text-black font-bold shadow-sm' :
                t === 'degraded' ? 'bg-[#f59e0b] text-black font-bold shadow-sm' :
                /* minimal */      'bg-[#f6465d] text-white font-bold shadow-sm';

              return (
                <button
                  key={t}
                  onClick={() => handleOverride(isActive ? null : t)}
                  className={`px-3 py-1 text-xs sm:text-sm rounded-md capitalize transition-all cursor-pointer ${
                    isActive
                      ? activeClass
                      : 'text-[#848e9c] hover:text-white hover:bg-[#202838]'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {override && (
            <span className="text-xs font-semibold text-[#f59e0b] hidden sm:inline ml-1">
              (Override active)
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}
