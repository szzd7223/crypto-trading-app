"use client";

import { useState } from "react";
import { useStore } from "@/store";
import { wsClient } from "@/lib/ws-client";
import type { DeliveryTier } from "@/types";

const TIERS: DeliveryTier[] = ["full", "degraded", "minimal"];

const RATE_LABEL: Record<number, string> = {
  0: "Real-time (0ms)",
  2000: "Batched (2s)",
  10000: "Throttled (10s)",
};

export default function DebugPanel() {
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const tier = useStore((s) => s.tier);
  const effectiveRate = useStore((s) => s.effectiveRateMs);
  const rtt = useStore((s) => s.rtt);
  const jitter = useStore((s) => s.jitter);
  const override = useStore((s) => s.override);
  const setOverride = useStore((s) => s.setOverride);
  const isStale = useStore((s) => s.isStale);

  function handleOverride(t: DeliveryTier | null) {
    setOverride(t);
    wsClient.sendOverride(t);
  }

  const tierBadgeBg =
    tier === "full"
      ? "bg-[#0ecb81]/15 border-[#0ecb81]/30 text-[#0ecb81]"
      : tier === "degraded"
        ? "bg-[#f59e0b]/15 border-[#f59e0b]/30 text-[#f59e0b]"
        : /* minimal */ "bg-[#f6465d]/15 border-[#f6465d]/30 text-[#f6465d]";

  return (
    <footer className="bg-[#121721] rounded-xl border border-[#1e2638] shadow-md select-none shrink-0 z-30 transition-all">
      {/* Primary Telemetry Bar */}
      <div className="flex items-center justify-between px-3.5 sm:px-5 py-2 sm:py-2.5 min-h-[44px] sm:min-h-[52px] text-xs sm:text-sm font-mono gap-2 sm:gap-3">
        {/* Left: Telemetry Indicators */}
        <div className="flex items-center gap-2.5 sm:gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[#848e9c] uppercase font-bold text-[10px] sm:text-xs tracking-wider">
              Network
            </span>
            <span
              className={`px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-bold uppercase border ${tierBadgeBg}`}
            >
              {tier}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] sm:text-sm text-[#848e9c]">
            <span className="text-[#94a3b8] font-medium hidden xs:inline">Rate:</span>
            <span className="text-white font-semibold">
              {RATE_LABEL[effectiveRate] ?? `${effectiveRate}ms`}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs sm:text-sm text-[#848e9c]">
            <span className="text-[#94a3b8] font-medium">RTT:</span>
            <span className="text-white font-semibold">
              {rtt !== null ? `${rtt} ms` : "—"}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs sm:text-sm text-[#848e9c]">
            <span className="text-[#94a3b8] font-medium">Jitter:</span>
            <span className="text-white font-semibold">
              {jitter !== null ? `${jitter} ms` : "—"}
            </span>
          </div>
        </div>

        {/* Mobile toggle button for Simulation Controls */}
        <div className="flex lg:hidden items-center gap-2">
          {override && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30">
              {override}
            </span>
          )}
          <button
            onClick={() => setMobileExpanded(!mobileExpanded)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-[#94a3b8] hover:text-white bg-[#181e2b] border border-[#1e2638] px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
          >
            <span>Simulate</span>
            <svg
              className={`w-3 h-3 transition-transform duration-200 ${
                mobileExpanded ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>

        {/* Desktop: Force Tier Simulation Controls */}
        <div className="hidden lg:flex items-center gap-3">
          <span className="text-sm text-[#94a3b8] font-semibold">
            Simulate Tier:
          </span>

          <div className="inline-flex items-center gap-1 rounded-lg bg-[#181e2b] p-1 border border-[#1e2638]">
            <button
              onClick={() => handleOverride(null)}
              className={`px-3 py-1 text-xs sm:text-sm rounded-md transition-all cursor-pointer font-bold ${
                override === null
                  ? "bg-[#2563eb] text-white shadow-sm"
                  : "text-[#848e9c] hover:text-white hover:bg-[#202838]"
              }`}
            >
              Auto
            </button>

            {TIERS.map((t) => {
              const isActive = override === t;
              const activeClass =
                t === "full"
                  ? "bg-[#0ecb81] text-black font-bold shadow-sm"
                  : t === "degraded"
                    ? "bg-[#f59e0b] text-black font-bold shadow-sm"
                    : /* minimal */ "bg-[#f6465d] text-white font-bold shadow-sm";

              return (
                <button
                  key={t}
                  onClick={() => handleOverride(isActive ? null : t)}
                  className={`px-3 py-1 text-xs sm:text-sm rounded-md capitalize transition-all cursor-pointer ${
                    isActive
                      ? activeClass
                      : "text-[#848e9c] hover:text-white hover:bg-[#202838]"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {override && (
            <span className="text-xs font-semibold text-[#f59e0b] ml-1">
              (Override active)
            </span>
          )}

          <div className="h-6 w-px bg-[#1e2638]" />

          {/* Simulate Disconnect / Stale Demo Button */}
          <button
            onClick={() => wsClient.simulateDisconnect(5000)}
            disabled={isStale}
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-all font-semibold border flex items-center gap-1.5 ${
              isStale
                ? "bg-[#f59e0b]/15 border-[#f59e0b]/30 text-[#f59e0b] cursor-not-allowed"
                : "border-[#1e2638] bg-[#181e2b] text-[#94a3b8] hover:text-white hover:bg-[#202838] cursor-pointer"
            }`}
            title="Temporarily close connection for 5s to demonstrate STALE state and auto-reconnection"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isStale ? "bg-[#f59e0b] animate-pulse-dot" : "bg-[#f6465d]"
              }`}
            />
            {isStale ? "Reconnecting (5s)..." : "Simulate Drop (5s)"}
          </button>
        </div>
      </div>

      {/* Mobile-only Collapsible Simulation Drawer */}
      {mobileExpanded && (
        <div className="lg:hidden px-3.5 pb-3 pt-1 border-t border-[#1e2638] flex flex-col gap-2.5 bg-[#0e131d]/60 rounded-b-xl">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#94a3b8] font-semibold">
              Simulate Delivery Tier:
            </span>
            {override && (
              <span className="text-[10px] font-semibold text-[#f59e0b]">
                Override active
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1.5 bg-[#181e2b] p-1 rounded-lg border border-[#1e2638]">
            <button
              onClick={() => handleOverride(null)}
              className={`py-1.5 text-xs rounded-md transition-all cursor-pointer font-bold text-center ${
                override === null
                  ? "bg-[#2563eb] text-white shadow-sm"
                  : "text-[#848e9c] hover:text-white hover:bg-[#202838]"
              }`}
            >
              Auto
            </button>

            {TIERS.map((t) => {
              const isActive = override === t;
              const activeClass =
                t === "full"
                  ? "bg-[#0ecb81] text-black font-bold shadow-sm"
                  : t === "degraded"
                    ? "bg-[#f59e0b] text-black font-bold shadow-sm"
                    : /* minimal */ "bg-[#f6465d] text-white font-bold shadow-sm";

              return (
                <button
                  key={t}
                  onClick={() => handleOverride(isActive ? null : t)}
                  className={`py-1.5 text-xs rounded-md capitalize transition-all cursor-pointer font-bold text-center ${
                    isActive
                      ? activeClass
                      : "text-[#848e9c] hover:text-white hover:bg-[#202838]"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => wsClient.simulateDisconnect(5000)}
            disabled={isStale}
            className={`w-full py-2 text-xs rounded-lg transition-all font-semibold border flex items-center justify-center gap-2 ${
              isStale
                ? "bg-[#f59e0b]/15 border-[#f59e0b]/30 text-[#f59e0b] cursor-not-allowed"
                : "border-[#1e2638] bg-[#181e2b] text-[#94a3b8] hover:text-white hover:bg-[#202838] cursor-pointer"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isStale ? "bg-[#f59e0b] animate-pulse-dot" : "bg-[#f6465d]"
              }`}
            />
            {isStale ? "Reconnecting in 5s..." : "Simulate Drop (5s Disconnect)"}
          </button>
        </div>
      )}
    </footer>
  );
}
