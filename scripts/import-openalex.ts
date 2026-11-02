/**
 * Import real paper metadata from OpenAlex (CC0 data) into PostgreSQL.
 *
 *   npm run data:import                       about 250 papers per leaf domain
 *   npm run data:import -- --per-domain 100   fewer papers (faster)
 *
 * Needs OPENALEX_API_KEY in .env (free: https://openalex.org/settings/api).
 * One list request returns 100 papers, so a full import uses about 15 requests.
 *
 * Imported papers are inserted as 'approved' with uploaded_by = NULL.
 * Citations are only stored when BOTH papers were imported (foreign keys require it).
 * Afterwards run:  npm run embed   and   npm run graph:rebuild
 */
import "./lib/env";
import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/pool";
import {
  cleanTitle,
  mapVenueType,
  normalizeDoi,
  normalizeOrcid,
  reconstructAbstract,
  shortOpenAlexId,
} from "@/lib/openalex/transform";

// One search query per leaf domain (domain names come from migration 004).
const DOMAIN_QUERIES: Record<string, string> = {
  "Natural Language Processing": "transformer language model",
  "Computer Vision": "convolutional neural network image recognition",
  "Reinforcement Learning": "deep reinforcement learning",
  "Database Systems": "database query optimization",
  "Information Retrieval": "information retrieval ranking",
  "Graph Data and Knowledge Graphs": "knowledge graph embedding",
};

const SELECT_FIELDS = [
  "id",
  "doi",
  "display_name",
  "publication_year",
  "abstract_inverted_index",
  "authorships",
  "primary_location",
  "referenced_works",
  "cited_by_count",
  "keywords",
].join(",");

interface OpenAlexWork {
  id: string;
  doi: string | null;
  display_name: string | null;
  publication_year: number | null;
  abstract_inverted_index: Record<string, number[]> | null;
  cited_by_count: number;
  referenced_works: string[];
  keywords?: { display_name: string }[];
  primary_location?: {
    source?: { id: string; display_name: string; type: string | null; host_organization_name?: string | null } | null;
  } | null;
  authorships: {
    author: { id: string | null; display_name: string | null; orcid: string | null };
    institutions: { id: string | null; display_name: string | null; country_code: string | null }[];
  }[];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const perDomainIndex = args.indexOf("--per-domain");
  const perDomain = perDomainIndex >= 0 ? Number(args[perDomainIndex + 1]) : 250;
  if (!Number.isInteger(perDomain) || perDomain < 1 || perDomain > 1000) {
    throw new Error("--per-domain must be between 1 and 1000");
  }
  return { perDomain };
}

