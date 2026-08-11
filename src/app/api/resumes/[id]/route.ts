import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

/** GET downloads the stored file. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const resume = await prisma.resume.findUnique({ where: { id: params.id } });
  if (!resume) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(resume.data), {
    headers: {
      "content-type": resume.mimeType,
      "content-disposition": `attachment; filename="${encodeURIComponent(resume.fileName)}"`,
      "content-length": String(resume.sizeBytes),
    },
  });
}

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  label: z.string().min(1).max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const resume = await prisma.resume.update({
      where: { id: params.id },
      data: parsed.data,
      select: { id: true, name: true, label: true, notes: true },
    });
    return NextResponse.json(resume);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.resume.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
