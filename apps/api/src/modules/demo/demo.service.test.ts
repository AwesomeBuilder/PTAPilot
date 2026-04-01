import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { RuntimeStore } from "../../lib/runtime-store";
import { DemoService } from "./demo.service";

describe("DemoService action execution", () => {
  let workspaceDir: string;
  let store: RuntimeStore;
  let service: DemoService;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "pta-pilot-"));
    store = new RuntimeStore(join(workspaceDir, "runtime-state.json"));
    service = new DemoService(store);
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("publishes the teacher version and completes the Thursday release in mock mode", async () => {
    const state = await service.getState();
    state.setup.integrations.gmail.mode = "mock";
    await store.write(state);

    const nextState = await service.approveAction("approval-thursday");
    const action = nextState.approvals.find(
      (approval) => approval.id === "approval-thursday",
    );

    expect(nextState.newsletters.teachers.status).toBe("published");
    expect(nextState.newsletters.teachers.delivery?.directUrl).toContain(
      "mock.membership-toolkit.local",
    );
    expect(action?.executionStatus).toBe("completed");
    expect(action?.steps.every((step) => step.status === "completed")).toBe(true);
  });

  it("skips the Sunday parent workflow when the following school week overlaps a break", async () => {
    const state = await service.getState();
    state.newsletters.teachers.status = "published";
    state.newsletters.teachers.publishedAt = "2026-04-02T09:00:00-07:00";
    state.newsletters.teachers.delivery = {
      directUrl: "https://lincolnpta.example/teacher-release",
      externalId: "teacher-release",
      lastSyncedAt: "2026-04-02T09:00:00-07:00",
    };
    state.approvals = state.approvals.map((approval) =>
      approval.id === "approval-sunday"
        ? {
            ...approval,
            scheduledFor: "2026-04-05T18:00:00-07:00",
          }
        : approval,
    );

    await store.write(state);

    const nextState = await service.approveAction("approval-sunday");
    const action = nextState.approvals.find(
      (approval) => approval.id === "approval-sunday",
    );

    expect(action?.executionStatus).toBe("skipped");
    expect(
      action?.steps.find((step) => step.id === "approval-sunday-schedule")?.status,
    ).toBe("skipped");
    expect(nextState.newsletters.parents.status).toBe("draft");
  });
});