async function fetchWorks(search: string, count: number): Promise<OpenAlexWork[]> {
  const apiKey = process.env.OPENALEX_API_KEY;
  if (!apiKey) console.warn("OPENALEX_API_KEY is not set: using the small keyless daily allowance.");

  const works: OpenAlexWork[] = [];
  const pages = Math.ceil(count / 100);
  for (let page = 1; page <= pages; page += 1) {
    const params = new URLSearchParams({
      search,
      filter: "publication_year:2010-2026,has_abstract:true,type:article|preprint,is_retracted:false",
      sort: "cited_by_count:desc",
      per_page: "100",
      page: String(page),
      select: SELECT_FIELDS,
    });
    if (apiKey) params.set("api_key", apiKey);

    const response = await fetch(`https://api.openalex.org/works?${params}`, {
      headers: { "User-Agent": "research-discovery-platform (student project)" },
    });
    if (!response.ok) {
      throw new Error(`OpenAlex returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const body = (await response.json()) as { results: OpenAlexWork[] };
    works.push(...body.results);
    if (body.results.length < 100) break;
    await new Promise((resolve) => setTimeout(resolve, 250)); // be polite to the API
  }
  return works.slice(0, count);
}

async function upsertVenue(client: PoolClient, work: OpenAlexWork): Promise<number | null> {
  const source = work.primary_location?.source;
  const openalexId = shortOpenAlexId(source?.id);
  if (!source?.display_name || !openalexId) return null;

  const type = mapVenueType(source.type);
  const name = source.display_name.slice(0, 255);
  const inserted = await client.query<{ venue_id: number }>(
    `INSERT INTO venues (name, venue_type, publisher, openalex_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING
     RETURNING venue_id`,
    [name, type, source.host_organization_name?.slice(0, 255) ?? null, openalexId],
  );
  if (inserted.rows[0]) return inserted.rows[0].venue_id;

  const existing = await client.query<{ venue_id: number }>(
    "SELECT venue_id FROM venues WHERE openalex_id = $1 OR (name = $2 AND venue_type = $3) LIMIT 1",
    [openalexId, name, type],
  );
  return existing.rows[0]?.venue_id ?? null;
}

async function upsertInstitution(
  client: PoolClient,
  institution: OpenAlexWork["authorships"][number]["institutions"][number] | undefined,
): Promise<number | null> {
  const openalexId = shortOpenAlexId(institution?.id);
  if (!institution?.display_name || !openalexId) return null;

  const country = institution.country_code && /^[A-Z]{2}$/.test(institution.country_code) ? institution.country_code : null;
  const name = institution.display_name.slice(0, 255);
  const inserted = await client.query<{ institution_id: number }>(
    `INSERT INTO institutions (name, country_code, openalex_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING institution_id`,
    [name, country, openalexId],
  );
  if (inserted.rows[0]) return inserted.rows[0].institution_id;

  const existing = await client.query<{ institution_id: number }>(
    "SELECT institution_id FROM institutions WHERE openalex_id = $1 OR name = $2 LIMIT 1",
    [openalexId, name],
  );
  return existing.rows[0]?.institution_id ?? null;
}

/** Insert one work and its authors/keywords. Returns false when skipped (duplicate or invalid). */
async function importWork(client: PoolClient, work: OpenAlexWork, domainId: number): Promise<boolean> {
  const openalexId = shortOpenAlexId(work.id);
  const title = cleanTitle(work.display_name);
  const year = work.publication_year;
  if (!openalexId || !title || !year || year < 1900 || year > 2100) return false;

  const venueId = await upsertVenue(client, work);
  const paper = await client.query<{ paper_id: number }>(
    `INSERT INTO papers (title, abstract, doi, openalex_id, publication_year, venue_id, domain_id,
                         status, external_citation_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8)
     ON CONFLICT DO NOTHING
     RETURNING paper_id`,
    [title, reconstructAbstract(work.abstract_inverted_index), normalizeDoi(work.doi), openalexId, year, venueId, domainId, Math.max(0, work.cited_by_count ?? 0)],
  );
  const paperId = paper.rows[0]?.paper_id;
  if (!paperId) return false; // already imported (same OpenAlex id or DOI)

  let order = 0;
  for (const authorship of work.authorships.slice(0, 50)) {
    const name = authorship.author.display_name;
    if (!name || name.trim().length < 2) continue;
    const institutionId = await upsertInstitution(client, authorship.institutions[0]);
    const author = await client.query<{ id: number }>("SELECT fn_get_or_create_author($1, $2, $3, $4) AS id", [
      name,
      normalizeOrcid(authorship.author.orcid),
      shortOpenAlexId(authorship.author.id),
      institutionId,
    ]);
    order += 1;
    await client.query(
      `INSERT INTO paper_authors (paper_id, author_id, author_order) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [paperId, author.rows[0].id, order],
    );
  }

  for (const keyword of (work.keywords ?? []).slice(0, 8)) {
    if (!keyword.display_name || keyword.display_name.trim().length < 2) continue;
    await client.query(
      `INSERT INTO paper_keywords (paper_id, keyword_id)
       VALUES ($1, fn_get_or_create_keyword($2)) ON CONFLICT DO NOTHING`,
      [paperId, keyword.display_name],
    );
  }
  return true;
}

async function main() {
  const { perDomain } = parseArgs();
  const pool = getPool();
  const client = await pool.connect();
  const allWorks: OpenAlexWork[] = [];

  try {
    for (const [domainName, search] of Object.entries(DOMAIN_QUERIES)) {
      const domain = await client.query<{ domain_id: number }>("SELECT domain_id FROM domains WHERE name = $1", [domainName]);
      const domainId = domain.rows[0]?.domain_id;
      if (!domainId) throw new Error(`Domain "${domainName}" not found. Run npm run db:migrate first.`);

      process.stdout.write(`${domainName}: fetching ... `);
      const works = await fetchWorks(search, perDomain);
      process.stdout.write(`${works.length} works, saving ... `);

      let imported = 0;
      await client.query("BEGIN");
      for (const work of works) {
        // A savepoint per paper: one bad record is skipped without losing the rest of the batch.
        await client.query("SAVEPOINT one_work");
        try {
          if (await importWork(client, work, domainId)) imported += 1;
          await client.query("RELEASE SAVEPOINT one_work");
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT one_work");
          console.warn(`\n  skipped ${work.id}: ${error instanceof Error ? error.message : error}`);
        }
      }
      await client.query("COMMIT");
      allWorks.push(...works);
      console.log(`${imported} new`);
    }

    // Second pass: citations between imported papers.
    const idMap = new Map(
      (await client.query<{ openalex_id: string; paper_id: number }>(
        "SELECT openalex_id, paper_id FROM papers WHERE openalex_id IS NOT NULL",
      )).rows.map((r) => [r.openalex_id, r.paper_id]),
    );

    const citing: number[] = [];
    const cited: number[] = [];
    for (const work of allWorks) {
      const from = idMap.get(shortOpenAlexId(work.id) ?? "");
      if (!from) continue;
      for (const ref of work.referenced_works ?? []) {
        const to = idMap.get(shortOpenAlexId(ref) ?? "");
        if (to && to !== from) {
          citing.push(from);
          cited.push(to);
        }
      }
    }
    // unnest() turns the two arrays into rows: one INSERT for all citations.
    const result = await client.query(
      `INSERT INTO citations (citing_paper_id, cited_paper_id)
       SELECT * FROM unnest($1::int[], $2::int[])
       ON CONFLICT DO NOTHING`,
      [citing, cited],
    );
    console.log(`Citations between imported papers: ${result.rowCount} new`);

    const totals = await client.query<{ papers: number; authors: number; citations: number }>(
      `SELECT (SELECT COUNT(*) FROM papers) AS papers,
              (SELECT COUNT(*) FROM authors) AS authors,
              (SELECT COUNT(*) FROM citations) AS citations`,
    );
    console.log("Totals:", totals.rows[0]);
    console.log("Next: npm run embed   then   npm run graph:rebuild");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
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
