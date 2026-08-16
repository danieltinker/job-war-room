export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Full self-diagnosis: audits every enum column for values the schema doesn't
 * know (they crash Prisma reads), then executes each dashboard page's primary
 * query and reports the exact error if one fails. Open in the browser whenever
 * a page shows "server-side exception" — this tells you why.
 */

const ENUM_AUDITS: { table: string; column: string; known: string[] }[] = [
  { table: "Company", column: "ats", known: ["NONE", "GREENHOUSE", "LEVER", "ASHBY", "SMARTRECRUITERS", "COMEET"] },
  { table: "Job", column: "source", known: ["LINKEDIN", "GREENHOUSE", "LEVER", "ASHBY", "SMARTRECRUITERS", "COMEET", "CAREERS", "EMAIL", "WHATSAPP", "MANUAL"] },
  { table: "Match", column: "status", known: ["SUGGESTED", "DISMISSED", "CONVERTED"] },
  { table: "Application", column: "status", known: ["APPLIED", "IN_REVIEW", "ASSESSMENT", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN", "GHOSTED"] },
  { table: "ApplicationEvent", column: "source", known: ["MANUAL", "EMAIL", "SYSTEM"] },
  { table: "EmailMessage", column: "classification", known: ["APPLICATION_RECEIVED", "ASSESSMENT", "INTERVIEW", "OFFER", "REJECTION", "RECRUITER_OUTREACH", "OTHER"] },
  { table: "ScrapeRun", column: "status", known: ["RUNNING", "SUCCESS", "FAILED"] },
  { table: "SweepSource", column: "status", known: ["OK", "EMPTY", "FAILED"] },
];

export async function GET() {
  const enumProblems: { table: string; column: string; value: string; rows: number }[] = [];
  const enumErrors: string[] = [];

  for (const audit of ENUM_AUDITS) {
    try {
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT "${audit.column}"::text AS value, count(*)::int AS rows FROM "${audit.table}" GROUP BY 1`
      )) as { value: string; rows: number }[];
      for (const row of rows) {
        if (!audit.known.includes(row.value)) {
          enumProblems.push({ table: audit.table, column: audit.column, value: row.value, rows: row.rows });
        }
      }
    } catch (e) {
      enumErrors.push(`${audit.table}.${audit.column}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const pageChecks: Record<string, () => Promise<unknown>> = {
    dashboard: () =>
      prisma.match.findMany({
        where: { status: "SUGGESTED", job: { application: null } },
        include: { job: true, profile: { select: { name: true } } },
        take: 12,
      }),
    jobs: () =>
      prisma.job.findMany({
        include: { matches: true, application: { select: { id: true, status: true } } },
        orderBy: { discoveredAt: "desc" },
        take: 200,
      }),
    applications: () =>
      prisma.application.findMany({
        include: { job: true, resume: { select: { id: true, name: true } }, events: { take: 5 }, emails: { take: 3 } },
      }),
    companies: () =>
      prisma.company.findMany({ include: { _count: { select: { jobs: true } } } }),
    profiles: () =>
      prisma.positionProfile.findMany({ include: { _count: { select: { matches: true } } } }),
    resumes: () => prisma.resume.findMany({ select: { id: true, name: true, label: true } }),
    sweeps: () =>
      prisma.scrapeRun.findMany({ include: { sources: true }, orderBy: { startedAt: "desc" }, take: 30 }),
    settingsRuns: () => prisma.scrapeRun.findMany({ orderBy: { startedAt: "desc" }, take: 15 }),
  };

  const pages: Record<string, { ok: boolean; error?: string }> = {};
  for (const [name, fn] of Object.entries(pageChecks)) {
    try {
      await fn();
      pages[name] = { ok: true };
    } catch (e) {
      pages[name] = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const healthy =
    enumProblems.length === 0 && enumErrors.length === 0 && Object.values(pages).every((p) => p.ok);

  return NextResponse.json({
    healthy,
    hint: healthy
      ? "All page queries succeed and all enum values are known."
      : "A failing page query below shows the exact error. strayEnumValues lists rows the schema doesn't understand — POST to this same URL to normalize them to safe defaults.",
    strayEnumValues: enumProblems,
    enumAuditErrors: enumErrors,
    pages,
  });
}

const DEFAULTS: Record<string, string> = {
  Company: "NONE",
  Job: "MANUAL",
  Match: "SUGGESTED",
  Application: "APPLIED",
  ApplicationEvent: "SYSTEM",
  EmailMessage: "OTHER",
  ScrapeRun: "FAILED",
  SweepSource: "FAILED",
};

/** Self-heal: reset any rows using schema-unknown enum values to safe defaults. */
export async function POST() {
  const fixed: Record<string, number> = {};
  const errors: string[] = [];
  for (const audit of ENUM_AUDITS) {
    try {
      const knownList = audit.known.map((v) => `'${v}'`).join(",");
      const count = await prisma.$executeRawUnsafe(
        `UPDATE "${audit.table}" SET "${audit.column}" = '${DEFAULTS[audit.table]}' WHERE "${audit.column}"::text NOT IN (${knownList})`
      );
      if (count > 0) fixed[`${audit.table}.${audit.column}`] = count;
    } catch (e) {
      errors.push(`${audit.table}.${audit.column}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return NextResponse.json({ ok: errors.length === 0, rowsFixed: fixed, errors });
}
