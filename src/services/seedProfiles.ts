/**
 * Position profiles seeded on worker boot, gated by settings flags so
 * dashboard edits/deletions are never overwritten.
 *
 * v2 profiles are derived from Daniel's resume (malware research @ Alice,
 * agentic AI pipelines, 3-4y cumulative full-stack, C/C++ + assembly at
 * entry level). Each profile name carries the target level so it's obvious
 * what bar the matcher is aiming at — tune freely in the dashboard.
 */
import { prisma } from "@/lib/db";
import { getSetting, setSetting, SETTING_KEYS } from "@/lib/settings";

const SEED_FLAG_V1 = "profiles.seeded";
const SEED_FLAG_V2 = "profiles.seeded.v2";

/** Applied to every profile, title-only, editable in Settings. */
const DEFAULT_GLOBAL_TITLE_EXCLUDES = [
  "sales", "account executive", "account manager", "business development",
  "marketing", "finance", "financial", "accountant", "controller", "fp&a",
  "real estate", "insurance", "attorney", "legal", "paralegal", "compliance",
  "recruiter", "talent", "human resources", "hr ", "customer success",
  "customer support", "procurement", "supply chain", "operations manager",
  "office manager", "executive assistant", "chief", "cfo", "coo", "cro",
  "vp ", "vice president", "president", "general manager", "partnerships",
  "product marketing", "content", "copywriter", "designer", "ux", "retail",
].join(", ");

const V1_NAMES = [
  "Backend",
  "Infrastructure / DevOps",
  "AI Research",
  "Cyber Research",
  "Software Developer (generalist)",
  "Full Stack",
];

const LEADERSHIP_EXCLUDES = ["principal", "staff engineer", "director", "head of", "team lead", "manager"];
const JUNIOR_EXCLUDES = ["intern", "internship", "student position", "unpaid"];

const V2_PROFILES = [
  {
    // Strongest, most differentiated area — current day job.
    name: "Malware & Security Research — Mid",
    titleKeywords: [
      "malware researcher", "security researcher", "threat researcher",
      "vulnerability researcher", "reverse engineer", "threat intelligence",
      "malware analyst", "mobile security researcher", "security research engineer",
    ],
    keywords: [
      "reverse engineering", "malware", "frida", "ghidra", "ida", "android",
      "threat intelligence", "ioc", "c2", "binary analysis", "dynamic analysis",
      "static analysis", "mobile security", "obfuscation", "threat hunting",
    ],
    excludeKeywords: [...JUNIOR_EXCLUDES],
    titleOnlyNote: "leadership filtered globally",
    minScore: 30,
    notes: "Level: MID (current role at Alice — malware research, Android RE, threat intel). Primary target.",
  },
  {
    // Real production LLM/agent experience — engineer-track, not PhD-track.
    name: "AI / LLM Engineering — Mid",
    titleKeywords: [
      "ai engineer", "llm engineer", "genai engineer", "generative ai",
      "machine learning engineer", "applied ai", "agentic", "ai developer",
      "prompt engineer", "ml engineer",
    ],
    keywords: [
      "langchain", "langgraph", "llm", "rag", "agents", "prompt", "fastapi",
      "python", "fine-tuning", "embeddings", "vector database", "openai",
      "anthropic", "evaluation", "nlp",
    ],
    excludeKeywords: [...JUNIOR_EXCLUDES, "research scientist", "phd required"],
    minScore: 30,
    notes: "Level: MID engineer-track (LangGraph/RAG/agent pipelines in production at Alice). Target AI/LLM engineer roles, not PhD research-scientist roles.",
  },
  {
    // Security engineering + automation — bridges research and development.
    name: "Security Tooling & Automation — Mid",
    titleKeywords: [
      "security engineer", "detection engineer", "security automation",
      "security developer", "research engineer", "security tools",
    ],
    keywords: [
      "python", "automation", "detection", "playwright", "pipelines", "soar",
      "security research", "integrations", "telemetry", "instrumentation",
      "tooling", "api",
    ],
    excludeKeywords: [...JUNIOR_EXCLUDES, "soc analyst", "compliance", "grc", "it security"],
    minScore: 35,
    notes: "Level: MID (built analysis pipelines and security tooling at Alice + C2 system at Head-On). 'Security engineer' is a broad title — threshold set higher.",
  },
  {
    // Solid professional history — cast as the safety net, higher bar.
    name: "Backend / Full Stack — Mid",
    titleKeywords: [
      "full stack developer", "full stack engineer", "backend developer",
      "backend engineer", "software engineer", "software developer",
    ],
    keywords: [
      "python", "typescript", "node.js", "react", "next.js", "fastapi",
      "postgresql", "sql", "aws", "gcp", "docker", "terraform", "rest api",
    ],
    excludeKeywords: [...JUNIOR_EXCLUDES, "wordpress", "salesforce", "sap", ".net", "php"],
    minScore: 45,
    notes: "Level: MID (~3-4y cumulative: IAF, Head-On C2 system, freelance cloud). Generalist net — highest threshold so only strong matches surface.",
  },
  {
    // Explicitly entry-level per Daniel: assembly + C/C++ foundations, wants in.
    name: "Low-Level / C C++ — Entry",
    titleKeywords: [
      "c++ developer", "c++ engineer", "embedded software", "low level",
      "low-level", "systems programmer", "firmware",
    ],
    keywords: [
      "c++", "assembly", "arm", "x86", "kernel", "drivers", "embedded",
      "operating systems", "rtos", "memory", "linux internals", "multithreading",
    ],
    excludeKeywords: [...JUNIOR_EXCLUDES, "senior", "staff", "principal", "lead", "architect", "expert"],
    minScore: 30,
    notes: "Level: ENTRY/JUNIOR by request (ARMv8/x86 assembly, C/C++ coursework, RE-adjacent). Senior+ titles filtered out for this profile only.",
  },
];

