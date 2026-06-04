# Prism Liquidity Agent

Install and run Prism for automated Meteora DLMM rebalancing on Solana.

## When This Skill Activates

- User wants to install a Solana liquidity trading agent
- User wants to automate Meteora DLMM pool rebalancing
- User wants to earn fees from concentrated-liquidity pools on Solana
- User mentions `prism`, `prism-liquidity-agent`, or `@irfndi/prism-liquidity-agent`

## Installation

The one-liner installer handles Bun (installs if missing), clones the repo, installs dependencies, runs postinstall, and writes a `prism` wrapper to `~/.local/bin/`.

```bash
curl -fsSL https://raw.githubusercontent.com/irfndi/prism-liquidity-agent/main/scripts/install.sh | bash
export PATH="$HOME/.local/bin:$PATH"
```

For a pinned release tarball:

```bash
curl -fsSL https://raw.githubusercontent.com/irfndi/prism-liquidity-agent/main/scripts/install.sh | PRISM_TARBALL_URL=https://github.com/irfndi/prism-liquidity-agent/releases/latest/download/prism-latest.tar.gz bash
export PATH="$HOME/.local/bin:$PATH"
```

## Configuration

```bash
prism setup --non-interactive --helius-key=$HELIUS_KEY
```

This writes `.env` with the Helius key, an optional watchlist, and paper-trading defaults. The default mode is **paper trading** — no real funds are at risk.

## Start Trading

```bash
prism dev
```

Decisions are logged to `logs/audit-trail.jsonl`. To stop, send SIGINT (Ctrl+C).

## Available Commands

- `prism whoami` — Show current account
- `prism backtest` — Run backtest
- `prism update` — Check for updates
- `prism issue "<msg>"` — File a GitHub issue
- `prism register` — Create a cloud account (optional)
- `prism wallet {generate,import,show}` — Manage the local Solana keypair
- `prism link-telegram` — Link to `@prism_agent_bot`

## Three Layers (CLI is the only required one)

The CLI is fully functional without the cloud API. Do not assume `prism register` is required — it isn't.

| Layer | Purpose | Required? |
|---|---|---|
| CLI (local) | Runs the trading engine | **Yes** |
| API (cloud) | Cloud account, whoami, subscription | No |
| Telegram (chat) | Monitor from `@prism_agent_bot` | No |

## Common Mistakes

1. Running `bun run dev` instead of `prism dev` — `prism dev` respects the install root.
2. Manually editing `.env` — use `prism setup`.
3. Assuming `prism register` is required — it isn't.
4. Setting `PAPER_TRADING=false` without a wallet — use `prism wallet generate` first.
5. Forgetting to export `PATH` after install.

## Troubleshooting

- `prism: command not found` → `export PATH="$HOME/.local/bin:$PATH"`
- `Bun not found` → installer auto-installs; check `$HOME/.bun/bin`
- `sqlite-vec` fails on Linux → engine falls back to system `libsqlite3.so` automatically
- `BigInt` serialization error → set `EMBEDDINGS_BACKEND=fallback` in `.env` (default)
- Helius 401/403 → re-run `prism setup` with a valid key
- Engine starts but makes no decisions → set `ENABLE_POOL_DISCOVERY=true` in `.env`

## Verify Installation

```bash
prism --version       # should print 0.0.2 or later
prism dev &           # start engine in background
sleep 30
tail -n 20 logs/audit-trail.jsonl
```

## Uninstall

```bash
rm -rf ~/.prism ~/.local/bin/prism ~/.config/prism/agent-id ~/.config/prism/install-id
```
