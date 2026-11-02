import { query } from "@/lib/db/pool";
import type { Domain, MetaData, Venue } from "@/lib/types";

/** Reference data for forms and filters, plus headline counts for the home page. */
export async function getMeta(): Promise<MetaData> {
  const [domains, venues, totals] = await Promise.all([
    // LEFT JOIN + GROUP BY so domains without papers still appear with 0.
    query<Domain>(
      `SELECT d.domain_id, d.name, d.description, d.parent_domain_id,
              COUNT(p.paper_id) AS paper_count
       FROM domains d
       LEFT JOIN papers p ON p.domain_id = d.domain_id AND p.status = 'approved'
       GROUP BY d.domain_id
       ORDER BY d.parent_domain_id NULLS FIRST, d.name`,
    ),
    // The 300 venues with the most approved papers.
    query<Venue>(
      `SELECT v.venue_id, v.name, v.venue_type
       FROM venues v
       LEFT JOIN papers p ON p.venue_id = v.venue_id AND p.status = 'approved'
       GROUP BY v.venue_id
       ORDER BY COUNT(p.paper_id) DESC, v.name
       LIMIT 300`,
    ),
    query<MetaData["totals"]>(
      `SELECT (SELECT COUNT(*) FROM papers WHERE status = 'approved') AS papers,
              (SELECT COUNT(DISTINCT pa.author_id)
                 FROM paper_authors pa JOIN papers p ON p.paper_id = pa.paper_id
                WHERE p.status = 'approved') AS authors,
              (SELECT COUNT(*) FROM citations) AS citations,
              (SELECT COUNT(*) FROM domains) AS domains`,
    ),
  ]);
  return { domains: domains.rows, venues: venues.rows, totals: totals.rows[0] };
}
