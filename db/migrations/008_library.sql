-- 008: a researcher's personal library: collections, reading status, bookmarks and notes.

CREATE TABLE collections (
    collection_id  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        INT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    name           VARCHAR(80)  NOT NULL,
    description    VARCHAR(500),
    is_public      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uq_collections_user_name UNIQUE (user_id, name),
    CONSTRAINT ck_collections_name      CHECK (char_length(btrim(name)) >= 1)
);

CREATE TABLE collection_papers (
    collection_id  INT NOT NULL REFERENCES collections (collection_id) ON DELETE CASCADE,
    paper_id       INT NOT NULL REFERENCES papers (paper_id)           ON DELETE CASCADE,
    added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_collection_papers PRIMARY KEY (collection_id, paper_id)
);
CREATE INDEX idx_collection_papers_paper ON collection_papers (paper_id);

-- M:N users <-> papers with attributes (status, bookmark).
CREATE TABLE reading_list (
    user_id        INT NOT NULL REFERENCES users (user_id)   ON DELETE CASCADE,
    paper_id       INT NOT NULL REFERENCES papers (paper_id) ON DELETE CASCADE,
    status         VARCHAR(10) NOT NULL DEFAULT 'to_read',
    is_bookmarked  BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_reading_list        PRIMARY KEY (user_id, paper_id),
    CONSTRAINT ck_reading_list_status CHECK (status IN ('to_read', 'reading', 'read'))
);
CREATE INDEX idx_reading_list_paper ON reading_list (paper_id);

CREATE TABLE notes (
    note_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     INT  NOT NULL REFERENCES users (user_id)   ON DELETE CASCADE,
    paper_id    INT  NOT NULL REFERENCES papers (paper_id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_notes_body CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000)
);
-- Notes are always listed per user per paper.
CREATE INDEX idx_notes_user_paper ON notes (user_id, paper_id);
CREATE INDEX idx_notes_paper      ON notes (paper_id);
