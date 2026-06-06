# Agent Marketplace Skills

This directory contains Prism installation skills for various agent harness marketplaces. Issue #33 tracked the full plan; this file documents the current status.

## Status by Marketplace

| # | Marketplace | Status | Skill file | Local install path |
|---|---|---|---|---|
| 1 | **OpenCode** | ✅ Ready | [`opencode/SKILL.md`](opencode/SKILL.md) | `~/.config/opencode/skills/prism-install/SKILL.md` |
| 1b | **OpenClaw** | ✅ Ready | [`openclaw/SKILL.md`](openclaw/SKILL.md) | `~/.openclaw/skills/prism-install/SKILL.md` |
| 1c | **Hermes** | ✅ Ready | [`hermes/SKILL.md`](hermes/SKILL.md) | `~/.hermes/skills/software-development/prism-install/SKILL.md` |
| 1d | **acpx / custom** | ✅ Ready | [`.agents/skills/prism-install.md`](../.agents/skills/prism-install.md) | `~/.agents/skills/prism-install.md` |
| 2 | Claude Desktop (MCP) | ✅ Ready | [`mcp-server/`](../mcp-server/) | `npm install -g @irfndi/prism-mcp` |
| 3 | OpenAI GPTs | ❌ Deferred | — | UI-only GPT Store submission |
| 4 | AutoGPT | ✅ Ready | [`packages/autogpt-prism/`](../packages/autogpt-prism/) | `pip install autogpt-prism` |
| 5 | LangChain | ✅ Ready | [`packages/langchain-prism/`](../packages/langchain-prism/) | `pip install langchain-prism` |
| 6 | CrewAI | ❌ Not started | — | Requires `crewai-prism` PyPI package |
| 7 | Dify | ❌ Not started | — | Requires Dify marketplace submission |
| 8 | Flowise | ❌ Not started | — | Requires Flowise custom-node npm package |
| 9 | ChatGPT Plugins (legacy) | ❌ Not started | — | Deprecated; OpenAI GPTs is the successor |
| 10 | Custom agent harnesses | ✅ Ready | Same as 1d (acpx) | See [docs/agent-harness.md](../docs/agent-harness.md) |

## What's Done (7/10)

The four Markdown-based harnesses, the MCP server, and two Python packages are ready:

- **OpenCode** — YAML frontmatter skill file
- **OpenClaw** — Plain Markdown skill file
- **Hermes** — Rich YAML frontmatter with metadata
- **acpx / custom** — Project's own skill format
- **Claude Desktop (MCP)** — npm package with 4 tools (`@irfndi/prism-mcp`)
- **LangChain** — PyPI package with `PrismTool` (`pip install langchain-prism`)
- **AutoGPT** — PyPI plugin with 5 commands (`pip install autogpt-prism`)

## What's Not Done (3/10)

The remaining harnesses are deferred:

- **OpenAI GPTs** — UI-only GPT Store submission; can't be automated from this repo
- **CrewAI** — Can follow the LangChain/AutoGPT pattern in a future update
- **Dify** — Requires `.difypkg` format + marketplace submission
- **Flowise** — Requires custom-node npm package
- **ChatGPT Plugins** — Deprecated; OpenAI GPTs is the successor

The 7 ready harnesses exceed the acceptance criterion of "at least 5 marketplaces."

## How to Use

### Install via the ready skill files

For each ready marketplace, copy the SKILL.md to the local path shown in the table above:

```bash
# OpenCode
mkdir -p ~/.config/opencode/skills/prism-install
cp marketplaces/opencode/SKILL.md ~/.config/opencode/skills/prism-install/SKILL.md

# OpenClaw
mkdir -p ~/.openclaw/skills/prism-install
cp marketplaces/openclaw/SKILL.md ~/.openclaw/skills/prism-install/SKILL.md

# Hermes (under software-development category)
mkdir -p ~/.hermes/skills/software-development/prism-install
cp marketplaces/hermes/SKILL.md ~/.hermes/skills/software-development/prism-install/SKILL.md

# acpx / custom
mkdir -p ~/.agents/skills
cp .agents/skills/prism-install.md ~/.agents/skills/prism-install.md
```

After copying, restart your agent harness so it picks up the new skill.

### Verify the skill was discovered

The exact command depends on the harness:

- **OpenCode**: `skill()` then ask for `prism-install`
- **OpenClaw**: restart the harness; skills in `~/.openclaw/skills/` are loaded automatically
- **Hermes**: restart the harness; skills in `~/.hermes/skills/` are loaded automatically
- **acpx**: the skill is in the standard `.agents/skills/` location; acpx discovers it on next run

## Adding a New Marketplace

If you want to add a marketplace that isn't listed:

1. Create a new subdirectory under `marketplaces/<harness-name>/`
2. Write a `SKILL.md` matching that harness's discovery format
3. Add a row to the status table above with the local install path
4. Open a PR

The content can be adapted from the existing four skill files — the install/configure/start/troubleshooting sections are universal.

## See Also

- [Issue #33](https://github.com/irfndi/prism-liquidity-agent/issues/33) — original phased plan
- [`docs/agent-harness.md`](../docs/agent-harness.md) — full agent integration guide
- [`.agents/skills/`](../.agents/skills/) — the project's own skill directory (acpx format)
- [`dlmm-rebalancer`](../.agents/skills/dlmm-rebalancer.md) — strategy-level reasoning skill
