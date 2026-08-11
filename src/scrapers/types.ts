import type { JobSource } from "@prisma/client";

export interface ScrapedJob {
  source: JobSource;
  externalId: string;
  url: string;
  title: string;
  companyName: string;
  location: string;
  description: string;
  postedAt: Date | null;
}

export interface ScrapeContext {
  /** Authenticated LinkedIn cookie (li_at), if the user connected their account. */
  linkedinLiAt: string | null;
}
