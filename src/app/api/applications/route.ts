import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const Body = z.object({
  jobId: z.string().min(1),
  resumeId: z.string().nullable().optional(),
  status: z
    .enum(["APPLIED", "IN_REVIEW", "ASSESSMENT", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN", "GHOSTED"])
    .default("APPLIED"),
  notes: z.string().max(4000).default(""),
});

/** Create an application from a job ("mark as applied"). */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { jobId, resumeId, status, notes } = parsed.data;

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });

  const existing = await prisma.application.findUnique({ where: { jobId } });
  if (existing) return NextResponse.json(existing);

  const application = await prisma.application.create({
    data: {
      jobId,
      resumeId: resumeId ?? null,
      status,
      notes,
      events: {
        create: {
          type: "status_change",
          description: `Marked as ${status.toLowerCase().replace(/_/g, " ")}`,
          source: "MANUAL",
        },
      },
    },
  });

  // The suggestion that led here is now converted.
  await prisma.match.updateMany({
    where: { jobId, status: "SUGGESTED" },
    data: { status: "CONVERTED" },
  });

  return NextResponse.json(application, { status: 201 });
}
