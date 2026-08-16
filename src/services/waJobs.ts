/**
 * WhatsApp group job capture: messages in monitored groups (e.g. משרות בהייטק)
 * are screened for job posts, turned into Jobs (source WHATSAPP, tagged with
 * the group so you know it's a referral opportunity), and scored against your
 * profiles like any scraped job.
 */
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { scoreJobs } from "@/scrapers";

const URL_RE = /https?:\/\/[^\s<>()\]]+/g;

// Hebrew + English signals that a group message is a job post.
const JOB_HINTS = [
  // Hebrew
  "משרה", "משרות", "מגייסים", "מגייסת", "מגייס", "דרוש", "דרושה", "דרושים",
  "מחפשים", "מחפשת", "מחפש", 'קו"ח', "קורות חיים", "הפניה", "גיוס", "תפקיד",
  "הזדמנות", "שכר", "היברידי",
  // English
  "hiring", "we're looking", "we are looking", "open position", "open role",
  "job opening", "referral", "apply", "cv", "resume", "position:", "role:",
  "engineer", "developer", "researcher", "backend", "frontend", "fullstack",
  "full stack", "devops", "security",
];

export interface GroupJobDetection {
  isJobPost: boolean;
  urls: string[];
  title: string;
  companyGuess: string;
}

/** Company slug from well-known ATS/job URLs, else the site's domain label. */
export function companyFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.split("/").filter(Boolean);
    const atsPatterns: [RegExp, number][] = [
      [/(?:boards?|job-boards)\.greenhouse\.io/, 0],
      [/jobs\.(?:eu\.)?lever\.co/, 0],
      [/jobs\.ashbyhq\.com/, 0],
      [/(?:jobs|careers)\.smartrecruiters\.com/, 0],
      [/(?:www\.)?comeet\.com/, 1], // comeet.com/jobs/<company>/...
    ];
    for (const [re, idx] of atsPatterns) {
      if (re.test(u.hostname)) {
        const seg = u.hostname.includes("comeet") ? path[idx] : path[0];
        if (seg && seg !== "jobs" && seg !== "embed") {
          return seg.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        }
      }
    }
    if (/linkedin\.com/.test(host)) return ""; // job id URLs carry no company
    const label = host.split(".").slice(-2, -1)[0] ?? "";
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : "";
  } catch {
    return "";
  }
}

export function detectJobPost(text: string): GroupJobDetection {
  const trimmed = text.trim();
  const urls = [...new Set(trimmed.match(URL_RE) ?? [])].slice(0, 5);
  const lower = trimmed.toLowerCase();
  const hintCount = JOB_HINTS.filter((h) => lower.includes(h)).length;

  // A job post needs either a link plus one hint, or strong textual signals.
  const isJobPost = trimmed.length >= 30 && (urls.length > 0 ? hintCount >= 1 : hintCount >= 2);

  const firstLine =
    trimmed
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length >= 8 && !URL_RE.test(l)) ?? trimmed.slice(0, 80);

  return {
    isJobPost,
    urls,
    title: firstLine.slice(0, 120),
    companyGuess: urls.map(companyFromUrl).find(Boolean) ?? "",
  };
}

/**
 * Ingest one group message. Returns the created job id, or null if the
 * message isn't a job post / was already captured.
 */
export async function ingestGroupMessage(
  text: string,
  groupName: string
): Promise<string | null> {
  const detection = detectJobPost(text);
  if (!detection.isJobPost) return null;

  const primaryUrl = detection.urls[0] ?? "";
  const dedupeKey = primaryUrl
    ? `wa:${primaryUrl}`
    : `wa:${createHash("sha1").update(text.slice(0, 300)).digest("hex")}`;

  const existing = await prisma.job.findUnique({ where: { dedupeKey } });
  if (existing) return null;

  const job = await prisma.job.create({
    data: {
      dedupeKey,
      source: "WHATSAPP",
      externalId: "",
      url: primaryUrl,
      title: detection.title,
      companyName: detection.companyGuess || `WhatsApp: ${groupName}`.slice(0, 100),
      location: "",
      description: `[Referral opportunity — posted in WhatsApp group "${groupName}"]\n\n${text.slice(0, 8000)}`,
    },
  });

  const profiles = await prisma.positionProfile.findMany({ where: { active: true } });
  await scoreJobs([job.id], profiles);
  return job.id;
}
