import Link from "next/link";
import { Nav } from "@/components/Nav";
import { LogoutClient } from "@/components/LogoutClient";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-10 flex w-56 flex-col border-r border-line bg-surface-raised">
        <Link href="/" className="flex items-center gap-2 px-5 py-5">
          <span className="text-2xl">🎯</span>
          <span className="text-lg font-bold tracking-tight text-white">War Room</span>
        </Link>
        <Nav />
        <div className="mt-auto p-4">
          <LogoutClient />
        </div>
      </aside>
      <main className="ml-56 flex-1 p-8">{children}</main>
    </div>
  );
}
