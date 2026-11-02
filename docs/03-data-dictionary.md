# Data Dictionary

Every table, column, type and constraint in the PostgreSQL schema.
PK = primary key, FK = foreign key, UK = unique, NN = not null.

## users

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| user_id | INT identity | PK | Surrogate key |
| full_name | VARCHAR(120) | NN, at least 2 characters | Display name |
| email | CITEXT | NN, UK, CHECK email format | Login name; case-insensitive |
| password_hash | CHAR(60) | NN, CHECK bcrypt format | bcrypt hash; the CHECK rejects plain-text passwords |
| role | VARCHAR(20) | NN, CHECK in (researcher, admin), default researcher | Authorization role |
| is_active | BOOLEAN | NN, default true | Deactivated users cannot log in |
| created_at | TIMESTAMPTZ | NN, default now() | Registration time |
| last_login_at | TIMESTAMPTZ | | Updated on each login |

## institutions

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| institution_id | INT identity | PK | |
| name | VARCHAR(255) | NN, UK | University or lab |
| country_code | CHAR(2) | CHECK two capital letters | ISO 3166 country |
| openalex_id | VARCHAR(20) | UK | Source id for imported data |

## venues

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| venue_id | INT identity | PK | |
| name | VARCHAR(255) | NN, UK with venue_type | Journal or conference name |
| venue_type | VARCHAR(20) | NN, CHECK in (journal, conference, preprint, book, other) | |
| publisher | VARCHAR(255) | | |
| openalex_id | VARCHAR(20) | UK | |

## domains

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| domain_id | INT identity | PK | |
| name | VARCHAR(100) | NN, UK | Research area |
| description | VARCHAR(500) | | |
| parent_domain_id | INT | FK → domains, CHECK not its own parent | Builds the hierarchy (AI → NLP) |

## authors

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| author_id | INT identity | PK | |
| full_name | VARCHAR(150) | NN, at least 2 characters | |
| orcid | VARCHAR(19) | UK, CHECK ORCID pattern | e.g. 0000-0002-1825-0097 |
| openalex_id | VARCHAR(20) | UK | |
| institution_id | INT | FK → institutions, ON DELETE SET NULL | Current affiliation |
| user_id | INT | FK → users, UK, ON DELETE SET NULL | Set when a user claims this profile |
| created_at | TIMESTAMPTZ | NN, default now() | |

## papers

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| paper_id | INT identity | PK | |
| title | VARCHAR(500) | NN, at least 5 characters | |
| abstract | TEXT | at most 10,000 characters | |
| doi | VARCHAR(255) | UK (case-insensitive index), CHECK DOI pattern | e.g. 10.1145/3292500 |
| openalex_id | VARCHAR(20) | UK | |
| publication_year | SMALLINT | NN, CHECK 1900–2100 | |
| venue_id | INT | FK → venues, ON DELETE SET NULL | |
| domain_id | INT | NN, FK → domains, ON DELETE RESTRICT | |
| uploaded_by | INT | FK → users, ON DELETE SET NULL | NULL for imported papers |
| status | VARCHAR(10) | NN, CHECK in (pending, approved, rejected), default pending | Moderation state |
| pdf_path | VARCHAR(300) | | Relative path inside the uploads folder |
| citation_count | INT | NN, CHECK ≥ 0, default 0 | Citations inside this platform; maintained by trigger |
| external_citation_count | INT | NN, CHECK ≥ 0, default 0 | Global count reported by OpenAlex |
| search_vector | TSVECTOR | generated, stored | Title (weight A) + abstract (weight B) for full-text search |
| pdf_size_bytes | INT | CHECK 1 byte to 50 MB; added by migration 011 (ALTER TABLE) | Size of the uploaded PDF |
| pdf_sha256 | CHAR(64) | CHECK lowercase hex; added by migration 011 | Checksum to detect a corrupted or swapped file |
| | | CHECK ck_papers_pdf_complete | pdf_path, pdf_size_bytes and pdf_sha256 are all set or all NULL |
| created_at / updated_at | TIMESTAMPTZ | NN | updated_at maintained by trigger |

## paper_authors

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| paper_id | INT | PK, FK → papers, ON DELETE CASCADE | |
| author_id | INT | PK, FK → authors, ON DELETE CASCADE | |
| author_order | SMALLINT | NN, CHECK > 0, UK with paper_id | 1 = first author |

## keywords and paper_keywords

| Table.Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| keywords.keyword_id | INT identity | PK | |
| keywords.term | VARCHAR(80) | NN, UK, CHECK lowercase and trimmed | |
| paper_keywords.paper_id | INT | PK, FK → papers, CASCADE | |
| paper_keywords.keyword_id | INT | PK, FK → keywords, CASCADE | |

## citations

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| citing_paper_id | INT | PK, FK → papers, CASCADE | The paper that contains the reference |
| cited_paper_id | INT | PK, FK → papers, CASCADE | The paper being referenced |
| created_at | TIMESTAMPTZ | NN | |
| | | CHECK citing ≠ cited | A paper cannot cite itself |

## paper_embeddings

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| paper_id | INT | PK, FK → papers, CASCADE | One vector per paper |
| model_name | VARCHAR(100) | NN | e.g. Xenova/all-MiniLM-L6-v2 |
| embedding | VECTOR(384) | NN, HNSW index (cosine) | |
| source_text_hash | CHAR(64) | NN | SHA-256 of the embedded text; detects stale vectors |
| embedded_at | TIMESTAMPTZ | NN | |

## collections, collection_papers, reading_list, notes

