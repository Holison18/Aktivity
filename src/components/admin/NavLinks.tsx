"use client";
// Console navigation links; the current section sits on a white pill inside the grey capsule (UI-05).
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Classes", match: (p: string) => p === "/admin" || p.startsWith("/admin/classes") },
  { href: "/admin/weeks", label: "Weeks", match: (p: string) => p.startsWith("/admin/weeks") && p !== "/admin/weeks/new" },
  { href: "/admin/students", label: "Students", match: (p: string) => p.startsWith("/admin/students") },
  { href: "/admin/review", label: "Review", match: (p: string) => p.startsWith("/admin/review") },
];

export default function NavLinks() {
  const path = usePathname() ?? "";
  return (
    <>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="nav-link" aria-current={l.match(path) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </>
  );
}
