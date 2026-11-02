-- 009: moderation audit trail, view tracking for analytics, and the Neo4j sync outbox.

CREATE TABLE moderation_log (
    log_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- SET NULL keeps the audit row after the paper is deleted; the title snapshot keeps it readable.
    paper_id     INT REFERENCES papers (paper_id) ON DELETE SET NULL,
    paper_title  VARCHAR(500) NOT NULL,
    actor_id     INT REFERENCES users (user_id) ON DELETE SET NULL,
    action       VARCHAR(10)  NOT NULL,
    old_status   VARCHAR(10),
    new_status   VARCHAR(10),
    reason       VARCHAR(1000),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT ck_modlog_action CHECK (action IN ('submit', 'approve', 'reject', 'reopen', 'delete')),
    -- Business rule enforced by the database: a rejection must explain itself.
    CONSTRAINT ck_modlog_reject_reason CHECK (action <> 'reject' OR char_length(btrim(coalesce(reason, ''))) >= 5)
);
CREATE INDEX idx_modlog_paper   ON moderation_log (paper_id);
CREATE INDEX idx_modlog_created ON moderation_log (created_at DESC);

CREATE TABLE paper_views (
    view_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    paper_id   INT NOT NULL REFERENCES papers (paper_id) ON DELETE CASCADE,
    user_id    INT REFERENCES users (user_id) ON DELETE SET NULL,  -- NULL for guests
    viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_paper_views_paper_time ON paper_views (paper_id, viewed_at);

-- Outbox pattern: triggers write a job here in the same transaction as the change,
-- and the sync step copies it to Neo4j. No foreign keys on purpose: a job must
-- still describe a paper after that paper has been deleted.
CREATE TABLE graph_sync_queue (
    job_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity        VARCHAR(12) NOT NULL,
    op            VARCHAR(6)  NOT NULL,
    payload       JSONB       NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at  TIMESTAMPTZ,
    attempts      SMALLINT    NOT NULL DEFAULT 0,
    last_error    VARCHAR(1000),

    CONSTRAINT ck_sync_entity  CHECK (entity IN ('paper', 'citation', 'authorship')),
    CONSTRAINT ck_sync_op      CHECK (op IN ('upsert', 'delete')),
    CONSTRAINT ck_sync_payload CHECK (jsonb_typeof(payload) = 'object')
);

-- Partial index: only unprocessed jobs are indexed, so the index stays tiny
-- however many processed jobs accumulate.
CREATE INDEX idx_sync_pending ON graph_sync_queue (job_id) WHERE processed_at IS NULL;
