// Analytics for the dashboard. Each query demonstrates a different SQL feature:
// aggregates, GROUP BY ... HAVING, window functions, correlated subqueries,
// FILTER clauses and a materialized view.
import { query } from "@/lib/db/pool";

export interface AnalyticsData {
  overview: {
    papers: number;
    pending: number;
    authors: number;
    citations: number;
    users: number;
    views_30d: number;
  };
  trends: { publication_year: number; root_domain: string; paper_count: number }[];
  citationsByYear: { year: number; citations: number }[];
  domains: { domain_name: string; root_domain: string; papers: number; avg_citations: number; views_90d: number }[];
  topPapersByDomain: { domain_name: string; rank: number; paper_id: number; title: string; citations: number }[];
  aboveAverage: { paper_id: number; title: string; domain_name: string; citations: number; domain_avg: number }[];
  mostViewed: { paper_id: number; title: string; views: number }[];
  topAuthors: { author_id: number; full_name: string; papers: number; citations: number; h_index: number }[];
  keywords: { term: string; papers: number }[];
}

export async function getAnalytics(minPapers = 1): Promise<AnalyticsData> {
  const [overview, trends, citationsByYear, domains, topPapers, aboveAverage, mostViewed, topAuthors, keywords] = await Promise.all([
    // Scalar subqueries: several unrelated counts in one round trip.
    query<AnalyticsData["overview"]>(
      `SELECT COUNT(*) FILTER (WHERE status = 'approved') AS papers,
              COUNT(*) FILTER (WHERE status = 'pending')  AS pending,
              (SELECT COUNT(*) FROM authors)              AS authors,
              (SELECT COUNT(*) FROM citations)            AS citations,
              (SELECT COUNT(*) FROM users)                AS users,
              (SELECT COUNT(*) FROM paper_views WHERE viewed_at > now() - INTERVAL '30 days') AS views_30d
       FROM papers`,
    ),
    // Read from the materialized view (pre-aggregated by year and domain).
    query<AnalyticsData["trends"][number]>(
      `SELECT publication_year, root_domain, SUM(paper_count) AS paper_count
       FROM mv_domain_year_trends
       WHERE publication_year >= 2000
       GROUP BY publication_year, root_domain
       ORDER BY publication_year, root_domain`,
    ),
    // Citations made per year, by the year of the citing paper.
    query<AnalyticsData["citationsByYear"][number]>(
      `SELECT citing.publication_year AS year, COUNT(*) AS citations
       FROM citations c
       JOIN papers citing ON citing.paper_id = c.citing_paper_id AND citing.status = 'approved'
       WHERE citing.publication_year >= 2000
       GROUP BY citing.publication_year
       ORDER BY year`,
    ),
    // GROUP BY ... HAVING: only domains with at least `minPapers` papers.
    query<AnalyticsData["domains"][number]>(
      `SELECT d.name AS domain_name,
              COALESCE(parent.name, d.name) AS root_domain,
              COUNT(DISTINCT p.paper_id) AS papers,
              ROUND(AVG(GREATEST(p.citation_count, p.external_citation_count)), 1) AS avg_citations,
              COUNT(v.view_id) AS views_90d
       FROM papers p
       JOIN domains d ON d.domain_id = p.domain_id
       LEFT JOIN domains parent ON parent.domain_id = d.parent_domain_id
       LEFT JOIN paper_views v ON v.paper_id = p.paper_id AND v.viewed_at > now() - INTERVAL '90 days'
       WHERE p.status = 'approved'
       GROUP BY d.domain_id, d.name, parent.name
       HAVING COUNT(DISTINCT p.paper_id) >= $1
       ORDER BY papers DESC`,
      [minPapers],
    ),
    // Window function: rank papers inside each domain, keep the top 3.
    query<AnalyticsData["topPapersByDomain"][number]>(
      `SELECT domain_name, rank, paper_id, title, citations
       FROM (
         SELECT d.name AS domain_name, p.paper_id, p.title,
                GREATEST(p.citation_count, p.external_citation_count) AS citations,
                RANK() OVER (PARTITION BY p.domain_id
                             ORDER BY GREATEST(p.citation_count, p.external_citation_count) DESC) AS rank
         FROM papers p
         JOIN domains d ON d.domain_id = p.domain_id
         WHERE p.status = 'approved'
       ) ranked
       WHERE rank <= 3
       ORDER BY domain_name, rank, title`,
    ),
    // Correlated subquery: papers cited more than the average paper in their own domain.
    query<AnalyticsData["aboveAverage"][number]>(
      `SELECT p.paper_id, p.title, d.name AS domain_name,
              GREATEST(p.citation_count, p.external_citation_count) AS citations,
              ROUND((SELECT AVG(GREATEST(p2.citation_count, p2.external_citation_count))
                     FROM papers p2
                     WHERE p2.domain_id = p.domain_id AND p2.status = 'approved'), 1) AS domain_avg
       FROM papers p
       JOIN domains d ON d.domain_id = p.domain_id
       WHERE p.status = 'approved'
         AND GREATEST(p.citation_count, p.external_citation_count) >
             (SELECT AVG(GREATEST(p2.citation_count, p2.external_citation_count))
              FROM papers p2
              WHERE p2.domain_id = p.domain_id AND p2.status = 'approved')
       ORDER BY citations DESC
       LIMIT 10`,
    ),
    query<AnalyticsData["mostViewed"][number]>(
      `SELECT p.paper_id, p.title, COUNT(*) AS views
       FROM paper_views v
       JOIN papers p ON p.paper_id = v.paper_id AND p.status = 'approved'
       WHERE v.viewed_at > now() - INTERVAL '30 days'
       GROUP BY p.paper_id, p.title
       ORDER BY views DESC, p.title
       LIMIT 10`,
    ),
    // h-index for every author in one pass: number each author's papers by citations
    // (ROW_NUMBER), then h = how many papers have citations >= their position.
    query<AnalyticsData["topAuthors"][number]>(
      `WITH ranked AS (
         SELECT pa.author_id,
                GREATEST(p.citation_count, p.external_citation_count) AS cites,
                ROW_NUMBER() OVER (PARTITION BY pa.author_id
                                   ORDER BY GREATEST(p.citation_count, p.external_citation_count) DESC) AS position
         FROM paper_authors pa
         JOIN papers p ON p.paper_id = pa.paper_id AND p.status = 'approved'
       )
       SELECT a.author_id, a.full_name,
              COUNT(*) AS papers,
              SUM(r.cites) AS citations,
              COUNT(*) FILTER (WHERE r.cites >= r.position) AS h_index
       FROM ranked r
       JOIN authors a ON a.author_id = r.author_id
       GROUP BY a.author_id, a.full_name
       ORDER BY h_index DESC, citations DESC
       LIMIT 10`,
    ),
    query<AnalyticsData["keywords"][number]>(
      `SELECT k.term, COUNT(*) AS papers
       FROM paper_keywords pk
       JOIN keywords k ON k.keyword_id = pk.keyword_id
       JOIN papers p ON p.paper_id = pk.paper_id AND p.status = 'approved'
       GROUP BY k.term
       ORDER BY papers DESC, k.term
       LIMIT 20`,
    ),
  ]);

  return {
    overview: overview.rows[0],
    trends: trends.rows,
    citationsByYear: citationsByYear.rows,
    domains: domains.rows,
    topPapersByDomain: topPapers.rows,
    aboveAverage: aboveAverage.rows,
    mostViewed: mostViewed.rows,
    topAuthors: topAuthors.rows,
    keywords: keywords.rows,
  };
}

/** Refresh the materialized view through the SECURITY DEFINER function (works as app_user). */
export async function refreshAnalytics(): Promise<string> {
  const { rows } = await query<{ refreshed_at: string }>("SELECT fn_refresh_analytics() AS refreshed_at");
  return rows[0].refreshed_at;
}
