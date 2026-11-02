-- 004: reference data for papers: institutions, venues, research domains and authors.

CREATE TABLE institutions (
    institution_id  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    country_code    CHAR(2),
    openalex_id     VARCHAR(20),

    CONSTRAINT uq_institutions_name     UNIQUE (name),
    CONSTRAINT uq_institutions_openalex UNIQUE (openalex_id),
    CONSTRAINT ck_institutions_country  CHECK (country_code ~ '^[A-Z]{2}$')
);

CREATE TABLE venues (
    venue_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name         VARCHAR(255) NOT NULL,
    venue_type   VARCHAR(20)  NOT NULL DEFAULT 'journal',
    publisher    VARCHAR(255),
    openalex_id  VARCHAR(20),

    CONSTRAINT uq_venues_name_type UNIQUE (name, venue_type),
    CONSTRAINT uq_venues_openalex  UNIQUE (openalex_id),
    CONSTRAINT ck_venues_type      CHECK (venue_type IN ('journal', 'conference', 'preprint', 'book', 'other'))
);

-- Self-referencing table: a domain may have a parent (Artificial Intelligence -> NLP).
CREATE TABLE domains (
    domain_id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name              VARCHAR(100) NOT NULL,
    description       VARCHAR(500),
    parent_domain_id  INT REFERENCES domains (domain_id) ON DELETE RESTRICT,

    CONSTRAINT uq_domains_name           UNIQUE (name),
    CONSTRAINT ck_domains_not_own_parent CHECK (parent_domain_id IS NULL OR parent_domain_id <> domain_id)
);

CREATE TABLE authors (
    author_id       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name       VARCHAR(150) NOT NULL,
    orcid           VARCHAR(19),
    openalex_id     VARCHAR(20),
    institution_id  INT REFERENCES institutions (institution_id) ON DELETE SET NULL,
    user_id         INT REFERENCES users (user_id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_authors_orcid    UNIQUE (orcid),
    CONSTRAINT uq_authors_openalex UNIQUE (openalex_id),
    CONSTRAINT uq_authors_user     UNIQUE (user_id),   -- one profile per user (1 : 0..1)
    CONSTRAINT ck_authors_name     CHECK (char_length(btrim(full_name)) >= 2),
    CONSTRAINT ck_authors_orcid    CHECK (orcid ~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$')
);

-- Foreign-key columns are not indexed automatically in PostgreSQL.
CREATE INDEX idx_authors_institution ON authors (institution_id);
CREATE INDEX idx_domains_parent      ON domains (parent_domain_id);

-- Reference data: the domain hierarchy used for classification and filtering.
INSERT INTO domains (name, description) VALUES
    ('Artificial Intelligence', 'Machine intelligence: learning, language, vision and decision making'),
    ('Data Management', 'Storing, querying, retrieving and connecting data at scale');

INSERT INTO domains (name, description, parent_domain_id)
SELECT child.name, child.description, parent.domain_id
FROM (VALUES
        ('Natural Language Processing', 'Language models, translation, question answering', 'Artificial Intelligence'),
        ('Computer Vision', 'Image recognition, detection and generation', 'Artificial Intelligence'),
        ('Reinforcement Learning', 'Agents that learn by trial and error', 'Artificial Intelligence'),
        ('Database Systems', 'Query processing, storage, transactions', 'Data Management'),
        ('Information Retrieval', 'Search engines, ranking, recommendation', 'Data Management'),
        ('Graph Data and Knowledge Graphs', 'Graph databases, knowledge graphs, graph learning', 'Data Management')
     ) AS child (name, description, parent_name)
JOIN domains parent ON parent.name = child.parent_name;
