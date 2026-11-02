-- 006: citation network. A recursive many-to-many relationship on papers.
-- PostgreSQL is the source of truth; Neo4j receives a copy for graph traversal.

CREATE TABLE citations (
    citing_paper_id  INT NOT NULL REFERENCES papers (paper_id) ON DELETE CASCADE,
    cited_paper_id   INT NOT NULL REFERENCES papers (paper_id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_citations         PRIMARY KEY (citing_paper_id, cited_paper_id),
    CONSTRAINT ck_citations_no_self CHECK (citing_paper_id <> cited_paper_id)
);

-- The primary key already indexes (citing, cited). "Who cites paper X?" needs the reverse.
CREATE INDEX idx_citations_cited ON citations (cited_paper_id);

COMMENT ON TABLE citations IS 'Edge list: citing_paper_id contains a reference to cited_paper_id.';
