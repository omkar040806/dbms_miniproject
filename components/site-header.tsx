"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/components/session-provider";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const publicLinks = [
  { href: "/search", label: "Search" },
  { href: "/graph", label: "Citation graph" },
  { href: "/analytics", label: "Analytics" },
];

const researcherLinks = [
  { href: "/library", label: "My library" },
  { href: "/upload", label: "Upload" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useSession();

  const links = [
    ...publicLinks,
    ...(user ? researcherLinks : []),
    ...(user?.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  async function handleLogout() {
    await logout();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="border-b border-line bg-card/80 backdrop-blur">
      <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
        <Link href="/" className="font-serif text-lg font-semibold text-ink">
          Research<span className="text-accent">Discovery</span>
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
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
        <div className="flex items-center gap-2 text-sm">
          {loading ? null : user ? (
            <>
              <span className="hidden text-muted sm:inline">
                {user.name}
                {user.role === "admin" ? " · admin" : ""}
              </span>
              <button type="button" onClick={handleLogout} className={buttonClass("secondary", "sm")}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className={buttonClass("ghost", "sm")}>
                Log in
              </Link>
              <Link href="/register" className={buttonClass("primary", "sm")}>
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
