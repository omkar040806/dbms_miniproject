import { cn } from "@/lib/utils";

type Tone = "info" | "ok" | "warn" | "danger";

const tones: Record<Tone, string> = {
  info: "border-accent/30 bg-accent-soft text-accent-strong",
  ok: "border-ok/30 bg-ok-soft text-ok",
  warn: "border-warn/30 bg-warn-soft text-warn",
  danger: "border-danger/30 bg-danger-soft text-danger",
};

/** Inline message box for errors, warnings and confirmations. */
export function Notice({ tone = "info", className, ...props }: React.HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-md border px-4 py-3 text-sm", tones[tone], className)} {...props} />;
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <p className="font-serif text-lg font-semibold">{title}</p>
      {children ? <div className="mt-2 text-sm text-muted">{children}</div> : null}
    </div>
  );
}
