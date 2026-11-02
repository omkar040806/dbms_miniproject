import { apiHandler, json } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/session";
import { query } from "@/lib/db/pool";
import { readGraph } from "@/lib/graph/driver";
import { drainSyncQueue, rebuildGraph } from "@/lib/graph/sync";

// GET /api/admin/graph: sync queue status and Neo4j node/edge counts.
export const GET = apiHandler(async () => {
  await requireRole("admin");
  const queue = await query<{ pending: number; failed: number; processed: number; last_processed_at: string | null }>(
    `SELECT COUNT(*) FILTER (WHERE processed_at IS NULL AND attempts < 5) AS pending,
            COUNT(*) FILTER (WHERE processed_at IS NULL AND attempts >= 5) AS failed,
            COUNT(*) FILTER (WHERE processed_at IS NOT NULL) AS processed,
            MAX(processed_at) AS last_processed_at
     FROM graph_sync_queue`,
  );

  let graph: Record<string, number> | null = null;
  let graphError: string | null = null;
  try {
    const [row] = await readGraph<Record<string, number>>(
      `CALL () { MATCH (p:Paper) RETURN count(p) AS papers }
       CALL () { MATCH (a:Author) RETURN count(a) AS authors }
       CALL () { MATCH ()-[c:CITES]->() RETURN count(c) AS citations }
       CALL () { MATCH ()-[w:CO_AUTHORED]->() RETURN count(w) AS coauthorships }
       RETURN papers, authors, citations, coauthorships`,
    );
    graph = row ?? null;
  } catch (error) {
    graphError = error instanceof Error ? error.message : String(error);
  }
  return json({ queue: queue.rows[0], graph, graphError });
});

// POST /api/admin/graph?mode=sync|rebuild
export const POST = apiHandler(async (request) => {
  await requireRole("admin");
  const mode = request.nextUrl.searchParams.get("mode") ?? "sync";
  if (mode === "rebuild") return json({ rebuilt: await rebuildGraph() });
  return json({ synced: await drainSyncQueue() });
});
