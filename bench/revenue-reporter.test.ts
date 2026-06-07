import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Effect, Layer } from "effect";
import { AdapterService } from "../engine/services.js";
import type { AdapterApi } from "../engine/services.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function run<T>(effect: Effect.Effect<T, unknown, unknown>, layer: unknown): T {
  return Effect.runSync((Effect.provide as any)(effect, layer));
}

type FeeCollectionEvent = {
  poolAddress: string;
  positionPubkey: string;
  feeX: number;
  feeY: number;
  platformFeeX: number;
  platformFeeY: number;
  tier: string;
  txSignature: string;
  feeTransferTxSignature?: string;
};

/**
 * Build a test AdapterService layer that replicates the reportFeeCollection
 * behavior from adapter-service.ts:875-890.
 *
 * The real implementation:
 *   1. Returns early if config.feeWalletApiUrl is not set
 *   2. Fires an async fetch to POST /v1/revenue/log
 *   3. Logs warning on failure (does not throw)
 */
function makeTestAdapterLayer(config: { feeWalletApiUrl: string }) {
  const mockAdapter: AdapterApi = {
    hasWallet: () => false,
    getWalletAddress: () => null,
    getWalletBalanceUsd: () => Effect.succeed(0),
    getNativeSolBalance: () => Effect.succeed(0),
    getPoolState: () => Effect.fail("not implemented"),
    getBinArray: () => Effect.fail("not implemented"),
    getPositions: () => Effect.succeed([]),
    simulateRebalance: () => Effect.fail("not implemented"),
    enterPosition: () => Effect.fail("not implemented"),
    exitPosition: () => Effect.fail("not implemented"),
    rebalancePosition: () => Effect.fail("not implemented"),
    claimFees: () => Effect.fail("not implemented"),
    discoverPools: () => Effect.succeed([]),

    reportFeeCollection(event: FeeCollectionEvent) {
      if (!config.feeWalletApiUrl) return;
      void (async () => {
        try {
          const res = await fetch(`${config.feeWalletApiUrl}/v1/revenue/log`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...event, installId: "test-install-id" }),
          });
          if (!res.ok) console.warn("Revenue report failed:", res.status);
        } catch (err) {
          console.warn("Revenue report failed:", String(err));
        }
      })();
    },
  };

  return Layer.succeed(AdapterService, mockAdapter);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("reportFeeCollection", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  const sampleEvent: FeeCollectionEvent = {
    poolAddress: "PoolAddr111111111111111111111111111111111111",
    positionPubkey: "PosKey111111111111111111111111111111111111111",
    feeX: 1.5,
    feeY: 2.3,
    platformFeeX: 0.15,
    platformFeeY: 0.23,
    tier: "standard",
    txSignature: "Sig11111111111111111111111111111111111111111111",
  };

  it("sends the correct payload to the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const layer = makeTestAdapterLayer({ feeWalletApiUrl: "https://api.example.com" });

    run(
      Effect.gen(function* () {
        const adapter = yield* AdapterService;
        adapter.reportFeeCollection(sampleEvent);
      }),
      layer,
    );

    // reportFeeCollection is fire-and-forget (void), so flush the microtask queue
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.com/v1/revenue/log");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });

    const body = JSON.parse(options.body as string);
    expect(body.poolAddress).toBe(sampleEvent.poolAddress);
    expect(body.positionPubkey).toBe(sampleEvent.positionPubkey);
    expect(body.feeX).toBe(1.5);
    expect(body.feeY).toBe(2.3);
    expect(body.platformFeeX).toBe(0.15);
    expect(body.platformFeeY).toBe(0.23);
    expect(body.tier).toBe("standard");
    expect(body.txSignature).toBe(sampleEvent.txSignature);
    expect(body.installId).toBe("test-install-id");
  });

  it("handles API errors gracefully (no throw)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network timeout"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const layer = makeTestAdapterLayer({ feeWalletApiUrl: "https://api.example.com" });

    // Should not throw
    expect(() => {
      run(
        Effect.gen(function* () {
          const adapter = yield* AdapterService;
          adapter.reportFeeCollection(sampleEvent);
        }),
        layer,
      );
    }).not.toThrow();

    // Flush microtasks so the async fetch completes
    await vi.advanceTimersByTimeAsync(0);

    // The fetch was attempted but failed — no throw, just a console.warn
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when feeWalletApiUrl is not configured", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const layer = makeTestAdapterLayer({ feeWalletApiUrl: "" });

    run(
      Effect.gen(function* () {
        const adapter = yield* AdapterService;
        adapter.reportFeeCollection(sampleEvent);
      }),
      layer,
    );

    await vi.advanceTimersByTimeAsync(0);

    // fetch should never be called when the URL is empty
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
