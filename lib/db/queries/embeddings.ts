import { query } from "@/lib/db/pool";
import { EMBEDDING_MODEL, embedText, embedTexts, toPgVector } from "@/lib/embeddings/model";
import { buildEmbeddingText, textHash } from "@/lib/embeddings/text";

interface EmbeddingSource {
  paper_id: number;
  title: string;
  abstract: string | null;
  keywords: string[];
  source_text_hash: string | null;
  model_name: string | null;
}

/** Approved papers whose embedding is missing, out of date, or from another model. */
export async function findStaleEmbeddings(force = false): Promise<{ paperId: number; text: string; hash: string }[]> {
  const { rows } = await query<EmbeddingSource>(
    `SELECT vp.paper_id, vp.title, vp.abstract, vp.keywords, e.source_text_hash, e.model_name
     FROM v_paper_details vp
     LEFT JOIN paper_embeddings e ON e.paper_id = vp.paper_id
     WHERE vp.status = 'approved'
     ORDER BY vp.paper_id`,
  );
  return rows
    .map((row) => {
      const text = buildEmbeddingText(row);
      return { paperId: row.paper_id, text, hash: textHash(text), row };
    })
    .filter(({ hash, row }) => force || row.source_text_hash !== hash || row.model_name !== EMBEDDING_MODEL)
    .map(({ paperId, text, hash }) => ({ paperId, text, hash }));
}

export async function saveEmbedding(paperId: number, vector: number[], hash: string): Promise<void> {
  // UPSERT: insert the first embedding, or replace an outdated one.
  await query(
    `INSERT INTO paper_embeddings (paper_id, model_name, embedding, source_text_hash)
     VALUES ($1, $2, $3::vector, $4)
     ON CONFLICT (paper_id) DO UPDATE
       SET model_name = EXCLUDED.model_name,
           embedding = EXCLUDED.embedding,
           source_text_hash = EXCLUDED.source_text_hash,
           embedded_at = now()`,
    [paperId, EMBEDDING_MODEL, toPgVector(vector), hash],
  );
}

/** Embed one paper right away (used when an admin approves it). */
export async function embedPaper(paperId: number): Promise<void> {
  const { rows } = await query<EmbeddingSource>(
    "SELECT paper_id, title, abstract, keywords, NULL AS source_text_hash, NULL AS model_name FROM v_paper_details WHERE paper_id = $1",
    [paperId],
  );
  if (!rows[0]) return;
  const text = buildEmbeddingText(rows[0]);
  const vector = await embedText(text);
  await saveEmbedding(paperId, vector, textHash(text));
}

/** Embed papers in batches; returns how many were written. */
export async function embedInBatches(
  items: { paperId: number; text: string; hash: string }[],
  batchSize = 32,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  let done = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const vectors = await embedTexts(batch.map((item) => item.text));
    for (let j = 0; j < batch.length; j += 1) {
      await saveEmbedding(batch[j].paperId, vectors[j], batch[j].hash);
    }
    done += batch.length;
    onProgress?.(done, items.length);
  }
  return done;
}
