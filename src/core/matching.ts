/**
 * Matching engine: scores a scraped job against a position profile.
 * Pure functions — no I/O — so the scoring rules are unit-testable.
 */

export interface ProfileRules {
  keywords: string[];
  titleKeywords: string[];
  excludeKeywords: string[];
  /** Hard filters matched against the TITLE only — safe for words like
   *  "sales" that legitimately appear inside engineering job descriptions. */
  titleExcludes?: string[];
  locations: string[];
  remoteOk: boolean;
  minScore: number;
}

export interface JobFacts {
  title: string;
  description: string;
  location: string;
}

export interface MatchResult {
  score: number; // 0..100
  matchedKeywords: string[];
  suggested: boolean;
  reason: string;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Word-boundary-ish containment that tolerates symbols like "c++" and "node.js". */
export function containsTerm(haystack: string, term: string): boolean {
  const h = norm(haystack);
  const t = norm(term);
  if (!t) return false;
  const idx = h.indexOf(t);
  if (idx === -1) return false;
  const before = idx === 0 ? " " : h[idx - 1];
  const after = idx + t.length >= h.length ? " " : h[idx + t.length];
  const isWordChar = (c: string) => /[a-z0-9]/.test(c);
  // Require non-word boundaries only when the term itself starts/ends with word chars
  const okBefore = !isWordChar(t[0]) || !isWordChar(before);
  const okAfter = !isWordChar(t[t.length - 1]) || !isWordChar(after);
  return okBefore && okAfter;
}

const REMOTE_HINTS = ["remote", "hybrid", "work from home", "wfh", "anywhere"];

export function looksRemote(job: JobFacts): boolean {
  const blob = `${job.title} ${job.location}`;
  return REMOTE_HINTS.some((h) => containsTerm(blob, h));
}

export function scoreJob(job: JobFacts, rules: ProfileRules): MatchResult {
  const text = `${job.title}\n${job.description}`;

  // Hard exclusions first — title-only excludes, then full-text excludes
  for (const ex of rules.titleExcludes ?? []) {
    if (containsTerm(job.title, ex)) {
      return { score: 0, matchedKeywords: [], suggested: false, reason: `title excluded: "${ex}"` };
    }
  }
  for (const ex of rules.excludeKeywords) {
    if (containsTerm(text, ex)) {
      return { score: 0, matchedKeywords: [], suggested: false, reason: `excluded: "${ex}"` };
    }
  }

  // Location gate: if locations are specified, job must match one of them
  // (or read as remote when remoteOk).
  if (rules.locations.length > 0) {
    const locOk = rules.locations.some((l) => containsTerm(job.location, l));
    if (!locOk && !(rules.remoteOk && looksRemote(job))) {
      return { score: 0, matchedKeywords: [], suggested: false, reason: "location mismatch" };
    }
  }

  const matched: string[] = [];
  let points = 0;

  // Title keywords are the strongest signal: 30 pts each (matched vs title only)
  for (const kw of rules.titleKeywords) {
    if (containsTerm(job.title, kw)) {
      matched.push(kw);
      points += 30;
    }
  }

  // General keywords: 15 pts in title, 8 pts in description
  for (const kw of rules.keywords) {
    if (matched.includes(kw)) continue;
    if (containsTerm(job.title, kw)) {
      matched.push(kw);
      points += 15;
    } else if (containsTerm(job.description, kw)) {
      matched.push(kw);
      points += 8;
    }
  }

  const score = Math.min(100, points);
  const suggested = score >= rules.minScore && matched.length > 0;
  return {
    score,
    matchedKeywords: matched,
    suggested,
    reason: suggested ? "matched" : "below threshold",
  };
}