async function ensureGlobalExcludes(): Promise<void> {
  const existing = await getSetting(SETTING_KEYS.globalTitleExcludes);
  if (existing == null) {
    await setSetting(SETTING_KEYS.globalTitleExcludes, DEFAULT_GLOBAL_TITLE_EXCLUDES);
  }
}

/** v1 (kept for fresh installs that never ran it — superseded by v2). */
export async function seedStarterProfiles(): Promise<number> {
  // v2 supersedes v1 entirely; mark v1 done so it never runs.
  if ((await getSetting(SEED_FLAG_V1)) !== "true") {
    await setSetting(SEED_FLAG_V1, "true");
  }
  return seedResumeProfiles();
}

/** v2: resume-derived profiles. Deactivates untouched v1 starter profiles. */
export async function seedResumeProfiles(): Promise<number> {
  await ensureGlobalExcludes();
  if ((await getSetting(SEED_FLAG_V2)) === "true") return 0;

  // Retire the generic v1 set (deactivate, never delete — history stays intact)
  await prisma.positionProfile.updateMany({
    where: { name: { in: V1_NAMES } },
    data: { active: false },
  });
  // Their open suggestions are what flooded the dashboard — clear them out.
  await prisma.match.updateMany({
    where: { profile: { name: { in: V1_NAMES } }, status: "SUGGESTED" },
    data: { status: "DISMISSED" },
  });

  const existing = await prisma.positionProfile.findMany({ select: { name: true } });
  const existingNames = new Set(existing.map((p) => p.name.toLowerCase()));

  let created = 0;
  for (const profile of V2_PROFILES) {
    if (existingNames.has(profile.name.toLowerCase())) continue;
    await prisma.positionProfile.create({
      data: {
        name: profile.name,
        titleKeywords: profile.titleKeywords,
        keywords: profile.keywords,
        excludeKeywords: profile.excludeKeywords,
        locations: ["Tel Aviv", "Israel"],
        remoteOk: true,
        minScore: profile.minScore,
      },
    });
    created++;
  }

  await setSetting(SEED_FLAG_V2, "true");
  return created;
}
