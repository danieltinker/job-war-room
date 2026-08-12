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

const FAVORITES: CompanySeed[] = [
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

/** Creates the favorite companies once; returns how many were created. */
export async function seedFavoriteCompanies(): Promise<number> {
  const seeded = await getSetting(SEED_FLAG);
  if (seeded === "true") return 0;

  let created = 0;
  for (const c of FAVORITES) {
    const existing = await prisma.company.findUnique({ where: { name: c.name } });
    if (existing) {
      // e.g. Team8 was auto-added from email earlier — enrich, don't duplicate
      continue;
    }
    await prisma.company.create({
      data: {
        name: c.name,
        website: c.website,
        careersUrl: c.careersUrl,
        linkedinSlug: c.linkedinSlug,
        ats: c.ats ?? "NONE",
        atsIdentifier: c.atsIdentifier ?? "",
        notes: "Priority watchlist",
      },
    });
    created++;
  }

  await setSetting(SEED_FLAG, "true");
  return created;
}
