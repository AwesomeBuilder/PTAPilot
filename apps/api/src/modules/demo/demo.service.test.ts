import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
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

  it("hydrates the content workspace and Monday reminder from the MTK baseline", async () => {
    const state = await service.getState();
    const mondayApproval = state.approvals.find(
      (approval) => approval.id === "approval-monday",
    );

    expect(state.contentWorkspace.baseline?.title).toBeTruthy();
    expect(state.contentWorkspace.proposedEdits.length).toBeGreaterThan(0);
    expect(state.contentWorkspace.runbook.length).toBeGreaterThan(0);
    expect(mondayApproval?.body).toContain("Current newsletter link:");
  });

  it("builds MTK dashboard links for runbook edit and duplicate steps", async () => {
    const state = await service.getState();
    state.newsletters.lastPublishedParent.delivery = {
      directUrl:
        "https://simondselementarypta.membershiptoolkit.com/newsletter/03458-nl20260324102059-064017800-1824091692",
      lastSyncedAt: "2026-04-02T09:00:00-07:00",
    };
    await store.write(state);

    const nextState = await service.getState();
    const duplicateBoardStep = nextState.contentWorkspace.runbook.find(
      (step) => step.id === "runbook-duplicate-board",
    );
    const editBoardStep = nextState.contentWorkspace.runbook.find(
      (step) => step.id === "runbook-edit-board",
    );

    expect(duplicateBoardStep?.targetUrl).toBe(
      "https://simondselementarypta.membershiptoolkit.com/dashboard/newsletter/03458-nl20260324102059-064017800-1824091692",
    );
    expect(editBoardStep?.targetUrl).toBe(
      "https://simondselementarypta.membershiptoolkit.com/dashboard/newsletters/draft",
    );
  });

  it("treats broader PTA board roles as valid Wednesday board-review recipients", async () => {
    const state = await service.getState();
    state.setup.integrations.gmail.mode = "mock";
    state.setup.contacts = [
      {
        id: "contact-board-treasurer",
        name: "Taylor Brooks",
        role: "Treasurer",
        email: "treasurer@lincolnpta.org",
      },
    ];

    await store.write(state);

    const nextState = await service.approveAction("approval-wednesday");
    const action = nextState.approvals.find(
      (approval) => approval.id === "approval-wednesday",
    );

    expect(action?.executionStatus).toBe("completed");
    expect(action?.steps[0]?.status).toBe("completed");
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

  it("creates a fresh Gmail draft when replaying Monday after a prior send", async () => {
    const state = await service.getState();
    state.setup.integrations.gmail.mode = "live";
    state.approvals = state.approvals.map((approval) =>
      approval.id === "approval-monday"
        ? {
            ...approval,
            executionStatus: "failed",
            steps: approval.steps.map((step) => ({
              ...step,
              status: "failed",
              errorMessage: "Gmail API request failed: Requested entity was not found.",
            })),
            gmailExecution: {
              deliveryPath: "identity_provider",
              lastAction: "sent",
              draftId: "stale-draft-id",
              draftMessageId: "stale-draft-message-id",
              sentMessageId: "old-message-id",
              threadId: "old-thread-id",
              updatedAt: new Date().toISOString(),
            },
          }
        : approval,
    );
    await store.write(state);

    const createDraft = vi.fn().mockResolvedValue({
      deliveryPath: "identity_provider",
      draftId: "fresh-draft-id",
      draftMessageId: "fresh-draft-message-id",
      threadId: "fresh-thread-id",
    });
    const sendEmail = vi.fn().mockResolvedValue({
      deliveryPath: "identity_provider",
      messageId: "fresh-sent-message-id",
      threadId: "fresh-thread-id",
    });

    (
      service as unknown as {
        liveGmail: {
          createDraft: typeof createDraft;
          sendEmail: typeof sendEmail;
        };
      }
    ).liveGmail = {
      createDraft,
      sendEmail,
    };

    const nextState = await service.retryAction("approval-monday", {
      userId: "user-123",
      auth0AccessToken: "token-123",
    });
    const action = nextState.approvals.find(
      (approval) => approval.id === "approval-monday",
    );

    expect(createDraft).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: "fresh-draft-id",
      }),
      expect.anything(),
    );
    expect(action?.gmailExecution?.lastAction).toBe("sent");
    expect(action?.gmailExecution?.draftId).toBeUndefined();
    expect(action?.gmailExecution?.sentMessageId).toBe("fresh-sent-message-id");
    expect(action?.steps[0]?.status).toBe("completed");
  });

  it("creates a new Gmail draft when editing Monday after a prior send", async () => {
    const state = await service.getState();
    state.setup.integrations.gmail.mode = "live";
    state.approvals = state.approvals.map((approval) =>
      approval.id === "approval-monday"
        ? {
            ...approval,
            gmailExecution: {
              deliveryPath: "identity_provider",
              lastAction: "sent",
              draftId: "stale-draft-id",
              draftMessageId: "stale-draft-message-id",
              sentMessageId: "old-message-id",
              threadId: "old-thread-id",
              updatedAt: new Date().toISOString(),
            },
          }
        : approval,
    );
    await store.write(state);

    const createDraft = vi.fn().mockResolvedValue({
      deliveryPath: "identity_provider",
      draftId: "fresh-draft-id",
      draftMessageId: "fresh-draft-message-id",
      threadId: "fresh-thread-id",
    });

    (
      service as unknown as {
        liveGmail: {
          createDraft: typeof createDraft;
        };
      }
    ).liveGmail = {
      createDraft,
    };

    const nextState = await service.editApproval(
      "approval-monday",
      {
        subject: "Updated Monday subject",
        body: "Updated Monday body",
      },
      {
        userId: "user-123",
        auth0AccessToken: "token-123",
      },
    );
    const action = nextState.approvals.find(
      (approval) => approval.id === "approval-monday",
    );

    expect(createDraft).toHaveBeenCalledWith(
      expect.not.objectContaining({
        draftId: "stale-draft-id",
      }),
      expect.anything(),
    );
    expect(action?.gmailExecution?.lastAction).toBe("draft_saved");
    expect(action?.gmailExecution?.draftId).toBe("fresh-draft-id");
  });

  it("advances from Monday reminder to collect updates after a successful send", async () => {
    const state = await service.getState();
    state.setup.integrations.gmail.mode = "mock";
    state.planner.currentStage = "monday_reminder";
    state.planner.timeline = state.planner.timeline.map((entry) => ({
      ...entry,
      status: entry.stage === "monday_reminder" ? "active" : "upcoming",
    }));
    state.approvals = state.approvals.map((approval) =>
      approval.id === "approval-monday"
        ? {
            ...approval,
            status: "pending",
            executionStatus: "not_started",
            steps: approval.steps.map((step) => ({
              ...step,
              status: "pending",
              startedAt: undefined,
              completedAt: undefined,
              note: undefined,
              errorMessage: undefined,
            })),
            gmailExecution: undefined,
          }
        : approval,
    );
    await store.write(state);

    const nextState = await service.approveAction("approval-monday");

    expect(nextState.planner.currentStage).toBe("collect_updates");
    expect(
      nextState.planner.timeline.find((entry) => entry.stage === "monday_reminder")
        ?.status,
    ).toBe("done");
    expect(
      nextState.planner.timeline.find((entry) => entry.stage === "collect_updates")
        ?.status,
    ).toBe("active");
  });

  it("resets the workflow to a fresh Monday test state while preserving setup", async () => {
    const state = await service.getState();
    state.planner.currentStage = "thursday_teacher_release";
    state.planner.timeline = state.planner.timeline.map((entry) => ({
      ...entry,
      status: entry.stage === "thursday_teacher_release" ? "active" : "done",
    }));
    state.setup.memberRecipients = [
      {
        id: "member-test",
        name: "Taylor Brooks",
        email: "taylor@example.com",
      },
    ];
    state.newsletters.teachers.status = "published";
    state.newsletters.teachers.publishedAt = "2026-04-04T09:00:00-07:00";
    state.newsletters.teachers.delivery = {
      directUrl: "https://lincolnpta.example/teacher",
      externalId: "teacher-1",
      lastSyncedAt: "2026-04-04T09:00:00-07:00",
    };
    state.approvals = state.approvals.map((approval) => ({
      ...approval,
      status: "approved",
      executionStatus: "completed",
      steps: approval.steps.map((step) => ({
        ...step,
        status: "completed",
        startedAt: "2026-04-04T09:00:00-07:00",
        completedAt: "2026-04-04T09:05:00-07:00",
        note: "Completed during testing.",
      })),
      gmailExecution: {
        deliveryPath: "mock",
        lastAction: "sent",
        sentMessageId: `sent-${approval.id}`,
        updatedAt: "2026-04-04T09:05:00-07:00",
      },
    }));
    await store.write(state);

    const nextState = await service.resetWorkflowForTesting();

    expect(nextState.planner.currentStage).toBe("monday_reminder");
    expect(nextState.setup.memberRecipients).toEqual(state.setup.memberRecipients);
    expect(nextState.newsletters.teachers.status).toBe("draft");
    expect(nextState.newsletters.teachers.publishedAt).toBeUndefined();
    expect(nextState.newsletters.teachers.delivery ?? {}).toEqual({});
    expect(
      nextState.approvals.every(
        (approval) =>
          approval.status === "pending" &&
          approval.executionStatus === "not_started" &&
          approval.steps.every((step) => step.status === "pending") &&
          approval.gmailExecution === undefined,
      ),
    ).toBe(true);
    expect(nextState.auditLog).toHaveLength(1);
    expect(nextState.auditLog[0]?.summary).toContain(
      "Reset the workflow to a fresh Monday test state.",
    );
  });
});
