/**
 * Compute embeddings for approved papers that have none or an outdated one.
 *   npm run embed            only missing/stale embeddings
 *   npm run embed -- --force re-embed everything (e.g. after changing EMBEDDING_MODEL)
 * The first run downloads the model into .cache/transformers (about 23 MB).
 */
import "./lib/env";
import { getPool } from "@/lib/db/pool";
import { embedInBatches, findStaleEmbeddings } from "@/lib/db/queries/embeddings";
import { EMBEDDING_MODEL } from "@/lib/embeddings/model";

async function main() {
  const force = process.argv.includes("--force");
  const items = await findStaleEmbeddings(force);
  if (items.length === 0) {
    console.log("All approved papers already have up-to-date embeddings.");
    return;
  }
  console.log(`Embedding ${items.length} paper(s) with ${EMBEDDING_MODEL} ...`);
  const started = Date.now();
  await embedInBatches(items, 32, (done, total) => process.stdout.write(`\r  ${done}/${total}`));
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
