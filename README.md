# Research Paper & Knowledge Discovery Platform

A web platform where researchers upload, search and explore research papers.
It combines three database paradigms, each holding the data it fits best:

| Data | Store | Paradigm |
| --- | --- | --- |
| Papers, authors, users, collections, notes, moderation | PostgreSQL 18 | Relational |
| One embedding per paper for semantic search | pgvector (inside PostgreSQL) | Vector |
| Citation network and co-authorship | Neo4j | Graph (NoSQL) |

DBMS Experiential Learning, Level 3 Project.

> Setup and run instructions will be completed as the project grows.

## Team

| Member | Area |
| --- | --- |
| Member A | Papers, search, vector search, personal library |
| Member B | Users and auth, admin and moderation, Neo4j graph, analytics |
