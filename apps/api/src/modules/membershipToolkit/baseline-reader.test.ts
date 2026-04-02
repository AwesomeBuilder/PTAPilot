import { describe, expect, it } from "vitest";
import { parseMembershipToolkitNewsletterHtml } from "./baseline-reader";

const sampleNewsletterHtml = `
  <html>
    <head>
      <title>Newsletter - Simonds PTA Newsletter 4/13/26 - 4/17/26</title>
    </head>
    <body>
      <div class="mtk-nl-rich-text-editable"><p><strong>THIS WEEK</strong></p></div>
      <div class="mtk-nl-rich-text-editable">
        <p>Wednesday, 4/1</p>
        <ul><li>5th Grade Cap &amp; Gown Photos (by Dorian)</li></ul>
        <p>Friday, 4/3</p>
        <ul><li>PTA Association Meeting, 8:15 - 9:15 AM</li></ul>
      </div>
      <div class="mtk-nl-rich-text-editable">
        <p><strong>Sponsors</strong></p>
        <ul><li>A Big Thank you to our Sponsors</li></ul>
        <p><strong>Quick Links</strong></p>
        <ul><li>Parent resources with useful links</li></ul>
      </div>
    </body>
  </html>
`;

describe("parseMembershipToolkitNewsletterHtml", () => {
  it("extracts normalized sections and marks stable sections as locked", () => {
    const baseline = parseMembershipToolkitNewsletterHtml(
      sampleNewsletterHtml,
      "https://example.com/newsletter/latest",
    );

    expect(baseline.title).toContain("Simonds PTA Newsletter");
    expect(baseline.sections.find((section) => section.title === "THIS WEEK")).toBeTruthy();
    expect(
      baseline.sections.find((section) => section.title === "Sponsors")?.locked,
    ).toBe(true);
    expect(
      baseline.sections.find((section) => section.title === "Quick Links")?.locked,
    ).toBe(true);
    expect(
      baseline.sections
        .find((section) => section.title === "THIS WEEK")
        ?.items.map((item) => item.body),
    ).toContain("Wednesday, 4/1 — 5th Grade Cap & Gown Photos (by Dorian)");
  });
});

