/**
 * Apply pending jobs from graph_sync_queue to Neo4j.
 *   npm run graph:sync
 * The app also does this automatically after an admin approves a paper.
 */
import "./lib/env";
import { getPool, query } from "@/lib/db/pool";
import { closeDriver } from "@/lib/graph/driver";
import { drainSyncQueue } from "@/lib/graph/sync";

async function main() {
  let total = 0;
  for (;;) {
    const { processed, failed } = await drainSyncQueue(500);
    total += processed;
    if (failed > 0) console.warn(`${failed} job(s) failed; see graph_sync_queue.last_error`);
    if (processed === 0) break;
  }
  const pending = await query<{ n: number }>("SELECT COUNT(*) AS n FROM graph_sync_queue WHERE processed_at IS NULL");
  console.log(`Applied ${total} job(s). Still pending: ${pending.rows[0].n}`);
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
