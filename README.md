# Research Paper & Knowledge Discovery Platform

Upload, search and explore research papers. Find papers by **meaning** (vector search),
follow ideas through the **citation graph**, keep a personal **library**, and see
**research trends**.

DBMS Experiential Learning, Level 3 Project.

| Data | Store | Paradigm |
| --- | --- | --- |
| Papers, authors, users, collections, notes, moderation | PostgreSQL 18 | Relational |
| One 384-dimension embedding per paper | pgvector (inside PostgreSQL) | Vector |
| Citation network and co-authorship | Neo4j | Graph (NoSQL) |

**Stack:** Next.js 16 (App Router, Route Handlers), React 19, TypeScript, Tailwind CSS 4,
`pg`, `neo4j-driver`, Transformers.js, Recharts, Vitest, Docker Compose.

## Features

- Paper upload with PDF, authors, keywords and references; admin moderation with an audit log
- Keyword search (PostgreSQL full text), semantic search (pgvector) and hybrid search (rank fusion)
- Filters: domain with sub-domains, years, author (typo-tolerant), venue type, minimum citations
- Similar-paper recommendations, citation-graph recommendations
- Interactive citation explorer, shortest citation path, SQL-vs-Cypher comparison
- Researcher profiles with h-index and co-author network
- Reading status, bookmarks, collections (private or public) and private notes
- Analytics dashboard: trends, popular domains, top papers per domain, top authors
- Roles: guest, researcher, admin

## Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | 26 LTS (22.12 or newer works) |
| Docker Desktop | Recent version (Windows: WSL 2 enabled, at least 4 GB RAM for Docker) |
| Git | Any recent version |

## Setup

```bash
# 1. Get the code
git clone https://github.com/<your-org>/research-discovery-platform.git
cd research-discovery-platform

# 2. Configuration: copy the template and replace every change_me value
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
#   - DATABASE_URL must contain the same password as APP_DB_PASSWORD
#   - MIGRATION_DATABASE_URL must contain POSTGRES_OWNER_PASSWORD
#   - AUTH_SECRET: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# 3. Start PostgreSQL + pgvector and Neo4j
docker compose up -d
docker compose ps             # wait until postgres is "healthy"

# 4. Install packages (downloads the ONNX runtime for embeddings)
npm install

# 5. Create the schema (15 migrations) and the first admin
npm run db:migrate
npm run admin:create          # uses SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD from .env

# 6. Load data: pick ONE
npm run data:sample           # 30 well-known papers, works offline
npm run data:import           # ~1,500 real papers from OpenAlex (needs OPENALEX_API_KEY)

# 7. Build the derived data
npm run embed                 # vectors for semantic search (first run downloads a 23 MB model)
npm run graph:rebuild         # copy approved papers, authors and citations into Neo4j
npm run analytics:refresh     # fill the analytics materialized view

# 8. Run
npm run dev                   # http://localhost:3000
```

Log in with the admin account from `.env`, or register a researcher account on the site.
Neo4j Browser is at http://localhost:7474 (user `neo4j`, password from `.env`).

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development server / production build / production server |
| `npm run lint` / `typecheck` | ESLint / TypeScript checks |
| `npm test` / `test:unit` / `test:db` | All tests / unit tests only / database tests only |
| `npm run db:migrate` | Apply pending SQL migrations in `db/migrations` |
| `npm run db:status` | List applied and pending migrations |
| `npm run db:reset` | **Delete everything** and re-apply all migrations (development only) |
| `npm run db:explain` | Print `EXPLAIN ANALYZE` plans for the key queries |
| `npm run admin:create` | Create the admin from `.env`, or promote and reset that user |
| `npm run data:sample` / `data:import` | Load sample papers / import from OpenAlex |
| `npm run embed` | Compute missing or stale embeddings (`-- --force` for all) |
| `npm run graph:sync` / `graph:rebuild` | Apply pending graph jobs / rebuild Neo4j from PostgreSQL |
| `npm run analytics:refresh` | Refresh `mv_domain_year_trends` |

## Project structure

```
app/                 pages and app/api/* route handlers
components/          UI components (ui/, graph/, analytics/)
lib/
  api/               error handling, request parsing
  auth/              passwords, JWT session, rate limiting
  db/                pg pool and all SQL (queries/*.ts)
  graph/             Neo4j driver, Cypher queries, sync
  embeddings/        Transformers.js model and embedding text
  validation/        Zod schemas
db/
  init/              creates the least-privilege app_user on first container start
  migrations/        001-015 SQL migrations (tables, constraints, triggers, views, ...)
  neo4j/             graph schema (constraints and indexes)
  seed/              offline sample dataset
scripts/             migrate, import, embed, graph sync/rebuild, analytics, explain
tests/               unit/ and db/ tests (Vitest)
docs/                project documentation
proxy.ts             route protection (Next.js 16 proxy)
docker-compose.yml   PostgreSQL + pgvector, Neo4j
```

## Documentation

| Document | Contents |
| --- | --- |
| [01 Problem and objectives](docs/01-problem-and-objectives.md) | Problem statement, objectives, scope, functional requirements |
| [02 ER diagram and schema](docs/02-er-diagram-and-schema.md) | ER diagram, relational schema, normalization |
| [03 Data dictionary](docs/03-data-dictionary.md) | Every table, column, constraint, view, trigger and index |
| [04 Database choice](docs/04-database-choice.md) | Why PostgreSQL, pgvector and Neo4j |
| [05 Vector search](docs/05-vector-search.md) | Embeddings, model, storage, metric, retrieval |
| [06 Graph model](docs/06-graph-model.md) | Neo4j data model and synchronization |
| [07 Important queries](docs/07-important-queries.md) | Key SQL and Cypher with the concepts they show |
| [08 Architecture](docs/08-architecture.md) | Layers, request flow, security |
| [09 Testing](docs/09-testing.md) | Automated results and manual test cases |
| [10 Conclusion](docs/10-conclusion.md) | Results, limitations, future work |
| [Demo script](docs/demo-script.md) | 10-minute demo plan and viva answers |

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `password authentication failed for user "app_user"` | `APP_DB_PASSWORD` and the password in `DATABASE_URL` differ, or the volume was created before you set it. Fix `.env`, then `docker compose down -v` and `docker compose up -d` (this deletes the data). |
| `role "app_user" does not exist` | Same cause: the init script runs only on an empty volume. Recreate the volume as above. |
| Port 5432 already in use | Set `POSTGRES_PORT=5433` and use `:5433` in both URLs. |
| `/docker-entrypoint-initdb.d/...: bad interpreter` | The script has Windows line endings. `.gitattributes` prevents this; re-clone, or run `git add --renormalize .`. |
| Neo4j container exits | `NEO4J_PASSWORD` must be at least 8 characters. |
| Graph pages say Neo4j is not reachable | `docker compose ps`; then `npm run graph:rebuild`. Approvals still work while Neo4j is down; jobs wait in `graph_sync_queue`. |
| Semantic search error on first use | The model downloads on first use; check internet access and retry. |
| `.env` value with `#` is cut short | Put it in double quotes: `PASSWORD="abc#123"`. |

## Team

| Member | Area |
| --- | --- |
| Member A | Papers and upload, full-text, semantic and hybrid search, embeddings, researcher profiles, personal library, indexes |
| Member B | Authentication and roles, admin moderation and users, triggers and views, Neo4j graph, analytics, security |
