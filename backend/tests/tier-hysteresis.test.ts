// ============================================================
// Tests: Tier Manager — Hysteresis State Machine
// ============================================================

import { describe, it, expect, beforeEach } from "@jest/globals";
import { TierManager } from "../src/ws/tier-manager.js";

// Helper: feed N identical reports to TierManager
function feedReports(
  tm: TierManager,
  count: number,
  rtt: number,
  jitter: number,
): void {
  for (let i = 0; i < count; i++) {
    tm.processReport(rtt, jitter);
  }
}

describe("TierManager — initial state", () => {
  it("starts at FULL tier", () => {
    const tm = new TierManager();
    expect(tm.currentTier).toBe("full");
    expect(tm.currentRateMs).toBe(0);
  });
});

describe("TierManager — downgrade (FULL → DEGRADED)", () => {
  it("does NOT downgrade after a single bad report", () => {
    const tm = new TierManager();
    feedReports(tm, 1, 300, 100); // RTT 300ms > 150ms threshold
    expect(tm.currentTier).toBe("full");
  });

  it("downgrades after 2 consecutive bad reports", () => {
    const tm = new TierManager();
    feedReports(tm, 2, 300, 100);
    expect(tm.currentTier).toBe("degraded");
  });

  it("resets bad counter after a single good report interrupts", () => {
    const tm = new TierManager();
    feedReports(tm, 1, 300, 100); // bad
    feedReports(tm, 1, 50, 10); // good — resets bad counter
    feedReports(tm, 1, 300, 100); // bad again — only 1 consecutive bad
    expect(tm.currentTier).toBe("full"); // should NOT have downgraded
  });
});

describe("TierManager — downgrade (DEGRADED → MINIMAL)", () => {
  it("downgrades from DEGRADED to MINIMAL after 2 bad reports", () => {
    const tm = new TierManager();
    // First get to DEGRADED
    feedReports(tm, 2, 300, 100);
    expect(tm.currentTier).toBe("degraded");
    // Now 2 more bad reports to go to MINIMAL
    // DEGRADED threshold is RTT>500ms, so use 600ms
    feedReports(tm, 2, 600, 200);
    expect(tm.currentTier).toBe("minimal");
  });

  it("does not go below MINIMAL", () => {
    const tm = new TierManager();
    feedReports(tm, 2, 300, 100); // → degraded
    feedReports(tm, 2, 600, 200); // → minimal
    feedReports(tm, 10, 1000, 500); // already minimal, stays
    expect(tm.currentTier).toBe("minimal");
  });
});

describe("TierManager — upgrade", () => {
  it("does NOT upgrade after 2 good reports (needs 3)", () => {
    const tm = new TierManager();
    feedReports(tm, 2, 300, 100); // → degraded
    feedReports(tm, 2, 50, 10); // 2 good — NOT enough to upgrade
    expect(tm.currentTier).toBe("degraded");
  });

  it("upgrades from DEGRADED to FULL after 3 consecutive good reports", () => {
    const tm = new TierManager();
    feedReports(tm, 2, 300, 100); // → degraded
    feedReports(tm, 3, 50, 10); // 3 good → full
    expect(tm.currentTier).toBe("full");
  });

  it("upgrades from MINIMAL to DEGRADED after 3 good reports, then to FULL after 3 more", () => {
    const tm = new TierManager();
    feedReports(tm, 2, 300, 100); // → degraded
    feedReports(tm, 2, 600, 200); // → minimal
    feedReports(tm, 3, 50, 10); // → degraded
    expect(tm.currentTier).toBe("degraded");
    feedReports(tm, 3, 50, 10); // → full
    expect(tm.currentTier).toBe("full");
  });

  it("resets good counter after a bad report interrupts", () => {
    const tm = new TierManager();
    feedReports(tm, 2, 300, 100); // bad from FULL's perspective (RTT>150) → degraded
    expect(tm.currentTier).toBe("degraded");
    feedReports(tm, 2, 50, 10); // 2 good (from DEGRADED's perspective, RTT<500)
    feedReports(tm, 1, 600, 200); // bad from DEGRADED's perspective (RTT>500) — resets good counter
    feedReports(tm, 2, 50, 10); // 2 good again — counter restarted, only 2 < 3
    expect(tm.currentTier).toBe("degraded"); // stays degraded (needs 3 consecutive good)
  });
});

describe("TierManager — override (debug control)", () => {
  it("forces tier to MINIMAL via override", () => {
    const tm = new TierManager();
    tm.setOverride("minimal");
    expect(tm.currentTier).toBe("minimal");
    expect(tm.currentRateMs).toBe(10_000);
  });

  it("keeps tracking internal tier while override is active", () => {
    const tm = new TierManager();
    tm.setOverride("minimal");
    feedReports(tm, 2, 300, 100); // would downgrade internally
    tm.setOverride(null); // remove override
    expect(tm.currentTier).toBe("degraded"); // internal state was tracked
  });

  it("removing override reveals auto-tracked tier", () => {
    const tm = new TierManager();
    feedReports(tm, 2, 300, 100); // internal = degraded
    tm.setOverride("full"); // forced to full
    expect(tm.currentTier).toBe("full");
    tm.setOverride(null);
    expect(tm.currentTier).toBe("degraded"); // back to real tier
  });
});

describe("TierManager — onChange listener", () => {
  it("emits change events when tier changes", () => {
    const tm = new TierManager();
    const changes: string[] = [];
    tm.onChange((tier) => changes.push(tier));

    feedReports(tm, 2, 300, 100); // → degraded
    expect(changes).toContain("degraded");
  });

  it("does NOT emit when bad reports are not yet sufficient", () => {
    const tm = new TierManager();
    const changes: string[] = [];
    tm.onChange((tier) => changes.push(tier));

    feedReports(tm, 1, 300, 100); // only 1 bad — no change
    expect(changes).toHaveLength(0);
  });

  it("emits when override is set", () => {
    const tm = new TierManager();
    const changes: string[] = [];
    tm.onChange((tier) => changes.push(tier));

    tm.setOverride("minimal");
    expect(changes).toContain("minimal");
  });
});

describe("TierManager — reset", () => {
  it("resets to FULL after reset()", () => {
    const tm = new TierManager();
    feedReports(tm, 2, 300, 100); // → degraded
    tm.reset();
    expect(tm.currentTier).toBe("full");
  });

  it("clears override on reset", () => {
    const tm = new TierManager();
    tm.setOverride("minimal");
    tm.reset();
    expect(tm.currentTier).toBe("full");
  });
});
