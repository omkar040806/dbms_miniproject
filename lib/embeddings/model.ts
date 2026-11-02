// Text embeddings computed locally with Transformers.js (ONNX runtime, CPU).
// No API key and no cost: the quantized model (about 23 MB) downloads once into .cache/.
import path from "node:path";

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMENSIONS = 384;

type Extractor = (
  texts: string | string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

// Load the model once per process and share it between requests.
const globalForModel = globalThis as unknown as { rpExtractor?: Promise<Extractor> };

function getExtractor(): Promise<Extractor> {
  if (!globalForModel.rpExtractor) {
    globalForModel.rpExtractor = (async () => {
      // Dynamic import: the heavy library is only loaded when an embedding is needed.
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = path.resolve(".cache/transformers");
      // q8 = 8-bit quantized weights (onnx/model_quantized.onnx): 4x smaller, nearly the same quality.
      const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" });
      return extractor as unknown as Extractor;
    })().catch((error: unknown) => {
      globalForModel.rpExtractor = undefined; // allow a retry after a failed download
      throw error;
    });
  }
  return globalForModel.rpExtractor;
}

/**
 * Embed several texts at once. Mean pooling + L2 normalization gives unit-length
 * vectors, so cosine distance in pgvector equals 1 - dot product.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  const vectors = output.tolist();
  for (const vector of vectors) {
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Model returned ${vector.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`);
    }
  }
  return vectors;
}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}

/** pgvector accepts the text form '[0.1,0.2,...]', passed as a normal query parameter. */
export function toPgVector(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
