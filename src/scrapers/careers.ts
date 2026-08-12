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
): { kind: "GREENHOUSE" | "LEVER" | "ASHBY"; identifier: string } | null {
  const gh =
    html.match(/boards(?:-api)?\.greenhouse\.io\/(?:v1\/boards\/)?(?:embed\/job_board\?for=)?([A-Za-z0-9_-]+)/) ??
    html.match(/job-boards\.greenhouse\.io\/([A-Za-z0-9_-]+)/);
  if (gh) return { kind: "GREENHOUSE", identifier: gh[1] };

  const lever = html.match(/jobs\.(?:eu\.)?lever\.co\/([A-Za-z0-9_-]+)/);
  if (lever) return { kind: "LEVER", identifier: lever[1] };

  const ashby = html.match(/jobs\.ashbyhq\.com\/([A-Za-z0-9_-]+)/);
  if (ashby) return { kind: "ASHBY", identifier: ashby[1] };

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

  // 2) Structured data on the page itself
  const jsonLd = parseJsonLdJobs(html, url, companyName);
  if (jsonLd.length > 0) return jsonLd;

  // 3) Heuristic link sweep
  return extractJobLinks(html, url, companyName);
}
