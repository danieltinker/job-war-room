import { describe, expect, it } from "vitest";
import { extractNewCompanyName, extractPositionTitle } from "../src/core/emailClassifier";

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

  it("returns null when nothing matches", () => {
    expect(
      extractPositionTitle({ fromAddress: "a@b.com", subject: "hello", body: "world" })
    ).toBeNull();
  });
});
