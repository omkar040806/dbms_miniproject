-- 014: indexes tuned to the queries the app actually runs.
-- Measure with: npm run db:explain  (EXPLAIN ANALYZE before/after)

-- Partial composite index for browsing approved papers by year and citations.
-- Partial = only approved rows are indexed, so it is smaller than a full index.
CREATE INDEX idx_papers_approved_year_cites
    ON papers (publication_year DESC, citation_count DESC)
    WHERE status = 'approved';

-- Domain + year filter used by search and analytics.
CREATE INDEX idx_papers_approved_domain_year
    ON papers (domain_id, publication_year)
    WHERE status = 'approved';

-- The single-column year index from 005 is now redundant: the composite index above
-- has publication_year as its leading column. Dropping it saves space and write time.
DROP INDEX IF EXISTS idx_papers_year;

-- Trigram GIN index: speeds up ILIKE '%dean%' and the similarity operator % used by
-- typo-tolerant author search (pg_trgm extension from migration 001).
CREATE INDEX idx_authors_name_trgm ON authors USING gin (full_name gin_trgm_ops);

-- Covering index for the library page: user + status lookup answered from the index alone
-- (INCLUDE adds columns to the leaf pages without making them part of the key).
CREATE INDEX idx_reading_list_user_status
    ON reading_list (user_id, status) INCLUDE (is_bookmarked, updated_at);

-- Expression index for case-insensitive title lookups (used by the sample-data loader).
CREATE INDEX idx_papers_lower_title ON papers (lower(title));

-- Refresh planner statistics so the new indexes are considered immediately.
ANALYZE papers;
ANALYZE authors;
ANALYZE reading_list;
