# Graph Database (Neo4j) Data Model

Neo4j stores the citation network and the co-authorship network as a property graph.
It is a **read-optimized copy** of approved data; PostgreSQL remains the source of truth.

## Data model

| Element | Kind | Properties | Source in PostgreSQL |
| --- | --- | --- | --- |
| `Paper` | Node label | `paper_id` (unique), `title`, `year`, `domain`, `citations` | `papers` where status = approved |
| `Author` | Node label | `author_id` (unique), `name` | `authors` of approved papers |
| `CITES` | Relationship `(Paper)->(Paper)` | none | `citations` |
| `WROTE` | Relationship `(Author)->(Paper)` | `order` | `paper_authors` |
| `CO_AUTHORED` | Relationship `(Author)-(Author)` | `papers` (shared paper count) | derived by a self-join on `paper_authors` |

```
(:Author {author_id, name}) -[:WROTE {order}]-> (:Paper {paper_id, title, year, domain, citations})
(:Paper) -[:CITES]-> (:Paper)
(:Author) -[:CO_AUTHORED {papers}]- (:Author)
```

## Constraints and indexes

Defined in `db/neo4j/schema.cypher` and applied by `npm run graph:rebuild`:

| Statement | Purpose |
| --- | --- |
| `CREATE CONSTRAINT paper_id_unique ... REQUIRE p.paper_id IS UNIQUE` | One node per paper; also creates the lookup index used by every query |
| `CREATE CONSTRAINT author_id_unique ... REQUIRE a.author_id IS UNIQUE` | One node per author |
| `CREATE INDEX paper_year ... ON (p.year)` | Filtering graph results by year |
| `CREATE INDEX paper_domain ... ON (p.domain)` | Filtering graph results by domain |

## Why a graph database for this data

| Question | Cypher | SQL equivalent |
| --- | --- | --- |
| Papers within N citation hops | `(p)-[:CITES*1..N]-(q)` | Recursive CTE joining `citations` twice per hop, tracking visited paths |
| Shortest citation chain between two papers | `shortestPath((a)-[:CITES*..8]-(b))` | Breadth-first search in a recursive CTE, stopped manually |
| Co-authors of co-authors | `(a)-[:CO_AUTHORED]-(b)-[:CO_AUTHORED]-(c)` | Four-way self-join on `paper_authors` |
| "Cited together with my papers" | `(mine)<-[:CITES]-(x)-[:CITES]->(rec)` | Self-join on `citations` with grouping |

The citation graph page has a **SQL vs Cypher** panel that runs the same N-hop question in
both databases and shows the result counts, timings and query text side by side.

## Retrieval queries used by the app (`lib/graph/queries.ts`)

1. **Citation neighbourhood** (`/api/graph/citations/:id?depth=1..3`): every paper within
   N hops plus the CITES edges among them, for the force-directed graph.
2. **Shortest path** (`/api/graph/path?from=&to=`): `shortestPath` over CITES in either direction.
3. **Co-author network** (`/api/graph/coauthors/:id`): direct co-authors and their co-authors.
4. **Recommendations** (`/api/graph/recommendations`): papers cited by the user's saved
   papers, plus co-citation (papers often cited together with them).

## Keeping Neo4j in sync (outbox pattern)

```
PostgreSQL transaction                         after COMMIT
┌──────────────────────────────────┐          ┌──────────────────────────────┐
│ UPDATE papers SET status = ...   │          │ drainSyncQueue():            │
│   trigger -> INSERT INTO         │  ──────▶ │  SELECT ... FOR UPDATE       │
│   graph_sync_queue (job)         │          │  SKIP LOCKED; apply to Neo4j;│
└──────────────────────────────────┘          │  mark processed_at           │
                                              └──────────────────────────────┘
```

1. Triggers on `papers`, `paper_authors` and `citations` insert a job into
   `graph_sync_queue` **in the same transaction** as the change. If the change rolls back,
   so does the job.
2. After an approval or deletion the API calls `drainSyncQueue()`. Jobs are read with
   `FOR UPDATE SKIP LOCKED`, so two sync runs never process the same job.
3. A paper job re-reads the paper from PostgreSQL and rewrites its node, its `WROTE` edges,
   its `CITES` edges and the affected `CO_AUTHORED` edges inside one Neo4j transaction.
4. If Neo4j is down, jobs stay pending; `npm run graph:sync` or the admin **System** page
   applies them later. A job failing 5 times is parked with its error message.
5. `npm run graph:rebuild` wipes Neo4j and reloads everything from PostgreSQL.
