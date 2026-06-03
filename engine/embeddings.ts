// Fallback is default: @xenova/transformers crashes in Node when
// serializing BigInt. Set EMBEDDINGS_BACKEND=onnx to opt back into ONNX.
import { createLogger } from "./logger.js";

const logger = createLogger("embeddings");
const VECTOR_DIM = 384;

let onnxPromise: Promise<(text: string) => Promise<number[]>> | null = null;

async function loadOnnx(): Promise<(text: string) => Promise<number[]>> {
  if (!onnxPromise) {
    onnxPromise = (async () => {
      const mod = await import("@xenova/transformers");
      const extractor = await mod.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
      return async (text: string) => {
        const output = await extractor(text, {
          pooling: "mean",
          normalize: true,
        });
        return Array.from(output.data as Float32Array);
      };
    })();
    onnxPromise.catch(() => {
      onnxPromise = null;
    });
  }
  return onnxPromise;
}

function fallbackEmbedding(text: string): number[] {
  const vec = Array.from<number>({ length: VECTOR_DIM }).fill(0);
  // FNV-1a over 8-byte windows: no per-window allocation, runs on the
  // hot path. Not semantically meaningful — just stable and fast.
  const bytes = Buffer.from(text, "utf-8");
  const window = 8;
  for (let i = 0; i < bytes.length; i++) {
    const end = Math.min(i + window, bytes.length);
    let hash = 0x811c9dc5;
    for (let j = i; j < end; j++) {
      hash ^= bytes[j] ?? 0;
      hash = Math.imul(hash, 0x01000193);
    }
    const slot = (hash >>> 0) % VECTOR_DIM;
    vec[slot] = (vec[slot] ?? 0) + 1;
  }
  // L2-normalize so callers that expect a unit vector keep working.
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] = (vec[i] ?? 0) / norm;
  return vec;
}

export async function getEmbedding(text: string): Promise<number[]> {
  if (process.env.EMBEDDINGS_BACKEND !== "onnx") {
    return fallbackEmbedding(text);
  }
  try {
    const embed = await loadOnnx();
    return await embed(text);
  } catch (err) {
    logger.warn(
      "ONNX embedding model unavailable; falling back to deterministic hash vectors. Memory similarity will be reduced.",
      { error: err instanceof Error ? err.message : String(err) },
    );
    return fallbackEmbedding(text);
  }
}

export const EMBEDDING_DIM = VECTOR_DIM;
