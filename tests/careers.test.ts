import { describe, expect, it } from "vitest";
import { detectAts, extractJobLinks, parseJsonLdJobs } from "../src/scrapers/careers";

describe("detectAts", () => {
  it("detects an embedded Greenhouse board", () => {
    expect(
      detectAts('<iframe src="https://boards.greenhouse.io/embed/job_board?for=stripe">')
    ).toEqual({ kind: "GREENHOUSE", identifier: "stripe" });
  });
  it("detects Lever links", () => {
    expect(detectAts('<a href="https://jobs.lever.co/spotify/abc-123">Apply</a>')).toEqual({
      kind: "LEVER",
      identifier: "spotify",
    });
  });
  it("detects Ashby boards", () => {
    expect(detectAts('<a href="https://jobs.ashbyhq.com/linear">')).toEqual({
      kind: "ASHBY",
      identifier: "linear",
    });
  });
  it("returns null for plain pages", () => {
    expect(detectAts("<html><body>Join us!</body></html>")).toBeNull();
  });
});

describe("parseJsonLdJobs", () => {
  it("parses JobPosting JSON-LD", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Senior Backend Engineer",
      url: "/careers/senior-backend",
      datePosted: "2026-08-01",
      description: "<p>Node.js and PostgreSQL</p>",
      hiringOrganization: { name: "Acme" },
      jobLocation: { address: { addressLocality: "Tel Aviv", addressCountry: "IL" } },
    })}</script>`;
    const jobs = parseJsonLdJobs(html, "https://acme.com/careers", "Acme");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("Senior Backend Engineer");
    expect(jobs[0].url).toBe("https://acme.com/careers/senior-backend");
    expect(jobs[0].location).toContain("Tel Aviv");
    expect(jobs[0].description).toContain("Node.js");
  });

  it("parses ItemList graphs of postings", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "ItemList",
      itemListElement: [
        { "@type": "ListItem", item: { "@type": "JobPosting", title: "DevOps Engineer", url: "https://x.com/j/1" } },
        { "@type": "ListItem", item: { "@type": "JobPosting", title: "Data Engineer", url: "https://x.com/j/2" } },
      ],
    })}</script>`;
    const jobs = parseJsonLdJobs(html, "https://x.com/careers", "X");
    expect(jobs.map((j) => j.title)).toEqual(["DevOps Engineer", "Data Engineer"]);
  });
});

describe("extractJobLinks", () => {
  const html = `
    <nav><a href="/careers">Careers</a><a href="/about">About</a></nav>
    <ul>
      <li><a href="/careers/senior-backend-engineer-1234">Senior Backend Engineer</a></li>
      <li><a href="/jobs/platform-engineer">Platform Engineer</a></li>
      <li><a href="https://other.example.com/positions/data-eng">Data Engineer</a></li>
      <li><a href="/careers/senior-backend-engineer-1234">Senior Backend Engineer</a></li>
    </ul>
    <a href="/careers">See all</a>
    <a href="/blog/how-we-hire">How we hire</a>`;

  it("keeps posting-like links, resolves URLs, dedupes, drops nav noise", () => {
    const jobs = extractJobLinks(html, "https://acme.com/careers", "Acme");
    expect(jobs.map((j) => j.title)).toEqual([
      "Senior Backend Engineer",
      "Platform Engineer",
      "Data Engineer",
    ]);
    expect(jobs[0].url).toBe("https://acme.com/careers/senior-backend-engineer-1234");
  });
});
