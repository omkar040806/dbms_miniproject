import type { Metadata } from "next";
import { Suspense } from "react";
import { GraphExplorer } from "./graph-explorer";

export const metadata: Metadata = { title: "Citation graph" };

export default function GraphPage() {
  return (
    <Suspense>
      <GraphExplorer />
    </Suspense>
  );
}
