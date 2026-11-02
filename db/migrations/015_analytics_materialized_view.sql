-- 015: pre-computed analytics.
-- A materialized view stores the result of an expensive GROUP BY on disk.
-- Dashboards read it instantly; it is refreshed on demand instead of on every page load.

CREATE MATERIALIZED VIEW mv_domain_year_trends AS
SELECT
    d.domain_id,
    d.name                                   AS domain_name,
    COALESCE(parent.name, d.name)            AS root_domain,
    p.publication_year,
    COUNT(*)                                 AS paper_count,
    SUM(p.citation_count)                    AS platform_citations,
    SUM(p.external_citation_count)           AS external_citations,
    ROUND(AVG(p.external_citation_count), 1) AS avg_external_citations
FROM papers p
JOIN domains d          ON d.domain_id = p.domain_id
LEFT JOIN domains parent ON parent.domain_id = d.parent_domain_id
WHERE p.status = 'approved'
GROUP BY d.domain_id, d.name, parent.name, p.publication_year
WITH DATA;

-- A unique index is required for REFRESH ... CONCURRENTLY (readers are not blocked).
CREATE UNIQUE INDEX uq_mv_domain_year ON mv_domain_year_trends (domain_id, publication_year);

-- Only the owner of a materialized view may refresh it. This SECURITY DEFINER function
-- runs with the owner's rights, so app_user can refresh analytics without owning tables.
-- search_path is pinned so the function cannot be tricked into using another schema.
CREATE OR REPLACE FUNCTION fn_refresh_analytics()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_domain_year_trends;
    RETURN now();
END;
$$;

-- Functions are executable by PUBLIC by default; restrict this one to the app role.
REVOKE ALL ON FUNCTION fn_refresh_analytics() FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT EXECUTE ON FUNCTION fn_refresh_analytics() TO app_user;
        GRANT SELECT ON mv_domain_year_trends TO app_user;
    END IF;
END
$$;
