'use client';

import { useStore } from '@/store';
import { wsClient } from '@/lib/ws-client';
import type { DeliveryTier } from '@/types';

const TIERS: DeliveryTier[] = ['full', 'degraded', 'minimal'];

const RATE_LABEL: Record<number, string> = {
  0:     'Real-time',
  2000:  'Every 2s',
  10000: 'Every 10s',
};

export default function DebugPanel() {
  const tier          = useStore(s => s.tier);
  const effectiveRate = useStore(s => s.effectiveRateMs);
  const rtt           = useStore(s => s.rtt);
  const jitter        = useStore(s => s.jitter);
  const override      = useStore(s => s.override);
  const setOverride   = useStore(s => s.setOverride);

  function handleOverride(t: DeliveryTier | null) {
    setOverride(t);
    wsClient.sendOverride(t);
  }

  const tierColor =
    tier === 'full'     ? 'text-green-700' :
    tier === 'degraded' ? 'text-amber-600' :
    /* minimal */         'text-red-600';

  return (
    <div className="bg-white border-t border-gray-200">
      <div className="px-4 py-2.5 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">Connection</h2>
      </div>

      <div className="px-4 py-2 space-y-1.5">
        {[
          ['Tier',   <span key="t" className={`font-mono font-semibold ${tierColor}`}>{tier.toUpperCase()}</span>],
          ['Rate',   <span key="r" className="font-mono">{RATE_LABEL[effectiveRate] ?? `${effectiveRate}ms`}</span>],
          ['RTT',    <span key="rtt" className="font-mono">{rtt ? `${rtt} ms` : '—'}</span>],
          ['Jitter', <span key="j" className="font-mono">{jitter ? `${jitter} ms` : '—'}</span>],
        ].map(([label, value]) => (
          <div key={label as string} className="flex justify-between text-sm">
            <span className="text-gray-500">{label}</span>
            {value}
          </div>
        ))}
      </div>

      <div className="px-4 pb-3 pt-1">
        <p className="text-xs text-gray-400 mb-1.5">Force tier</p>
        <div className="flex gap-1.5">
          {TIERS.map(t => {
            const isActive = override === t;
            const activeClass =
              t === 'full'     ? 'bg-green-600 text-white border-green-600' :
              t === 'degraded' ? 'bg-amber-500 text-white border-amber-500' :
              /* minimal */      'bg-red-600 text-white border-red-600';

            return (
              <button
                key={t}
                onClick={() => handleOverride(isActive ? null : t)}
                className={`flex-1 text-xs font-medium py-1 rounded border transition-all cursor-pointer
                  ${isActive ? activeClass : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'}`}
              >
                {t}
              </button>
            );
          })}
        </div>
        {override && (
          <button
            onClick={() => handleOverride(null)}
            className="mt-1.5 w-full text-xs text-gray-500 hover:text-gray-800 py-1 border border-gray-200 rounded hover:border-gray-400 transition-all cursor-pointer"
          >
            Clear override
          </button>
        )}
      </div>
    </div>
  );
}
