import { Command } from "commander";
import { prismApiPost, readCredentials } from "./api.js";

interface LinkStartResult {
  code: string;
  expiresAt: string;
}

export const telegramCommand = new Command("link-telegram")
  .description("Generate a one-time code to link your Telegram account")
  .action(async () => {
    const creds = readCredentials();
    if (!creds) {
      console.error("Error: Not registered. Run 'prism register' first.");
      process.exit(1);
    }

    const result = await prismApiPost<LinkStartResult>(
      "/v1/link-telegram/start",
      {},
      { apiKey: creds.apiKey },
    );

    if (!result.ok || !result.data) {
      console.error("Error: Failed to generate link code");
      if (result.error) console.error(`  ${result.error}`);
      process.exit(1);
    }

    const { code, expiresAt } = result.data;
    const expiresInMin = Math.max(
      0,
      Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000),
    );
    console.log("Link code:", code);
    console.log(`(expires in ${expiresInMin} minutes)`);
    console.log("Send this code to @prism_agent_bot on Telegram");
  });
