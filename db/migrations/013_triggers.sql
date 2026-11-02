-- 013: triggers that keep derived data correct no matter which code changes the rows.

-------------------------------------------------------------------------------
-- 1. updated_at timestamps
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- Only real edits bump updated_at; a change to citation_count alone does not.
CREATE TRIGGER trg_papers_updated_at
    BEFORE UPDATE OF title, abstract, doi, publication_year, venue_id, domain_id, status, pdf_path ON papers
    FOR EACH ROW EXECUTE FUNCTION trg_fn_set_updated_at();

CREATE TRIGGER trg_notes_updated_at
    BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION trg_fn_set_updated_at();

CREATE TRIGGER trg_reading_list_updated_at
    BEFORE UPDATE ON reading_list
    FOR EACH ROW EXECUTE FUNCTION trg_fn_set_updated_at();

-------------------------------------------------------------------------------
-- 2. papers.citation_count follows the citations table
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_citation_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE papers SET citation_count = citation_count + 1 WHERE paper_id = NEW.cited_paper_id;
        RETURN NEW;
    ELSE -- DELETE
        UPDATE papers SET citation_count = GREATEST(citation_count - 1, 0) WHERE paper_id = OLD.cited_paper_id;
        RETURN OLD;
    END IF;
END;
$$;

CREATE TRIGGER trg_citations_count
    AFTER INSERT OR DELETE ON citations
    FOR EACH ROW EXECUTE FUNCTION trg_fn_citation_count();

-- Backfill counts for citations that existed before this trigger.
UPDATE papers p
SET citation_count = c.n
FROM (SELECT cited_paper_id, COUNT(*) AS n FROM citations GROUP BY cited_paper_id) c
WHERE p.paper_id = c.cited_paper_id;

-------------------------------------------------------------------------------
-- 3. Audit trail of submissions and moderation decisions
-------------------------------------------------------------------------------
-- The application tells the trigger who is acting with
--   SET LOCAL app.current_user_id = '<id>' and SET LOCAL app.moderation_reason = '<text>'
-- inside the same transaction. current_setting(..., true) returns NULL when unset.
CREATE OR REPLACE FUNCTION trg_fn_paper_moderation_log()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_actor  INT  := NULLIF(current_setting('app.current_user_id', true), '')::INT;
    v_reason TEXT := NULLIF(current_setting('app.moderation_reason', true), '');
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'pending' THEN
            INSERT INTO moderation_log (paper_id, paper_title, actor_id, action, new_status)
            VALUES (NEW.paper_id, NEW.title, COALESCE(v_actor, NEW.uploaded_by), 'submit', NEW.status);
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO moderation_log (paper_id, paper_title, actor_id, action, old_status, new_status, reason)
        VALUES (NEW.paper_id, NEW.title, v_actor,
                CASE NEW.status WHEN 'approved' THEN 'approve' WHEN 'rejected' THEN 'reject' ELSE 'reopen' END,
                OLD.status, NEW.status, v_reason);
        RETURN NEW;
    ELSE -- DELETE: the paper row is gone, so keep only its title.
        INSERT INTO moderation_log (paper_id, paper_title, actor_id, action, old_status, reason)
        VALUES (NULL, OLD.title, v_actor, 'delete', OLD.status, v_reason);
        RETURN OLD;
    END IF;
END;
$$;

CREATE TRIGGER trg_papers_moderation_insert
    AFTER INSERT ON papers
    FOR EACH ROW EXECUTE FUNCTION trg_fn_paper_moderation_log();

-- WHEN clause: fire only when the status really changes.
CREATE TRIGGER trg_papers_moderation_update
    AFTER UPDATE OF status ON papers
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION trg_fn_paper_moderation_log();

CREATE TRIGGER trg_papers_moderation_delete
    AFTER DELETE ON papers
    FOR EACH ROW EXECUTE FUNCTION trg_fn_paper_moderation_log();

-------------------------------------------------------------------------------
-- 4. Outbox: queue Neo4j sync jobs in the same transaction as the change
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_enqueue_paper_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status = 'approved' THEN
        INSERT INTO graph_sync_queue (entity, op, payload)
        VALUES ('paper', 'upsert', jsonb_build_object('paper_id', NEW.paper_id));
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN
        -- An approved paper was rejected or reopened: remove it from the graph.
        INSERT INTO graph_sync_queue (entity, op, payload)
        VALUES ('paper', 'delete', jsonb_build_object('paper_id', NEW.paper_id));
    ELSIF TG_OP = 'DELETE' AND OLD.status = 'approved' THEN
        INSERT INTO graph_sync_queue (entity, op, payload)
        VALUES ('paper', 'delete', jsonb_build_object('paper_id', OLD.paper_id));
    END IF;
    RETURN NULL; -- the return value of an AFTER trigger is ignored
END;
$$;

CREATE TRIGGER trg_papers_graph_sync
    AFTER INSERT OR DELETE OR UPDATE OF status, title, publication_year, domain_id ON papers
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_paper_sync();

CREATE OR REPLACE FUNCTION trg_fn_enqueue_citation_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO graph_sync_queue (entity, op, payload)
        VALUES ('citation', 'upsert', jsonb_build_object('citing', NEW.citing_paper_id, 'cited', NEW.cited_paper_id));
    ELSE
        INSERT INTO graph_sync_queue (entity, op, payload)
        VALUES ('citation', 'delete', jsonb_build_object('citing', OLD.citing_paper_id, 'cited', OLD.cited_paper_id));
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_citations_graph_sync
    AFTER INSERT OR DELETE ON citations
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_citation_sync();

CREATE OR REPLACE FUNCTION trg_fn_enqueue_authorship_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- The sync step re-reads the whole paper, so the paper id is enough.
    INSERT INTO graph_sync_queue (entity, op, payload)
    VALUES ('authorship', 'upsert',
            jsonb_build_object('paper_id', CASE WHEN TG_OP = 'DELETE' THEN OLD.paper_id ELSE NEW.paper_id END));
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_paper_authors_graph_sync
    AFTER INSERT OR DELETE ON paper_authors
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_authorship_sync();
