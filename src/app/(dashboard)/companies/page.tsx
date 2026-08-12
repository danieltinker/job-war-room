import { prisma } from "@/lib/db";
import { CompanyManager } from "@/components/CompanyManager";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { jobs: true } } },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Company watchlist</h1>
        <p className="mt-1 text-sm text-slate-400">
          These companies are scraped on every daily sweep — their ATS careers board (Greenhouse /
          Lever / Ashby, most reliable) plus LinkedIn job search.
        </p>
      </header>
      <CompanyManager
        companies={companies.map((c) => ({
          id: c.id,
          name: c.name,
          website: c.website,
          linkedinSlug: c.linkedinSlug,
          careersUrl: c.careersUrl,
          ats: c.ats,
          atsIdentifier: c.atsIdentifier,
          active: c.active,
          notes: c.notes,
          jobCount: c._count.jobs,
        }))}
      />
    </div>
  );
}
