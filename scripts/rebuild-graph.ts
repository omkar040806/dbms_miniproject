/**
 * Rebuild the whole Neo4j graph from PostgreSQL.
 *   npm run graph:rebuild
 * Safe to run any time: PostgreSQL is the source of truth.
 */
import "./lib/env";
import { getPool } from "@/lib/db/pool";
import { closeDriver } from "@/lib/graph/driver";
import { rebuildGraph } from "@/lib/graph/sync";

async function main() {
  const started = Date.now();
  const counts = await rebuildGraph((message) => console.log(message));
  console.log(`Graph rebuilt in ${((Date.now() - started) / 1000).toFixed(1)} s`, counts);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDriver();
    await getPool().end();
  });
