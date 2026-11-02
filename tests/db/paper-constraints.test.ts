// Database-level validation for paper-side tables (Member A).
// Each statement below is sent straight to PostgreSQL, bypassing the app,
// to prove the database itself rejects invalid data.
import { describe, expect, it } from "vitest";
import { expectDbError, hasDatabase, insertUser, withRollback } from "./helpers";

const describeDb = describe.skipIf(!hasDatabase);

async function domainId(client: import("pg").Client, name = "Natural Language Processing"): Promise<number> {
  const { rows } = await client.query<{ domain_id: number }>("SELECT domain_id FROM domains WHERE name = $1", [name]);
  return rows[0].domain_id;
}

async function insertPaper(client: import("pg").Client, overrides: Record<string, unknown> = {}): Promise<number> {
  const values = {
    title: "A valid test paper title",
    doi: null,
    publication_year: 2024,
    domain_id: await domainId(client),
    status: "pending",
    ...overrides,
  };
  const { rows } = await client.query<{ paper_id: number }>(
    `INSERT INTO papers (title, doi, publication_year, domain_id, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING paper_id`,
    [values.title, values.doi, values.publication_year, values.domain_id, values.status],
  );
  return rows[0].paper_id;
}

const PAPER_SQL = "INSERT INTO papers (title, doi, publication_year, domain_id, status) VALUES ($1, $2, $3, $4, $5)";

describeDb("papers constraints", () => {
  it("rejects a malformed DOI", () =>
    withRollback(async (client) => {
      await expectDbError(client, PAPER_SQL, ["Valid title here", "not-a-doi", 2024, await domainId(client), "pending"], {
        code: "23514",
        constraint: "ck_papers_doi",
      });
    }));

  it("rejects the same DOI twice, ignoring letter case", () =>
    withRollback(async (client) => {
      await insertPaper(client, { doi: "10.1234/abc.def" });
      await expectDbError(client, PAPER_SQL, ["Another valid title", "10.1234/ABC.DEF", 2024, await domainId(client), "pending"], {
        code: "23505",
        constraint: "uq_papers_doi_lower",
      });
    }));

  it("rejects a year outside 1900-2100", () =>
    withRollback(async (client) => {
      await expectDbError(client, PAPER_SQL, ["Valid title here", null, 1850, await domainId(client), "pending"], {
        code: "23514",
        constraint: "ck_papers_year",
      });
    }));

  it("rejects an unknown status", () =>
    withRollback(async (client) => {
      await expectDbError(client, PAPER_SQL, ["Valid title here", null, 2024, await domainId(client), "published"], {
        code: "23514",
        constraint: "ck_papers_status",
      });
    }));

  it("rejects a domain that does not exist", () =>
    withRollback(async (client) => {
      await expectDbError(client, PAPER_SQL, ["Valid title here", null, 2024, 999999, "pending"], {
        code: "23503",
        constraint: "papers_domain_id_fkey",
      });
    }));

  it("rejects a title shorter than 5 characters", () =>
    withRollback(async (client) => {
      await expectDbError(client, PAPER_SQL, ["Hey", null, 2024, await domainId(client), "pending"], {
        code: "23514",
        constraint: "ck_papers_title",
      });
    }));

  it("fills search_vector automatically (generated column)", () =>
    withRollback(async (client) => {
      const id = await insertPaper(client, { title: "Graph neural networks for molecules" });
      const { rows } = await client.query("SELECT search_vector @@ to_tsquery('english', 'molecule') AS hit FROM papers WHERE paper_id = $1", [id]);
      expect(rows[0].hit).toBe(true);
    }));
});

