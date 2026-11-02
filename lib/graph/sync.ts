// Keeps Neo4j in step with PostgreSQL (the source of truth).
//
// Incremental: triggers write jobs into graph_sync_queue (outbox); drainSyncQueue()
// applies them. Full: rebuildGraph() wipes Neo4j and reloads every approved paper.
import type { ManagedTransaction } from "neo4j-driver";
import { query, withTransaction } from "@/lib/db/pool";
import { getDriver, int, isGraphUnavailable, writeGraph } from "./driver";
import { ensureGraphSchema } from "./schema";

interface SyncJob {
  job_id: number;
  entity: "paper" | "citation" | "authorship";
  op: "upsert" | "delete";
  payload: { paper_id?: number; citing?: number; cited?: number };
}

/** Recompute CO_AUTHORED edges for the given authors from their WROTE edges. */
async function recomputeCoauthors(tx: ManagedTransaction, authorIds: number[]): Promise<void> {
  if (authorIds.length === 0) return;
  const ids = authorIds.map(int);
  await tx.run(
    `UNWIND $ids AS aid
     MATCH (:Author {author_id: aid})-[old:CO_AUTHORED]-()
     WITH DISTINCT old
     DELETE old`,
    { ids },
  );
  await tx.run(
    `UNWIND $ids AS aid
     MATCH (a:Author {author_id: aid})-[:WROTE]->(p:Paper)<-[:WROTE]-(b:Author)
     WITH a, b, count(DISTINCT p) AS shared
     MERGE (a)-[r:CO_AUTHORED]-(b)
     SET r.papers = shared`,
    { ids },
  );
  // Authors left without any paper are removed from the graph.
  await tx.run(
    `UNWIND $ids AS aid
     MATCH (a:Author {author_id: aid})
     WHERE NOT EXISTS { (a)-[:WROTE]->(:Paper) }
     DETACH DELETE a`,
    { ids },
  );
}

async function authorsOfPaperInGraph(tx: ManagedTransaction, paperId: number): Promise<number[]> {
  const result = await tx.run("MATCH (a:Author)-[:WROTE]->(:Paper {paper_id: $id}) RETURN collect(a.author_id) AS ids", {
    id: int(paperId),
  });
  return (result.records[0]?.get("ids") as number[]) ?? [];
}

async function removePaper(paperId: number): Promise<void> {
  const session = getDriver().session();
  try {
    await session.executeWrite(async (tx) => {
      const previousAuthors = await authorsOfPaperInGraph(tx, paperId);
      await tx.run("MATCH (p:Paper {paper_id: $id}) DETACH DELETE p", { id: int(paperId) });
      await recomputeCoauthors(tx, previousAuthors);
    });
  } finally {
    await session.close();
  }
}

