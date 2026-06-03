// Replacer that stringifies BigInt values. Use with JSON.stringify whenever
// the value graph may contain bigints (e.g. DLMM SDK PoolMetrics, BinArray).
// Standard JSON.stringify throws on bigint; this is the standard workaround.
export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function stringifySafe(value: unknown, space?: string | number): string {
  return JSON.stringify(value, bigintReplacer, space);
}

// JSON.parse cannot reconstruct bigints; this reviver converts decimal strings
// back to BigInt for the fields we know are bigint in our domain types.
const BIGINT_FIELDS = new Set(["reserveX", "reserveY", "liquiditySupply", "liquidityShares"]);

export function bigintReviver(key: string, value: unknown): unknown {
  if (typeof value === "string" && BIGINT_FIELDS.has(key)) {
    try {
      return BigInt(value);
    } catch {
      return value;
    }
  }
  return value;
}

export function parseBigIntSafe<T = unknown>(text: string): T {
  return JSON.parse(text, bigintReviver) as T;
}
