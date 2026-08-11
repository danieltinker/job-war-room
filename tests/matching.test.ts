import { describe, expect, it } from "vitest";
import { containsTerm, looksRemote, scoreJob, type ProfileRules } from "../src/core/matching";

const baseRules: ProfileRules = {
  keywords: ["node.js", "postgresql", "aws"],
  titleKeywords: ["backend engineer"],
  excludeKeywords: ["intern"],
  locations: [],
  remoteOk: true,
  minScore: 40,
};

describe("containsTerm", () => {
  it("matches whole terms only", () => {
    expect(containsTerm("Senior Java Developer", "java")).toBe(true);
    expect(containsTerm("JavaScript Developer", "java")).toBe(false);
  });
  it("handles symbol-laden terms", () => {
    expect(containsTerm("We use C++ and Node.js daily", "c++")).toBe(true);
    expect(containsTerm("We use C++ and Node.js daily", "node.js")).toBe(true);
  });
  it("is case-insensitive", () => {
    expect(containsTerm("BACKEND ENGINEER", "backend engineer")).toBe(true);
  });
});

describe("scoreJob", () => {
  it("suggests a strong title match", () => {
    const r = scoreJob(
      {
        title: "Senior Backend Engineer",
        description: "Node.js, PostgreSQL, AWS experience required",
        location: "Tel Aviv",
      },
      baseRules
    );
    expect(r.suggested).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(40);
    expect(r.matchedKeywords).toContain("backend engineer");
  });

  it("hard-excludes on exclude keywords", () => {
    const r = scoreJob(
      { title: "Backend Engineer Intern", description: "node.js", location: "" },
      baseRules
    );
    expect(r.suggested).toBe(false);
    expect(r.score).toBe(0);
  });

  it("rejects location mismatches when locations are set", () => {
    const rules = { ...baseRules, locations: ["Israel"], remoteOk: false };
    const r = scoreJob(
      { title: "Backend Engineer", description: "node.js", location: "Berlin, Germany" },
      rules
    );
    expect(r.suggested).toBe(false);
    expect(r.reason).toBe("location mismatch");
  });

  it("accepts remote jobs when remoteOk despite location filter", () => {
    const rules = { ...baseRules, locations: ["Israel"], remoteOk: true };
    const r = scoreJob(
      { title: "Backend Engineer (Remote)", description: "node.js postgresql", location: "Remote - EMEA" },
      rules
    );
    expect(r.suggested).toBe(true);
  });

  it("stays below threshold on weak matches", () => {
    const r = scoreJob(
      { title: "Product Manager", description: "some aws exposure", location: "" },
      baseRules
    );
    expect(r.suggested).toBe(false);
  });

  it("caps the score at 100", () => {
    const rules: ProfileRules = {
      ...baseRules,
      titleKeywords: ["engineer", "backend", "senior", "developer"],
    };
    const r = scoreJob(
      { title: "Senior Backend Engineer Developer", description: "node.js postgresql aws", location: "" },
      rules
    );
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("looksRemote", () => {
  it("detects remote hints", () => {
    expect(looksRemote({ title: "Engineer (Remote)", description: "", location: "" })).toBe(true);
    expect(looksRemote({ title: "Engineer", description: "", location: "Hybrid - Tel Aviv" })).toBe(true);
    expect(looksRemote({ title: "Engineer", description: "", location: "New York" })).toBe(false);
  });
});
