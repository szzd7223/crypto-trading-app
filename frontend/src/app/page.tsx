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
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      <Header />
      <div className="flex flex-1 min-h-0">

        {/* Chart — main area */}
        <main className="flex-1 min-w-0 border-r border-gray-200">
          <Chart />
        </main>

        {/* Sidebar — fixed 300px, clearly readable */}
        <aside className="w-[300px] shrink-0 flex flex-col overflow-hidden bg-white border-l border-gray-200">
          <div className="flex-[5] min-h-0 border-b border-gray-200 overflow-hidden">
            <OrderBook />
          </div>
          <div className="flex-[4] min-h-0 border-b border-gray-200 overflow-hidden">
            <Trades />
          </div>
          <div className="shrink-0">
            <DebugPanel />
          </div>
        </aside>

      </div>
    </div>
  );
}
