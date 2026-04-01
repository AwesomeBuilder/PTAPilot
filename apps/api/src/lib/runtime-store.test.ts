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
});
