export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const strList = z.array(z.string().min(1).max(100)).max(50);

const ProfileBody = z.object({
  name: z.string().min(1).max(200),
  keywords: strList.default([]),
  titleKeywords: strList.default([]),
  excludeKeywords: strList.default([]),
  locations: strList.default([]),
  remoteOk: z.boolean().default(true),
  minScore: z.number().int().min(0).max(100).default(40),
  active: z.boolean().default(true),
  resumeId: z.string().nullable().default(null),
});

export async function GET() {
  const profiles = await prisma.positionProfile.findMany({
    orderBy: { name: "asc" },
    include: { resume: { select: { id: true, name: true } }, _count: { select: { matches: true } } },
  });
  return NextResponse.json(profiles);
}

export async function POST(req: NextRequest) {
  const parsed = ProfileBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const profile = await prisma.positionProfile.create({ data: parsed.data });
  return NextResponse.json(profile, { status: 201 });
}
