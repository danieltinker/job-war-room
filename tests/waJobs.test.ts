import { describe, expect, it } from "vitest";
import { companyFromUrl, detectJobPost } from "../src/services/waJobs";

describe("detectJobPost", () => {
  it("detects a Hebrew job post with a link", () => {
    const d = detectJobPost(
      "מגייסים Security Researcher לצוות שלנו בתל אביב! ניסיון ב-reverse engineering חובה.\nלינק למשרה: https://boards.greenhouse.io/acme/jobs/123\nאפשר לפנות אליי בפרטי להפניה"
    );
    expect(d.isJobPost).toBe(true);
    expect(d.urls).toEqual(["https://boards.greenhouse.io/acme/jobs/123"]);
    expect(d.title).toContain("Security Researcher");
  });

  it("detects an English post without a link when signals are strong", () => {
    const d = detectJobPost(
      "We're hiring a Backend Engineer (Node.js) for our TLV office — referral bonus, DM me your CV!"
    );
    expect(d.isJobPost).toBe(true);
    expect(d.urls).toEqual([]);
  });

  it("ignores chatter", () => {
    expect(detectJobPost("מישהו יודע אם יש חניה ליד המשרד?").isJobPost).toBe(false);
    expect(detectJobPost("thanks! see you tomorrow").isJobPost).toBe(false);
  });

  it("ignores bare links with no hiring language", () => {
    expect(detectJobPost("https://example.com/blog/post check this out").isJobPost).toBe(false);
  });
});

describe("companyFromUrl", () => {
  it("extracts company slugs from ATS urls", () => {
    expect(companyFromUrl("https://boards.greenhouse.io/wizinc/jobs/123")).toBe("Wizinc");
    expect(companyFromUrl("https://jobs.lever.co/spotify/abc")).toBe("Spotify");
    expect(companyFromUrl("https://www.comeet.com/jobs/cyera/17.008/careers/4A.C3B")).toBe("Cyera");
  });
  it("falls back to the domain label", () => {
    expect(companyFromUrl("https://careers.checkpoint.com/some/job")).toBe("Checkpoint");
  });
  it("returns empty for linkedin job links", () => {
    expect(companyFromUrl("https://www.linkedin.com/jobs/view/1234567")).toBe("");
  });
});
