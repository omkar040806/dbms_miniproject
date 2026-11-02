// Read queries against Neo4j (Cypher). Variable-length paths and shortest paths are
// what the graph database is good at; PostgreSQL stays the source of truth.
import { int, readGraph } from "./driver";

export interface GraphNode {
  id: number;
  title?: string;
  name?: string;
  year?: number;
  domain?: string;
  citations?: number;
  hop?: number;
}

export interface GraphLink {
  source: number;
  target: number;
  papers?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/**
 * Citation neighbourhood: every paper within `depth` CITES hops of the centre
 * (citing or cited), plus the CITES edges among them.
 * Cypher cannot take the hop count as a parameter, so `depth` is validated (1..3)
 * and written into the query text.
 */
export async function citationNeighborhood(paperId: number, depth: 1 | 2 | 3, limit = 150): Promise<GraphData> {
  const rows = await readGraph<{ nodes: GraphNode[]; links: GraphLink[] }>(
    `MATCH (c:Paper {paper_id: $id})
     OPTIONAL MATCH (c)-[:CITES*1..${depth}]-(n:Paper)
     WITH c, collect(DISTINCT n)[0..$limit] AS others
     WITH [c] + others AS ps
     UNWIND ps AS a
     OPTIONAL MATCH (a)-[:CITES]->(b:Paper)
     WHERE b IN ps
     WITH ps, collect(DISTINCT CASE WHEN b IS NULL THEN NULL ELSE {source: a.paper_id, target: b.paper_id} END) AS links
     RETURN [p IN ps | {id: p.paper_id, title: p.title, year: p.year, domain: p.domain, citations: p.citations}] AS nodes,
            links`,
    { id: int(paperId), limit: int(limit) },
  );
  return rows[0] ?? { nodes: [], links: [] };
}

/** Shortest chain of citations (in either direction) linking two papers, up to 8 hops. */
export async function citationPath(fromId: number, toId: number): Promise<GraphData | null> {
  const rows = await readGraph<GraphData>(
    `MATCH (a:Paper {paper_id: $from}), (b:Paper {paper_id: $to})
     MATCH path = shortestPath((a)-[:CITES*..8]-(b))
     RETURN [n IN nodes(path) | {id: n.paper_id, title: n.title, year: n.year, domain: n.domain}] AS nodes,
            [r IN relationships(path) | {source: startNode(r).paper_id, target: endNode(r).paper_id}] AS links`,
    { from: int(fromId), to: int(toId) },
  );
  return rows[0] ?? null;
}

/** An author's co-author network: direct co-authors (hop 1) and their co-authors (hop 2). */
export async function coauthorNetwork(authorId: number): Promise<GraphData> {
  const rows = await readGraph<GraphData>(
    `MATCH (a:Author {author_id: $id})
     OPTIONAL MATCH (a)-[:CO_AUTHORED]-(b:Author)
     WITH a, collect(DISTINCT b)[0..25] AS first
     UNWIND CASE WHEN size(first) = 0 THEN [NULL] ELSE first END AS b
     OPTIONAL MATCH (b)-[:CO_AUTHORED]-(c:Author)
     WHERE c <> a AND NOT c IN first
     WITH a, first, collect(DISTINCT c)[0..40] AS second
     WITH a, first, [a] + first + second AS people
     UNWIND people AS x
     OPTIONAL MATCH (x)-[r:CO_AUTHORED]-(y:Author)
     WHERE y IN people AND x.author_id < y.author_id
     WITH a, first, people,
          collect(DISTINCT CASE WHEN y IS NULL THEN NULL ELSE {source: x.author_id, target: y.author_id, papers: r.papers} END) AS links
     RETURN [p IN people | {id: p.author_id, name: p.name,
                            hop: CASE WHEN p = a THEN 0 WHEN p IN first THEN 1 ELSE 2 END}] AS nodes,
            links`,
    { id: int(authorId) },
  );
  return rows[0] ?? { nodes: [], links: [] };
}

export interface Recommendation {
  paper_id: number;
  title: string;
  year: number;
  score: number;
  reason: string;
}

/**
 * Recommendations from the citation graph for a set of papers the user saved:
 *  - direct: papers that the saved papers cite
 *  - co-citation: papers that are cited together with the saved papers by others
 */
export async function recommendFromPapers(paperIds: number[], limit = 10): Promise<Recommendation[]> {
  if (paperIds.length === 0) return [];
  const rows = await readGraph<Recommendation>(
    `MATCH (mine:Paper)-[:CITES]->(rec:Paper)
     WHERE mine.paper_id IN $ids AND NOT rec.paper_id IN $ids
     WITH rec, count(DISTINCT mine) AS hits
     RETURN rec.paper_id AS paper_id, rec.title AS title, rec.year AS year, hits * 2 AS score,
            'cited by papers you saved' AS reason
     ORDER BY score DESC, rec.citations DESC
     LIMIT $limit
     UNION
     MATCH (mine:Paper)<-[:CITES]-(citer:Paper)-[:CITES]->(rec:Paper)
     WHERE mine.paper_id IN $ids AND NOT rec.paper_id IN $ids
     WITH rec, count(DISTINCT citer) AS hits
     RETURN rec.paper_id AS paper_id, rec.title AS title, rec.year AS year, hits AS score,
            'often cited together with papers you saved' AS reason
     ORDER BY score DESC, rec.citations DESC
     LIMIT $limit`,
    { ids: paperIds.map(int), limit: int(limit) },
  );

  // Merge the two lists: a paper found both ways keeps the higher score.
  const best = new Map<number, Recommendation>();
  for (const row of rows) {
    const current = best.get(row.paper_id);
    if (!current || row.score > current.score) best.set(row.paper_id, row);
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

export const CYPHER_REACHABLE = (depth: number) =>
  `MATCH (c:Paper {paper_id: $id})-[:CITES*1..${depth}]-(n:Paper)
WHERE n <> c
RETURN count(DISTINCT n) AS reachable`;

export async function cypherReachable(paperId: number, depth: number): Promise<{ reachable: number; ms: number }> {
  const started = performance.now();
  const rows = await readGraph<{ reachable: number }>(CYPHER_REACHABLE(depth), { id: int(paperId) });
  return { reachable: rows[0]?.reachable ?? 0, ms: Math.round((performance.now() - started) * 100) / 100 };
}
