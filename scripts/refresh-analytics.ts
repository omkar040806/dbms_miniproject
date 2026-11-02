/**
 * Refresh the analytics materialized view.
 *   npm run analytics:refresh
 * Run after a bulk import; the app also refreshes it after each approval.
 */
import "./lib/env";
import { getPool } from "@/lib/db/pool";
import { refreshAnalytics } from "@/lib/db/queries/analytics";

refreshAnalytics()
  .then((at) => console.log(`mv_domain_year_trends refreshed at ${at}`))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
