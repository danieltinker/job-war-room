import { describe, expect, it } from "vitest";
import { dedupeKeyFor, normalizeUrl, stripHtml } from "../src/core/normalize";

describe("normalizeUrl", () => {
  it("strips query strings and trailing slashes", () => {
    expect(normalizeUrl("https://x.com/jobs/123/?utm_source=foo#top")).toBe(
      "https://x.com/jobs/123"
    );
  });
  it("passes through invalid urls", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
  });
});

describe("dedupeKeyFor", () => {
  it("prefers source + external id", () => {
    expect(dedupeKeyFor("LINKEDIN", "999", "https://x.com/a?b=c")).toBe("linkedin:999");
  });
  it("falls back to normalized url", () => {
    expect(dedupeKeyFor("MANUAL", "", "https://x.com/a?b=c")).toBe("url:https://x.com/a");
  });
});

describe("stripHtml", () => {
  it("converts html to readable text", () => {
    expect(stripHtml("<p>Hello <b>world</b></p><p>Bye &amp; thanks</p>")).toBe(
      "Hello world\nBye & thanks"
    );
  });
});
