# Important Queries

Every query below runs in the application. The file and function are named so each one can
be shown live during the demo. `$1`, `$2` are bind parameters: user input never becomes SQL text.

## Part A: papers, search and library (Member A)

### A1. Upload transaction with a stored procedure

`lib/db/queries/papers.ts → createPaper()`

```sql
BEGIN;
SELECT set_config('app.current_user_id', '7', true);       -- read by the audit trigger
CALL sp_add_paper($1::text, $2::text, $3::text, $4::int, $5::int, $6::int, $7::int,
                  'pending'::text, $8::text[], $9::text[], $10::int[], NULL::int);
UPDATE papers SET pdf_path = $2, pdf_size_bytes = $3, pdf_sha256 = $4 WHERE paper_id = $1;
COMMIT;   -- any error -> ROLLBACK: no paper, no authors, no keywords, and the PDF is deleted
```

Concepts: transaction, stored procedure with an `INOUT` parameter, arrays, DML (`INSERT`, `UPDATE`).

### A2. Full-text search with ranking, snippets and filters

`lib/db/queries/search.ts → keywordSearch()`

```sql
WITH matches AS (
  SELECT p.paper_id,
         ts_rank_cd(p.search_vector, websearch_to_tsquery('english', $1)) AS score,
         ROW_NUMBER() OVER (ORDER BY ts_rank_cd(p.search_vector, websearch_to_tsquery('english', $1)) DESC) AS position,
         COUNT(*) OVER () AS total_count
  FROM papers p
  WHERE p.status = 'approved'
    AND p.domain_id IN (SELECT domain_id FROM fn_domain_subtree($2))
    AND p.publication_year >= $3
    AND p.search_vector @@ websearch_to_tsquery('english', $1)
  ORDER BY position
  LIMIT $4 OFFSET $5
)
SELECT vp.*, m.score, m.total_count,
       ts_headline('english', vp.abstract, websearch_to_tsquery('english', $1), 'StartSel=[[[, StopSel=]]]') AS snippet
FROM matches m JOIN v_paper_details vp ON vp.paper_id = m.paper_id
ORDER BY m.position;
```

Concepts: CTE, window functions (`ROW_NUMBER`, `COUNT(*) OVER ()` for the total without a
second query), GIN full-text index, subquery, join with a view, `ORDER BY`, pagination.

### A3. Semantic search (pgvector, HNSW)

`lib/db/queries/search.ts → semanticSearch()`

```sql
SET LOCAL hnsw.ef_search = 100;
SELECT p.paper_id, e.embedding <=> $1::vector AS distance
FROM paper_embeddings e
JOIN papers p ON p.paper_id = e.paper_id
WHERE p.status = 'approved'
ORDER BY e.embedding <=> $1::vector
LIMIT 50;
```

### A4. Hybrid search with Reciprocal Rank Fusion

`lib/db/queries/search.ts → hybridSearch()`

```sql
WITH semantic AS (...ROW_NUMBER() OVER (ORDER BY distance) AS rank ... LIMIT 50),
     keyword  AS (...ROW_NUMBER() OVER (ORDER BY text_rank DESC) AS rank ... LIMIT 50),
     fused AS (
       SELECT COALESCE(s.paper_id, k.paper_id) AS paper_id,
              COALESCE(1.0 / (60 + s.rank), 0) + COALESCE(1.0 / (60 + k.rank), 0) AS rrf_score
       FROM semantic s FULL OUTER JOIN keyword k ON k.paper_id = s.paper_id
     )
SELECT ... FROM fused ORDER BY rrf_score DESC;
```

Concepts: `FULL OUTER JOIN`, several CTEs, combining a vector index and a GIN index in one query.

### A5. Recursive CTE: a domain and all its sub-domains

`db/migrations/010_functions_procedures.sql → fn_domain_subtree()`

```sql
WITH RECURSIVE subtree AS (
    SELECT d.domain_id FROM domains d WHERE d.domain_id = $1
    UNION ALL
    SELECT child.domain_id FROM domains child JOIN subtree s ON child.parent_domain_id = s.domain_id
)
SELECT domain_id FROM subtree;
```

### A6. h-index in SQL

`fn_author_h_index()`: rank an author's papers by citations; h is the largest rank whose paper
still has at least that many citations.

```sql
SELECT COALESCE(MAX(rn), 0)
FROM (SELECT GREATEST(p.citation_count, p.external_citation_count) AS cites,
             ROW_NUMBER() OVER (ORDER BY GREATEST(p.citation_count, p.external_citation_count) DESC) AS rn
      FROM paper_authors pa JOIN papers p ON p.paper_id = pa.paper_id
      WHERE pa.author_id = $1 AND p.status = 'approved') ranked
WHERE cites >= rn;
```

