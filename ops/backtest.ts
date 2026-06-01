/**
 * Backtest script — replays historical pool data through the DLMM strategy
 * to evaluate decision quality without spending real capital.
 *
 * Usage: bun run backtest
 */
import { createLogger } from "../engine/logger.js";
import { DLMMStrategy } from "../engine/probes/dlmm.js";
import { config } from "../engine/config.js";
import type { BacktestResult, PoolState, BinArray } from "../engine/types.js";

const log = createLogger("Backtest");

// ─── Mock historical data generator ──────────────────────────────────────────

interface HistoryTick {
  pool: PoolState;
  binArray: BinArray;
}

function generateMockHistory(
  poolAddress: string,
  days: number,
  startTvl: number
): HistoryTick[] {
  const history: HistoryTick[] = [];
  const intervalMs = 10 * 60 * 1000; // 10 min
  const ticks = (days * 24 * 60 * 60 * 1000) / intervalMs;

  let tvl = startTvl;
  let price = 100;
  let activeBin = 5000;

  // Trending + volatile walk
  let trend = 0;
  let volatility = 0.015;

  for (let i = 0; i < ticks; i++) {
    const timestamp = Date.now() - (ticks - i) * intervalMs;

    // Switch volatility regimes every ~5 days
    if (i % 720 === 0) {
      volatility = 0.005 + Math.random() * 0.025;
      trend = (Math.random() - 0.5) * 0.004;
    }

    // Occasional large jumps (news events) — 2% chance per tick
    if (Math.random() < 0.02) {
      const jump = (Math.random() - 0.5) * 0.08; // ±4% jump
      price *= 1 + jump;
      activeBin += Math.floor(jump * 200); // 50 bins per 1% move
    }

    const shock = (Math.random() - 0.5) * volatility * 2;
    tvl *= 1 + (Math.random() - 0.49) * 0.02;
    price *= 1 + trend + shock;
    activeBin += Math.floor((trend * 200 + shock * 100) + (Math.random() - 0.5) * 10);

    const pool: PoolState = {
      address: poolAddress,
      tokenX: "So11111111111111111111111111111111111111112",
      tokenY: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      tokenXSymbol: "SOL",
      tokenYSymbol: "USDC",
      tvlUsd: Math.max(tvl, 1000),
      volume24hUsd: tvl * (0.3 + Math.random() * 0.5),
      fees24hUsd: tvl * 0.003 * (0.5 + Math.random() * 0.5), // 0.15-0.3% daily fees = 55-110% APR
      apr: 40 + Math.random() * 80,
      activeBinId: activeBin,
      binStep: 10,
      currentPrice: price,
      timestamp,
    };

    const bins = Array.from({ length: 40 }, (_, j) => ({
      binId: activeBin - 20 + j,
      price: price * (1 + (j - 20) * 0.001),
      reserveX: BigInt(Math.floor(Math.random() * 1e9)),
      reserveY: BigInt(Math.floor(Math.random() * 1e9)),
      liquiditySupply: BigInt(Math.floor(Math.random() * 1e12)),
    }));

    const binArray: BinArray = {
      lowerBinId: activeBin - 20,
      upperBinId: activeBin + 20,
      bins,
      activeBinId: activeBin,
    };

    history.push({ pool, binArray });
  }

  return history;
}

// ─── Run backtest with configurable parameters ────────────────────────────────

interface BacktestConfig {
  halfWidth: number;          // bins each side of active bin
  driftThreshold: number;     // % of half-width before rebalance triggers
  minHoldTicks: number;       // minimum ticks between rebalances
  minNetBenefitUsd: number;   // simulated net benefit threshold
  maxRebalances: number;      // cap to prevent churn
}

