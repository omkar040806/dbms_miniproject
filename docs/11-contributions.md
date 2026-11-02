# Individual Contributions

Both members worked on the database **and** the application. Each member made five
commits, one pull request each, reviewed and merged by the other member. GitHub's commit
history (Insights → Contributors, and each pull request) is the detailed record.

| Area | Member A | Member B |
| --- | --- | --- |
| Setup | Next.js scaffold, Tailwind, UI components, layout | Repository, Docker Compose, app_user init script, migration runner, pg pool |
| Database design | Paper-side ER entities, data model for vectors | ER diagram, relational schema, data dictionary |
| DDL migrations | 004 reference tables, 005 papers + full-text, 006 citations, 007 embeddings + HNSW, 008 library, 009 moderation log + outbox tables, 010 functions + procedure, 011 ALTER for PDFs, 014 indexes + DROP | 001 extensions, 002 users, 003 privileges, 012 views, 013 triggers (which write the citation counts, moderation log and outbox), 015 materialized view |
| Advanced DB features | Transaction + `sp_add_paper`, functions (keyword, author, h-index, domain subtree), full-text search, vector search, hybrid RRF, partial/trigram/covering indexes | Triggers (counter, audit, outbox), views, materialized view + SECURITY DEFINER, row locking (`FOR UPDATE`, `SKIP LOCKED`), Neo4j model and Cypher |
| Backend / API | Papers, upload, search, authors, library, collections, notes, embeddings | Auth, sessions, proxy, admin moderation, users, graph, analytics, rate limiting |
| Pages | Home, search, paper detail, upload, my uploads, author profile, library, collections | Login, register, admin (queue, log, users, system), citation graph, co-author network, recommendations, analytics |
| Scripts | OpenAlex import, sample data, embeddings, EXPLAIN report | Migrate, create admin, graph sync and rebuild, analytics refresh |
| Tests | Paper constraint DB tests, OpenAlex, embeddings, search SQL unit tests | Trigger DB tests, auth and rate-limit unit tests, test helpers |
| Documentation | Problem statement, objectives, scope, database choice, vector search, important queries (A), conclusion, demo script | ER and schema, data dictionary, graph model, architecture, important queries (B), testing, README |

## Commits

| # | Member | Commit |
| --- | --- | --- |
| 1 | B | Repository, Docker services, ER diagram and data dictionary |
| 2 | A | Next.js scaffold, UI components, layout, problem statement |
| 3 | B | pg pool, migration runner, users schema (001-003), authentication |
| 4 | A | Paper catalogue schema (004-011), routines, OpenAlex import |
| 5 | B | Views and triggers (012-013) with trigger tests |
| 6 | A | Upload, full-text, semantic and hybrid search, profiles, library |
| 7 | B | Admin moderation, user management, Neo4j citation graph |
| 8 | A | Indexes (014), EXPLAIN report, vector search and query docs |
| 9 | B | Analytics (015), security hardening, architecture, testing docs, README |
| 10 | A | Author suggestions, conclusion, demo script, this document |
