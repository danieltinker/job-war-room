import { prisma } from "@/lib/db";
import { ResumeManager } from "@/components/ResumeManager";

export const dynamic = "force-dynamic";

export default async function ResumesPage() {
  const resumes = await prisma.resume.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      label: true,
      fileName: true,
      sizeBytes: true,
      notes: true,
      updatedAt: true,
      _count: { select: { applications: true } },
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Resume vault</h1>
        <p className="mt-1 text-sm text-slate-400">
          Keep every variant here and link the right one to each application.
        </p>
      </header>
      <ResumeManager
        resumes={resumes.map((r) => ({
          id: r.id,
          name: r.name,
          label: r.label,
          fileName: r.fileName,
          sizeBytes: r.sizeBytes,
          notes: r.notes,
          updatedAt: r.updatedAt.toISOString(),
          applicationCount: r._count.applications,
        }))}
      />
    </div>
  );
}
