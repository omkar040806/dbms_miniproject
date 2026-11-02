-- 011: schema change for the PDF upload feature (ALTER TABLE).
-- Uploads store the file on disk; the database keeps its size and SHA-256
-- checksum so a corrupted or swapped file can be detected.

ALTER TABLE papers
    ADD COLUMN pdf_size_bytes INT,
    ADD COLUMN pdf_sha256     CHAR(64);

-- Longer paths: uploads/<year>/<uuid>.pdf
ALTER TABLE papers ALTER COLUMN pdf_path TYPE VARCHAR(400);

ALTER TABLE papers
    ADD CONSTRAINT ck_papers_pdf_size     CHECK (pdf_size_bytes IS NULL OR pdf_size_bytes BETWEEN 1 AND 52428800),
    ADD CONSTRAINT ck_papers_pdf_sha256   CHECK (pdf_sha256 IS NULL OR pdf_sha256 ~ '^[0-9a-f]{64}$'),
    -- All three PDF columns are set together, or none of them.
    ADD CONSTRAINT ck_papers_pdf_complete CHECK (
        (pdf_path IS NULL AND pdf_size_bytes IS NULL AND pdf_sha256 IS NULL) OR
        (pdf_path IS NOT NULL AND pdf_size_bytes IS NOT NULL AND pdf_sha256 IS NOT NULL)
    );

COMMENT ON COLUMN papers.pdf_sha256 IS 'SHA-256 of the uploaded PDF, hex encoded.';
