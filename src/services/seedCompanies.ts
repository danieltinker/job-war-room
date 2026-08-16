/**
 * Priority-company watchlist, seeded once on worker boot (flag-gated, like the
 * starter profiles — edits and deletions in the dashboard are never overwritten).
 *
 * ATS boards are set where verified; the rest rely on the careers-page scraper
 * (which auto-detects embedded boards) plus the LinkedIn sweep.
 */
import { prisma } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";
import type { AtsType } from "@prisma/client";

const SEED_FLAG = "companies.seeded";

interface CompanySeed {
  name: string;
  website: string;
  careersUrl: string;
  linkedinSlug: string;
  ats?: AtsType;
  atsIdentifier?: string;
}

export const FAVORITES: CompanySeed[] = [
  {
    name: "Dream",
    website: "https://dreamgroup.com",
    careersUrl: "https://dreamgroup.com/careers",
    linkedinSlug: "dreamsecurity",
  },
  {
    name: "Red Hat",
    website: "https://www.redhat.com",
    careersUrl: "https://www.redhat.com/en/jobs",
    linkedinSlug: "red-hat",
  },
  {
    name: "Microsoft",
    website: "https://www.microsoft.com",
    careersUrl: "https://careers.microsoft.com",
    linkedinSlug: "microsoft",
  },
  {
    name: "Cyera",
    website: "https://www.cyera.com",
    careersUrl: "https://www.cyera.com/careers",
    linkedinSlug: "cyera",
  },
  {
    name: "Wiz",
    website: "https://www.wiz.io",
    careersUrl: "https://www.wiz.io/careers",
    linkedinSlug: "wizsecurity",
    ats: "GREENHOUSE",
    atsIdentifier: "wizinc",
  },
  {
    name: "Akamai",
    website: "https://www.akamai.com",
    careersUrl: "https://www.akamai.com/careers",
    linkedinSlug: "akamai-technologies",
  },
  {
    name: "Palo Alto Networks",
    website: "https://www.paloaltonetworks.com",
    careersUrl: "https://careers.smartrecruiters.com/paloaltonetworks2",
    linkedinSlug: "palo-alto-networks",
    ats: "SMARTRECRUITERS",
    atsIdentifier: "paloaltonetworks2",
  },
  {
    name: "Varonis",
    website: "https://www.varonis.com",
    careersUrl: "https://www.varonis.com/careers",
    linkedinSlug: "varonis",
  },
  {
    name: "JFrog",
    website: "https://jfrog.com",
    careersUrl: "https://join.jfrog.com",
    linkedinSlug: "jfrog-ltd",
  },
  {
    name: "Navina",
    website: "https://www.navina.ai",
    careersUrl: "https://www.navina.ai/careers",
    linkedinSlug: "navina-ai",
  },
  {
    name: "Sweet Security",
    website: "https://www.sweet.security",
    careersUrl: "https://www.sweet.security/careers",
    linkedinSlug: "sweetsecurity",
  },
  {
    name: "Windsurf",
    website: "https://windsurf.com",
    careersUrl: "https://windsurf.com/careers",
    linkedinSlug: "windsurf-ai",
  },
  {
    name: "OpenAI",
    website: "https://openai.com",
    careersUrl: "https://openai.com/careers",
    linkedinSlug: "openai",
    ats: "ASHBY",
    atsIdentifier: "openai",
  },
  {
    name: "Anthropic",
    website: "https://www.anthropic.com",
    careersUrl: "https://www.anthropic.com/careers",
    linkedinSlug: "anthropic",
    ats: "GREENHOUSE",
    atsIdentifier: "anthropic",
  },
];

const SEED_FLAG_V2 = "companies.seeded.v2";

/**
 * Israeli cyber/tech watchlist (batch 2). Names normalized (Intezer,
 * Cellebrite, Check Point, SentinelOne, Moon Active, CrowdStrike, SafeBreach).
 * Careers URLs set where established — the careers scraper auto-detects any
 * embedded ATS board. Everything is editable in the Companies page; ambiguous
 * young startups are flagged in notes so their careers URL can be filled in.
 */
