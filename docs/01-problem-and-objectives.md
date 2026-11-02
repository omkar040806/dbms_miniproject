# Problem Statement, Objectives and Scope

## Problem statement

Researchers and students lose hours finding relevant papers. Keyword search misses papers
that describe the same idea in different words ("teaching computers to read" vs "natural
language understanding"). Citation relationships, which show how ideas build on each other,
are hidden inside reference lists. Personal reading lists live in scattered folders and
browser bookmarks, and nobody sees which research areas are growing.

## Proposed solution

A web platform that stores papers with rich metadata and lets users:

1. Search by keywords, metadata filters, **or meaning** (vector similarity search).
2. Get **similar-paper recommendations** from embeddings.
3. Explore the **citation network** and **co-author network** as interactive graphs.
4. Keep **collections, bookmarks, reading status and notes**.
5. See **analytics** on research domains, citation trends and popular papers.
6. Submit papers through a **moderated workflow** run by administrators.

## Objectives

| # | Objective | Measured by |
| --- | --- | --- |
| O1 | Design a normalized relational schema with enforced integrity | 18 tables in 3NF, constraints rejecting invalid data in tests |
| O2 | Support semantic discovery | Top-10 semantic results relevant for test queries |
| O3 | Model citations and co-authorship as a graph | Multi-hop Cypher queries answer in under 1 second |
| O4 | Demonstrate advanced database features | Transactions, procedures, triggers, views, indexes, full-text and vector search |
| O5 | Secure, role-based web application | Researcher and admin roles enforced on every API route |

## Scope

**In scope:** paper metadata and PDF upload, full-text, metadata and semantic search, similar
papers, citation and co-author graphs, researcher profiles, collections, reading status,
notes, moderation, user management, analytics dashboards, import of real metadata from
OpenAlex.

**Out of scope:** extracting text from full PDFs for search, peer review, payments, email
notifications, deployment to a public server.

## Users and roles

| Role | Can do |
| --- | --- |
| Guest (not logged in) | Browse and search approved papers, view profiles, graphs and analytics |
| Researcher | Everything a guest can, plus upload papers, manage collections, reading status and notes |
| Admin | Everything a researcher can, plus approve or reject papers, delete papers, manage users, refresh analytics and the graph |

## Functional requirements

| ID | Requirement | Role |
| --- | --- | --- |
| FR1 | Register and log in with email and password | Guest |
| FR2 | Upload a paper with title, abstract, authors, keywords, year, venue, domain, references and an optional PDF | Researcher |
| FR3 | New uploads stay pending until an admin approves or rejects them with a reason | Admin |
| FR4 | Keyword search with filters: domain (including sub-domains), year range, author, venue type, minimum citations | All |
| FR5 | Semantic search and hybrid search (keywords + meaning) | All |
| FR6 | Similar-paper recommendations on every paper page | All |
| FR7 | Citation network explorer (1–3 hops) and shortest citation path between two papers | All |
| FR8 | Researcher profile with papers, statistics, h-index and co-author network | All |
| FR9 | Collections, bookmarks, reading status and private notes | Researcher |
| FR10 | Analytics: papers per domain, citation trends, top papers, most viewed papers, top authors | All |
| FR11 | Manage users: change role, deactivate accounts | Admin |
| FR12 | Audit log of every submission and moderation decision | Admin |
