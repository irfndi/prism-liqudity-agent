import { ChromaClient, Collection } from "chromadb";
import { createLogger } from "../logger.js";
import type { MemoryEntry, MemoryCategory } from "../types.js";
import { config } from "../config.js";
import { randomUUID } from "crypto";

const log = createLogger("AgentMemory");

// TTL by category (milliseconds)
const TTL_MS: Record<MemoryCategory, number> = {
  pattern: 90 * 24 * 60 * 60 * 1000, // 90 days
  warning: 60 * 24 * 60 * 60 * 1000, // 60 days
  outcome: 180 * 24 * 60 * 60 * 1000, // 180 days
};

const COLLECTION_NAME = "mantis_memory";
const SIMILARITY_MERGE_THRESHOLD = 0.7;

export class AgentMemory {
  private client: ChromaClient;
  private collection: Collection | null = null;

  constructor() {
    this.client = new ChromaClient({ path: config.CHROMA_URL });
  }

  async initialize(): Promise<void> {
    try {
      this.collection = await this.client.getOrCreateCollection({
        name: COLLECTION_NAME,
        metadata: { description: "Mantis agent memory store" },
      });
      log.info("Memory store initialized", {
        collection: COLLECTION_NAME,
        url: config.CHROMA_URL,
      });
    } catch (err) {
      log.warn("Chroma unavailable — running without memory", { err });
      this.collection = null;
    }
  }

  async upsert(entry: Omit<MemoryEntry, "id" | "createdAt" | "expiresAt">): Promise<void> {
    if (!this.collection) return;

    const now = Date.now();
    const id = randomUUID();
    const expiresAt = now + TTL_MS[entry.category];

    const metadata: Record<string, string | number | boolean> = {
      category: entry.category,
      createdAt: now,
      expiresAt,
      ...(entry.poolAddress ? { poolAddress: entry.poolAddress } : {}),
      ...(entry.outcome ? { outcome: entry.outcome } : {}),
      ...(entry.pnlUsd !== undefined ? { pnlUsd: entry.pnlUsd } : {}),
      ...(entry.confidence !== undefined ? { confidence: entry.confidence } : {}),
    };

    // Check for near-duplicates before inserting
    const similar = await this.collection.query({
      queryTexts: [entry.content],
      nResults: 1,
      where: { category: entry.category },
    });

    const topDistance = similar.distances?.[0]?.[0];
    if (topDistance !== undefined && topDistance < 1 - SIMILARITY_MERGE_THRESHOLD) {
      // Update existing entry's metadata instead of duplicating
      const existingId = similar.ids[0]?.[0];
      if (existingId) {
        await this.collection.update({
          ids: [existingId],
          metadatas: [{ ...metadata, merged: true }],
        });
        log.debug("Merged similar memory entry", { existingId, distance: topDistance });
        return;
      }
    }

    await this.collection.add({
      ids: [id],
      documents: [entry.content],
      metadatas: [metadata],
    });

    log.debug("Memory upserted", { id, category: entry.category });
  }

  async getRelevantContext(query: string, topK = 5): Promise<MemoryEntry[]> {
    if (!this.collection) return [];

    const now = Date.now();
    const results = await this.collection.query({
      queryTexts: [query],
      nResults: topK * 2, // over-fetch then filter expired
    });

    const entries: MemoryEntry[] = [];
    const ids = results.ids[0] ?? [];
    const docs = results.documents[0] ?? [];
    const metas = results.metadatas[0] ?? [];

    for (let i = 0; i < ids.length; i++) {
      const meta = metas[i] as Record<string, unknown>;
      const expiresAt = Number(meta["expiresAt"] ?? 0);
      if (expiresAt < now) continue; // skip expired

      entries.push({
        id: String(ids[i]),
        category: String(meta["category"] ?? "outcome") as MemoryCategory,
        content: String(docs[i] ?? ""),
        poolAddress: meta["poolAddress"] ? String(meta["poolAddress"]) : undefined,
        outcome: meta["outcome"] as MemoryEntry["outcome"],
        pnlUsd: meta["pnlUsd"] !== undefined ? Number(meta["pnlUsd"]) : undefined,
        confidence: meta["confidence"] !== undefined ? Number(meta["confidence"]) : undefined,
        createdAt: Number(meta["createdAt"] ?? 0),
        expiresAt,
      });

      if (entries.length === topK) break;
    }

    return entries;
  }

  async pruneExpired(): Promise<number> {
    if (!this.collection) return 0;

    const now = Date.now();
    const all = await this.collection.get();
    const expiredIds: string[] = [];

    for (let i = 0; i < all.ids.length; i++) {
      const meta = all.metadatas[i] as Record<string, unknown>;
      const expiresAt = Number(meta["expiresAt"] ?? 0);
      if (expiresAt < now) {
        expiredIds.push(all.ids[i] as string);
      }
    }

    if (expiredIds.length > 0) {
      await this.collection.delete({ ids: expiredIds });
      log.info("Pruned expired memories", { count: expiredIds.length });
    }

    return expiredIds.length;
  }

  async recordOutcome(
    poolAddress: string,
    action: string,
    pnlUsd: number,
    context: string
  ): Promise<void> {
    const outcome = pnlUsd > 0 ? "profit" : pnlUsd < 0 ? "loss" : "neutral";
    const content = `${action} on ${poolAddress}: PnL=$${pnlUsd.toFixed(2)}. Context: ${context}`;

    await this.upsert({
      category: "outcome",
      content,
      poolAddress,
      outcome,
      pnlUsd,
    });
  }
}
