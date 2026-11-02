-- 007: vector embeddings for semantic search (pgvector).
-- One 384-dimension vector per paper from the all-MiniLM-L6-v2 model,
-- computed from title + abstract + keywords.

CREATE TABLE paper_embeddings (
    paper_id          INT PRIMARY KEY REFERENCES papers (paper_id) ON DELETE CASCADE,
    model_name        VARCHAR(100) NOT NULL,
    embedding         VECTOR(384)  NOT NULL,
    -- SHA-256 of the text that was embedded. If title/abstract change, the hash
    -- no longer matches and the embedding script re-computes the vector.
    source_text_hash  CHAR(64)     NOT NULL,
    embedded_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT ck_embeddings_hash CHECK (source_text_hash ~ '^[0-9a-f]{64}$')
);

-- HNSW approximate nearest-neighbour index for cosine distance (the <=> operator).
-- m = links per node, ef_construction = build-time search width (pgvector defaults).
CREATE INDEX idx_paper_embeddings_hnsw
    ON paper_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

COMMENT ON TABLE paper_embeddings IS 'Weak entity of papers (1 : 0..1). Vectors are normalized, so cosine distance = 1 - dot product.';
