# Application Screenshots

Capture these after loading data (`npm run data:import`, `npm run embed`,
`npm run graph:rebuild`). Save them in this folder with the file names below; they are
referenced from the project report.

| File name | Page | What must be visible |
| --- | --- | --- |
| `01-home.png` | `/` | Search box, totals, domain browser |
| `02-search-keyword.png` | `/search?q=attention` | Highlighted snippets, filters |
| `03-search-semantic.png` | Semantic mode with a paraphrased query | Similarity scores |
| `04-search-hybrid.png` | Hybrid mode, query `BM25` | Exact match first |
| `05-paper.png` | A paper page | References, cited by, similar papers, library panel |
| `06-upload.png` | `/upload` | Filled form with references picked |
| `07-upload-error.png` | Upload with a duplicate DOI | Error message from the UNIQUE constraint |
| `08-admin-queue.png` | `/admin` | Pending paper with approve / reject |
| `09-audit-log.png` | `/admin/log` | Submit, approve and reject entries |
| `10-admin-users.png` | `/admin/users` | Roles and deactivate buttons |
| `11-graph.png` | `/graph?paper=<id>&depth=2` | Citation network |
| `12-shortest-path.png` | Graph page | Highlighted path and the ordered chain |
| `13-sql-vs-cypher.png` | Graph page | Both counts, timings and queries |
| `14-author.png` | An author profile | h-index, co-author network |
| `15-library.png` | `/library` | Status tabs, collections, recommendations |
| `16-analytics.png` | `/analytics` | Charts and tables |
| `17-neo4j-browser.png` | `localhost:7474` | `MATCH (p:Paper)-[r:CITES]->(q) RETURN p, r, q LIMIT 100` |
| `18-pgadmin-er.png` | pgAdmin or DBeaver | Generated ER diagram of the live schema |
| `19-tests.png` | Terminal | `npm test` summary |
| `20-explain.png` | Terminal | `npm run db:explain -- --no-seqscan` output |
