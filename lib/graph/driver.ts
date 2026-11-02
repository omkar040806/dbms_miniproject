// Neo4j connection (Bolt protocol) shared by the app and scripts.
import neo4j, { type Driver, type QueryResult } from "neo4j-driver";
import { HttpError } from "@/lib/api/http";

const globalForNeo4j = globalThis as unknown as { rpNeo4j?: Driver };

export function getDriver(): Driver {
  if (!globalForNeo4j.rpNeo4j) {
    const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = process.env;
    if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
      throw new Error("NEO4J_URI, NEO4J_USER and NEO4J_PASSWORD must be set in .env");
    }
    globalForNeo4j.rpNeo4j = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), {
      // Return Neo4j integers as plain JavaScript numbers (our ids are small).
      disableLosslessIntegers: true,
      // Fail fast when Neo4j is down instead of retrying for the default 30 s,
      // so pages show "not reachable" quickly and approvals are not held up.
      connectionTimeout: 3_000,
      connectionAcquisitionTimeout: 5_000,
      maxTransactionRetryTime: 2_000,
    });
  }
  return globalForNeo4j.rpNeo4j;
}

export async function closeDriver(): Promise<void> {
  await globalForNeo4j.rpNeo4j?.close();
  globalForNeo4j.rpNeo4j = undefined;
}

/** JavaScript numbers are sent to Neo4j as floats; ids must be sent as integers. */
export const int = (value: number) => neo4j.int(value);

function isUnavailable(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? "";
  return code === "ServiceUnavailable" || code === "SessionExpired" || /ECONNREFUSED|connect/i.test(String((error as Error)?.message));
}

/** Run a read query and return plain objects. Connection problems become HTTP 503. */
export async function readGraph<T>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
  let result: QueryResult;
  try {
    result = await getDriver().executeQuery(cypher, params, { routing: neo4j.routing.READ });
  } catch (error) {
    if (isUnavailable(error)) throw new HttpError(503, "The graph database (Neo4j) is not reachable. Is the container running?");
    throw error;
  }
  return result.records.map((record) => record.toObject() as T);
}

export async function writeGraph(cypher: string, params: Record<string, unknown> = {}): Promise<void> {
  await getDriver().executeQuery(cypher, params, { routing: neo4j.routing.WRITE });
}

export { isUnavailable as isGraphUnavailable };
