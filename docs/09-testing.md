# Testing

Three layers of tests: automated unit tests, automated database tests that send invalid data
straight to PostgreSQL, and manual end-to-end test cases run through the browser.

## How to run

```bash
npm test            # everything (database tests are skipped if DATABASE_URL is not set)
npm run test:unit   # no database needed
npm run test:db     # needs the Docker database with migrations applied
```

Database tests run inside a transaction that is rolled back, so they leave no data behind.

## Automated results

Last run before submission: **7 test files, 57 tests, all passing**
(Vitest 5, PostgreSQL with pgvector). Re-run on your machine and paste the summary here
together with a screenshot of the terminal.

| File | Owner | What it proves | Tests |
| --- | --- | --- | --- |
| `tests/unit/auth.test.ts` | B | Registration rules, bcrypt hashing, JWT round-trip, forged token rejected | 11 |
| `tests/unit/rate-limit.test.ts` | B | Login throttling blocks after 5 failures and recovers | 3 |
| `tests/unit/openalex.test.ts` | A | Abstract reconstruction, DOI/ORCID normalization, venue mapping | 7 |
| `tests/unit/embeddings.test.ts` | A | Embedding text, hash, pgvector literal format | 4 |
| `tests/unit/search-sql.test.ts` | A | All user input becomes bind parameters; LIKE escaping; query validation | 7 |
| `tests/db/paper-constraints.test.ts` | A | CHECK, UNIQUE, FK and procedure rules on paper-side tables | 15 |
| `tests/db/triggers.test.ts` | B | Citation counter, audit log, reject-needs-reason, updated_at, outbox jobs, user rules | 10 |

## Database-level validation cases

Each row is a statement sent directly to PostgreSQL that must be rejected.

| ID | Input | Expected | Enforced by |
| --- | --- | --- | --- |
| DB-01 | User with password `password123` | Rejected, 23514 | `ck_users_password_is_bcrypt` |
| DB-02 | Second user `case@example.COM` when `Case@Example.com` exists | Rejected, 23505 | CITEXT + `uq_users_email` |
| DB-03 | Role `superuser` | Rejected, 23514 | `ck_users_role` |
| DB-04 | DOI `not-a-doi` | Rejected, 23514 | `ck_papers_doi` |
| DB-05 | Same DOI in different letter case | Rejected, 23505 | `uq_papers_doi_lower` (expression index) |
| DB-06 | Publication year 1850 | Rejected, 23514 | `ck_papers_year` |
| DB-07 | Status `published` | Rejected, 23514 | `ck_papers_status` |
| DB-08 | Domain id that does not exist | Rejected, 23503 | foreign key |
| DB-09 | Title `Hey` | Rejected, 23514 | `ck_papers_title` |
| DB-10 | Keyword `Deep Learning` (not normalized) | Rejected, 23514 | `ck_keywords_format` |
| DB-11 | `author_order` 0, or two authors at position 1 | Rejected | `ck_paper_authors_order`, `uq_paper_authors_order` |
| DB-12 | ORCID `1234` | Rejected, 23514 | `ck_authors_orcid` |
| DB-13 | Paper cites itself | Rejected, 23514 | `ck_citations_no_self` |
| DB-14 | `sp_add_paper` with no authors | Rejected, nothing inserted | procedure check + transaction |
| DB-15 | Reject a paper without a reason | Rejected, status unchanged | `ck_modlog_reject_reason` via trigger |
| DB-16 | Two collections with the same name for one user | Rejected, 23505 | `uq_collections_user_name` |
| DB-17 | Reading status `skimmed`, empty note | Rejected, 23514 | `ck_reading_list_status`, `ck_notes_body` |
| DB-18 | `app_user` runs `CREATE TABLE` or `REFRESH MATERIALIZED VIEW` | Permission denied | least-privilege grants |

## Manual end-to-end test cases

Run these in the browser before the demo and fill in the Result column.

| ID | Role | Steps | Expected result | Result |
| --- | --- | --- | --- | --- |
| E2E-01 | Guest | Open `/library` | Redirected to `/login?next=/library` | |
| E2E-02 | Guest | Register with password `short` | Error under the form, no account created | |
| E2E-03 | Guest | Register with a valid email and password | Logged in, header shows the name | |
| E2E-04 | Researcher | Open `/admin` | Redirected home with "administrators only" notice | |
| E2E-05 | Researcher | Upload a paper with a PDF and 2 references | Paper page shows "pending review"; appears under My uploads | |
| E2E-06 | Researcher | Upload a text file renamed to `.pdf` | "Only PDF files can be uploaded" | |
| E2E-07 | Researcher | Upload with a DOI that already exists | "A paper with this DOI already exists" | |
| E2E-08 | Guest | Open the pending paper's URL | "Paper not found" | |
| E2E-09 | Admin | Reject the paper with an empty reason | Error; paper stays pending | |
| E2E-10 | Admin | Approve the paper | Approved; audit log shows approve by admin | |
| E2E-11 | Guest | Keyword search for a word in the new abstract | Paper appears with the word highlighted | |
| E2E-12 | Guest | Semantic search with a paraphrase (no shared words) | Related papers ranked by similarity | |
| E2E-13 | Guest | Hybrid search for an acronym, e.g. `BM25` | Exact match ranked first | |
| E2E-14 | Guest | Filter by "Artificial Intelligence (all)" | Results include NLP, Vision and RL papers | |
| E2E-15 | Guest | Paper page | Similar papers listed; references and cited-by correct | |
| E2E-16 | Guest | Citation graph, depth 2, click a node | Node details; "Centre here" redraws the graph | |
| E2E-17 | Guest | Shortest path between two connected papers | Ordered chain, highlighted in the graph | |
| E2E-18 | Guest | SQL vs Cypher panel | Both report the same count, with timings | |
| E2E-19 | Researcher | Set "Reading", bookmark, add to a new collection, add a note | All shown on the paper page and in My library | |
| E2E-20 | Researcher | Make a collection public, open its link logged out | Visible to guests; private ones return "not found" | |
| E2E-21 | Researcher | Library recommendations | Suggestions from cited / co-cited papers | |
| E2E-22 | Guest | Author profile | Stats, h-index and co-author network | |
| E2E-23 | Admin | Deactivate a researcher who is logged in elsewhere | Their next request is treated as logged out | |
| E2E-24 | Admin | Demote yourself | "You cannot change your own role or status" | |
| E2E-25 | Admin | Stop Neo4j, approve a paper, start Neo4j, press "Sync now" | Approval succeeds with a warning; sync applies the queued job | |
| E2E-26 | Guest | Wrong password 6 times | 6th attempt: "Too many failed attempts" | |
| E2E-27 | Admin | Analytics, raise "Minimum papers" | Domains below the threshold disappear (HAVING) | |

## Performance checks

`npm run db:explain` prints `EXPLAIN ANALYZE` plans for full-text search, browsing by year,
author search, "cited by" lookups and vector search. Save its output (before and after
migration 014) for the report. On small tables PostgreSQL may prefer sequential scans;
`npm run db:explain -- --no-seqscan` shows which index each query would use.