### A7. Co-authors with a self-join

`lib/db/queries/authors.ts → getAuthorProfile()`

```sql
SELECT a2.author_id, a2.full_name, COUNT(*) AS shared_papers
FROM paper_authors pa1
JOIN paper_authors pa2 ON pa2.paper_id = pa1.paper_id AND pa2.author_id <> pa1.author_id
JOIN papers p          ON p.paper_id = pa1.paper_id AND p.status = 'approved'
JOIN authors a2        ON a2.author_id = pa2.author_id
WHERE pa1.author_id = $1
GROUP BY a2.author_id, a2.full_name
ORDER BY shared_papers DESC
LIMIT 15;
```

### A8. Typo-tolerant author search (pg_trgm) with a correlated subquery

`lib/db/queries/authors.ts → searchAuthors()`

```sql
SELECT a.author_id, a.full_name,
       (SELECT COUNT(*) FROM paper_authors pa JOIN papers p ON p.paper_id = pa.paper_id
         WHERE pa.author_id = a.author_id AND p.status = 'approved') AS paper_count,
       similarity(a.full_name, $1) AS similarity
FROM authors a
WHERE a.full_name % $1 OR a.full_name ILIKE $2
ORDER BY similarity DESC, paper_count DESC
LIMIT 10;
```

### A9. UPSERT for reading status

`lib/db/queries/library.ts → upsertReadingEntry()`

```sql
INSERT INTO reading_list (user_id, paper_id, status, is_bookmarked)
VALUES ($1, $2, COALESCE($3, 'to_read'), COALESCE($4, FALSE))
ON CONFLICT (user_id, paper_id) DO UPDATE
  SET status = COALESCE($3, reading_list.status),
      is_bookmarked = COALESCE($4, reading_list.is_bookmarked)
RETURNING status, is_bookmarked;
```

### A10. Aggregate FILTER: several counts in one pass

`lib/db/queries/library.ts → getLibrary()`

```sql
SELECT COUNT(*) FILTER (WHERE status = 'to_read') AS to_read,
       COUNT(*) FILTER (WHERE status = 'reading') AS reading,
       COUNT(*) FILTER (WHERE status = 'read')    AS read,
       COUNT(*) FILTER (WHERE is_bookmarked)      AS bookmarked
FROM reading_list WHERE user_id = $1;
```

### A11. Ownership-checked DELETE with USING

`lib/db/queries/library.ts → removePaperFromCollection()`

```sql
DELETE FROM collection_papers cp
USING collections c
WHERE cp.collection_id = c.collection_id
  AND c.collection_id = $1 AND c.user_id = $2 AND cp.paper_id = $3;
```

## Part B: administration, analytics and graph (Member B)

### B1. Moderation decision: row lock, transaction-local settings, trigger audit

`lib/db/queries/admin.ts → reviewPaper()`

```sql
BEGIN;
SELECT status FROM papers WHERE paper_id = $1 FOR UPDATE;   -- a second admin waits here
SELECT set_config('app.current_user_id', $2, true),
       set_config('app.moderation_reason', $3, true);       -- like SET LOCAL
UPDATE papers SET status = 'approved' WHERE paper_id = $1;
-- trigger trg_papers_moderation_update -> INSERT INTO moderation_log (...)
-- trigger trg_papers_graph_sync        -> INSERT INTO graph_sync_queue (...)
COMMIT;
```

A rejection without a reason fails on `ck_modlog_reject_reason` inside the trigger, so the
whole `UPDATE` rolls back: the rule holds even if someone bypasses the API.

### B2. Last-admin guard with row locks

`lib/db/queries/admin.ts → updateUser()`

```sql
BEGIN;
SELECT user_id FROM users WHERE role = 'admin' AND is_active ORDER BY user_id FOR UPDATE;
SELECT role, is_active FROM users WHERE user_id = $1 FOR UPDATE;
-- refuse if this would leave zero active admins
UPDATE users SET role = COALESCE($2, role), is_active = COALESCE($3, is_active) WHERE user_id = $1;
COMMIT;
```

### B3. Outbox processing with SKIP LOCKED

`lib/graph/sync.ts → drainSyncQueue()`

```sql
SELECT job_id, entity, op, payload
FROM graph_sync_queue
WHERE processed_at IS NULL AND attempts < 5
ORDER BY job_id
LIMIT 500
FOR UPDATE SKIP LOCKED;
```

