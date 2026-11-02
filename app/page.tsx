"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, Stat } from "@/components/ui/card";
import { Notice } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { useApi } from "@/lib/client/use-api";
import type { MetaData } from "@/lib/types";

function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data } = useApi<MetaData>("/api/meta");
  const [text, setText] = useState("");

  const roots = data?.domains.filter((d) => d.parent_domain_id === null) ?? [];
  const childrenOf = (id: number) => data?.domains.filter((d) => d.parent_domain_id === id) ?? [];

  return (
    <div className="space-y-12">
      {searchParams.get("denied") === "admin" ? <Notice tone="warn">That page is for administrators only.</Notice> : null}

      <section className="pt-8">
        <p className="text-sm font-medium uppercase tracking-widest text-accent">Research Discovery Platform</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">Find papers by meaning, follow ideas through citations.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Search by keywords or by what a paper is about, explore citation and co-author networks, and keep your own reading library.
        </p>
        <form
          className="mt-8 flex max-w-2xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/search?q=${encodeURIComponent(text.trim())}`);
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. teaching computers to understand language" className="h-12 text-base" aria-label="Search papers" />
          <Button type="submit" className="h-12 px-6">
            Search
          </Button>
        </form>
        <div className="mt-4 flex gap-2">
          <LinkButton href="/graph" variant="secondary" size="sm">
            Explore the citation graph
          </LinkButton>
          <LinkButton href="/analytics" variant="ghost" size="sm">
            See research trends →
          </LinkButton>
        </div>
      </section>

      {data ? (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Papers" value={data.totals.papers.toLocaleString("en-IN")} />
          <Stat label="Authors" value={data.totals.authors.toLocaleString("en-IN")} />
          <Stat label="Citations" value={data.totals.citations.toLocaleString("en-IN")} />
          <Stat label="Research domains" value={data.totals.domains} />
        </section>
      ) : null}

      {roots.length > 0 ? (
        <section>
          <h2 className="mb-4 text-2xl font-semibold">Browse by domain</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {roots.map((root) => (
              <Card key={root.domain_id}>
                <Link href={`/search?domainId=${root.domain_id}`} className="font-serif text-xl font-semibold hover:text-accent">
                  {root.name}
                </Link>
                <p className="mt-1 text-sm text-muted">{root.description}</p>
                <ul className="mt-4 space-y-2">
                  {childrenOf(root.domain_id).map((child) => (
                    <li key={child.domain_id} className="flex justify-between text-sm">
                      <Link href={`/search?domainId=${child.domain_id}`} className="hover:text-accent">
                        {child.name}
                      </Link>
                      <span className="text-muted">{child.paper_count.toLocaleString("en-IN")}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
