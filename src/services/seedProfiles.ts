/**
 * Starter position profiles, seeded once on worker boot (gated by a settings
 * flag so deleting or editing them never resurrects the defaults).
 * Deliberately loose — low thresholds, broad keywords — meant to be tuned in
 * the dashboard.
 */
import { prisma } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";

const SEED_FLAG = "profiles.seeded";

const COMMON_EXCLUDES = ["intern", "internship", "student position", "unpaid"];

const STARTER_PROFILES = [
  {
    name: "Backend",
    titleKeywords: ["backend engineer", "backend developer", "server-side engineer", "software engineer, backend"],
    keywords: [
      "node.js", "python", "go", "java", "microservices", "distributed systems",
      "postgresql", "redis", "kafka", "rest api", "grpc", "aws", "gcp", "sql",
    ],
    excludeKeywords: COMMON_EXCLUDES,
    minScore: 30,
  },
  {
    name: "Infrastructure / DevOps",
    titleKeywords: [
      "infrastructure engineer", "devops engineer", "platform engineer",
      "site reliability engineer", "sre", "cloud engineer",
    ],
    keywords: [
      "kubernetes", "terraform", "docker", "ci/cd", "aws", "gcp", "azure",
      "linux", "ansible", "helm", "observability", "prometheus", "networking",
    ],
    excludeKeywords: COMMON_EXCLUDES,
    minScore: 30,
  },
  {
    name: "AI Research",
    titleKeywords: [
      "ai researcher", "research engineer", "machine learning engineer",
      "ml engineer", "applied scientist", "deep learning engineer", "ai engineer",
    ],
    keywords: [
      "pytorch", "tensorflow", "llm", "nlp", "computer vision", "transformers",
      "machine learning", "deep learning", "generative ai", "rag", "fine-tuning",
      "reinforcement learning", "model training",
    ],
    excludeKeywords: COMMON_EXCLUDES,
    minScore: 30,
  },
  {
    name: "Cyber Research",
    titleKeywords: [
      "security researcher", "vulnerability researcher", "cyber security researcher",
      "security engineer", "reverse engineer", "malware researcher",
    ],
    keywords: [
      "reverse engineering", "vulnerability research", "exploit", "malware",
      "threat intelligence", "offensive security", "binary analysis", "low-level",
      "embedded", "fuzzing", "ida", "ghidra", "penetration testing", "red team",
    ],
    excludeKeywords: COMMON_EXCLUDES,
    minScore: 30,
  },
  {
    name: "Software Developer (generalist)",
    titleKeywords: ["software engineer", "software developer"],
    keywords: [
      "c++", "python", "javascript", "typescript", "java", "algorithms",
      "data structures", "git", "sql", "linux",
    ],
    // Generalist casts the widest net — slightly higher bar + trim adjacent roles
    excludeKeywords: [...COMMON_EXCLUDES, "qa engineer", "test automation", "technical writer"],
    minScore: 35,
  },
  {
    name: "Full Stack",
    titleKeywords: ["full stack", "fullstack", "full-stack"],
    keywords: [
      "react", "node.js", "typescript", "next.js", "javascript", "frontend",
      "backend", "rest api", "postgresql", "mongodb", "graphql", "tailwind",
    ],
    excludeKeywords: COMMON_EXCLUDES,
    minScore: 30,
  },
];

/** Creates the starter profiles once; returns how many were created. */
export async function seedStarterProfiles(): Promise<number> {
  const seeded = await getSetting(SEED_FLAG);
  if (seeded === "true") return 0;

  const existing = await prisma.positionProfile.findMany({ select: { name: true } });
  const existingNames = new Set(existing.map((p) => p.name.toLowerCase()));

  let created = 0;
  for (const profile of STARTER_PROFILES) {
    if (existingNames.has(profile.name.toLowerCase())) continue;
    await prisma.positionProfile.create({
      data: {
        name: profile.name,
        titleKeywords: profile.titleKeywords,
        keywords: profile.keywords,
        excludeKeywords: profile.excludeKeywords,
        locations: ["Israel", "Tel Aviv"],
        remoteOk: true,
        minScore: profile.minScore,
      },
    });
    created++;
  }

  await setSetting(SEED_FLAG, "true");
  return created;
}
