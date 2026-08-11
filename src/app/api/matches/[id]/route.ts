import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const Body = z.object({ status: z.enum(["SUGGESTED", "DISMISSED"]) });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const match = await prisma.match.update({
      where: { id: params.id },
      data: { status: parsed.data.status },
    });
    return NextResponse.json(match);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
