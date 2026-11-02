// Neo4j graph schema. Applied automatically by `npm run graph:rebuild`
// (lib/graph/schema.ts runs the same statements). Kept here for documentation
// and for pasting into Neo4j Browser at http://localhost:7474.

// Nodes
//   (:Paper  {paper_id, title, year, domain, citations})   one per APPROVED paper in PostgreSQL
//   (:Author {author_id, name})                            one per author of an approved paper
// Relationships
//   (:Paper)-[:CITES]->(:Paper)                            from the citations table
//   (:Author)-[:WROTE {order}]->(:Paper)                   from paper_authors
//   (:Author)-[:CO_AUTHORED {papers}]-(:Author)            derived: number of shared papers

CREATE CONSTRAINT paper_id_unique IF NOT EXISTS FOR (p:Paper) REQUIRE p.paper_id IS UNIQUE;
CREATE CONSTRAINT author_id_unique IF NOT EXISTS FOR (a:Author) REQUIRE a.author_id IS UNIQUE;
CREATE INDEX paper_year IF NOT EXISTS FOR (p:Paper) ON (p.year);
CREATE INDEX paper_domain IF NOT EXISTS FOR (p:Paper) ON (p.domain);

// Example queries to try in Neo4j Browser:
// Papers within 2 citation hops of paper 19
// MATCH (p:Paper {paper_id: 19})-[:CITES*1..2]-(q:Paper) RETURN DISTINCT q.title LIMIT 25;
// Shortest citation chain between two papers
// MATCH (a:Paper {paper_id: 19}), (b:Paper {paper_id: 9}) MATCH path = shortestPath((a)-[:CITES*..8]-(b)) RETURN path;
// Most connected authors
// MATCH (a:Author)-[r:CO_AUTHORED]-() RETURN a.name, count(r) AS coauthors ORDER BY coauthors DESC LIMIT 10;
