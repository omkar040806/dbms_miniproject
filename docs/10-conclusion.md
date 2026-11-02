# Conclusion and Future Enhancements

## Conclusion

The Research Paper & Knowledge Discovery Platform shows that one application can use three
database paradigms, each where it fits best:

- **PostgreSQL** keeps all records consistent with 18 normalized tables, foreign keys,
  CHECK constraints, transactions, a stored procedure, functions, triggers, views and a
  materialized view. Invalid data is rejected by the database itself, not only by the app.
- **pgvector** adds semantic search inside the same database: papers are found by meaning,
  filtered with ordinary SQL, and merged with full-text results by Reciprocal Rank Fusion.
- **Neo4j** answers graph questions (multi-hop citation neighbourhoods, shortest citation
  paths, co-author networks, co-citation recommendations) with short Cypher patterns. A
  trigger-fed outbox keeps it in step with PostgreSQL, which stays the source of truth.

The Next.js interface exposes every feature through a role-based API layer, with security
measures at each level: hashed passwords enforced by a constraint, httpOnly session cookies,
role checks on every route, a least-privilege database role and login throttling.

## Objectives met

| Objective | Evidence |
| --- | --- |
| O1 Normalized schema with enforced integrity | `docs/02-er-diagram-and-schema.md`, 25 database tests |
| O2 Semantic discovery | Semantic and hybrid search modes, similar papers |
| O3 Graph model for citations and co-authorship | Citation explorer, shortest path, co-author network |
| O4 Advanced database features | Transactions, procedure, functions, triggers, views, materialized view, partial/trigram/HNSW indexes, full-text and vector search, recursive CTEs, window functions |
| O5 Secure role-based application | Researcher and admin roles; `docs/08-architecture.md` security table |

## Limitations

- The embedding model reads only the first 256 tokens, so long abstracts are truncated and
  full-text PDFs are not embedded.
- Citations exist only between papers stored on the platform; references to outside papers
  are dropped during import.
- Login throttling is kept in server memory, so it resets on restart and is per instance.
- Author disambiguation is basic (OpenAlex id, ORCID, then exact name).

## Future enhancements

1. **Full-text PDF processing:** extract text, split it into chunks, store one vector per
   chunk, and answer questions about a paper (retrieval-augmented generation).
2. **Science-specific embeddings** (SPECTER2) served by a small Python service.
3. **Graph algorithms** with the Neo4j Graph Data Science library: PageRank for influential
   papers, community detection for research clusters.
4. **Alerts:** email researchers when a new paper cites one of their papers.
5. **Citation export** in BibTeX and RIS for collections.
6. **Shared rate limiting and sessions** in Redis for multi-server deployment.
7. **Deployment** with managed PostgreSQL (with pgvector) and Neo4j Aura.
