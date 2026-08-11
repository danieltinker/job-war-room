import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const strList = z.array(z.string().min(1).max(100)).max(50);

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  keywords: strList.optional(),
  titleKeywords: strList.optional(),
  excludeKeywords: strList.optional(),
  locations: strList.optional(),
  remoteOk: z.boolean().optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  active: z.boolean().optional(),
  resumeId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const profile = await prisma.positionProfile.update({
      where: { id: params.id },
      data: parsed.data,
    });
    return NextResponse.json(profile);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.positionProfile.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
