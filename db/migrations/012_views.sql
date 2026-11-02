-- 012: views that hide multi-table joins behind one name.
-- Queries in the app select from these instead of repeating the same joins.

-- One row per paper with its domain, venue, ordered authors and keywords.
CREATE VIEW v_paper_details AS
SELECT
    p.paper_id,
    p.title,
    p.abstract,
    p.doi,
    p.publication_year,
    p.status,
    p.citation_count,
    p.external_citation_count,
    (p.pdf_path IS NOT NULL)          AS has_pdf,
    p.pdf_size_bytes,
    p.uploaded_by,
    p.created_at,
    p.updated_at,
    d.domain_id,
    d.name                            AS domain_name,
    parent.name                       AS parent_domain_name,
    v.venue_id,
    v.name                            AS venue_name,
    v.venue_type,
    COALESCE(au.authors, '[]'::json)  AS authors,
    COALESCE(au.author_names, '')     AS author_names,
    COALESCE(kw.keywords, ARRAY[]::TEXT[]) AS keywords
FROM papers p
JOIN domains d            ON d.domain_id = p.domain_id
LEFT JOIN domains parent  ON parent.domain_id = d.parent_domain_id
LEFT JOIN venues v        ON v.venue_id = p.venue_id
-- LATERAL subqueries aggregate the many authors/keywords into one value per paper.
LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('author_id', a.author_id, 'full_name', a.full_name, 'author_order', pa.author_order)
                    ORDER BY pa.author_order) AS authors,
           string_agg(a.full_name, ', ' ORDER BY pa.author_order) AS author_names
    FROM paper_authors pa
    JOIN authors a ON a.author_id = pa.author_id
    WHERE pa.paper_id = p.paper_id
) au ON TRUE
LEFT JOIN LATERAL (
    SELECT array_agg(k.term ORDER BY k.term) AS keywords
    FROM paper_keywords pk
    JOIN keywords k ON k.keyword_id = pk.keyword_id
    WHERE pk.paper_id = p.paper_id
) kw ON TRUE;

COMMENT ON VIEW v_paper_details IS 'Paper with domain, venue, ordered authors (JSON) and keywords (array).';

-- One row per author with publication statistics over approved papers.
CREATE VIEW v_author_stats AS
SELECT
    a.author_id,
    a.full_name,
    a.orcid,
    a.user_id,
    i.name                                     AS institution_name,
    i.country_code,
    COUNT(p.paper_id)                          AS paper_count,
    COALESCE(SUM(p.citation_count), 0)         AS platform_citations,
    COALESCE(SUM(p.external_citation_count), 0) AS external_citations,
    MIN(p.publication_year)                    AS first_year,
    MAX(p.publication_year)                    AS last_year
FROM authors a
LEFT JOIN institutions i  ON i.institution_id = a.institution_id
LEFT JOIN paper_authors pa ON pa.author_id = a.author_id
LEFT JOIN papers p        ON p.paper_id = pa.paper_id AND p.status = 'approved'
GROUP BY a.author_id, i.institution_id;

COMMENT ON VIEW v_author_stats IS 'Author with paper count, citation totals and active years (approved papers only).';
