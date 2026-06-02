import { Command } from "commander";
import { execSync } from "child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { pipeline } from "stream/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createHash } from "crypto";
import { getCurrentVersion } from "../engine/version.js";
import {
  compareVersions,
  isValidVersion,
  fetchLatestRelease,
  R2_PUBLIC_URL,
} from "../engine/update-utils.js";
import { Effect } from "effect";
import { createLogger } from "../engine/logger.js";

const logger = createLogger("update");

export const updateCommand = new Command("update")
  .description("Check for and apply updates")
  .option("--check-only", "Only check for updates, don't apply")
  .option("--channel <channel>", "Release channel (stable, beta, dev)", "stable")
  .option("--r2-url <url>", "R2 public URL for release tarballs", R2_PUBLIC_URL)
  .action(async (options) => {
    const current = getCurrentVersion();
    console.log(`Current version: ${current}`);

    try {
      const repo = "irfndi/prism-liquidity-agent";
      const channel = options.channel as "stable" | "beta" | "dev";
      const r2Url = options.r2Url as string;

      const release = await Effect.runPromise(
        fetchLatestRelease(repo, channel, r2Url),
      );

      if (!release) {
        console.log("✓ Already up to date");
        return;
      }

      const latest = release.version;

      if (!isValidVersion(latest)) {
        logger.error("Invalid version format", { version: latest });
        console.error("Error: Invalid version format");
        process.exit(1);
      }

      if (compareVersions(latest, current) <= 0) {
        console.log("✓ Already up to date");
        return;
      }

      console.log(`Update available: ${current} → ${latest}`);
      console.log(`Source: ${release.source === "r2" ? "Cloudflare R2" : "GitHub Releases"}`);
      if (release.tarballUrl) {
        console.log(`Download: ${release.tarballUrl}`);
      }

      if (options.checkOnly) {
        return;
      }

      if (!release.tarballUrl) {
        console.error(`Error: No tarball URL available for version ${latest}`);
        process.exit(1);
      }

      const workDir = join(tmpdir(), `prism-update-${Date.now()}`);
      mkdirSync(workDir, { recursive: true });
      const tarballName = `prism-v${latest}.tar.gz`;
      const tarballPath = join(workDir, tarballName);

      try {
        console.log(`Downloading from ${release.source === "r2" ? "R2" : "GitHub"}...`);
        const downloadResponse = await fetch(release.tarballUrl);
        if (!downloadResponse.ok) {
          console.error(
            `Error: Download failed: ${downloadResponse.status} ${downloadResponse.statusText}`,
          );
          process.exit(1);
        }
        if (!downloadResponse.body) {
          console.error("Error: Download response has no body");
          process.exit(1);
        }
        await pipeline(downloadResponse.body, createWriteStream(tarballPath));
        console.log(`✓ Downloaded to ${tarballPath}`);

        if (release.sha256Url) {
          console.log("Verifying SHA-256 checksum...");
          const expectedHashResponse = await fetch(release.sha256Url);
          const expectedHash = (await expectedHashResponse.text())
            .trim()
            .split(/\s+/)[0] ?? "";
          const fileBuffer = readFileSync(tarballPath);
          const actualHash = createHash("sha256")
            .update(fileBuffer)
            .digest("hex");
          if (actualHash !== expectedHash) {
            console.error(
              `Error: SHA-256 mismatch: expected ${expectedHash}, got ${actualHash}`,
            );
            process.exit(1);
          }
          console.log("✓ SHA-256 checksum verified");
        }

        console.log("Extracting tarball...");
        execSync(`tar -xzf "${tarballPath}" -C "${workDir}"`, { stdio: "inherit" });

        const extractedDir = join(workDir, "prism-liquidity-agent");
        if (!existsSync(extractedDir)) {
          console.error("Error: Extracted tarball missing expected directory");
          process.exit(1);
        }

        console.log("Installing dependencies...");
        execSync("bun install", { cwd: extractedDir, stdio: "inherit" });

        console.log("Copying files to current directory...");
        execSync("cp -r ./* .[!.]* ../../", {
          cwd: extractedDir,
          stdio: "inherit",
        });

        logger.info(`Updated to ${latest} from ${release.source}`);
        console.log(`✓ Updated to ${latest}`);
      } finally {
        if (existsSync(workDir)) {
          rmSync(workDir, { recursive: true, force: true });
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        logger.error("Update failed", { error: err.message });
        console.error("Error:", err.message);
      } else {
        logger.error("Update failed", { error: String(err) });
        console.error("Error checking for updates:", err);
      }
      process.exit(1);
    }
  });
