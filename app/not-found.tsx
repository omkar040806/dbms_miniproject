import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="py-20 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-accent">404</p>
      <h1 className="mt-2 text-3xl font-semibold">This page does not exist yet.</h1>
      <p className="mt-2 text-muted">It may be a feature that is still being built, or the link is wrong.</p>
      <LinkButton href="/" className="mt-6">
        Back to home
      </LinkButton>
    </section>
  );
}
