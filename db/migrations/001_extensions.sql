-- 001: PostgreSQL extensions used by the schema.
-- Needs the owner role (superuser inside the Docker container).

CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive text, used for user emails
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- trigram similarity, used for typo-tolerant author search
CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector: VECTOR type, HNSW index, <=> cosine distance
