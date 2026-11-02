# Database Choice and Justification

Each kind of data is stored where it fits best. PostgreSQL is the single source of truth;
pgvector and Neo4j each serve one type of query that plain SQL handles poorly.

| Data | Shape of the data | Store | Why |
| --- | --- | --- | --- |
| Papers, authors, users, venues, domains, collections, notes, moderation | Structured records with many relationships and strict rules | **PostgreSQL 18** (relational) | Foreign keys, CHECK constraints, transactions and SQL aggregation |
| Paper embeddings | 384 floating-point numbers per paper | **pgvector** inside PostgreSQL (vector) | Nearest-neighbour search by meaning, combined with SQL filters in one query |
| Citations and co-authorship | A network of nodes and edges | **Neo4j** (graph, NoSQL) | Variable-length path queries and graph traversal |

## Why PostgreSQL rather than MySQL

- The **pgvector** extension adds a vector type and HNSW indexes to the same database, so
  semantic search does not need a separate service.
- Built-in **full-text search** (`tsvector`, `ts_rank`, `ts_headline`) with weighted fields.
- **Materialized views**, **recursive CTEs**, **procedures**, **generated columns** and
  **partial indexes** are all used in this project.
- Every `CHECK` constraint is enforced, which requirement 12 (database-level validation) needs.

## Why pgvector rather than a separate vector database

- Semantic results must respect normal filters ("approved papers in NLP after 2020").
  With pgvector that is one SQL statement: `WHERE ... ORDER BY embedding <=> $1 LIMIT 20`.
- The embedding row lives next to its paper, so deleting a paper deletes its vector through
  `ON DELETE CASCADE`. A separate vector store would need its own synchronization.
- A few thousand papers fits comfortably in one PostgreSQL instance.
- Rejected: Qdrant or Chroma (one more service to run and keep consistent), Pinecone (cloud
  account and API keys).

## Why Neo4j for citations and co-authorship

Questions like "which papers are within three citation hops of this one?" or "what is the
shortest chain of citations linking paper A to paper B?" are graph traversals.

- In Cypher: `MATCH (p:Paper {paper_id: $id})-[:CITES*1..3]-(q:Paper) RETURN DISTINCT q`.
- In SQL: a recursive CTE that joins `citations` to itself once per hop, tracks visited
  rows to avoid cycles, and gets slower as depth grows.

The application shows both side by side on the citation graph page (SQL recursive CTE vs
Cypher, with timings) to justify the choice with evidence, not opinion.

Rejected: MongoDB. A document model suits self-contained records, not relationship-heavy data.

## Why PostgreSQL stays the source of truth

Neo4j holds a **read-optimized copy** of approved papers, authors and citations.

1. Triggers on `papers`, `paper_authors` and `citations` write jobs into `graph_sync_queue`
   (an outbox table) inside the same transaction as the change.
2. A sync step reads pending jobs with `FOR UPDATE SKIP LOCKED` and applies them to Neo4j.
3. `npm run graph:rebuild` can recreate the whole graph from PostgreSQL at any time.

Foreign keys in PostgreSQL guarantee that every citation points at a real paper. If the two
stores ever disagree, PostgreSQL wins and the graph is rebuilt.
