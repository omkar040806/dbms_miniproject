"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/ui/feedback";

// The canvas library touches `window`, so it is only loaded in the browser.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <Spinner label="Drawing graph…" />,
});

export interface NetworkNode {
  id: number;
  label: string;
  group: string;
  size?: number;
  highlight?: boolean;
}

export interface NetworkLink {
  source: number;
  target: number;
  highlight?: boolean;
}

const PALETTE = ["#0f6e6e", "#b45309", "#6d28d9", "#be123c", "#1d4ed8", "#4d7c0f", "#a16207", "#0e7490"];

/** Same group name -> same colour on every render. */
export function groupColor(group: string): string {
  let hash = 0;
  for (const char of group) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function GraphLegend({ groups }: { groups: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
      {groups.map((group) => (
        <span key={group} className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: groupColor(group) }} />
          {group}
        </span>
      ))}
    </div>
  );
}

/** Force-directed network drawn on a canvas. Directed graphs get arrowheads. */
export function NetworkGraph({
  nodes,
  links,
  directed = false,
  height = 520,
  onNodeClick,
}: {
  nodes: NetworkNode[];
  links: NetworkLink[];
  directed?: boolean;
  height?: number;
  onNodeClick?: (node: NetworkNode) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The library adds x/y and swaps link ids for node objects, so give it copies.
  const data = useMemo(() => ({ nodes: nodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) }), [nodes, links]);

  return (
    <div ref={box} className="overflow-hidden rounded-lg border border-line bg-white">
      <ForceGraph2D
        graphData={data}
        width={width}
        height={height}
        nodeLabel={(node) => String(node.label)}
        nodeVal={(node) => Number(node.size ?? 1)}
        nodeColor={(node) => (node.highlight ? "#d97706" : groupColor(String(node.group)))}
        linkColor={(link) => (link.highlight ? "#d97706" : "rgba(29,36,51,0.22)")}
        linkWidth={(link) => (link.highlight ? 3 : 1)}
        linkDirectionalArrowLength={directed ? 4 : 0}
        linkDirectionalArrowRelPos={1}
        cooldownTicks={150}
        onNodeClick={(node) => onNodeClick?.(node as unknown as NetworkNode)}
      />
    </div>
  );
}
