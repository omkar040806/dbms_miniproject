import { HIGHLIGHT_START, HIGHLIGHT_STOP } from "@/lib/search-markers";

/**
 * Render a ts_headline snippet. React escapes every piece of text, and only the
 * marker tokens become <mark> elements, so the abstract cannot inject HTML.
 */
export function Highlight({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    const start = rest.indexOf(HIGHLIGHT_START);
    if (start === -1) {
      parts.push(rest);
      break;
    }
    const stop = rest.indexOf(HIGHLIGHT_STOP, start);
    if (stop === -1) {
      parts.push(rest.replace(HIGHLIGHT_START, ""));
      break;
    }
    if (start > 0) parts.push(rest.slice(0, start));
    parts.push(<mark key={key++}>{rest.slice(start + HIGHLIGHT_START.length, stop)}</mark>);
    rest = rest.slice(stop + HIGHLIGHT_STOP.length);
  }
  return <>{parts}</>;
}
