import { describe, it, expect, beforeEach } from "vitest";
import { env, createExecutionContext } from "cloudflare:test";
import worker, { type Env } from "./index";

const ADMIN_KEY = "test-admin-key-123";

function buildRequest(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(`https://example.com${path}`, init);
}

function withAdmin(req: Request): Request {
  return new Request(req.url, {
    method: req.method,
    headers: { ...Object.fromEntries(req.headers), Authorization: `Bearer ${ADMIN_KEY}` },
    body: req.body,
  });
}

describe("Fee Wallet API", () => {
  const testEnv = { ...env, ADMIN_API_KEY: ADMIN_KEY } as unknown as Env;

  beforeEach(async () => {
    // Clear KV entries
    await env.CACHE.delete("fee_wallet_address");
  });

  // ── GET /v1/fee-wallet ──────────────────────────────────────────────────

  describe("GET /v1/fee-wallet", () => {
    it("returns the fee wallet address from KV", async () => {
      await env.CACHE.put("fee_wallet_address", "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");

      const ctx = createExecutionContext();
      const request = buildRequest("GET", "/v1/fee-wallet");
      const response = await worker.fetch(request, testEnv, ctx);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { address: string; source: string };
      expect(body.address).toBe("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");
      expect(body.source).toBe("kv");
    });

    it("returns 404 when no fee wallet is configured", async () => {
      // Ensure KV is clear and no FEE_WALLET_ADDRESS in env
      const envNoFee = { ...testEnv, FEE_WALLET_ADDRESS: "" } as unknown as Env;
      const ctx = createExecutionContext();
      const request = buildRequest("GET", "/v1/fee-wallet");
      const response = await worker.fetch(request, envNoFee, ctx);
      expect(response.status).toBe(404);

      const body = (await response.json()) as { error: string };
      expect(body.error).toMatch(/no fee wallet/i);
    });
  });

  // ── PUT /v1/fee-wallet ──────────────────────────────────────────────────

  describe("PUT /v1/fee-wallet", () => {
    it("returns 401 without valid admin API key", async () => {
      const ctx = createExecutionContext();
      // No Authorization header
      const request = buildRequest("PUT", "/v1/fee-wallet", {
        address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      });
      const response = await worker.fetch(request, testEnv, ctx);
      expect(response.status).toBe(401);
    });

    it("returns 401 with wrong admin API key", async () => {
      const ctx = createExecutionContext();
      const request = buildRequest(
        "PUT",
        "/v1/fee-wallet",
        { address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" },
        { Authorization: "Bearer wrong-key" },
      );
      const response = await worker.fetch(request, testEnv, ctx);
      expect(response.status).toBe(401);
    });

    it("updates the fee wallet address in KV with valid admin key", async () => {
      const ctx = createExecutionContext();
      const addr = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
      const request = withAdmin(
        buildRequest("PUT", "/v1/fee-wallet", { address: addr }),
      );
      const response = await worker.fetch(request, testEnv, ctx);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { address: string; updated: boolean };
      expect(body.address).toBe(addr);
      expect(body.updated).toBe(true);

      // Verify persisted in KV
      const stored = await env.CACHE.get("fee_wallet_address");
      expect(stored).toBe(addr);
    });

    it("rejects invalid Solana addresses", async () => {
      const ctx = createExecutionContext();
      const request = withAdmin(
        buildRequest("PUT", "/v1/fee-wallet", { address: "not-a-valid-addr" }),
      );
      const response = await worker.fetch(request, testEnv, ctx);
      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toMatch(/invalid solana/i);
    });

    it("rejects addresses that are too short", async () => {
      const ctx = createExecutionContext();
      const request = withAdmin(
        buildRequest("PUT", "/v1/fee-wallet", { address: "abc123" }),
      );
      const response = await worker.fetch(request, testEnv, ctx);
      expect(response.status).toBe(400);
    });

    it("returns 400 when address is missing", async () => {
      const ctx = createExecutionContext();
      const request = withAdmin(buildRequest("PUT", "/v1/fee-wallet", {}));
      const response = await worker.fetch(request, testEnv, ctx);
      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toMatch(/address is required/i);
    });
  });
});
