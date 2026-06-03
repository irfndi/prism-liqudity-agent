import { Command } from "commander";
import { prismApiGet, readCredentials } from "./api.js";

interface WhoamiResult {
  id: string;
  tier: string;
  telegram_id: string | null;
  created_at: string;
}

export const whoamiCommand = new Command("whoami")
  .description("Show current user info")
  .action(async () => {
    const creds = readCredentials();
    if (!creds) {
      console.error("Error: Not registered. Run 'prism register' first.");
      process.exit(1);
    }

    const result = await prismApiGet<WhoamiResult>("/v1/whoami", {
      apiKey: creds.apiKey,
    });

    if (!result.ok || !result.data) {
      console.error("Error: Failed to fetch user info");
      if (result.error) console.error(`  ${result.error}`);
      console.error("Your stored credentials may be invalid. Run 'prism login <key>' to refresh.");
      process.exit(1);
    }

    const { id, tier, telegram_id: telegramId, created_at: createdAt } = result.data;

    console.log("User ID:", id);
    console.log("Tier:", tier);
    console.log("Telegram:", telegramId ? `linked (${telegramId})` : "not linked");
    console.log("Created:", createdAt);
    console.log("API Key:", `${creds.apiKey.slice(0, 12)}...`);
  });
