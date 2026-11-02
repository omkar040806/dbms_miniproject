-- 005: papers, their authors and keywords, with full-text search.

CREATE TABLE papers (
    paper_id                 INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title                    VARCHAR(500) NOT NULL,
    abstract                 TEXT,
    doi                      VARCHAR(255),
    openalex_id              VARCHAR(20),
    publication_year         SMALLINT     NOT NULL,
    venue_id                 INT REFERENCES venues (venue_id)   ON DELETE SET NULL,
    domain_id                INT NOT NULL REFERENCES domains (domain_id) ON DELETE RESTRICT,
    uploaded_by              INT REFERENCES users (user_id)     ON DELETE SET NULL,
    status                   VARCHAR(10)  NOT NULL DEFAULT 'pending',
    pdf_path                 VARCHAR(300),
    citation_count           INT          NOT NULL DEFAULT 0,  -- citations inside this platform (trigger-maintained)
    external_citation_count  INT          NOT NULL DEFAULT 0,  -- global count reported by OpenAlex
    -- Generated column: always consistent with title/abstract, no application code needed.
    -- Weight A (title) ranks higher than weight B (abstract) in ts_rank.
    search_vector            TSVECTOR GENERATED ALWAYS AS (
                                 setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                                 setweight(to_tsvector('english', coalesce(abstract, '')), 'B')
                             ) STORED,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uq_papers_openalex  UNIQUE (openalex_id),
    CONSTRAINT ck_papers_title     CHECK (char_length(btrim(title)) >= 5),
    CONSTRAINT ck_papers_abstract  CHECK (abstract IS NULL OR char_length(abstract) <= 10000),
    CONSTRAINT ck_papers_doi       CHECK (doi ~* '^10\.[0-9]{4,9}/\S+$'),
    CONSTRAINT ck_papers_year      CHECK (publication_year BETWEEN 1900 AND 2100),
    CONSTRAINT ck_papers_status    CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT ck_papers_citations CHECK (citation_count >= 0 AND external_citation_count >= 0)
);

COMMENT ON COLUMN papers.citation_count IS 'Denormalized COUNT of citations rows pointing here; kept in sync by trigger trg_citations_count.';

-- DOIs are case-insensitive: a unique index on the expression lower(doi)
-- rejects "10.1/ABC" when "10.1/abc" already exists.
CREATE UNIQUE INDEX uq_papers_doi_lower ON papers (lower(doi));

-- GIN index makes @@ full-text queries fast.
CREATE INDEX idx_papers_search_vector ON papers USING gin (search_vector);
CREATE INDEX idx_papers_status        ON papers (status);
CREATE INDEX idx_papers_domain        ON papers (domain_id);
CREATE INDEX idx_papers_venue         ON papers (venue_id);
CREATE INDEX idx_papers_uploaded_by   ON papers (uploaded_by);
CREATE INDEX idx_papers_year          ON papers (publication_year);

-- M:N papers <-> authors. author_order keeps the byline order (1 = first author).
CREATE TABLE paper_authors (
    paper_id      INT      NOT NULL REFERENCES papers (paper_id)   ON DELETE CASCADE,
    author_id     INT      NOT NULL REFERENCES authors (author_id) ON DELETE CASCADE,
    author_order  SMALLINT NOT NULL,

    CONSTRAINT pk_paper_authors       PRIMARY KEY (paper_id, author_id),
    CONSTRAINT uq_paper_authors_order UNIQUE (paper_id, author_order),
    CONSTRAINT ck_paper_authors_order CHECK (author_order > 0)
);
CREATE INDEX idx_paper_authors_author ON paper_authors (author_id);

CREATE TABLE keywords (
    keyword_id  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    term        VARCHAR(80) NOT NULL,

    CONSTRAINT uq_keywords_term   UNIQUE (term),
    -- Stored normalized so "Deep Learning" and "deep learning" are one keyword.
    CONSTRAINT ck_keywords_format CHECK (term = lower(btrim(term)) AND char_length(term) >= 2)
);

-- M:N papers <-> keywords.
CREATE TABLE paper_keywords (
    paper_id    INT NOT NULL REFERENCES papers (paper_id)     ON DELETE CASCADE,
    keyword_id  INT NOT NULL REFERENCES keywords (keyword_id) ON DELETE CASCADE,

    CONSTRAINT pk_paper_keywords PRIMARY KEY (paper_id, keyword_id)
);
CREATE INDEX idx_paper_keywords_keyword ON paper_keywords (keyword_id);
