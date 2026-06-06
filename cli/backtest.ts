import { Command } from "commander";
import { spawn } from "child_process";

export const backtestCommand = new Command("backtest")
  .description("Run historical simulation")
  .option("-d, --days <number>", "Simulation duration in days", "7")
  .option("-p, --pools <addresses>", "Comma-separated pool addresses")
  .option("-s, --source <type>", 'Data source: "synthetic" or "replay"', "synthetic")
  .option("--db <path>", "SQLite database path for replay source", "./prism.db")
  .action((options) => {
    console.log("Starting backtest...");

    const args = ["run", "backtest"];
    if (options.days) args.push("--days", String(options.days));
    if (options.pools) args.push("--pools", options.pools);
    if (options.source) args.push("--source", options.source);
    if (options.db) args.push("--db", options.db);

    const child = spawn("bun", args, {
      stdio: "inherit",
      shell: false,
    });

    child.on("exit", (code) => {
      process.exit(code ?? 0);
    });
  });
