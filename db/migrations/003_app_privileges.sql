-- 003: least-privilege access for the web application.
-- The app connects as app_user, which may read and change rows but never
-- CREATE, ALTER or DROP anything. app_user is created by db/init/01-create-app-role.sh.
-- ALTER DEFAULT PRIVILEGES makes every table created by later migrations available too.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT USAGE ON SCHEMA public TO app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
        -- The migration bookkeeping table is not the app's business.
        REVOKE ALL ON schema_migrations FROM app_user;
    ELSE
        RAISE NOTICE 'Role app_user does not exist; skipping grants (run db/init/01-create-app-role.sh first).';
    END IF;

    -- Nobody except the owner may create objects in the public schema.
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
END
$$;
