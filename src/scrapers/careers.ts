/**
 * Generic company careers-page scraper.
 *
 * Strategy, in order of reliability:
 *   1. If the page embeds/links a known ATS board (Greenhouse, Lever, Ashby,
 *      Comeet), delegate to that ATS's public API/board.
 *   2. Parse schema.org JSON-LD JobPosting blocks (many careers sites emit them).
 *   3. Heuristic sweep: collect anchors whose href/text look like job postings.
 */
import * as cheerio from "cheerio";
import { stripHtml } from "@/core/normalize";
import { scrapeGreenhouse } from "./greenhouse";
import { scrapeLever } from "./lever";
import { scrapeAshby } from "./ashby";
import { scrapeSmartrecruiters } from "./smartrecruiters";
import type { ScrapedJob } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Detect an embedded/linked ATS board anywhere in the page source. */
export function detectAts(
  html: string
): { kind: "GREENHOUSE" | "LEVER" | "ASHBY" | "SMARTRECRUITERS"; identifier: string } | null {
  const gh =
    html.match(/boards(?:-api)?\.greenhouse\.io\/(?:v1\/boards\/)?(?:embed\/job_board\?for=)?([A-Za-z0-9_-]+)/) ??
    html.match(/job-boards\.greenhouse\.io\/([A-Za-z0-9_-]+)/);
  if (gh) return { kind: "GREENHOUSE", identifier: gh[1] };

  const lever = html.match(/jobs\.(?:eu\.)?lever\.co\/([A-Za-z0-9_-]+)/);
  if (lever) return { kind: "LEVER", identifier: lever[1] };

  const ashby = html.match(/jobs\.ashbyhq\.com\/([A-Za-z0-9_-]+)/);
  if (ashby) return { kind: "ASHBY", identifier: ashby[1] };

  const sr = html.match(/(?:careers|jobs)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/);
  if (sr) return { kind: "SMARTRECRUITERS", identifier: sr[1] };

  return null;
}

interface JsonLdJob {
  "@type"?: string | string[];
  title?: string;
  url?: string;
  datePosted?: string;
  description?: string;
  hiringOrganization?: { name?: string };
  jobLocation?:
    | { address?: { addressLocality?: string; addressCountry?: string } }
    | { address?: { addressLocality?: string; addressCountry?: string } }[];
}

function jsonLdLocation(job: JsonLdJob): string {
  const locs = Array.isArray(job.jobLocation) ? job.jobLocation : job.jobLocation ? [job.jobLocation] : [];
  const parts = locs
    .map((l) => [l?.address?.addressLocality, l?.address?.addressCountry].filter(Boolean).join(", "))
    .filter(Boolean);
  return parts[0] ?? "";
}

/** Extract schema.org JobPosting entries from JSON-LD script tags. */
export function parseJsonLdJobs(html: string, pageUrl: string, companyName: string): ScrapedJob[] {
  const $ = cheerio.load(html);
  const out: ScrapedJob[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    const nodes: JsonLdJob[] = [];
    const visit = (n: unknown) => {
      if (Array.isArray(n)) return n.forEach(visit);
      if (n && typeof n === "object") {
        const o = n as JsonLdJob & { "@graph"?: unknown; itemListElement?: unknown };
        const type = o["@type"];
        const types = Array.isArray(type) ? type : [type];
        if (types.includes("JobPosting")) nodes.push(o);
        if (o["@graph"]) visit(o["@graph"]);
        if (o.itemListElement) visit(o.itemListElement);
        const item = (n as { item?: unknown }).item;
        if (item) visit(item);
      }
    };
    visit(data);
    for (const job of nodes) {
      if (!job.title) continue;
      const url = job.url ? new URL(job.url, pageUrl).toString() : pageUrl;
      out.push({
        source: "CAREERS",
        externalId: "",
        url,
        title: job.title.trim(),
        companyName: job.hiringOrganization?.name?.trim() || companyName,
        location: jsonLdLocation(job),
        description: stripHtml(job.description ?? "").slice(0, 20000),
        postedAt: job.datePosted ? new Date(job.datePosted) : null,
      });
    }
  });
  return out;
}

