import { Command } from "commander";
import { spawn } from "child_process";
import { pingInstall, readCredentials } from "./api.js";

export const devCommand = new Command("dev")
  .description("Start the trading agent")
  .action(() => {
    pingInstall("dev_start");
    const creds = readCredentials();
    if (!creds) {
      console.log("💡 Tip: Run 'prism register' to enable cloud features (Telegram bot, cross-device sync).");
      console.log("   The trading agent works without registration — this is optional.");
      console.log("");
    }
    console.log("Starting Prism trading agent...");
    const child = spawn("bun", ["run", "dev"], {
      stdio: "inherit",
      shell: false,
    });

    child.on("exit", (code) => {
      process.exit(code ?? 0);
    });
  });
