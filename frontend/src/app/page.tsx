'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { wsClient } from '@/lib/ws-client';
import Header from '@/components/Header';
import OrderBook from '@/components/OrderBook';
import Trades from '@/components/Trades';
import DebugPanel from '@/components/DebugPanel';

const Chart = dynamic(() => import('@/components/Chart'), { ssr: false });

export default function TradingPage() {
  useEffect(() => {
    wsClient.connect();
    return () => wsClient.destroy();
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#07090e] p-4 sm:p-5 lg:px-7 lg:py-4 gap-3.5 sm:gap-4 text-[#eaecef]">
      {/* Top Market Header */}
      <Header />

      {/* Main Trading Area */}
      <div className="flex flex-1 min-h-0 gap-3.5 sm:gap-4 overflow-hidden">
        {/* Left: Candlestick Chart Area */}
        <main className="flex-1 min-w-0 h-full rounded-xl border border-[#1e2638] bg-[#0e131d] overflow-hidden shadow-lg">
          <Chart />
        </main>

        {/* Right Sidebar: Order Book & Recent Trades */}
        <aside className="w-[360px] xl:w-[390px] shrink-0 flex flex-col h-full gap-2.5 sm:gap-3 overflow-hidden">
          {/* Order Book: ~58% of sidebar */}
          <div className="flex-[58] min-h-0 rounded-xl border border-[#1e2638] bg-[#121721] overflow-hidden shadow-lg">
            <OrderBook />
          </div>

          {/* Recent Trades: ~42% of sidebar */}
          <div className="flex-[42] min-h-0 rounded-xl border border-[#1e2638] bg-[#121721] overflow-hidden shadow-lg">
            <Trades />
          </div>
        </aside>
      </div>

      {/* Bottom Telemetry Dock */}
      <DebugPanel />
    </div>
  );
}