/** Comeet reference (company uid + widget token) embedded in a careers page. */
export function extractComeetRef(html: string): { uid: string | null; token: string | null; jobsPage: string | null } {
  const uid =
    html.match(/comeet\.com\/jobs\/[A-Za-z0-9_-]+\/([0-9A-F]{2}\.[0-9A-F]{3})/i)?.[1] ??
    html.match(/careers-api\/2\.0\/company\/([0-9A-F]{2}\.[0-9A-F]{3})/i)?.[1] ??
    null;
  const token =
    html.match(/positions\?token=([A-Za-z0-9]+)/i)?.[1] ??
    html.match(/["']token["']\s*[:=]\s*["']([A-Za-z0-9]{8,})["']/i)?.[1] ??
    null;
  const jobsPage =
    html.match(/https?:\/\/(?:www\.)?comeet\.com\/jobs\/[A-Za-z0-9_-]+\/[0-9A-F]{2}\.[0-9A-F]{3}/i)?.[0] ??
    null;
  return { uid, token, jobsPage };
}

interface ComeetPosition {
  uid?: string;
  name?: string;
  location?: { name?: string };
  url_comeet_hosted_page?: string;
  url_active_page?: string;
  time_updated?: string;
  department?: string;
}

/** Comeet careers widget API — used when a careers page embeds a Comeet board. */
async function scrapeComeetViaApi(
  uid: string,
  token: string,
  companyName: string
): Promise<ScrapedJob[]> {
  const base = process.env.COMEET_API_BASE ?? "https://www.comeet.co";
  const res = await fetch(
    `${base}/careers-api/2.0/company/${encodeURIComponent(uid)}/positions?token=${encodeURIComponent(token)}`,
    { headers: { accept: "application/json", "user-agent": UA } }
  );
  if (!res.ok) throw new Error(`Comeet ${uid}: HTTP ${res.status}`);
  const data = (await res.json()) as ComeetPosition[];
  return (Array.isArray(data) ? data : [])
    .filter((p) => p.name && p.uid)
    .map((p) => ({
      source: "CAREERS" as const,
      externalId: `comeet:${p.uid}`,
      url: p.url_comeet_hosted_page ?? p.url_active_page ?? "",
      title: p.name!,
      companyName,
      location: p.location?.name ?? "",
      description: p.department ? `Department: ${p.department}` : "",
      postedAt: p.time_updated ? new Date(p.time_updated) : null,
    }));
}

/**
 * Scrape a Comeet board directly from a company identifier — either
 * "companySlug/uid" (e.g. "cyera/17.008") or a full comeet.com jobs URL.
 * Fetches the standalone jobs page to obtain the widget token, then uses the
 * structured careers API.
 */
export async function scrapeComeet(identifier: string, companyName: string): Promise<ScrapedJob[]> {
  const jobsPage = /^https?:\/\//i.test(identifier)
    ? identifier
    : `https://www.comeet.com/jobs/${identifier.replace(/^\/+|\/+$/g, "")}`;
  const html = await fetchHtml(jobsPage);
  if (!html) throw new Error(`Comeet page unreachable: ${jobsPage}`);
  const ref = extractComeetRef(html);
  if (!ref.uid || !ref.token) {
    throw new Error(
      `Comeet board not resolvable from ${jobsPage} — expected identifier like "company/17.008"`
    );
  }
  return scrapeComeetViaApi(ref.uid, ref.token, companyName);
}

/** Detect + scrape a Comeet board referenced by a careers page (follows the
 *  standalone comeet.com jobs page once if the token isn't on the first page). */
async function tryComeet(html: string, companyName: string): Promise<ScrapedJob[] | null> {
  let ref = extractComeetRef(html);
  if (!ref.uid && !ref.jobsPage) return null;
  if ((!ref.uid || !ref.token) && ref.jobsPage) {
    const followed = await fetchHtml(ref.jobsPage);
    if (followed) {
      const deeper = extractComeetRef(followed);
      ref = {
        uid: ref.uid ?? deeper.uid,
        token: ref.token ?? deeper.token,
        jobsPage: ref.jobsPage,
      };
    }
  }
  if (ref.uid && ref.token) {
    return scrapeComeetViaApi(ref.uid, ref.token, companyName);
  }
  return null;
}

const HREF_HINTS = /\/(jobs?|careers?|positions?|openings?|vacanc|opportunit|role)s?\/|[?&](gh_jid|lever|job_?id|position)=/i;
const TEXT_NOISE =
  /^(careers?|jobs?|open positions?|see (all|more)|view (all|more)|apply|about|learn more|read more|home|back|all departments?|benefits|culture|team|contact)$/i;

/** Heuristic: anchors that look like individual job postings. */
export function extractJobLinks(html: string, pageUrl: string, companyName: string): ScrapedJob[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: ScrapedJob[] = [];
  $("a[href]").each((_, el) => {
    const a = $(el);
    const href = a.attr("href") ?? "";
    const text = a.text().replace(/\s+/g, " ").trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
    if (text.length < 4 || text.length > 120) return;
    if (TEXT_NOISE.test(text)) return;
    if (!HREF_HINTS.test(href)) return;
    // A posting link usually ends with something id-ish or a slugged title
    let abs: string;
    try {
      abs = new URL(href, pageUrl).toString();
    } catch {
      return;
    }
    // Skip links back to the careers index itself
    if (abs.replace(/\/$/, "") === pageUrl.replace(/\/$/, "")) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push({
      source: "CAREERS",
      externalId: "",
      url: abs,
      title: text,
      companyName,
      location: "",
      description: "",
      postedAt: null,
    });
  });
  return out;
}

export async function scrapeCareersPage(url: string, companyName: string): Promise<ScrapedJob[]> {
  const html = await fetchHtml(url);
  if (!html) throw new Error(`careers page unreachable: ${url}`);

  // 1) Embedded ATS → use the structured source instead of HTML scraping
  const ats = detectAts(html);
  if (ats?.kind === "GREENHOUSE") return scrapeGreenhouse(ats.identifier, companyName);
  if (ats?.kind === "LEVER") return scrapeLever(ats.identifier, companyName);
  if (ats?.kind === "ASHBY") return scrapeAshby(ats.identifier, companyName);
  if (ats?.kind === "SMARTRECRUITERS") return scrapeSmartrecruiters(ats.identifier, companyName);

  // 2) Embedded Comeet board (common for Israeli companies)
  const comeet = await tryComeet(html, companyName).catch(() => null);
  if (comeet && comeet.length > 0) return comeet;

  // 3) Structured data on the page itself
  const jsonLd = parseJsonLdJobs(html, url, companyName);
  if (jsonLd.length > 0) return jsonLd;

  // 4) Heuristic link sweep
  return extractJobLinks(html, url, companyName);
}
