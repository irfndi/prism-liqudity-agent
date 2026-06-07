import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Effect } from "effect";

// ─── Replicate fetchFeeWalletAddress logic from adapter-service.ts:77-104 ───
// This mirrors the exact same closure-based caching pattern:
//   1. Return cached address if not expired (30-min TTL)
//   2. Try to fetch from ${feeWalletApiUrl}/v1/fee-wallet
//   3. Fall back to feeWalletAddress env var
//   4. Return empty string if nothing configured

const FEE_WALLET_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function makeFeeWalletFetcher(config: { feeWalletApiUrl: string; feeWalletAddress: string }) {
  let cachedFeeWallet: { address: string; expiresAt: number } | null = null;

  function fetchFeeWalletAddress(): Effect.Effect<string, never> {
    return Effect.gen(function* () {
      // Return cached if valid
      if (cachedFeeWallet && Date.now() < cachedFeeWallet.expiresAt) {
        return cachedFeeWallet.address;
      }

      // Try API
      if (config.feeWalletApiUrl) {
        const res = yield* Effect.tryPromise(() =>
          fetch(`${config.feeWalletApiUrl}/v1/fee-wallet`),
        );
        if (res.ok) {
          const data = (yield* Effect.tryPromise(() => res.json())) as { address?: string };
          if (data.address) {
            cachedFeeWallet = {
              address: data.address,
              expiresAt: Date.now() + FEE_WALLET_CACHE_TTL_MS,
            };
            return data.address;
          }
        }
      }

      // Fallback to env var
      return config.feeWalletAddress;
    }).pipe(Effect.catchAll(() => Effect.succeed(config.feeWalletAddress)));
  }

  return {
    fetchFeeWalletAddress,
    /** Reset the internal cache (for test isolation). */
    resetCache: () => {
      cachedFeeWallet = null;
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("fetchFeeWalletAddress", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("returns env-configured address when API is unavailable", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("network error")) as unknown as typeof fetch;
    const { fetchFeeWalletAddress, resetCache } = makeFeeWalletFetcher({
      feeWalletApiUrl: "https://api.example.com",
      feeWalletAddress: "EnvWallet11111111111111111111111111111111111",
    });
    resetCache();

    const result = await Effect.runPromise(fetchFeeWalletAddress());
    expect(result).toBe("EnvWallet11111111111111111111111111111111111");
  });

  it("caches the result for 30 minutes", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ address: "CachedWallet22222222222222222222222222222222222" }),
    }) as unknown as typeof fetch;
    const { fetchFeeWalletAddress, resetCache } = makeFeeWalletFetcher({
      feeWalletApiUrl: "https://api.example.com",
      feeWalletAddress: "FallbackWallet",
    });
    resetCache();

    // First call — hits the API
    const first = await Effect.runPromise(fetchFeeWalletAddress());
    expect(first).toBe("CachedWallet22222222222222222222222222222222222");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Second call within TTL — returns cache, no second fetch
    const second = await Effect.runPromise(fetchFeeWalletAddress());
    expect(second).toBe("CachedWallet22222222222222222222222222222222222");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // still 1

    // Advance past TTL (30 min + 1 ms)
    vi.advanceTimersByTime(FEE_WALLET_CACHE_TTL_MS + 1);

    // Third call — cache expired, hits API again
    const third = await Effect.runPromise(fetchFeeWalletAddress());
    expect(third).toBe("CachedWallet22222222222222222222222222222222222");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to env var when API returns invalid data", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ error: "not found" }), // no `address` field
    }) as unknown as typeof fetch;
    const { fetchFeeWalletAddress, resetCache } = makeFeeWalletFetcher({
      feeWalletApiUrl: "https://api.example.com",
      feeWalletAddress: "FallbackWallet33333333333333333333333333333333333",
    });
    resetCache();

    const result = await Effect.runPromise(fetchFeeWalletAddress());
    expect(result).toBe("FallbackWallet33333333333333333333333333333333333");
  });
});