/** Copy one paper (with its authors and citations to other approved papers) into Neo4j. */
export async function syncPaper(paperId: number): Promise<void> {
  const paper = await query<{ paper_id: number; title: string; year: number; domain: string; citations: number; status: string }>(
    `SELECT p.paper_id, p.title, p.publication_year AS year, d.name AS domain,
            GREATEST(p.citation_count, p.external_citation_count) AS citations, p.status
     FROM papers p JOIN domains d ON d.domain_id = p.domain_id
     WHERE p.paper_id = $1`,
    [paperId],
  );
  const row = paper.rows[0];
  if (!row || row.status !== "approved") {
    await removePaper(paperId);
    return;
  }

  const [authors, cited, citing] = await Promise.all([
    query<{ author_id: number; name: string; order: number }>(
      `SELECT a.author_id, a.full_name AS name, pa.author_order AS "order"
       FROM paper_authors pa JOIN authors a ON a.author_id = pa.author_id
       WHERE pa.paper_id = $1`,
      [paperId],
    ),
    query<{ id: number }>(
      `SELECT c.cited_paper_id AS id FROM citations c JOIN papers p ON p.paper_id = c.cited_paper_id
       WHERE c.citing_paper_id = $1 AND p.status = 'approved'`,
      [paperId],
    ),
    query<{ id: number }>(
      `SELECT c.citing_paper_id AS id FROM citations c JOIN papers p ON p.paper_id = c.citing_paper_id
       WHERE c.cited_paper_id = $1 AND p.status = 'approved'`,
      [paperId],
    ),
  ]);

  const id = int(paperId);
  const session = getDriver().session();
  try {
    // One Neo4j transaction: the paper and all its edges appear together or not at all.
    await session.executeWrite(async (tx) => {
      const previousAuthors = await authorsOfPaperInGraph(tx, paperId);
      await tx.run(
        `MERGE (p:Paper {paper_id: $id})
         SET p.title = $title, p.year = $year, p.domain = $domain, p.citations = $citations`,
        { id, title: row.title, year: int(row.year), domain: row.domain, citations: int(row.citations) },
      );
      await tx.run("MATCH (:Author)-[w:WROTE]->(:Paper {paper_id: $id}) DELETE w", { id });
      await tx.run(
        `MATCH (p:Paper {paper_id: $id})
         UNWIND $authors AS au
         MERGE (a:Author {author_id: au.author_id})
         SET a.name = au.name
         MERGE (a)-[w:WROTE]->(p)
         SET w.order = au.order`,
        { id, authors: authors.rows.map((a) => ({ author_id: int(a.author_id), name: a.name, order: int(a.order) })) },
      );
      await tx.run(
        `MATCH (p:Paper {paper_id: $id})
         UNWIND $cited AS cid
         MATCH (q:Paper {paper_id: cid})
         MERGE (p)-[:CITES]->(q)`,
        { id, cited: cited.rows.map((r) => int(r.id)) },
      );
      await tx.run(
        `MATCH (p:Paper {paper_id: $id})
         UNWIND $citing AS cid
         MATCH (q:Paper {paper_id: cid})
         MERGE (q)-[:CITES]->(p)`,
        { id, citing: citing.rows.map((r) => int(r.id)) },
      );
      const affected = [...new Set([...previousAuthors, ...authors.rows.map((a) => a.author_id)])];
      await recomputeCoauthors(tx, affected);
    });
  } finally {
    await session.close();
  }
}

async function applyJob(job: SyncJob): Promise<void> {
  const p = job.payload;
  if (job.entity === "citation" && p.citing && p.cited) {
    const params = { a: int(p.citing), b: int(p.cited) };
    if (job.op === "upsert") {
      // Only links papers that are both already in the graph (approved).
      await writeGraph("MATCH (a:Paper {paper_id: $a}), (b:Paper {paper_id: $b}) MERGE (a)-[:CITES]->(b)", params);
    } else {
      await writeGraph("MATCH (:Paper {paper_id: $a})-[r:CITES]->(:Paper {paper_id: $b}) DELETE r", params);
    }
    return;
  }
  if (p.paper_id) {
    // paper upsert/delete and authorship changes: re-read the paper from PostgreSQL.
    if (job.entity === "paper" && job.op === "delete") await removePaper(p.paper_id);
    else await syncPaper(p.paper_id);
  }
}

/**
 * Apply pending outbox jobs in order. FOR UPDATE SKIP LOCKED lets two sync
 * processes run at once without handling the same job twice.
 * If Neo4j is down, the jobs stay pending and are retried next time.
 */
