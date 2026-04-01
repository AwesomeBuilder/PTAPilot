import { describe, expect, it } from "vitest";
import { shouldSkipParentSend } from "./workflow";

describe("shouldSkipParentSend", () => {
  it("skips when a break overlaps the Monday-through-Friday school week after Sunday", () => {
    const result = shouldSkipParentSend("2026-04-05T18:00:00-07:00", [
      {
        id: "spring-break",
        name: "Spring Break",
        startsOn: "2026-04-06",
        endsOn: "2026-04-10",
      },
    ]);

    expect(result.skip).toBe(true);
    expect(result.reason).toContain("overlaps the school week");
  });

  it("allows the send when the next school week stays outside break dates", () => {
    const result = shouldSkipParentSend("2026-03-29T18:00:00-07:00", [
      {
        id: "spring-break",
        name: "Spring Break",
        startsOn: "2026-04-06",
        endsOn: "2026-04-10",
      },
    ]);

    expect(result.skip).toBe(false);
  });
});
