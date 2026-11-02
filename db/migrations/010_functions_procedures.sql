-- 010: stored functions and a stored procedure.
-- Business logic that must behave the same no matter who calls it lives in the database.

-- Normalize a keyword and return its id, creating the row if needed.
CREATE OR REPLACE FUNCTION fn_get_or_create_keyword(p_term TEXT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_term TEXT := left(lower(btrim(regexp_replace(coalesce(p_term, ''), '\s+', ' ', 'g'))), 80);
    v_id   INT;
BEGIN
    IF char_length(v_term) < 2 THEN
        RAISE EXCEPTION 'Keyword "%" is too short', p_term USING ERRCODE = '22023';
    END IF;

    INSERT INTO keywords (term) VALUES (v_term)
    ON CONFLICT (term) DO NOTHING
    RETURNING keyword_id INTO v_id;

    IF v_id IS NULL THEN
        SELECT keyword_id INTO v_id FROM keywords WHERE term = v_term;
    END IF;
    RETURN v_id;
END;
$$;

-- Find an author by OpenAlex id, then ORCID, then exact name; create one if nothing matches.
CREATE OR REPLACE FUNCTION fn_get_or_create_author(
    p_name            TEXT,
    p_orcid           TEXT DEFAULT NULL,
    p_openalex_id     TEXT DEFAULT NULL,
    p_institution_id  INT  DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_name TEXT := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
    v_id   INT;
BEGIN
    IF char_length(v_name) < 2 THEN
        RAISE EXCEPTION 'Author name "%" is too short', p_name USING ERRCODE = '22023';
    END IF;

    IF p_openalex_id IS NOT NULL THEN
        SELECT author_id INTO v_id FROM authors WHERE openalex_id = p_openalex_id;
    END IF;
    IF v_id IS NULL AND p_orcid IS NOT NULL THEN
        SELECT author_id INTO v_id FROM authors WHERE orcid = p_orcid;
    END IF;
    IF v_id IS NULL AND p_openalex_id IS NULL AND p_orcid IS NULL THEN
        SELECT author_id INTO v_id FROM authors WHERE lower(full_name) = lower(v_name) ORDER BY author_id LIMIT 1;
    END IF;

    IF v_id IS NULL THEN
        INSERT INTO authors (full_name, orcid, openalex_id, institution_id)
        VALUES (left(v_name, 150), p_orcid, p_openalex_id, p_institution_id)
        RETURNING author_id INTO v_id;
    END IF;
    RETURN v_id;
END;
$$;

-- h-index: the largest h such that the author has h papers with at least h citations each.
-- Uses a window function to rank the author's papers by citations.
CREATE OR REPLACE FUNCTION fn_author_h_index(p_author_id INT)
RETURNS INT
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(MAX(rn), 0)::INT
    FROM (
        SELECT GREATEST(p.citation_count, p.external_citation_count) AS cites,
               ROW_NUMBER() OVER (ORDER BY GREATEST(p.citation_count, p.external_citation_count) DESC) AS rn
        FROM paper_authors pa
        JOIN papers p ON p.paper_id = pa.paper_id
        WHERE pa.author_id = p_author_id
          AND p.status = 'approved'
    ) ranked
    WHERE cites >= rn;
$$;

-- All domain ids in the subtree rooted at p_domain_id (the domain itself included).
-- Recursive CTE: "Artificial Intelligence" returns AI + NLP + Vision + RL.
CREATE OR REPLACE FUNCTION fn_domain_subtree(p_domain_id INT)
RETURNS TABLE (domain_id INT)
LANGUAGE sql
STABLE
AS $$
    WITH RECURSIVE subtree AS (
        SELECT d.domain_id FROM domains d WHERE d.domain_id = p_domain_id
        UNION ALL
        SELECT child.domain_id
        FROM domains child
        JOIN subtree s ON child.parent_domain_id = s.domain_id
    )
    SELECT subtree.domain_id FROM subtree;
$$;

-- Insert a paper together with its authors, keywords and references.
-- Called inside the application's upload transaction: if any step fails
-- (bad DOI, duplicate, invalid author) every insert is rolled back together.
CREATE OR REPLACE PROCEDURE sp_add_paper(
    p_title           TEXT,
    p_abstract        TEXT,
    p_doi             TEXT,
    p_year            INT,
    p_venue_id        INT,
    p_domain_id       INT,
    p_uploaded_by     INT,
    p_status          TEXT,
    p_author_names    TEXT[],
    p_keywords        TEXT[],
    p_cited_paper_ids INT[],
    INOUT p_paper_id  INT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_author_count INT := coalesce(array_length(p_author_names, 1), 0);
    v_author_id    INT;
    v_term         TEXT;
    i              INT;
BEGIN
    IF v_author_count = 0 THEN
        RAISE EXCEPTION 'A paper needs at least one author' USING ERRCODE = '23514';
    END IF;
    IF v_author_count > 50 THEN
        RAISE EXCEPTION 'A paper may list at most 50 authors' USING ERRCODE = '23514';
    END IF;

    INSERT INTO papers (title, abstract, doi, publication_year, venue_id, domain_id, uploaded_by, status)
    VALUES (btrim(p_title), NULLIF(btrim(p_abstract), ''), NULLIF(lower(btrim(p_doi)), ''),
            p_year, p_venue_id, p_domain_id, p_uploaded_by, coalesce(p_status, 'pending'))
    RETURNING paper_id INTO p_paper_id;

    FOR i IN 1 .. v_author_count LOOP
        v_author_id := fn_get_or_create_author(p_author_names[i]);
        -- The same person listed twice keeps their first position.
        INSERT INTO paper_authors (paper_id, author_id, author_order)
        VALUES (p_paper_id, v_author_id, i)
        ON CONFLICT (paper_id, author_id) DO NOTHING;
    END LOOP;

    FOREACH v_term IN ARRAY coalesce(p_keywords, ARRAY[]::TEXT[]) LOOP
        IF char_length(btrim(v_term)) >= 2 THEN
            INSERT INTO paper_keywords (paper_id, keyword_id)
            VALUES (p_paper_id, fn_get_or_create_keyword(v_term))
            ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;

    -- Only reference papers that exist; unknown ids are ignored.
    INSERT INTO citations (citing_paper_id, cited_paper_id)
    SELECT p_paper_id, cited.id
    FROM unnest(coalesce(p_cited_paper_ids, ARRAY[]::INT[])) AS cited (id)
    WHERE cited.id <> p_paper_id
      AND EXISTS (SELECT 1 FROM papers p WHERE p.paper_id = cited.id)
    ON CONFLICT DO NOTHING;
END;
$$;
