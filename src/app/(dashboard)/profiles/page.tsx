import { prisma } from "@/lib/db";
import { ProfileManager } from "@/components/ProfileManager";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const [profiles, resumes] = await Promise.all([
    prisma.positionProfile.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { matches: true } } },
    }),
    prisma.resume.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Position profiles</h1>
        <p className="mt-1 text-sm text-slate-400">
          Teach the war room what a relevant position looks like.
        </p>
      </header>
      <ProfileManager
        profiles={profiles.map((p) => ({
          id: p.id,
          name: p.name,
          keywords: p.keywords,
          titleKeywords: p.titleKeywords,
          excludeKeywords: p.excludeKeywords,
          locations: p.locations,
          remoteOk: p.remoteOk,
          minScore: p.minScore,
          active: p.active,
          resumeId: p.resumeId,
          matchCount: p._count.matches,
        }))}
        resumes={resumes}
      />
    </div>
  );
}
