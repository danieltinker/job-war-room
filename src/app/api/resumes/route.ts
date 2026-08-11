export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export async function GET() {
  const resumes = await prisma.resume.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      label: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { applications: true, profiles: true } },
    },
  });
  return NextResponse.json(resumes);
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "expected multipart form" }, { status: 400 });

  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim();
  const label = String(form.get("label") ?? "").trim() || "General";
  const notes = String(form.get("notes") ?? "").slice(0, 2000);

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "file too large (max 10 MB)" }, { status: 413 });
  }
  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return NextResponse.json({ error: "only PDF, Word, or plain-text files" }, { status: 415 });
  }

  const data = Buffer.from(await file.arrayBuffer());
  const resume = await prisma.resume.create({
    data: {
      name,
      label,
      notes,
      fileName: file.name.slice(0, 300),
      mimeType,
      sizeBytes: file.size,
      data,
    },
    select: { id: true, name: true, label: true },
  });
  return NextResponse.json(resume, { status: 201 });
}