async function runBacktest(
  poolAddress: string,
  days = 30,
  cfg: BacktestConfig
): Promise<BacktestResult> {
  log.info("Starting backtest", {
    pool: poolAddress,
    days,
    halfWidth: cfg.halfWidth,
    driftThreshold: cfg.driftThreshold,
    minHoldTicks: cfg.minHoldTicks,
    minNetBenefitUsd: cfg.minNetBenefitUsd,
  });

  const strategy = new DLMMStrategy();
  const history = generateMockHistory(poolAddress, days, 100_000);

  let rebalances = 0;
  let wins = 0;
  let totalFees = 0;
  let totalIl = 0;
  const initialValue = 10_000;
  let portfolioValue = initialValue;

  if (history.length === 0) {
    throw new Error("Empty history generated");
  }

  let previousTvl = history[0]!.pool.tvlUsd;

  // Position starts centered on first active bin
  let currentLowerBinId = history[0]!.pool.activeBinId - cfg.halfWidth;
  let currentUpperBinId = history[0]!.pool.activeBinId + cfg.halfWidth;
  let hasPosition = true;
  let lastRebalanceTick = -cfg.minHoldTicks;

  for (let i = 0; i < history.length; i++) {
    const tick = history[i]!;
    const metrics = strategy.computeMetrics(tick.pool, tick.binArray, previousTvl);

    // Pre-filter
    const auth = strategy.checkVolumeAuthenticity(tick.pool);
    if (!strategy.passesPreFilter(tick.pool, auth.score, metrics.binUtilization)) {
      previousTvl = tick.pool.tvlUsd;
      continue;
    }

    const feeIl = metrics.feeIlRatio;

    // Fees accrue if active bin is inside our POSITION range
    const inRange = tick.pool.activeBinId >= currentLowerBinId && tick.pool.activeBinId <= currentUpperBinId;
    const feesThisTick = inRange ? tick.pool.fees24hUsd / (24 * 6) : 0;
    totalFees += feesThisTick;
    portfolioValue += feesThisTick;

    // Calculate drift of ACTIVE bin relative to our POSITION range center
    const positionCenter = (currentLowerBinId + currentUpperBinId) / 2;
    const positionHalfWidth = (currentUpperBinId - currentLowerBinId) / 2;
    const binDrift = Math.abs(tick.pool.activeBinId - positionCenter) / (positionHalfWidth || 1);

    const ticksSinceRebalance = i - lastRebalanceTick;
    const canRebalance = hasPosition && rebalances < cfg.maxRebalances && ticksSinceRebalance >= cfg.minHoldTicks;

    if (canRebalance && binDrift > cfg.driftThreshold) {
      // Simulate rebalance cost
      const ilCost = portfolioValue * 0.001 * binDrift; // IL from being off-center
      const swapCost = portfolioValue * 0.0005; // 0.05% swap + gas
      const totalCost = ilCost + swapCost;

      // Net benefit = fees we expect to earn in the next window minus cost
      // Estimate: if we rebalance now, we'll be in range for ~minHoldTicks before next rebalance
      const expectedFeesAhead = feesThisTick * cfg.minHoldTicks * 0.7; // 0.7 = we might drift again
      const netBenefit = expectedFeesAhead - totalCost;

      if (netBenefit > cfg.minNetBenefitUsd) {
        rebalances++;
        totalIl += ilCost;
        totalIl += swapCost;
        portfolioValue -= totalCost;

        // Rebalance: move position to center around current active bin
        currentLowerBinId = tick.pool.activeBinId - cfg.halfWidth;
        currentUpperBinId = tick.pool.activeBinId + cfg.halfWidth;
        lastRebalanceTick = i;

        // Check if this was a "win" — did fees in the next window exceed cost?
        let feesInNextWindow = 0;
        for (let j = i + 1; j < Math.min(i + cfg.minHoldTicks, history.length); j++) {
          const nextTick = history[j]!;
          const nextInRange = nextTick.pool.activeBinId >= currentLowerBinId && nextTick.pool.activeBinId <= currentUpperBinId;
          if (nextInRange) {
            feesInNextWindow += nextTick.pool.fees24hUsd / (24 * 6);
          }
        }
        if (feesInNextWindow > totalCost) wins++;
      }
    } else if (binDrift > 0.9 && hasPosition) {
      // Hard exit if drift is extreme
      totalIl += portfolioValue * 0.002;
      portfolioValue *= 0.998;
      hasPosition = false;
    }

    previousTvl = tick.pool.tvlUsd;
  }

  const netPnl = portfolioValue - initialValue;
  const winRate = rebalances > 0 ? wins / rebalances : 0;

  // Sharpe from per-tick returns
  const returns = history.map((_, i) => {
    if (i === 0) return 0;
    return (history[i]?.pool.fees24hUsd ?? 0) / (history[i - 1]?.pool.tvlUsd ?? 1);
  });
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  const sharpe = variance > 0 ? mean / Math.sqrt(variance) : 0;

  const result: BacktestResult = {
    poolAddress,
    startDate: history[0]?.pool.timestamp ?? 0,
    endDate: history[history.length - 1]?.pool.timestamp ?? 0,
    initialValueUsd: initialValue,
    finalValueUsd: portfolioValue,
    totalFeesUsd: totalFees,
    totalIlUsd: totalIl,
    netPnlUsd: netPnl,
    totalRebalances: rebalances,
    winRate,
    sharpeRatio: sharpe,
  };

  log.info("Backtest complete", {
    netPnlUsd: netPnl.toFixed(2),
    totalRebalances: rebalances,
    winRate: (winRate * 100).toFixed(1) + "%",
    sharpeRatio: sharpe.toFixed(3),
  });

  return result;
}

