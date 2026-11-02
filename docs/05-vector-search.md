# Vector Database and Semantic Search

Semantic search finds papers by meaning. A query such as "teaching computers to understand
language" finds BERT and the Transformer even though neither abstract contains those words.

## What is converted into embeddings

One vector per **approved** paper, built from:

```
<title>
<abstract>
Keywords: <keyword 1>, <keyword 2>, ...
```

The text is built by `lib/embeddings/text.ts`. Its SHA-256 hash is stored next to the vector
(`paper_embeddings.source_text_hash`). If an admin edits a title or abstract, the hash no
longer matches and `npm run embed` re-computes only that vector.

## Embedding model

| Property | Value |
| --- | --- |
| Model | `Xenova/all-MiniLM-L6-v2` (sentence-transformers, ONNX, 8-bit quantized) |
| Library | Transformers.js (`@huggingface/transformers`), runs inside Node.js on the CPU |
| Dimensions | 384 |
| Pooling | Mean of token embeddings, then L2-normalized (unit length) |
| Input limit | 256 tokens (longer abstracts are truncated by the tokenizer) |
| Cost | Free, offline after a one-time 23 MB download into `.cache/` |

The same model embeds papers (when approved, or by `npm run embed`) and user queries (at
search time), so both live in the same vector space.

**Why this model:** small and fast on a laptop CPU, no API key, widely used for sentence
similarity. A science-specific model (SPECTER2) would be more accurate for papers but needs
Python; it is listed as a future enhancement.

## How vectors are stored

```sql
CREATE TABLE paper_embeddings (
    paper_id          INT PRIMARY KEY REFERENCES papers (paper_id) ON DELETE CASCADE,
    model_name        VARCHAR(100) NOT NULL,
    embedding         VECTOR(384)  NOT NULL,
    source_text_hash  CHAR(64)     NOT NULL,
    embedded_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_paper_embeddings_hnsw
    ON paper_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

- **pgvector inside PostgreSQL**, so vectors sit next to the rows they describe. Deleting a
  paper deletes its vector through `ON DELETE CASCADE`.
- **HNSW** (Hierarchical Navigable Small World) is an approximate nearest-neighbour index:
  a layered graph of vectors that answers "closest k" without comparing against every row.
  `m` = links per node, `ef_construction` = build-time search width.

## Similarity metric

**Cosine distance**, the `<=>` operator. Because vectors are normalized,
cosine similarity = 1 − cosine distance = the dot product of the two vectors.
The UI shows similarity (1 = identical meaning, 0 = unrelated).

## How relevant results are retrieved

### Semantic search (`mode=semantic`)

1. Embed the query text with the same model.
2. Take the 50 nearest approved papers that also pass the SQL filters:

```sql
SELECT p.paper_id, e.embedding <=> $1::vector AS distance
FROM paper_embeddings e
JOIN papers p ON p.paper_id = e.paper_id
WHERE p.status = 'approved'
  AND p.domain_id IN (SELECT domain_id FROM fn_domain_subtree($2))
ORDER BY e.embedding <=> $1::vector
LIMIT 50;
```

3. Page through those 50 (optionally re-sorted by year or citations).

Before the query, the transaction runs `SET LOCAL hnsw.ef_search = 100` (HNSW returns at
most `ef_search` rows, and the default 40 is below our limit of 50). On pgvector 0.8+ it
also enables `hnsw.iterative_scan`, which keeps scanning when filters remove candidates.

### Hybrid search (`mode=hybrid`)

Pure vector search can miss exact terms such as acronyms ("BM25") or author-coined names.
Hybrid search runs **both** full-text search (`ts_rank_cd`) and vector search, then merges
the two ranked lists with **Reciprocal Rank Fusion**:

```
score(paper) = 1 / (60 + keyword_rank) + 1 / (60 + semantic_rank)
```

A paper missing from one list contributes 0 for that list. Papers found by both methods
rise to the top. The constant 60 is the standard RRF value that dampens the influence of
the very top ranks.

### Similar papers ("more like this")

Uses the paper's own stored vector as the query, excluding the paper itself:

```sql
SELECT e.paper_id,
       e.embedding <=> (SELECT embedding FROM paper_embeddings WHERE paper_id = $1) AS distance
FROM paper_embeddings e
WHERE e.paper_id <> $1
ORDER BY distance
LIMIT 30;
```

The scalar subquery is evaluated once, so the planner can still use the HNSW index.

## Keeping embeddings up to date

| Event | What happens |
| --- | --- |
| Admin approves a paper | The approve route embeds it immediately (`embedPaper`) |
| Bulk import | Run `npm run embed` afterwards |
| Title, abstract or keywords change | Hash mismatch; `npm run embed` re-embeds that paper |
| Model changed (`EMBEDDING_MODEL`) | `npm run embed -- --force` re-embeds everything |
| Paper deleted | `ON DELETE CASCADE` removes the vector |
