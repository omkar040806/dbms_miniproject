"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { apiFetch } from "@/lib/client/api";
import type { SessionUser } from "@/lib/auth/token";

/** Shared login / register form. `next` in the URL says where to go afterwards. */
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const next = searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/search";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const body =
      mode === "register"
        ? { fullName: form.get("fullName"), email: form.get("email"), password: form.get("password") }
        : { email: form.get("email"), password: form.get("password") };

    try {
      const data = await apiFetch<{ user: SessionUser }>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setUser(data.user);
      router.push(safeNext);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto mt-6 w-full max-w-md p-8">
      <h1 className="text-2xl font-semibold">{mode === "login" ? "Log in" : "Create an account"}</h1>
      <p className="mt-1 text-sm text-muted">
        {mode === "login" ? "Welcome back." : "Researchers can upload papers and keep a personal library."}
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {mode === "register" ? (
          <Field label="Full name" htmlFor="fullName">
            <Input id="fullName" name="fullName" autoComplete="name" required minLength={2} maxLength={120} />
          </Field>
        ) : null}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          hint={mode === "register" ? "At least 8 characters with a letter and a digit." : undefined}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "register" ? 8 : 1}
            maxLength={72}
          />
        </Field>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-accent underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already registered?{" "}
            <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-accent underline">
              Log in
            </Link>
          </>
        )}
      </p>
    </Card>
  );
}
