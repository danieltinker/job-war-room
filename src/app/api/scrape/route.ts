import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enqueueNow, QUEUE_NAMES } from "@/lib/queue";

const Body = z.object({ kind: z.enum(["scrape", "email", "digest"]) });

/** "Run now" — enqueues the requested sweep for the worker to pick up. */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const queue = {
    scrape: QUEUE_NAMES.scrape,
    email: QUEUE_NAMES.emailSync,
    digest: QUEUE_NAMES.digest,
  }[parsed.data.kind];
  await enqueueNow(queue);
  return NextResponse.json({ ok: true, queued: parsed.data.kind });
}
