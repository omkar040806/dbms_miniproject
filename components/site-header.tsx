"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/search", label: "Search" },
  { href: "/graph", label: "Citation graph" },
  { href: "/analytics", label: "Analytics" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-line bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="font-serif text-lg font-semibold text-ink">
          Research<span className="text-accent">Discovery</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-muted hover:bg-accent-soft hover:text-ink",
                pathname.startsWith(link.href) && "bg-accent-soft font-medium text-ink",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
