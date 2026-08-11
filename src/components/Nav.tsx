"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/jobs", label: "Jobs", icon: "🔎" },
  { href: "/applications", label: "Applications", icon: "🗂️" },
  { href: "/companies", label: "Companies", icon: "🏢" },
  { href: "/profiles", label: "Position profiles", icon: "🎛️" },
  { href: "/resumes", label: "Resumes", icon: "📄" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="mt-2 space-y-1 px-3">
      {ITEMS.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-accent-dim/20 text-accent"
                : "text-slate-400 hover:bg-surface-overlay hover:text-slate-200"
            }`}
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
