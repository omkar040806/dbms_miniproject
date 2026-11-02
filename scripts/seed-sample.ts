/**
 * Load the small offline dataset in db/seed/sample-papers.json (about 30 well-known papers).
 *   npm run data:sample
 * Useful without an OpenAlex key, and for tests. Safe to run twice: existing titles are skipped.
 * Every paper goes through the stored procedure sp_add_paper inside one transaction.
 */
import "./lib/env";
import { readFile } from "node:fs/promises";
import { getPool } from "@/lib/db/pool";

interface SamplePaper {
  key: string;
  title: string;
  abstract: string;
  year: number;
  domain: string;
  doi?: string;
  venue: { name: string; type: string };
  authors: string[];
  keywords: string[];
  cites: string[];
}

async function main() {
  const file = JSON.parse(await readFile("db/seed/sample-papers.json", "utf8")) as { papers: SamplePaper[] };
  const pool = getPool();
  const client = await pool.connect();
  const ids = new Map<string, number>();
  let added = 0;

  try {
    await client.query("BEGIN");
    for (const paper of file.papers) {
      const existing = await client.query<{ paper_id: number }>(
        "SELECT paper_id FROM papers WHERE lower(title) = lower($1)",
        [paper.title],
      );
      if (existing.rows[0]) {
        ids.set(paper.key, existing.rows[0].paper_id);
        continue;
      }

      const domain = await client.query<{ domain_id: number }>("SELECT domain_id FROM domains WHERE name = $1", [paper.domain]);
      if (!domain.rows[0]) throw new Error(`Unknown domain ${paper.domain}`);

      await client.query(
        "INSERT INTO venues (name, venue_type) VALUES ($1, $2) ON CONFLICT (name, venue_type) DO NOTHING",
        [paper.venue.name, paper.venue.type],
      );
      const venue = await client.query<{ venue_id: number }>(
        "SELECT venue_id FROM venues WHERE name = $1 AND venue_type = $2",
        [paper.venue.name, paper.venue.type],
      );

      const result = await client.query<{ p_paper_id: number }>(
        `CALL sp_add_paper($1::text, $2::text, $3::text, $4::int, $5::int, $6::int, NULL::int,
                           'approved'::text, $7::text[], $8::text[], NULL::int[], NULL::int)`,
        [paper.title, paper.abstract, paper.doi ?? null, paper.year, venue.rows[0].venue_id, domain.rows[0].domain_id, paper.authors, paper.keywords],
      );
      ids.set(paper.key, result.rows[0].p_paper_id);
      added += 1;
    }

    // Citations reference other sample papers by key, so insert them after every paper exists.
    let citations = 0;
    for (const paper of file.papers) {
      for (const target of paper.cites) {
        const from = ids.get(paper.key);
        const to = ids.get(target);
        if (!from || !to) throw new Error(`Bad citation ${paper.key} -> ${target}`);
        const inserted = await client.query(
          "INSERT INTO citations (citing_paper_id, cited_paper_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [from, to],
        );
        citations += inserted.rowCount ?? 0;
      }
    }
    await client.query("COMMIT");
    console.log(`Sample data: ${added} papers and ${citations} citations added.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