describeDb("authors, keywords and junction tables", () => {
  it("rejects keywords that are not lowercase", () =>
    withRollback(async (client) => {
      await expectDbError(client, "INSERT INTO keywords (term) VALUES ($1)", ["Deep Learning"], {
        code: "23514",
        constraint: "ck_keywords_format",
      });
    }));

  it("rejects author_order 0 and duplicate positions", () =>
    withRollback(async (client) => {
      const paperId = await insertPaper(client);
      const a1 = (await client.query("SELECT fn_get_or_create_author('Test Author One') AS id")).rows[0].id;
      const a2 = (await client.query("SELECT fn_get_or_create_author('Test Author Two') AS id")).rows[0].id;
      await expectDbError(client, "INSERT INTO paper_authors VALUES ($1, $2, 0)", [paperId, a1], {
        code: "23514",
        constraint: "ck_paper_authors_order",
      });
      await client.query("INSERT INTO paper_authors VALUES ($1, $2, 1)", [paperId, a1]);
      await expectDbError(client, "INSERT INTO paper_authors VALUES ($1, $2, 1)", [paperId, a2], {
        code: "23505",
        constraint: "uq_paper_authors_order",
      });
    }));

  it("rejects an invalid ORCID", () =>
    withRollback(async (client) => {
      await expectDbError(client, "INSERT INTO authors (full_name, orcid) VALUES ($1, $2)", ["Test Person", "1234"], {
        code: "23514",
        constraint: "ck_authors_orcid",
      });
    }));

  it("cascades paper deletion to authorship and keyword rows", () =>
    withRollback(async (client) => {
      const result = await client.query(
        `CALL sp_add_paper('Cascade test paper', NULL, NULL, 2024, NULL, $1, NULL, 'pending',
                           ARRAY['Cascade Author'], ARRAY['cascade'], NULL, NULL)`,
        [await domainId(client)],
      );
      const paperId = result.rows[0].p_paper_id;
      await client.query("DELETE FROM papers WHERE paper_id = $1", [paperId]);
      const left = await client.query(
        "SELECT (SELECT COUNT(*) FROM paper_authors WHERE paper_id = $1) + (SELECT COUNT(*) FROM paper_keywords WHERE paper_id = $1) AS n",
        [paperId],
      );
      expect(left.rows[0].n).toBe("0");
    }));
});

describeDb("sp_add_paper procedure", () => {
  it("inserts a paper with ordered authors and normalized keywords", () =>
    withRollback(async (client) => {
      const result = await client.query(
        `CALL sp_add_paper($1, $2, $3, $4, NULL, $5, NULL, 'pending', $6::text[], $7::text[], NULL, NULL)`,
        ["Procedure test paper", "Abstract text", "10.9999/PROC.TEST", 2025, await domainId(client), ["Ada Lovelace", "Alan Turing"], ["  Graph   Theory ", "graph theory", "AI"]],
      );
      const paperId = result.rows[0].p_paper_id;
      const paper = await client.query("SELECT doi, status FROM papers WHERE paper_id = $1", [paperId]);
      expect(paper.rows[0]).toEqual({ doi: "10.9999/proc.test", status: "pending" });

      const authors = await client.query(
        "SELECT a.full_name FROM paper_authors pa JOIN authors a USING (author_id) WHERE paper_id = $1 ORDER BY author_order",
        [paperId],
      );
      expect(authors.rows.map((r) => r.full_name)).toEqual(["Ada Lovelace", "Alan Turing"]);

      const keywords = await client.query(
        "SELECT k.term FROM paper_keywords pk JOIN keywords k USING (keyword_id) WHERE paper_id = $1 ORDER BY term",
        [paperId],
      );
      expect(keywords.rows.map((r) => r.term)).toEqual(["ai", "graph theory"]);
    }));

  it("refuses a paper without authors, leaving nothing behind", () =>
    withRollback(async (client) => {
      await expectDbError(
        client,
        "CALL sp_add_paper('No author paper', NULL, NULL, 2024, NULL, $1, NULL, 'pending', ARRAY[]::text[], NULL, NULL, NULL)",
        [await domainId(client)],
        { code: "23514" },
      );
      const { rows } = await client.query("SELECT COUNT(*) AS n FROM papers WHERE title = 'No author paper'");
      expect(rows[0].n).toBe("0");
    }));

  it("lists a domain together with its sub-domains (recursive CTE)", () =>
    withRollback(async (client) => {
      const root = await domainId(client, "Artificial Intelligence");
      const { rows } = await client.query(
        "SELECT d.name FROM fn_domain_subtree($1) s JOIN domains d USING (domain_id) ORDER BY d.name",
        [root],
      );
      expect(rows.map((r) => r.name)).toEqual([
        "Artificial Intelligence",
        "Computer Vision",
        "Natural Language Processing",
        "Reinforcement Learning",
      ]);
    }));
});

describeDb("library constraints", () => {
  it("enforces one collection name per user, a valid reading status and non-empty notes", () =>
    withRollback(async (client) => {
      const userId = await insertUser(client, "library-test@example.com");
      const paperId = await insertPaper(client);
      await client.query("INSERT INTO collections (user_id, name) VALUES ($1, 'Thesis')", [userId]);
      await expectDbError(client, "INSERT INTO collections (user_id, name) VALUES ($1, 'Thesis')", [userId], {
        code: "23505",
        constraint: "uq_collections_user_name",
      });
      await expectDbError(client, "INSERT INTO reading_list (user_id, paper_id, status) VALUES ($1, $2, 'skimmed')", [userId, paperId], {
        code: "23514",
        constraint: "ck_reading_list_status",
      });
      await expectDbError(client, "INSERT INTO notes (user_id, paper_id, body) VALUES ($1, $2, '   ')", [userId, paperId], {
        code: "23514",
        constraint: "ck_notes_body",
      });
    }));
});
