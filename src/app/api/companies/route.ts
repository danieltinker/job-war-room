export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const CompanyBody = z.object({
  name: z.string().min(1).max(200),
  website: z.string().max(500).default(""),
  linkedinSlug: z.string().max(200).default(""),
  ats: z.enum(["NONE", "GREENHOUSE", "LEVER", "ASHBY"]).default("NONE"),
  atsIdentifier: z.string().max(200).default(""),
  active: z.boolean().default(true),
  notes: z.string().max(2000).default(""),
});

export async function GET() {
  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { jobs: true } } },
  });
  return NextResponse.json(companies);
}

export async function POST(req: NextRequest) {
  const parsed = CompanyBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const company = await prisma.company.create({ data: parsed.data });
    return NextResponse.json(company, { status: 201 });
  } catch {
    return NextResponse.json({ error: "company already exists" }, { status: 409 });
  }
}
