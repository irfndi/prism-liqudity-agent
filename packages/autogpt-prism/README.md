# autogpt-prism

AutoGPT plugin for [Prism](https://github.com/irfndi/prism-liquidity-agent) — an autonomous liquidity agent for Solana DLMM pools.

## Install

```bash
pip install autogpt-prism
```

Or from source:

```bash
cd packages/autogpt-prism
pip install -e .
```

AutoGPT discovers the plugin automatically via the `autogpt.plugins` entry point.

## Commands

| Command | Arguments | Description |
|---------|-----------|-------------|
| `prism_install` | *(none)* | Runs the Prism one-liner install script |
| `prism_setup` | `helius_key` | Runs `prism setup` with the provided Helius API key |
| `prism_start` | *(none)* | Starts Prism in paper-trading mode (`prism dev`) |
| `prism_status` | *(none)* | Shows current Prism status |
| `prism_stop` | *(none)* | Stops the running Prism agent |

## Usage

Once installed, AutoGPT exposes Prism commands in its command set. Example prompt:

```
Use prism_install to install Prism, then prism_setup with helius key "abc123",
then prism_start to begin paper trading.
```

## Requirements

- Python 3.9+
- AutoGPT installed and configured
- `prism` CLI on PATH (installed by `prism_install` or manually)
- Bun runtime (Prism's underlying engine)

## How it works

Each command is a thin wrapper around `subprocess.run` calling the `prism` CLI.
No Prism internals are imported — everything goes through the CLI boundary.

## License

MIT
