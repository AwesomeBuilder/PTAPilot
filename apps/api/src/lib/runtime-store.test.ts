import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedDemoState } from "@pta-pilot/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RuntimeStore } from "./runtime-store";

describe("RuntimeStore", () => {
  let workspaceDir: string;
  let filePath: string;
  let store: RuntimeStore;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "pta-pilot-runtime-store-"));
    filePath = join(workspaceDir, "runtime-state.json");
    store = new RuntimeStore(filePath);
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("restores missing approval execution fields from legacy runtime state", async () => {
    const legacyState = {
      ...structuredClone(seedDemoState),
      approvals: seedDemoState.approvals.map(
        ({ executionStatus: _executionStatus, steps: _steps, ...approval }) =>
          approval,
      ),
    };

    await writeFile(filePath, JSON.stringify(legacyState, null, 2), "utf-8");

    const state = await store.read();

    expect(state.approvals).toHaveLength(seedDemoState.approvals.length);

    for (const approval of state.approvals) {
      expect(approval.executionStatus).toBeTruthy();
      expect(approval.steps.length).toBeGreaterThan(0);
    }
  });

  it("removes the old placeholder MTK newsletter URL from persisted state", async () => {
    const legacyState = structuredClone(seedDemoState);
    legacyState.inbox.artifacts.unshift({
      id: "artifact-placeholder",
      type: "previous_newsletter_link",
      label: "Previous newsletter link",
      createdAt: "2026-04-02T09:00:00-07:00",
      source: "manual",
      originalUrl: "https://lincolnpta.membershiptoolkit.com/newsletter/last-week",
    });
    legacyState.newsletters.lastPublishedParent.delivery = {
      directUrl: "https://lincolnpta.membershiptoolkit.com/newsletter/last-week",
      externalId: "mtk-last-week",
    };
    if (legacyState.contentWorkspace.baseline) {
      legacyState.contentWorkspace.baseline.sourceUrl =
        "https://lincolnpta.membershiptoolkit.com/newsletter/last-week";
    }

    await writeFile(filePath, JSON.stringify(legacyState, null, 2), "utf-8");

    const state = await store.read();

    expect(
      state.inbox.artifacts.some(
        (artifact) =>
          artifact.type === "previous_newsletter_link" &&
          artifact.originalUrl ===
            "https://lincolnpta.membershiptoolkit.com/newsletter/last-week",
      ),
    ).toBe(false);
    expect(state.newsletters.lastPublishedParent.delivery?.directUrl).toBeUndefined();
    expect(state.contentWorkspace.baseline?.sourceUrl).toBeUndefined();
  });
});
