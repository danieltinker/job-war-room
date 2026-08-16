/**
 * Heuristic classifier for job-application emails, plus company extraction
 * so a message can be linked back to an application in the pipeline.
 * Pure functions — unit-testable without an inbox.
 */

export type EmailClassification =
  | "APPLICATION_RECEIVED"
  | "ASSESSMENT"
  | "INTERVIEW"
  | "OFFER"
  | "REJECTION"
  | "RECRUITER_OUTREACH"
  | "OTHER";

export interface EmailFacts {
  fromAddress: string;
  fromName?: string; // display name on the From header, e.g. "Team8 Careers"
  subject: string;
  body: string;
}

interface Rule {
  classification: EmailClassification;
  patterns: RegExp[];
}

// Ordered: first hit wins. Rejections before interviews because rejection
// emails often mention "interview" ("after your interview we decided…").
const RULES: Rule[] = [
  {
    classification: "REJECTION",
    patterns: [
      /not (?:to )?(?:be )?moving forward/i,
      /(?:decided|chosen) to (?:move forward|proceed) with other candidates/i,
      /unfortunately.{0,120}(?:not|other candidates|unable)/i,
      /we (?:will not|won't) be (?:progressing|proceeding|moving)/i,
      /pursue other (?:candidates|applicants)/i,
      /position has been filled/i,
      /not selected/i,
      /no longer under consideration/i,
      /wish you (?:the best|success|luck).{0,80}(?:search|future|endeavou?rs)/i,
    ],
  },
  {
    classification: "OFFER",
    patterns: [
      /(?:pleased|excited|delighted|happy) to (?:extend|offer|make you)/i,
      /offer (?:letter|of employment|details)/i,
      /your (?:compensation|salary) package/i,
      /congratulations.{0,120}offer/i,
    ],
  },
  {
    classification: "ASSESSMENT",
    patterns: [
      /(?:online|take-?home|technical|coding) (?:assessment|assignment|challenge|test|task)/i,
      /hackerrank|codility|codesignal|hackerearth|karat/i,
      /complete (?:the|this|your) (?:assessment|challenge|exercise)/i,
    ],
  },
  {
    classification: "INTERVIEW",
    patterns: [
      /schedule (?:an?|your) (?:interview|call|conversation|meeting)/i,
      /interview (?:invitation|confirmed|scheduled|availability)/i,
      /invite you to (?:an? )?(?:interview|chat|call|meet)/i,
      /(?:phone|video|technical|onsite|on-site|final) (?:screen|interview|round)/i,
      /next (?:step|stage|round).{0,80}(?:interview|call|conversation)/i,
      /book a time|pick a (?:time|slot)|calendly\.com|goodtime\.io/i,
    ],
  },
  {
    classification: "APPLICATION_RECEIVED",
    patterns: [
      /(?:thank|thanks).{0,60}(?:applying|application|interest)/i,
      /application (?:has been )?(?:received|submitted|sent)/i,
      /we(?:'ve| have) received your application/i,
      /your application (?:to|for|was)/i,
    ],
  },
  {
    classification: "RECRUITER_OUTREACH",
    patterns: [
      /(?:came across|found|saw) your (?:profile|resume|cv)/i,
      /(?:exciting|great|new) (?:opportunity|opening|role) (?:at|with|for)/i,
      /are you open to (?:new |exploring )?(?:opportunities|roles|a conversation)/i,
      /i(?:'m| am) (?:a )?(?:recruiter|talent|sourcing|hiring)/i,
    ],
  },
];

/** Senders that are almost always ATS/job-related — used to pre-filter the inbox. */
export const JOB_SENDER_HINTS = [
  "greenhouse",
  "lever.co",
  "ashbyhq",
  "workday",
  "myworkday",
  "smartrecruiters",
  "icims",
  "jobvite",
  "bamboohr",
  "recruitee",
  "workable",
  "comeet",
  "linkedin.com",
  "indeed.com",
  "glassdoor",
  "no-reply",
  "noreply",
  "careers",
  "talent",
  "recruiting",
  "recruitment",
  "hr@",
  "jobs@",
];

export function looksJobRelated(facts: EmailFacts): boolean {
  const from = facts.fromAddress.toLowerCase();
  if (JOB_SENDER_HINTS.some((h) => from.includes(h))) return true;
  const subject = facts.subject.toLowerCase();
  return /application|interview|position|role|opportunity|assessment|offer|candidate|recruit/i.test(
    subject
  );
}

export function classifyEmail(facts: EmailFacts): EmailClassification {
  const text = `${facts.subject}\n${facts.body}`;
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.classification;
  }
  return "OTHER";
}

/**
 * Try to figure out which company an email is about, given the list of
 * company names present in the pipeline. Checks sender domain and text.
 */
export function extractCompany(facts: EmailFacts, knownCompanies: string[]): string | null {
  const domain = facts.fromAddress.split("@")[1]?.toLowerCase() ?? "";
  const text = `${facts.subject}\n${facts.body}`.toLowerCase();

  let best: string | null = null;
  let bestLen = 0;
  for (const name of knownCompanies) {
    const n = name.toLowerCase().trim();
    if (n.length < 2) continue;
    const compact = n.replace(/[^a-z0-9]/g, "");
    const inDomain = compact.length >= 3 && domain.replace(/[^a-z0-9]/g, "").includes(compact);
    const inText = text.includes(n);
    if ((inDomain || inText) && n.length > bestLen) {
      best = name;
      bestLen = n.length;
    }
  }
  return best;
}

/** ATS/mailer domains that never identify the actual employer. */
const GENERIC_SENDER_DOMAINS =
  /greenhouse|lever\.co|ashbyhq|comeet|workday|myworkday|smartrecruiters|icims|jobvite|bamboohr|recruitee|workable|linkedin|indeed|glassdoor|gmail|outlook|hotmail|yahoo|sendgrid|mailgun|amazonses/i;

const GENERIC_NAME_WORDS =
  /\b(careers?|recruit(?:ing|ment)?|talent(?:\s+acquisition)?|jobs?|hr|hiring|people(?:\s+ops)?|no-?reply|notifications?|team)\b/gi;

/**
 * Best-effort employer name for an email that matches no known company —
 * used to auto-create applications from confirmation emails.
 */
/** ATS mailer domains where the employer is the subdomain:
 *  no-reply@team8.comeet-notifications.com → "Team8" */
const ATS_SUBDOMAIN_MAILERS =
  /^([a-z0-9-]+)\.(comeet-notifications\.com|bamboohr\.com|recruitee\.com|workablemail\.com|greenhouse-mail\.io)$/;

export function extractNewCompanyName(facts: EmailFacts): string | null {
  const clean = (s: string) =>
    s
      .replace(GENERIC_NAME_WORDS, " ")
      .replace(/[|@·–—-]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const [localPart, domain0] = facts.fromAddress.toLowerCase().split("@");

  // 0) ATS mailers that encode the employer in the address itself
  const sub = domain0?.match(ATS_SUBDOMAIN_MAILERS);
  if (sub) return sub[1].charAt(0).toUpperCase() + sub[1].slice(1);
  if (domain0 === "myworkday.com" && localPart && localPart.length >= 2) {
    // Workday sends from <company>@myworkday.com
    return localPart.charAt(0).toUpperCase() + localPart.slice(1);
  }

  // 1) Subject patterns: "your application to X", "thank you for applying to X"
  const subjectPatterns = [
    /(?:your |the )?application (?:to|at|with|for a position at) ([A-Za-z0-9][\w .&'-]{1,40})/i,
    /(?:thank(?:s| you)) for applying (?:to|at) ([A-Za-z0-9][\w .&'-]{1,40})/i,
    /interest in (?:joining )?([A-Za-z0-9][\w .&'-]{1,40})/i,
  ];
  for (const p of subjectPatterns) {
    const m = facts.subject.match(p);
    if (m) {
      const name = clean(m[1].replace(/[.!,;:]+$/, ""));
      if (name.length >= 2) return name;
    }
  }

  // 2) From display name: "Team8 Careers <no-reply@comeet.co>" → "Team8"
  if (facts.fromName) {
    const name = clean(facts.fromName);
    if (name.length >= 2 && name.length <= 40 && !/@/.test(name)) return name;
  }

  // 3) Sender domain, unless it's a generic ATS/mailer domain
  const domain = facts.fromAddress.split("@")[1]?.toLowerCase() ?? "";
  if (domain && !GENERIC_SENDER_DOMAINS.test(domain)) {
    const label = domain.split(".").slice(-2, -1)[0] ?? "";
    if (label.length >= 2) return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return null;
}

/** Best-effort position title from an application email, or null. */
export function extractPositionTitle(facts: EmailFacts): string | null {
  // Comeet-style subjects put the position (not the company) after "for":
  // "Thank you for applying for Reindeer- Software Engineer (Backend)"
  const subjectTail = facts.subject.match(
    /thank(?:s| you) for applying (?:for|to)[:\s]+(.{3,90}?)\s*$/i
  );
  if (subjectTail) {
    const title = subjectTail[1].replace(/\s+/g, " ").trim();
    // If it reads like a role (contains a role-ish word), trust it
    if (/engineer|developer|researcher|scientist|manager|analyst|architect|designer|lead|devops|sre|consultant|specialist/i.test(title)) {
      return title;
    }
  }

  const text = `${facts.subject}\n${facts.body.slice(0, 1000)}`;
  const patterns = [
    /application for (?:the )?(?:position of )?["“]?([^"”,\n]{3,80}?)["”]? (?:position|role|at|with)\b/i,
    /applying (?:for|to) (?:the )?["“]?([^"”,\n]{3,80}?)["”]? (?:position|role)\b/i,
    /application (?:to|for) the ([^,\n]{3,80}?) (?:position|role|opening)\b/i,
    /position[:\s]+["“]?([^"”,\n]{3,80})["”]?(?:\n|$)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const title = m[1].replace(/\s+/g, " ").trim();
      if (title.length >= 3) return title;
    }
  }
  return null;
}

/** Map an email classification to the pipeline status it implies (or null). */
export function statusForClassification(
  c: EmailClassification
): "IN_REVIEW" | "ASSESSMENT" | "INTERVIEW" | "OFFER" | "REJECTED" | null {
  switch (c) {
    case "APPLICATION_RECEIVED":
      return "IN_REVIEW";
    case "ASSESSMENT":
      return "ASSESSMENT";
    case "INTERVIEW":
      return "INTERVIEW";
    case "OFFER":
      return "OFFER";
    case "REJECTION":
      return "REJECTED";
    default:
      return null;
  }
}

/** Pipeline statuses only ever move forward automatically; email can never
 *  demote e.g. OFFER back to IN_REVIEW. REJECTED always wins. */
const STATUS_RANK: Record<string, number> = {
  APPLIED: 0,
  IN_REVIEW: 1,
  ASSESSMENT: 2,
  INTERVIEW: 3,
  OFFER: 4,
  REJECTED: 5,
  WITHDRAWN: 5,
  GHOSTED: 1,
};

export function shouldAdvance(current: string, proposed: string): boolean {
  if (proposed === "REJECTED") return current !== "WITHDRAWN";
  return (STATUS_RANK[proposed] ?? 0) > (STATUS_RANK[current] ?? 0);
}