| Table.Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| collections.collection_id | INT identity | PK | |
| collections.user_id | INT | NN, FK → users, CASCADE | Owner |
| collections.name | VARCHAR(80) | NN, UK with user_id | |
| collections.description | VARCHAR(500) | | |
| collections.is_public | BOOLEAN | NN, default false | |
| collection_papers.(collection_id, paper_id) | INT, INT | PK, both FK, CASCADE | |
| collection_papers.added_at | TIMESTAMPTZ | NN | |
| reading_list.(user_id, paper_id) | INT, INT | PK, both FK, CASCADE | |
| reading_list.status | VARCHAR(10) | NN, CHECK in (to_read, reading, read) | |
| reading_list.is_bookmarked | BOOLEAN | NN, default false | |
| notes.note_id | INT identity | PK | |
| notes.user_id / paper_id | INT | NN, FK, CASCADE | |
| notes.body | TEXT | NN, CHECK 1–5000 characters | |

## moderation_log

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| log_id | BIGINT identity | PK | |
| paper_id | INT | FK → papers, ON DELETE SET NULL | NULL once the paper is deleted |
| paper_title | VARCHAR(500) | NN | Snapshot so the log stays readable after deletion |
| actor_id | INT | FK → users, ON DELETE SET NULL | Who acted |
| action | VARCHAR(10) | NN, CHECK in (submit, approve, reject, reopen, delete) | |
| old_status / new_status | VARCHAR(10) | | |
| reason | VARCHAR(1000) | CHECK required (≥ 5 characters) when action = reject | |
| created_at | TIMESTAMPTZ | NN | |

## paper_views

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| view_id | BIGINT identity | PK | |
| paper_id | INT | NN, FK → papers, CASCADE | |
| user_id | INT | FK → users, SET NULL | NULL for guests |
| viewed_at | TIMESTAMPTZ | NN | Feeds "most viewed" analytics |

## graph_sync_queue

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| job_id | BIGINT identity | PK | Processing order |
| entity | VARCHAR(12) | NN, CHECK in (paper, citation, authorship) | |
| op | VARCHAR(6) | NN, CHECK in (upsert, delete) | |
| payload | JSONB | NN, CHECK is a JSON object | Ids needed to sync, e.g. {"paper_id": 12} |
| created_at | TIMESTAMPTZ | NN | |
| processed_at | TIMESTAMPTZ | | NULL = still pending (partial index) |
| attempts | SMALLINT | NN, default 0 | Retries after a Neo4j error |
| last_error | VARCHAR(1000) | | |

## Views

| View | Type | Columns | Used by |
| --- | --- | --- | --- |
| v_paper_details | View (LATERAL joins) | paper columns + domain_name, parent_domain_name, venue_name, venue_type, authors (JSON, ordered), author_names, keywords (array) | Paper pages, search results, library |
| v_author_stats | View (GROUP BY) | author, institution, paper_count, platform_citations, external_citations, first_year, last_year | Researcher profiles |
| mv_domain_year_trends | Materialized view, unique index (domain_id, publication_year) | domain, root_domain, publication_year, paper_count, citation sums, average citations | Analytics trend chart |

## Functions and procedures

| Name | Kind | Purpose |
| --- | --- | --- |
| fn_get_or_create_keyword(term) | Function, plpgsql | Normalize a keyword and return its id |
| fn_get_or_create_author(name, orcid, openalex_id, institution_id) | Function, plpgsql | Match an author by id, ORCID or name, or create one |
| fn_author_h_index(author_id) | Function, SQL, STABLE | h-index using ROW_NUMBER() |
| fn_domain_subtree(domain_id) | Function, SQL, recursive CTE | A domain and all its sub-domains |
| sp_add_paper(...) | Procedure, plpgsql | Insert a paper with authors, keywords and references in one call |
| fn_refresh_analytics() | Function, SECURITY DEFINER | Lets app_user refresh the materialized view it does not own |

## Triggers

| Trigger | Table and timing | Effect |
| --- | --- | --- |
| trg_papers_updated_at | papers, BEFORE UPDATE OF edited columns | Sets updated_at |
| trg_notes_updated_at, trg_reading_list_updated_at | BEFORE UPDATE | Sets updated_at |
| trg_citations_count | citations, AFTER INSERT OR DELETE | Keeps papers.citation_count correct |
| trg_papers_moderation_insert / _update / _delete | papers, AFTER | Writes moderation_log (actor and reason from SET LOCAL settings) |
| trg_papers_graph_sync | papers, AFTER INSERT/DELETE/UPDATE OF status, title, year, domain | Queues Neo4j sync jobs |
| trg_citations_graph_sync | citations, AFTER INSERT OR DELETE | Queues citation sync jobs |
| trg_paper_authors_graph_sync | paper_authors, AFTER INSERT OR DELETE | Queues a paper re-sync |

## Indexes (beyond primary keys and unique constraints)

| Index | Type | Purpose |
| --- | --- | --- |
| idx_papers_search_vector | GIN | Full-text search |
| uq_papers_doi_lower | Unique, expression lower(doi) | Case-insensitive DOI uniqueness |
| idx_papers_approved_year_cites | B-tree, partial (approved), composite | Browse by year sorted by citations |
| idx_papers_approved_domain_year | B-tree, partial, composite | Domain + year filters |
| idx_paper_embeddings_hnsw | HNSW (vector_cosine_ops) | Nearest-neighbour vector search |
| idx_authors_name_trgm | GIN (gin_trgm_ops) | Fuzzy and ILIKE author search |
| idx_reading_list_user_status | B-tree with INCLUDE (covering) | Library page |
| idx_sync_pending | B-tree, partial (processed_at IS NULL) | Finding pending sync jobs |
| idx_citations_cited | B-tree | "Cited by" lookups and recursive traversal |
| Foreign-key indexes | B-tree | Joins and ON DELETE checks (PostgreSQL does not index FKs automatically) |
