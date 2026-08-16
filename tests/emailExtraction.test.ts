import { describe, expect, it } from "vitest";
import { extractJobUrl, extractNewCompanyName, extractPositionTitle } from "../src/core/emailClassifier";

// Real LinkedIn Easy Apply confirmation shape (abridged)
const LINKEDIN_BODY = `Your application was sent to Cellebrite

Exploit Engineer
Cellebrite
Tel Aviv-Yafo
View job: https://www.linkedin.com/comm/jobs/view/4372536672/?trackingId=xyz

Applied on August 16, 2026
Now, take these next steps for more success

View similar jobs you may be interested in

Malware Research (Mid-Level)
Alice (Formerly ActiveFence)
View job: https://www.linkedin.com/comm/jobs/view/4451399582/?trackingId=abc`;

describe("extractNewCompanyName", () => {
  it("extracts from 'application to X' subjects", () => {
    expect(
      extractNewCompanyName({
        fromAddress: "no-reply@greenhouse.io",
        subject: "Thank you for your application to Team8",
        body: "",
      })
    ).toBe("Team8");
  });

  it("extracts from 'thank you for applying to X'", () => {
    expect(
      extractNewCompanyName({
        fromAddress: "do-not-reply@comeet.co",
        subject: "Thank you for applying to Wiz!",
        body: "",
      })
    ).toBe("Wiz");
  });

  it("falls back to the From display name, stripping generic words", () => {
    expect(
      extractNewCompanyName({
        fromAddress: "no-reply@comeet.co",
        fromName: "Team8 Careers",
        subject: "We received your application",
        body: "",
      })
    ).toBe("Team8");
  });

  it("falls back to a non-generic sender domain", () => {
    expect(
      extractNewCompanyName({
        fromAddress: "talent@monday.com",
        subject: "Update",
        body: "",
      })
    ).toBe("Monday");
  });

  it("extracts the employer from Comeet notification subdomains (real Team8 format)", () => {
    expect(
      extractNewCompanyName({
        fromAddress: "no-reply@team8.comeet-notifications.com",
        subject: "Thank you for applying for Reindeer- Software Engineer (Backend)",
        body: "Hi, Thank you for applying.",
      })
    ).toBe("Team8");
  });

  it("extracts the employer from Workday sender local parts", () => {
    expect(
      extractNewCompanyName({
        fromAddress: "redhat@myworkday.com",
        subject: "Your application",
        body: "",
      })
    ).toBe("Redhat");
  });

  it("extracts the employer from LinkedIn Easy Apply subjects — never 'LinkedIn'", () => {
    expect(
      extractNewCompanyName({
        fromAddress: "jobs-noreply@linkedin.com",
        fromName: "LinkedIn",
        subject: "Daniel, your application was sent to Blockaid",
        body: LINKEDIN_BODY,
      })
    ).toBe("Blockaid");
  });

  it("never falls back to a job-board display name", () => {
    expect(
      extractNewCompanyName({
        fromAddress: "jobs-noreply@linkedin.com",
        fromName: "LinkedIn",
        subject: "A message about your job search",
        body: "",
      })
    ).toBeNull();
  });

  it("refuses generic ATS domains with no other signal", () => {
    expect(
      extractNewCompanyName({
        fromAddress: "no-reply@greenhouse.io",
        subject: "We received your application",
        body: "",
      })
    ).toBeNull();
  });
});

describe("extractPositionTitle", () => {
  it("extracts 'application for the X position'", () => {
    expect(
      extractPositionTitle({
        fromAddress: "a@b.com",
        subject: "Your application for the Senior Backend Engineer position at Team8",
        body: "",
      })
    ).toBe("Senior Backend Engineer");
  });

  it("extracts from body when subject is generic", () => {
    expect(
      extractPositionTitle({
        fromAddress: "a@b.com",
        subject: "Application received",
        body: "Thank you for applying to the Platform Engineer role at Acme.",
      })
    ).toBe("Platform Engineer");
  });

  it("extracts the position from Comeet 'applying for' subjects (real Team8 format)", () => {
    expect(
      extractPositionTitle({
        fromAddress: "no-reply@team8.comeet-notifications.com",
        subject: "Thank you for applying for Team8-Cyber Startup, Senior Software Engineer",
        body: "",
      })
    ).toBe("Team8-Cyber Startup, Senior Software Engineer");
    expect(
      extractPositionTitle({
        fromAddress: "no-reply@team8.comeet-notifications.com",
        subject: "Thank you for applying for Reindeer- Software Engineer (Infrastructure)",
        body: "",
      })
    ).toBe("Reindeer- Software Engineer (Infrastructure)");
  });

  it("extracts the applied title from LinkedIn bodies, not the similar-jobs section", () => {
    expect(
      extractPositionTitle({
        fromAddress: "jobs-noreply@linkedin.com",
        fromName: "LinkedIn",
        subject: "Daniel, your application was sent to Cellebrite",
        body: LINKEDIN_BODY,
      })
    ).toBe("Exploit Engineer");
  });

  it("returns null when nothing matches", () => {
    expect(
      extractPositionTitle({ fromAddress: "a@b.com", subject: "hello", body: "world" })
    ).toBeNull();
  });
});

describe("extractJobUrl", () => {
  it("takes the applied job's link, not a similar-jobs link", () => {
    expect(
      extractJobUrl({ fromAddress: "jobs-noreply@linkedin.com", subject: "", body: LINKEDIN_BODY })
    ).toBe("https://www.linkedin.com/jobs/view/4372536672");
  });
  it("returns null without a link", () => {
    expect(extractJobUrl({ fromAddress: "a@b.com", subject: "", body: "no links here" })).toBeNull();
  });
});