### B4. GROUP BY ... HAVING: popular domains

`lib/db/queries/analytics.ts`

```sql
SELECT d.name AS domain_name, COUNT(DISTINCT p.paper_id) AS papers,
       ROUND(AVG(GREATEST(p.citation_count, p.external_citation_count)), 1) AS avg_citations,
       COUNT(v.view_id) AS views_90d
FROM papers p
JOIN domains d ON d.domain_id = p.domain_id
LEFT JOIN paper_views v ON v.paper_id = p.paper_id AND v.viewed_at > now() - INTERVAL '90 days'
WHERE p.status = 'approved'
GROUP BY d.domain_id, d.name
HAVING COUNT(DISTINCT p.paper_id) >= $1
ORDER BY papers DESC;
```

### B5. Window function: top 3 papers per domain

```sql
SELECT * FROM (
  SELECT d.name, p.title, GREATEST(p.citation_count, p.external_citation_count) AS citations,
         RANK() OVER (PARTITION BY p.domain_id ORDER BY GREATEST(p.citation_count, p.external_citation_count) DESC) AS rank
  FROM papers p JOIN domains d ON d.domain_id = p.domain_id
  WHERE p.status = 'approved'
) ranked
WHERE rank <= 3;
```

### B6. Correlated subquery: cited above the domain average

```sql
SELECT p.title, GREATEST(p.citation_count, p.external_citation_count) AS citations
FROM papers p
WHERE p.status = 'approved'
  AND GREATEST(p.citation_count, p.external_citation_count) >
      (SELECT AVG(GREATEST(p2.citation_count, p2.external_citation_count))
       FROM papers p2 WHERE p2.domain_id = p.domain_id AND p2.status = 'approved')
ORDER BY citations DESC LIMIT 10;
```

### B7. h-index for all authors in one query

```sql
WITH ranked AS (
  SELECT pa.author_id, GREATEST(p.citation_count, p.external_citation_count) AS cites,
         ROW_NUMBER() OVER (PARTITION BY pa.author_id
                            ORDER BY GREATEST(p.citation_count, p.external_citation_count) DESC) AS position
  FROM paper_authors pa JOIN papers p ON p.paper_id = pa.paper_id AND p.status = 'approved'
)
SELECT a.full_name, COUNT(*) AS papers, COUNT(*) FILTER (WHERE r.cites >= r.position) AS h_index
FROM ranked r JOIN authors a ON a.author_id = r.author_id
GROUP BY a.author_id, a.full_name
ORDER BY h_index DESC LIMIT 10;
```

### B8. Materialized view refresh through SECURITY DEFINER

```sql
SELECT fn_refresh_analytics();   -- runs REFRESH MATERIALIZED VIEW CONCURRENTLY as the owner
```

### B9. Same question in SQL and Cypher: papers within 2 citation hops

SQL (`lib/db/queries/graph-sql.ts`):

```sql
WITH RECURSIVE hops (paper_id, depth, path) AS (
    SELECT $1::int, 0, ARRAY[$1::int]
    UNION ALL
    SELECT nxt.id, h.depth + 1, h.path || nxt.id
    FROM hops h
    CROSS JOIN LATERAL (
        SELECT c.cited_paper_id AS id FROM citations c WHERE c.citing_paper_id = h.paper_id
        UNION ALL
        SELECT c.citing_paper_id FROM citations c WHERE c.cited_paper_id = h.paper_id
    ) nxt
    JOIN papers p ON p.paper_id = nxt.id AND p.status = 'approved'
    WHERE h.depth < $2 AND NOT nxt.id = ANY (h.path)
)
SELECT COUNT(DISTINCT paper_id) - 1 AS reachable FROM hops;
```

Cypher (`lib/graph/queries.ts`):

```cypher
MATCH (c:Paper {paper_id: $id})-[:CITES*1..2]-(n:Paper)
WHERE n <> c
RETURN count(DISTINCT n) AS reachable
```

### B10. Cypher: shortest citation path and co-citation recommendations

```cypher
MATCH (a:Paper {paper_id: $from}), (b:Paper {paper_id: $to})
MATCH path = shortestPath((a)-[:CITES*..8]-(b))
RETURN [n IN nodes(path) | n.title] AS chain;

MATCH (mine:Paper)<-[:CITES]-(citer:Paper)-[:CITES]->(rec:Paper)
WHERE mine.paper_id IN $ids AND NOT rec.paper_id IN $ids
RETURN rec.title, count(DISTINCT citer) AS score
ORDER BY score DESC LIMIT 10;
```
