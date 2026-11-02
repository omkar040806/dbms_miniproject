-- 002: application users and their roles.

CREATE TABLE users (
    user_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name      VARCHAR(120) NOT NULL,
    email          CITEXT       NOT NULL,
    password_hash  CHAR(60)     NOT NULL,
    role           VARCHAR(20)  NOT NULL DEFAULT 'researcher',
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_login_at  TIMESTAMPTZ,

    CONSTRAINT uq_users_email         UNIQUE (email),
    CONSTRAINT ck_users_name          CHECK (char_length(btrim(full_name)) >= 2),
    CONSTRAINT ck_users_email_format  CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    -- Integrity rule: only bcrypt hashes are accepted, so a plain-text password can never be stored.
    CONSTRAINT ck_users_password_is_bcrypt CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'),
    CONSTRAINT ck_users_role          CHECK (role IN ('researcher', 'admin'))
);

COMMENT ON TABLE  users IS 'Platform accounts. Role decides what each user may do.';
COMMENT ON COLUMN users.password_hash IS 'bcrypt hash (60 characters). Plain text is rejected by ck_users_password_is_bcrypt.';
