import { Command } from "commander";
import { prismApiPost, writeCredentials, readCredentials } from "./api.js";

interface LoginResult {
  id: string;
  tier: string;
  telegram_id: string | null;
}

export const loginCommand = new Command("login")
  .description("Validate an existing API key and store it locally")
  .argument("<key>", "API key to validate")
  .action(async (key: string) => {
    const result = await prismApiPost<LoginResult>("/v1/login", {}, { apiKey: key });

    if (!result.ok || !result.data) {
      console.error("Error: Invalid API key");
      if (result.error) console.error(`  ${result.error}`);
      process.exit(1);
    }

    const { id: userId } = result.data;
    const existing = readCredentials();
    writeCredentials({
      apiKey: key,
      userId,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });

    console.log("✓ Login successful");
    console.log(`  User ID: ${userId}`);
    console.log(`  Key: ${key.slice(0, 12)}...`);
  });
