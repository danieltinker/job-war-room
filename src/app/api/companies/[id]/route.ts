import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  website: z.string().max(500).optional(),
  linkedinSlug: z.string().max(200).optional(),
  careersUrl: z.string().max(500).optional(),
  ats: z.enum(["NONE", "GREENHOUSE", "LEVER", "ASHBY", "SMARTRECRUITERS"]).optional(),
  atsIdentifier: z.string().max(200).optional(),
  active: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const company = await prisma.company.update({ where: { id: params.id }, data: parsed.data });
    return NextResponse.json(company);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.company.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