export async function drainSyncQueue(limit = 500): Promise<{ processed: number; failed: number }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<SyncJob>(
      `SELECT job_id, entity, op, payload
       FROM graph_sync_queue
       WHERE processed_at IS NULL AND attempts < 5
       ORDER BY job_id
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit],
    );

    let processed = 0;
    let failed = 0;
    const done = new Set<string>();
    for (const job of rows) {
      // Several authorship jobs for one paper collapse into a single re-sync.
      const key = `${job.entity === "citation" ? "citation" : "paper"}:${job.op}:${JSON.stringify(job.payload)}`;
      try {
        if (!done.has(key)) await applyJob(job);
        done.add(key);
        await client.query("UPDATE graph_sync_queue SET processed_at = now() WHERE job_id = $1", [job.job_id]);
        processed += 1;
      } catch (error) {
        if (isGraphUnavailable(error)) throw error; // keep everything pending
        failed += 1;
        await client.query(
          "UPDATE graph_sync_queue SET attempts = attempts + 1, last_error = left($2, 1000) WHERE job_id = $1",
          [job.job_id, error instanceof Error ? error.message : String(error)],
        );
      }
    }
    return { processed, failed };
  });
}

async function inBatches<T>(rows: T[], size: number, work: (batch: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await work(rows.slice(i, i + size));
}

/** Wipe Neo4j and reload every approved paper, author, citation and co-authorship. */
export async function rebuildGraph(log: (message: string) => void = () => undefined): Promise<Record<string, number>> {
  const startJob = await query<{ max: number }>("SELECT COALESCE(MAX(job_id), 0) AS max FROM graph_sync_queue");

  await ensureGraphSchema();
  log("Clearing Neo4j ...");
  // Delete in chunks so a large graph does not need one huge transaction.
  for (;;) {
    const { records } = await getDriver().executeQuery("MATCH (n) WITH n LIMIT 5000 DETACH DELETE n RETURN count(*) AS deleted");
    if (Number(records[0]?.get("deleted") ?? 0) === 0) break;
  }

  const papers = await query<{ paper_id: number; title: string; year: number; domain: string; citations: number }>(
    `SELECT p.paper_id, p.title, p.publication_year AS year, d.name AS domain,
            GREATEST(p.citation_count, p.external_citation_count) AS citations
     FROM papers p JOIN domains d ON d.domain_id = p.domain_id
     WHERE p.status = 'approved'`,
  );
  await inBatches(papers.rows, 1000, (batch) =>
    writeGraph(
      `UNWIND $rows AS row
       CREATE (p:Paper {paper_id: toInteger(row.paper_id), title: row.title, year: toInteger(row.year),
                        domain: row.domain, citations: toInteger(row.citations)})`,
      { rows: batch },
    ),
  );
  log(`Papers: ${papers.rows.length}`);

  const wrote = await query<{ author_id: number; name: string; paper_id: number; order: number }>(
    `SELECT a.author_id, a.full_name AS name, pa.paper_id, pa.author_order AS "order"
     FROM paper_authors pa
     JOIN authors a ON a.author_id = pa.author_id
     JOIN papers p  ON p.paper_id = pa.paper_id AND p.status = 'approved'`,
  );
  await inBatches(wrote.rows, 2000, (batch) =>
    writeGraph(
      `UNWIND $rows AS row
       MATCH (p:Paper {paper_id: toInteger(row.paper_id)})
       MERGE (a:Author {author_id: toInteger(row.author_id)})
       SET a.name = row.name
       MERGE (a)-[w:WROTE]->(p)
       SET w.order = toInteger(row.order)`,
      { rows: batch },
    ),
  );
  log(`Authorships: ${wrote.rows.length}`);

  const cites = await query<{ citing: number; cited: number }>(
    `SELECT c.citing_paper_id AS citing, c.cited_paper_id AS cited
     FROM citations c
     JOIN papers a ON a.paper_id = c.citing_paper_id AND a.status = 'approved'
     JOIN papers b ON b.paper_id = c.cited_paper_id AND b.status = 'approved'`,
  );
  await inBatches(cites.rows, 2000, (batch) =>
    writeGraph(
      `UNWIND $rows AS row
       MATCH (a:Paper {paper_id: toInteger(row.citing)}), (b:Paper {paper_id: toInteger(row.cited)})
       MERGE (a)-[:CITES]->(b)`,
      { rows: batch },
    ),
  );
  log(`Citations: ${cites.rows.length}`);

  // Co-authorship is computed in SQL (self-join) and written as one edge per pair.
  const pairs = await query<{ a: number; b: number; shared: number }>(
    `SELECT pa1.author_id AS a, pa2.author_id AS b, COUNT(*) AS shared
     FROM paper_authors pa1
     JOIN paper_authors pa2 ON pa2.paper_id = pa1.paper_id AND pa1.author_id < pa2.author_id
     JOIN papers p ON p.paper_id = pa1.paper_id AND p.status = 'approved'
     GROUP BY pa1.author_id, pa2.author_id`,
  );
  await inBatches(pairs.rows, 2000, (batch) =>
    writeGraph(
      `UNWIND $rows AS row
       MATCH (a:Author {author_id: toInteger(row.a)}), (b:Author {author_id: toInteger(row.b)})
       MERGE (a)-[r:CO_AUTHORED]->(b)
       SET r.papers = toInteger(row.shared)`,
      { rows: batch },
    ),
  );
  log(`Co-author pairs: ${pairs.rows.length}`);

  // Everything queued before the snapshot is now reflected in Neo4j.
  await query("UPDATE graph_sync_queue SET processed_at = now() WHERE processed_at IS NULL AND job_id <= $1", [startJob.rows[0].max]);

  return { papers: papers.rows.length, authorships: wrote.rows.length, citations: cites.rows.length, coauthorPairs: pairs.rows.length };
}
