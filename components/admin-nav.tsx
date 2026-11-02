"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/admin", label: "Moderation queue" },
  { href: "/admin/log", label: "Audit log" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/system", label: "System" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-line">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "-mb-px border-b-2 px-4 py-2 text-sm",
            pathname === tab.href ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
