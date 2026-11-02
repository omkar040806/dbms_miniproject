import { clsx, type ClassValue } from "clsx";

/** Join Tailwind class names, skipping falsy values. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** "1 paper", "3 papers". */
export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count.toLocaleString("en-IN")} ${count === 1 ? word : pluralWord}`;
}

/** Short, readable date such as "1 Nov 2026". */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Trim long text to `max` characters on a word boundary. */
export function truncate(text: string | null | undefined, max = 260): string {
  if (!text) return "";
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max)}…`;
}
