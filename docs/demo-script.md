# 10-Minute Demo Script

Two presenters: **A** (papers, search, vectors, library) and **B** (auth, admin, graph,
analytics). Each speaks about their own part. Rehearse once with a timer.

## Before the demo

- [ ] `docker compose up -d`, then `npm run db:status` shows every migration applied
- [ ] Data loaded (`npm run data:import` or `npm run data:sample`), then `npm run embed`,
      `npm run graph:rebuild`, `npm run analytics:refresh`
- [ ] `npm run build && npm start`
- [ ] Two browser windows: one logged in as a researcher, one as the admin
- [ ] pgAdmin (or DBeaver) and Neo4j Browser (`localhost:7474`) open in tabs
- [ ] A small test PDF ready on the desktop

## Script

| Time | Who | Show | Say |
| --- | --- | --- | --- |
| 0:00 | A | Home page | Problem: keyword search misses related work and citation links are hidden. Three databases, each for the data it fits. |
| 0:45 | B | ER diagram (`docs/02-...`) | 18 tables in 3NF, junction tables, recursive citations, the one controlled denormalization. |
| 1:30 | A | Search: keyword "attention", then filter "Artificial Intelligence (all)" | GIN full-text index, `ts_rank_cd`, highlighted snippets, recursive CTE for sub-domains. |
| 2:15 | A | Search: semantic, "teaching computers to understand language" | Query embedded with MiniLM, HNSW cosine search in pgvector, finds BERT without shared words. |
| 2:45 | A | Search: hybrid "BM25" | Reciprocal Rank Fusion keeps exact acronym matches. |
| 3:15 | A | Researcher window: upload a paper with a PDF and 2 references | One transaction around `sp_add_paper`; PDF signature check; then upload the same DOI again to show the UNIQUE error message from PostgreSQL. |
| 4:15 | B | Admin window: reject with no reason, then approve | Database CHECK in the audit trigger blocks a reason-less reject; approval locks the row (`FOR UPDATE`), the trigger writes the audit row and queues the Neo4j job. Show the Audit log tab. |
| 5:15 | B | Citation graph centred on the new paper, depth 2 | Neo4j variable-length path; click a node; shortest path to another paper. |
| 6:00 | B | "SQL vs Cypher" panel | Same question, recursive CTE vs one Cypher pattern: the justification for Neo4j. |
| 6:45 | A | Paper page: similar papers, set "Reading", add to collection, add a note | Vector similarity on the paper's own embedding; UPSERT; library page with counts from aggregate FILTER. |
| 7:30 | B | Library: recommendations; an author profile with co-author network | Co-citation pattern in Cypher; CO_AUTHORED edges built from a SQL self-join. |
| 8:15 | B | Analytics page; change "Minimum papers" | Materialized view, `GROUP BY ... HAVING`, `RANK() OVER (PARTITION BY ...)`, correlated subquery, h-index with window functions. |
| 9:00 | A | Terminal: `npm test`, `npm run db:explain -- --no-seqscan` | 57 tests including direct constraint tests; EXPLAIN shows the trigram, partial and HNSW indexes. |
| 9:30 | B | `.env.example`, pgAdmin: try `CREATE TABLE` as app_user | Secrets outside Git, least-privilege role, bcrypt-only passwords. |
| 9:45 | Both | GitHub Insights → Contributors | Individual contributions; close. |

## Likely viva questions

| Question | Short answer |
| --- | --- |
| Why not only PostgreSQL? | Vectors are in PostgreSQL (pgvector). Multi-hop graph queries are much simpler and faster to express in Cypher; the comparison panel shows it. |
| How do the two databases stay consistent? | Outbox table filled by triggers in the same transaction; sync with `SKIP LOCKED`; full rebuild from PostgreSQL any time. |
| Why is `citation_count` stored? | Search sorts by it on every request; a trigger keeps it exact. Controlled denormalization. |
| What happens if two admins approve at once? | `SELECT ... FOR UPDATE` serializes them; the second sees "already approved". |
| How is SQL injection prevented? | Every value is a bind parameter (`$1`); a unit test checks that malicious input never appears in the SQL text. |
| Why cosine distance and HNSW? | MiniLM vectors are normalized, so cosine is the natural metric; HNSW needs no training step and stays fast as data grows. |
| How are passwords protected? | bcrypt cost 12; a CHECK constraint refuses anything that is not a bcrypt hash. |
