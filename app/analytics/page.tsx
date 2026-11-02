"use client";

import Link from "next/link";
import { useState } from "react";
import { CitationsChart, TrendChart } from "@/components/analytics/charts";
import { useSession } from "@/components/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, PageHeader, Stat } from "@/components/ui/card";
import { EmptyState, Notice, Spinner } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { apiFetch } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";
import type { AnalyticsData } from "@/lib/db/queries/analytics";
import { truncate } from "@/lib/utils";

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`py-2 pr-3 ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export default function AnalyticsPage() {
  const { user } = useSession();
  const [minPapers, setMinPapers] = useState(1);
  const { data, error, loading, reload } = useApi<AnalyticsData>(`/api/analytics?minPapers=${minPapers}`);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const result = await apiFetch<{ refreshedAt: string }>("/api/admin/analytics/refresh", { method: "POST" });
    setMessage(`Materialized view refreshed at ${new Date(result.refreshedAt).toLocaleTimeString("en-IN")}`);
    reload();
  }

  return (
    <>
      <PageHeader
        title="Research analytics"
        description="Publication trends, citation patterns and the most influential papers and authors."
        actions={user?.role === "admin" ? <Button variant="secondary" onClick={refresh}>Refresh trends</Button> : null}
      />
      {message ? <Notice tone="ok" className="mb-4">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {loading && !data ? <Spinner /> : null}

      {data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <Stat label="Approved papers" value={data.overview.papers.toLocaleString("en-IN")} />
            <Stat label="Pending review" value={data.overview.pending} />
            <Stat label="Authors" value={data.overview.authors.toLocaleString("en-IN")} />
            <Stat label="Citations" value={data.overview.citations.toLocaleString("en-IN")} />
            <Stat label="Users" value={data.overview.users} />
            <Stat label="Views (30 days)" value={data.overview.views_30d.toLocaleString("en-IN")} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardTitle>Papers per year by research area</CardTitle>
              <p className="text-xs text-muted">From the materialized view mv_domain_year_trends.</p>
              {data.trends.length ? <TrendChart rows={data.trends} /> : <EmptyState title="No data yet" />}
            </Card>
            <Card>
              <CardTitle>Citations made per year</CardTitle>
              <p className="text-xs text-muted">Counted by the publication year of the citing paper.</p>
              {data.citationsByYear.length ? <CitationsChart rows={data.citationsByYear} /> : <EmptyState title="No citations yet" />}
            </Card>
          </div>

          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <CardTitle>Popular research domains</CardTitle>
                <p className="text-xs text-muted">GROUP BY domain HAVING COUNT(papers) ≥ the minimum below.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                Minimum papers
                <Input type="number" min={1} value={minPapers} onChange={(e) => setMinPapers(Math.max(1, Number(e.target.value) || 1))} className="h-8 w-20" />
              </label>
            </div>
            <Table head={["Domain", "Papers", "Avg citations", "Views (90 days)"]}>
              {data.domains.map((d) => (
                <tr key={d.domain_name}>
                  <td className="py-2 pr-3">
                    {d.domain_name} <span className="text-xs text-muted">· {d.root_domain}</span>
                  </td>
                  <td className="py-2 pr-3 text-right">{d.papers.toLocaleString("en-IN")}</td>
                  <td className="py-2 pr-3 text-right">{d.avg_citations}</td>
                  <td className="py-2 pr-3 text-right">{d.views_90d}</td>
                </tr>
              ))}
            </Table>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardTitle>Top authors by h-index</CardTitle>
              <p className="text-xs text-muted">Window function ROW_NUMBER() per author, computed for everyone in one query.</p>
              <Table head={["Author", "Papers", "Citations", "h-index"]}>
                {data.topAuthors.map((a) => (
                  <tr key={a.author_id}>
                    <td className="py-2 pr-3">
                      <Link href={`/authors/${a.author_id}`} className="hover:text-accent">
                        {a.full_name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-right">{a.papers}</td>
                    <td className="py-2 pr-3 text-right">{a.citations.toLocaleString("en-IN")}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{a.h_index}</td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card>
              <CardTitle>Cited above their domain average</CardTitle>
              <p className="text-xs text-muted">Correlated subquery comparing each paper with its own domain.</p>
              <Table head={["Paper", "Citations", "Domain avg"]}>
                {data.aboveAverage.map((p) => (
                  <tr key={p.paper_id}>
                    <td className="py-2 pr-3">
                      <Link href={`/papers/${p.paper_id}`} className="hover:text-accent">
                        {truncate(p.title, 55)}
                      </Link>
                      <span className="block text-xs text-muted">{p.domain_name}</span>
                    </td>
                    <td className="py-2 pr-3 text-right">{p.citations.toLocaleString("en-IN")}</td>
                    <td className="py-2 pr-3 text-right">{p.domain_avg}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardTitle>Top 3 papers in each domain</CardTitle>
              <p className="text-xs text-muted">RANK() OVER (PARTITION BY domain ORDER BY citations DESC).</p>
              <Table head={["Domain / paper", "Rank", "Citations"]}>
                {data.topPapersByDomain.map((p) => (
                  <tr key={`${p.domain_name}-${p.paper_id}`}>
                    <td className="py-2 pr-3">
                      <span className="block text-xs text-muted">{p.domain_name}</span>
                      <Link href={`/papers/${p.paper_id}`} className="hover:text-accent">
                        {truncate(p.title, 60)}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-right">#{p.rank}</td>
                    <td className="py-2 pr-3 text-right">{p.citations.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </Table>
            </Card>
            <div className="space-y-6">
              <Card>
                <CardTitle>Most viewed (30 days)</CardTitle>
                {data.mostViewed.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No views recorded yet.</p>
                ) : (
                  <Table head={["Paper", "Views"]}>
                    {data.mostViewed.map((p) => (
                      <tr key={p.paper_id}>
                        <td className="py-2 pr-3">
                          <Link href={`/papers/${p.paper_id}`} className="hover:text-accent">
                            {truncate(p.title, 60)}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-right">{p.views}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>
              <Card>
                <CardTitle>Most common keywords</CardTitle>
                <div className="mt-3 flex flex-wrap gap-1">
                  {data.keywords.map((k) => (
                    <Link key={k.term} href={`/search?q=${encodeURIComponent(k.term)}`}>
                      <Badge tone="accent">
                        {k.term} · {k.papers}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
