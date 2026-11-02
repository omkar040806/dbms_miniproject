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
