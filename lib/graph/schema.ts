import { writeGraph } from "./driver";

// Same statements as db/neo4j/schema.cypher. IF NOT EXISTS makes them safe to repeat.
const STATEMENTS = [
  "CREATE CONSTRAINT paper_id_unique IF NOT EXISTS FOR (p:Paper) REQUIRE p.paper_id IS UNIQUE",
  "CREATE CONSTRAINT author_id_unique IF NOT EXISTS FOR (a:Author) REQUIRE a.author_id IS UNIQUE",
  "CREATE INDEX paper_year IF NOT EXISTS FOR (p:Paper) ON (p.year)",
  "CREATE INDEX paper_domain IF NOT EXISTS FOR (p:Paper) ON (p.domain)",
];

export async function ensureGraphSchema(): Promise<void> {
  for (const statement of STATEMENTS) await writeGraph(statement);
}
