import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/session";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

// Small in-memory brake against password guessing (per process).
const attempts = new Map<string, { count: number; resetAt: number }>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  if (rateLimited(email.toLowerCase())) {
    return NextResponse.json({ error: "too many attempts, try later" }, { status: 429 });
  }

  let user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // First run: bootstrap the single account from ADMIN_EMAIL / ADMIN_PASSWORD.
  if (!user) {
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD;
    const userCount = await prisma.user.count();
    if (
      userCount === 0 &&
      adminEmail &&
      adminPassword &&
      email.toLowerCase() === adminEmail &&
      password === adminPassword
    ) {
      user = await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash: await bcrypt.hash(adminPassword, 12),
        },
      });
    }
  }

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  const token = await createSessionToken(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