// ─── Grid search over parameter combinations ────────────────────────────────

const testPools = [
  "5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6",
];

const configs: BacktestConfig[] = [
  // Conservative: wide range, high drift threshold, long hold
  { halfWidth: 25, driftThreshold: 0.75, minHoldTicks: 144, minNetBenefitUsd: 15, maxRebalances: 20 },
  // Balanced
  { halfWidth: 20, driftThreshold: 0.65, minHoldTicks: 72, minNetBenefitUsd: 10, maxRebalances: 30 },
  // Aggressive: tight range, lower threshold, shorter hold
  { halfWidth: 15, driftThreshold: 0.55, minHoldTicks: 36, minNetBenefitUsd: 5, maxRebalances: 50 },
  // Very wide, very patient
  { halfWidth: 35, driftThreshold: 0.80, minHoldTicks: 288, minNetBenefitUsd: 25, maxRebalances: 10 },
];

for (const pool of testPools) {
  console.log(`\n=== Pool: ${pool} ===\n`);
  const results = await Promise.all(configs.map((cfg) => runBacktest(pool, 30, cfg)));

  const table = results.map((r, i) => ({
    Config: `C${i + 1}`,
    "Net PnL": `$${r.netPnlUsd.toFixed(0)}`,
    Fees: `$${r.totalFeesUsd.toFixed(0)}`,
    IL: `$${r.totalIlUsd.toFixed(0)}`,
    Rebal: r.totalRebalances,
    "Win %": `${(r.winRate * 100).toFixed(0)}%`,
    Sharpe: r.sharpeRatio.toFixed(2),
  }));

  console.table(table);

  // Pick the best config by win rate, then by net PnL
  const best = results.reduce((best, curr) => {
    if (curr.winRate > best.winRate) return curr;
    if (curr.winRate === best.winRate && curr.netPnlUsd > best.netPnlUsd) return curr;
    return best;
  });

  const bestConfig = configs[results.indexOf(best)];
  console.log("\n🏆 Best config:", bestConfig);
  console.log("   Net PnL:", best.netPnlUsd.toFixed(2));
  console.log("   Win Rate:", (best.winRate * 100).toFixed(1) + "%");
  console.log("   Rebalances:", best.totalRebalances);
}
