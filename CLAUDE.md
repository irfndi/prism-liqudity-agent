# CLAUDE.md

This file tells Claude Code how to work with this repository.

## What this project does

`prism` is an autonomous liquidity rebalancing agent. It scans Meteora DLMM pools every 10 minutes, reasons over live on-chain data using Claude, and decides: HOLD, REBALANCE, EXIT, or ENTER. All decisions go through a risk gate before execution.

## Project layout

```
engine/          ← core agent logic
  index.ts       ← entry point + scan loop
  config.ts      ← Zod-validated env
  types.ts       ← shared interfaces
  logger.ts      ← structured logger
  memory/        ← Chroma vector store
  adapters/      ← Meteora SDK + Helius calls
  probes/        ← DLMM analysis (fee/IL, volume auth, bin util)
  risk/          ← decision gate
  tools/         ← MCP tool definitions + executor
ops/             ← setup wizard + backtest runner
bench/           ← vitest unit tests
.agents/skills/  ← decision heuristics for the agent
```

## Dev commands

```bash
bun run dev          # run with hot reload
bun run backtest     # historical simulation
bun run test         # vitest
bun run lint         # TypeScript type check
```

## Key constraints

- Never use `console.log` — use `createLogger(component)` from `engine/logger.ts`
- Paper trading is the default — `PAPER_TRADING=true` in `.env`
- The `meteora_decision` MCP tool is intercepted in `engine/index.ts` — it never reaches `executeTool()`
- No `any` types — use `unknown` and narrow

## Adding a pool to watch

Add its address to `WATCHLIST_POOLS` in `.env` (comma-separated).

