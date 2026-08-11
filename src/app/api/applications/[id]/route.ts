import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const PatchBody = z.object({
  status: z
    .enum(["APPLIED", "IN_REVIEW", "ASSESSMENT", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN", "GHOSTED"])
    .optional(),
  resumeId: z.string().nullable().optional(),
  notes: z.string().max(4000).optional(),
  addNote: z.string().max(2000).optional(), // appends a timeline note event
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { status, resumeId, notes, addNote } = parsed.data;

  const application = await prisma.application.findUnique({ where: { id: params.id } });
  if (!application) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.application.update({
    where: { id: params.id },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(resumeId !== undefined ? { resumeId } : {}),
      ...(notes !== undefined ? { notes } : {}),
    },
  });

  if (status && status !== application.status) {
    await prisma.applicationEvent.create({
      data: {
        applicationId: params.id,
        type: "status_change",
        description: `Status ${application.status} → ${status}`,
        source: "MANUAL",
      },
    });
  }
  if (addNote) {
    await prisma.applicationEvent.create({
      data: {
        applicationId: params.id,
        type: "note",
        description: addNote,
        source: "MANUAL",
      },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.application.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
