import { describe, expect, it } from "vitest";
import {
  classifyEmail,
  extractCompany,
  looksJobRelated,
  shouldAdvance,
  statusForClassification,
} from "../src/core/emailClassifier";

describe("classifyEmail", () => {
  it("detects rejections", () => {
    expect(
      classifyEmail({
        fromAddress: "no-reply@acme.com",
        subject: "Update on your application",
        body: "Unfortunately we have decided to move forward with other candidates.",
      })
    ).toBe("REJECTION");
  });

  it("prefers rejection over interview mentions", () => {
    expect(
      classifyEmail({
        fromAddress: "hr@acme.com",
        subject: "Your interview outcome",
        body: "After your interview, we will not be progressing your application. We wish you the best in your search.",
      })
    ).toBe("REJECTION");
  });

  it("detects interview invitations", () => {
    expect(
      classifyEmail({
        fromAddress: "recruiting@acme.com",
        subject: "Next steps",
        body: "We'd love to schedule an interview with you. Please pick a time: calendly.com/acme",
      })
    ).toBe("INTERVIEW");
  });

  it("detects assessments", () => {
    expect(
      classifyEmail({
        fromAddress: "no-reply@hackerrank.com",
        subject: "Acme coding challenge",
        body: "Please complete the assessment within 7 days.",
      })
    ).toBe("ASSESSMENT");
  });

  it("detects offers", () => {
    expect(
      classifyEmail({
        fromAddress: "hr@acme.com",
        subject: "Congratulations!",
        body: "We are pleased to extend an offer of employment.",
      })
    ).toBe("OFFER");
  });

  it("detects application confirmations", () => {
    expect(
      classifyEmail({
        fromAddress: "no-reply@greenhouse.io",
        subject: "Thank you for applying to Acme",
        body: "We have received your application and will be in touch.",
      })
    ).toBe("APPLICATION_RECEIVED");
  });

  it("falls back to OTHER", () => {
    expect(
      classifyEmail({
        fromAddress: "friend@gmail.com",
        subject: "lunch?",
        body: "want to grab lunch tomorrow",
      })
    ).toBe("OTHER");
  });
});

describe("looksJobRelated", () => {
  it("flags ATS senders", () => {
    expect(
      looksJobRelated({ fromAddress: "no-reply@greenhouse.io", subject: "hi", body: "" })
    ).toBe(true);
  });
  it("flags job-ish subjects", () => {
    expect(
      looksJobRelated({ fromAddress: "someone@x.com", subject: "Your application status", body: "" })
    ).toBe(true);
  });
  it("ignores unrelated mail", () => {
    expect(
      looksJobRelated({ fromAddress: "mom@family.com", subject: "dinner sunday", body: "" })
    ).toBe(false);
  });
});

describe("extractCompany", () => {
  const companies = ["Acme", "Globex Corporation", "Initech"];
  it("matches by sender domain", () => {
    expect(
      extractCompany({ fromAddress: "talent@acme.com", subject: "update", body: "" }, companies)
    ).toBe("Acme");
  });
  it("matches by text mention, preferring the longest name", () => {
    expect(
      extractCompany(
        {
          fromAddress: "no-reply@greenhouse.io",
          subject: "Your application to Globex Corporation",
          body: "",
        },
        companies
      )
    ).toBe("Globex Corporation");
  });
  it("returns null when nothing matches", () => {
    expect(
      extractCompany({ fromAddress: "a@b.com", subject: "x", body: "y" }, companies)
    ).toBeNull();
  });
});

describe("status transitions", () => {
  it("maps classifications to statuses", () => {
    expect(statusForClassification("REJECTION")).toBe("REJECTED");
    expect(statusForClassification("INTERVIEW")).toBe("INTERVIEW");
    expect(statusForClassification("OTHER")).toBeNull();
  });
  it("only advances forward", () => {
    expect(shouldAdvance("APPLIED", "INTERVIEW")).toBe(true);
    expect(shouldAdvance("OFFER", "IN_REVIEW")).toBe(false);
    expect(shouldAdvance("INTERVIEW", "REJECTED")).toBe(true);
    expect(shouldAdvance("WITHDRAWN", "REJECTED")).toBe(false);
  });
});
