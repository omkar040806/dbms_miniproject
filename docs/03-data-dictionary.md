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
