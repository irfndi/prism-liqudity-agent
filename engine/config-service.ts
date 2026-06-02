import { Config, Context, Effect, Layer, Option, pipe } from "effect";
import { ConfigError } from "./errors.js";

export interface AppConfig {
  readonly walletPrivateKey: string;
  readonly anthropicBaseUrl: string;
  readonly anthropicApiKey: string;
  readonly heliusApiKey: string;
  readonly solanaRpcUrl: string;
  readonly paperTrading: boolean;
  readonly scanIntervalMs: number;
  readonly minPoolTvlUsd: number;
  readonly minFeeIlRatio: number;
  readonly tvlDropExitPct: number;
  readonly volumeAuthThreshold: number;
  readonly maxConcurrentPositions: number;
  readonly minRebalanceIntervalMs: number;
  readonly minRebalanceNetBenefitUsd: number;
  readonly confidenceThreshold: number;
  readonly paperPortfolioUsd: number;
  readonly minBinUtilization: number;
  readonly maxRebalanceRangeBins: number;
  readonly watchlistPools: ReadonlyArray<string>;
  readonly claudeModel: string;
  // New features
  readonly stopLossPct: number;
  readonly trailingStopPct: number;
  readonly oorGracePeriodCycles: number;
  readonly feeClaimIntervalMs: number;
  readonly enablePoolDiscovery: boolean;
  readonly discoveryMinTvlUsd: number;
  readonly discoveryMinFeeRatio: number;
  readonly deployerBlacklistPath: string;
  readonly tokenBlacklistPath: string;
}

export class ConfigService extends Context.Tag("ConfigService")<ConfigService, AppConfig>() {}

