import { Command } from "commander";
import { execSync, spawnSync } from "child_process";
import { getCurrentVersion } from "../engine/version.js";

export const updateCommand = new Command("update")
  .description("Check for and apply updates")
  .option("--check-only", "Only check for updates, don't apply")
  .action(async (options) => {
    const current = getCurrentVersion();
    console.log(`Current version: ${current}`);

    try {
      const repo = "irfndi/prism-liquidity-agent";
      const url = `https://api.github.com/repos/${repo}/releases/latest`;
      const response = await fetch(url, {
        headers: { "User-Agent": "prism-liquidity-agent" },
      });

      if (!response.ok) {
        console.error(`Failed to check for updates: ${response.status}`);
        process.exit(1);
      }

      const release = await response.json() as {
        tag_name: string;
        html_url: string;
        body: string;
      };

      const latest = release.tag_name;

      // Validate version string to prevent command injection
      const validVersion = /^v?[\d.]+$/.test(latest);
      if (!validVersion) {
        console.error("Error: Invalid version format from GitHub API");
        process.exit(1);
      }

      // Simple semver compare
      const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
      const currentParts = parse(current);
      const latestParts = parse(latest);

      let isNewer = false;
      for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const c = currentParts[i] || 0;
        const l = latestParts[i] || 0;
        if (l > c) { isNewer = true; break; }
        if (l < c) break;
      }

      if (!isNewer) {
        console.log("✓ Already up to date");
        return;
      }

      console.log(`Update available: ${current} → ${latest}`);
      console.log(`Release notes: ${release.html_url}`);

      if (options.checkOnly) {
        return;
      }

      // Check for local modifications
      try {
        const status = execSync("git status --porcelain", { encoding: "utf-8" });
        if (status.trim()) {
          console.error("Error: Local modifications detected. Commit or stash before updating.");
          process.exit(1);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("git")) {
          console.warn("Warning: git not available, skipping local modification check");
        }
        // Otherwise git is available but returned empty status, which is fine
      }

      console.log("Applying update...");
      execSync("git fetch origin", { stdio: "inherit" });
      // Use spawnSync with array args to avoid shell interpolation
      const checkoutResult = spawnSync("git", ["checkout", latest], { stdio: "inherit" });
      if (checkoutResult.status !== 0) {
        console.error("Error: git checkout failed");
        process.exit(1);
      }
      execSync("bun install", { stdio: "inherit" });

      console.log(`✓ Updated to ${latest}`);
    } catch (err) {
      console.error("Error checking for updates:", err);
      process.exit(1);
    }
  });
