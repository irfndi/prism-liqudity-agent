import { readFileSync } from "fs";
import { join } from "path";

let cachedVersion: string | null = null;

export function getCurrentVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
    cachedVersion = pkg.version as string;
    return cachedVersion;
  } catch {
    return "0.0.0";
  }
}