const loadConfig = Effect.gen(function* () {
  const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

  const walletPrivateKey = yield* Config.string("WALLET_PRIVATE_KEY").pipe(
    Effect.orElseSucceed(() => ""),
  );
  const anthropicBaseUrl = yield* Config.string("ANTHROPIC_BASE_URL").pipe(
    Effect.orElseSucceed(() => "https://api.anthropic.com"),
  );
  const anthropicApiKey = yield* Config.string("ANTHROPIC_API_KEY").pipe(
    Effect.orElseSucceed(() => (isTest ? "test-anthropic-key" : "")),
  );
  const heliusApiKey = yield* Config.string("HELIUS_API_KEY").pipe(
    Effect.orElseSucceed(() => (isTest ? "test-helius-key" : "")),
  );
  const solanaRpcUrl = yield* Config.string("SOLANA_RPC_URL").pipe(
    Effect.orElseSucceed(() =>
      isTest ? "https://example.com" : "https://api.mainnet-beta.solana.com",
    ),
  );
  const paperTrading = yield* Config.boolean("PAPER_TRADING").pipe(
    Effect.orElseSucceed(() => true),
  );
  const scanIntervalMs = yield* Config.number("SCAN_INTERVAL_MS").pipe(
    Effect.orElseSucceed(() => 600_000),
  );
  const minPoolTvlUsd = yield* Config.number("MIN_POOL_TVL_USD").pipe(
    Effect.orElseSucceed(() => 50_000),
  );
  const minFeeIlRatio = yield* Config.number("MIN_FEE_IL_RATIO").pipe(
    Effect.orElseSucceed(() => 1.2),
  );
  const tvlDropExitPct = yield* Config.number("TVL_DROP_EXIT_PCT").pipe(
    Effect.orElseSucceed(() => 0.3),
  );
  const volumeAuthThreshold = yield* Config.number("VOLUME_AUTH_THRESHOLD").pipe(
    Effect.orElseSucceed(() => 0.7),
  );
  const maxConcurrentPositions = yield* Config.number("MAX_CONCURRENT_POSITIONS").pipe(
    Effect.orElseSucceed(() => 5),
  );
  const minRebalanceIntervalMs = yield* Config.number("MIN_REBALANCE_INTERVAL_MS").pipe(
    Effect.orElseSucceed(() => 24 * 60 * 60 * 1000),
  );
  const minRebalanceNetBenefitUsd = yield* Config.number("MIN_REBALANCE_NET_BENEFIT_USD").pipe(
    Effect.orElseSucceed(() => 10),
  );
  const confidenceThreshold = yield* Config.number("CONFIDENCE_THRESHOLD").pipe(
    Effect.orElseSucceed(() => 0.65),
  );
  const paperPortfolioUsd = yield* Config.number("PAPER_PORTFOLIO_USD").pipe(
    Effect.orElseSucceed(() => 10_000),
  );
  const minBinUtilization = yield* Config.number("MIN_BIN_UTILIZATION").pipe(
    Effect.orElseSucceed(() => 0.3),
  );
  const maxRebalanceRangeBins = yield* Config.number("MAX_REBALANCE_RANGE_BINS").pipe(
    Effect.orElseSucceed(() => 50),
  );
  const watchlistPoolsRaw = yield* Config.string("WATCHLIST_POOLS").pipe(
    Effect.orElseSucceed(() => ""),
  );
  const claudeModel = yield* Config.string("CLAUDE_MODEL").pipe(
    Effect.orElseSucceed(() => "claude-sonnet-4-5-20251001"),
  );

  // New feature configs
  const stopLossPct = yield* Config.number("STOP_LOSS_PCT").pipe(Effect.orElseSucceed(() => 0.15));
  const trailingStopPct = yield* Config.number("TRAILING_STOP_PCT").pipe(
    Effect.orElseSucceed(() => 0.1),
  );
  const oorGracePeriodCycles = yield* Config.number("OOR_GRACE_PERIOD_CYCLES").pipe(
    Effect.orElseSucceed(() => 3),
  );
  const feeClaimIntervalMs = yield* Config.number("FEE_CLAIM_INTERVAL_MS").pipe(
    Effect.orElseSucceed(() => 24 * 60 * 60 * 1000),
  );
  const enablePoolDiscovery = yield* Config.boolean("ENABLE_POOL_DISCOVERY").pipe(
    Effect.orElseSucceed(() => false),
  );
  const discoveryMinTvlUsd = yield* Config.number("DISCOVERY_MIN_TVL_USD").pipe(
    Effect.orElseSucceed(() => 100_000),
  );
  const discoveryMinFeeRatio = yield* Config.number("DISCOVERY_MIN_FEE_RATIO").pipe(
    Effect.orElseSucceed(() => 1.5),
  );
  const deployerBlacklistPath = yield* Config.string("DEPLOYER_BLACKLIST_PATH").pipe(
    Effect.orElseSucceed(() => "./engine/data/deployer-blacklist.json"),
  );
  const tokenBlacklistPath = yield* Config.string("TOKEN_BLACKLIST_PATH").pipe(
    Effect.orElseSucceed(() => "./engine/data/token-blacklist.json"),
  );

  const watchlistPools = watchlistPoolsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const cfg: AppConfig = {
    walletPrivateKey,
    anthropicBaseUrl,
    anthropicApiKey,
    heliusApiKey,
    solanaRpcUrl,
    paperTrading,
    scanIntervalMs,
    minPoolTvlUsd,
    minFeeIlRatio,
    tvlDropExitPct,
    volumeAuthThreshold,
    maxConcurrentPositions,
    minRebalanceIntervalMs,
    minRebalanceNetBenefitUsd,
    confidenceThreshold,
    paperPortfolioUsd,
    minBinUtilization,
    maxRebalanceRangeBins,
    watchlistPools,
    claudeModel,
    stopLossPct,
    trailingStopPct,
    oorGracePeriodCycles,
    feeClaimIntervalMs,
    enablePoolDiscovery,
    discoveryMinTvlUsd,
    discoveryMinFeeRatio,
    deployerBlacklistPath,
    tokenBlacklistPath,
  };

  return cfg;
});

export const ConfigLive = Layer.effect(ConfigService, loadConfig);
