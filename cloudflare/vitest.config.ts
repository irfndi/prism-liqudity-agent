import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.telegram.test.toml" },
    }),
  ],
  test: {
    pool: "@cloudflare/vitest-pool-workers",
  },
});
