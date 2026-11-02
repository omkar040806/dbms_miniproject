import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-paper text-muted border-line",
  accent: "bg-accent-soft text-accent-strong border-transparent",
  ok: "bg-ok-soft text-ok border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

/** Colour a paper's moderation status consistently everywhere. */
export function StatusBadge({ status }: { status: string }) {
  const tone: Tone = status === "approved" ? "ok" : status === "rejected" ? "danger" : "warn";
  return <Badge tone={tone}>{status}</Badge>;
}
