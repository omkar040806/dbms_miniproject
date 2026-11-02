"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DomainSelect } from "@/components/domain-select";
import { PaperPicker, type PickedPaper } from "@/components/paper-picker";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { apiFetch } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";
import type { MetaData } from "@/lib/types";

export default function UploadPage() {
  const router = useRouter();
  const { data: meta } = useApi<MetaData>("/api/meta");
  const [references, setReferences] = useState<PickedPaper[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const thisYear = new Date().getFullYear();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    form.set("citedPaperIds", references.map((p) => p.paper_id).join(","));
    const file = form.get("pdf");
    if (file instanceof File && file.size === 0) form.delete("pdf");

    try {
      const result = await apiFetch<{ paperId: number }>("/api/papers", { method: "POST", body: form });
      router.push(`/papers/${result.paperId}?submitted=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <>
      <PageHeader
        title="Upload a paper"
        description="Your paper is saved as pending. An admin reviews it before it appears in search."
        actions={<LinkButton href="/my-papers" variant="secondary">My uploads</LinkButton>}
      />
      {error ? <Notice tone="danger" className="mb-4">{error}</Notice> : null}

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="space-y-4">
          <Field label="Title" htmlFor="title">
            <Input id="title" name="title" required minLength={5} maxLength={500} />
          </Field>
          <Field label="Abstract" htmlFor="abstract" hint="Used for full-text and semantic search.">
            <Textarea id="abstract" name="abstract" rows={8} maxLength={10000} />
          </Field>
          <Field label="Authors" htmlFor="authors" hint="One author per line, in byline order.">
            <Textarea id="authors" name="authors" rows={4} required placeholder={"Ada Lovelace\nAlan Turing"} />
          </Field>
          <Field label="Keywords" htmlFor="keywords" hint="Comma separated, up to 15.">
            <Input id="keywords" name="keywords" placeholder="graph neural networks, link prediction" />
          </Field>
          <div>
            <p className="mb-1 text-sm font-medium">References</p>
            <p className="mb-2 text-xs text-muted">Papers already on the platform that this paper cites. They become edges in the citation graph.</p>
            <PaperPicker value={references} onChange={setReferences} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4">
            <Field label="Publication year" htmlFor="publicationYear">
              <Input id="publicationYear" name="publicationYear" type="number" min={1900} max={thisYear + 1} defaultValue={thisYear} required />
            </Field>
            <Field label="Domain" htmlFor="domainId">
              <DomainSelect id="domainId" name="domainId" required domains={meta?.domains ?? []} emptyLabel="Choose a domain" defaultValue="" />
            </Field>
            <Field label="Venue" htmlFor="venueId" hint="Optional.">
              <Select id="venueId" name="venueId" defaultValue="">
                <option value="">Not listed / unpublished</option>
                {(meta?.venues ?? []).map((venue) => (
                  <option key={venue.venue_id} value={venue.venue_id}>
                    {venue.name} ({venue.venue_type})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="DOI" htmlFor="doi" hint="Optional, e.g. 10.1145/3292500.3330701">
              <Input id="doi" name="doi" />
            </Field>
            <Field label="PDF" htmlFor="pdf" hint="Optional, up to 20 MB.">
              <Input id="pdf" name="pdf" type="file" accept="application/pdf" className="h-auto py-1.5" />
            </Field>
          </Card>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit for review"}
          </Button>
          <p className="text-center text-xs text-muted">
            Need help? See <Link href="/search" className="underline">existing papers</Link> for examples.
          </p>
        </div>
      </form>
    </>
  );
}
