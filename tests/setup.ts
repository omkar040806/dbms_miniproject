// Load .env so database tests can reach PostgreSQL.
import { config } from "dotenv";

config({ path: ".env", quiet: true });

// Unit tests sign tokens; use a throwaway secret when none is configured.
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