export const ISRAELI_CYBER_BATCH: CompanySeed[] = [
  { name: "Mate", website: "", careersUrl: "", linkedinSlug: "" },
  { name: "Vega", website: "", careersUrl: "", linkedinSlug: "" },
  { name: "Legion", website: "", careersUrl: "", linkedinSlug: "" },
  { name: "Pillar Security", website: "https://www.pillar.security", careersUrl: "https://www.pillar.security/careers", linkedinSlug: "pillar-security" },
  { name: "Intezer", website: "https://intezer.com", careersUrl: "https://intezer.com/careers/", linkedinSlug: "intezer" },
  { name: "Torq", website: "https://torq.io", careersUrl: "https://torq.io/careers/", linkedinSlug: "torq-io" },
  { name: "Aqua Security", website: "https://www.aquasec.com", careersUrl: "https://www.aquasec.com/about-us/careers/", linkedinSlug: "aquasecurity" },
  { name: "Paragon", website: "", careersUrl: "", linkedinSlug: "" },
  { name: "Cato Networks", website: "https://www.catonetworks.com", careersUrl: "https://www.catonetworks.com/careers/", linkedinSlug: "cato-networks" },
  { name: "Check Point", website: "https://www.checkpoint.com", careersUrl: "https://careers.checkpoint.com", linkedinSlug: "check-point-software-technologies" },
  { name: "Island", website: "https://www.island.io", careersUrl: "https://www.island.io/careers", linkedinSlug: "island-io" },
  { name: "Upwind", website: "https://www.upwind.io", careersUrl: "https://www.upwind.io/careers", linkedinSlug: "upwindsecurity" },
  { name: "Astelia", website: "", careersUrl: "", linkedinSlug: "" },
  { name: "SafeBreach", website: "https://www.safebreach.com", careersUrl: "https://www.safebreach.com/careers/", linkedinSlug: "safebreach" },
  { name: "Tenable", website: "https://www.tenable.com", careersUrl: "https://careers.tenable.com", linkedinSlug: "tenableinc" },
  { name: "Sygnia", website: "https://www.sygnia.co", careersUrl: "https://www.sygnia.co/careers/", linkedinSlug: "sygnia-consulting" },
  { name: "Orca Security", website: "https://orca.security", careersUrl: "https://orca.security/about/careers/", linkedinSlug: "orca-security" },
  { name: "CrowdStrike", website: "https://www.crowdstrike.com", careersUrl: "https://www.crowdstrike.com/careers/", linkedinSlug: "crowdstrike" },
  { name: "SentinelOne", website: "https://www.sentinelone.com", careersUrl: "https://www.sentinelone.com/jobs/", linkedinSlug: "sentinelone" },
  { name: "Cellebrite", website: "https://cellebrite.com", careersUrl: "https://cellebrite.com/en/careers/", linkedinSlug: "cellebrite" },
  { name: "Axonius", website: "https://www.axonius.com", careersUrl: "https://www.axonius.com/careers", linkedinSlug: "axonius" },
  { name: "Cynet", website: "https://www.cynet.com", careersUrl: "https://www.cynet.com/careers/", linkedinSlug: "cynet-security" },
  { name: "CYE", website: "https://cyesec.com", careersUrl: "https://cyesec.com/careers/", linkedinSlug: "cye" },
  { name: "Moon Active", website: "https://www.moonactive.com", careersUrl: "https://www.moonactive.com/careers/", linkedinSlug: "moon-active" },
  { name: "Overwolf", website: "https://www.overwolf.com", careersUrl: "https://www.overwolf.com/careers/", linkedinSlug: "overwolf" },
  { name: "Charm", website: "", careersUrl: "", linkedinSlug: "" },
  { name: "Harmony", website: "", careersUrl: "", linkedinSlug: "" },
];

const AMBIGUOUS_NOTE =
  "Ambiguous company name — set the exact careers page URL (and website) here so the sweep can scrape it directly; LinkedIn search covers it meanwhile.";

async function seedBatch(batch: CompanySeed[], noteDefault: string): Promise<number> {
  let created = 0;
  for (const c of batch) {
    const existing = await prisma.company.findUnique({ where: { name: c.name } });
    if (existing) continue; // never overwrite dashboard edits
    await prisma.company.create({
      data: {
        name: c.name,
        website: c.website,
        careersUrl: c.careersUrl,
        linkedinSlug: c.linkedinSlug,
        ats: c.ats ?? "NONE",
        atsIdentifier: c.atsIdentifier ?? "",
        notes: c.website ? noteDefault : AMBIGUOUS_NOTE,
      },
    });
    created++;
  }
  return created;
}

/** Creates the favorite companies once per batch; returns how many were created. */
export async function seedFavoriteCompanies(): Promise<number> {
  let created = 0;
  if ((await getSetting(SEED_FLAG)) !== "true") {
    created += await seedBatch(FAVORITES, "Priority watchlist");
    await setSetting(SEED_FLAG, "true");
  }
  if ((await getSetting(SEED_FLAG_V2)) !== "true") {
    created += await seedBatch(ISRAELI_CYBER_BATCH, "Israeli cyber watchlist");
    await setSetting(SEED_FLAG_V2, "true");
  }
  return created;
}
