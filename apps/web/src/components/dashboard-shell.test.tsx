import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seedDemoState } from "@pta-pilot/shared";
import { DashboardShell } from "./dashboard-shell";

describe("DashboardShell", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockRejectedValue(new Error("backend offline"));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
  });

  it("defaults to a stage-led dashboard with a primary CTA", async () => {
    render(
      <DashboardShell
        authEnabled={false}
        gmailConnectUrl="/auth/login"
        tokenVaultConfigured={false}
      />,
    );

    expect(await screen.findByText("Active stage")).toBeInTheDocument();
    expect(screen.getAllByText("Collect updates").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /ingest updates/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /set monday reminder active/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /set monday reminder active/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/setup",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
  });

  it("shows editable outbound drafts and sent emails in separate views", async () => {
    render(
      <DashboardShell
        authEnabled={false}
        gmailConnectUrl="/auth/login"
        tokenVaultConfigured={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /drafts/i }));

    expect(await screen.findByText("Wednesday board review email")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Subject").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /approve and run/i }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /sent emails/i }));

    expect(await screen.findByText("PTA this week: quick reminder + last newsletter")).toBeInTheDocument();
  });

  it("surfaces the active-stage Monday draft for replay when Monday is manually selected", async () => {
    const mondayState = structuredClone(seedDemoState);
    mondayState.planner.currentStage = "monday_reminder";
    mondayState.planner.timeline = mondayState.planner.timeline.map((entry) => ({
      ...entry,
      status: entry.stage === "monday_reminder" ? "active" : "upcoming",
    }));

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mondayState,
      text: async () => JSON.stringify(mondayState),
    });

    render(
      <DashboardShell
        authEnabled={false}
        gmailConnectUrl="/auth/login"
        tokenVaultConfigured={false}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /open drafts/i }));

    expect(await screen.findByText("Monday reminder email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send again/i })).toBeInTheDocument();
  });

  it("shows the stored execution error for a failed draft send", async () => {
    const failedState = structuredClone(seedDemoState);
    const boardDraft = failedState.approvals.find(
      (approval) => approval.id === "approval-wednesday",
    );

    if (!boardDraft) {
      throw new Error("Expected the seeded Wednesday approval to exist.");
    }

    const existingStep = boardDraft.steps[0];

    if (!existingStep) {
      throw new Error("Expected the seeded Wednesday approval to include a send step.");
    }

    boardDraft.status = "approved";
    boardDraft.executionStatus = "failed";
    boardDraft.steps = [
      {
        ...existingStep,
        status: "failed",
        errorMessage:
          "No board-review recipients are configured in Setup. Add PTA board contacts before sending a live Gmail board review email.",
      },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => failedState,
      text: async () => JSON.stringify(failedState),
    });

    render(
      <DashboardShell
        authEnabled={false}
        gmailConnectUrl="/auth/login"
        tokenVaultConfigured={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /drafts/i }));

    expect(await screen.findByText("Last send failed")).toBeInTheDocument();
    expect(
      screen.getByText(
        /No board-review recipients are configured in Setup\. Add PTA board contacts before sending a live Gmail board review email\./i,
      ),
    ).toBeInTheDocument();
  });

  it("surfaces the runbook, mock messages, and settings sections without the old inbox/setup tabs", async () => {
    render(
      <DashboardShell
        authEnabled={false}
        gmailConnectUrl="/auth/login"
        tokenVaultConfigured={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /mtk runbook/i }));
    expect((await screen.findAllByText("MTK runbook")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Attendance Spirit Week reminder").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /messages/i }));
    expect(await screen.findByText("Mock messages")).toBeInTheDocument();
    expect(screen.getByText("Marcus (Room Parent)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    expect(await screen.findByRole("button", { name: /contacts/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /newsletter url/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /breaks/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /account/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /audit log/i })).toBeInTheDocument();
  });

  it("renders MTK dashboard links for duplicate and update actions", async () => {
    const linkedState = structuredClone(seedDemoState);
    linkedState.contentWorkspace.runbook = [
      {
        id: "runbook-duplicate-board",
        title: "Duplicate the latest sent newsletter for board review",
        audience: "board_review",
        action: "duplicate",
        targetUrl:
          "https://simondselementarypta.membershiptoolkit.com/dashboard/newsletter/03458-nl20260324102059-064017800-1824091692",
        instructions: ["Duplicate the latest sent newsletter."],
        requiredOutputs: ["directUrl", "externalId"],
        completionState: "pending",
      },
      {
        id: "runbook-edit-board",
        title: "Apply PTA Pilot's patch plan to the board-review draft",
        audience: "board_review",
        action: "edit",
        targetUrl:
          "https://simondselementarypta.membershiptoolkit.com/dashboard/newsletters/draft",
        instructions: ["Update the current MTK draft."],
        requiredOutputs: ["directUrl", "externalId"],
        completionState: "pending",
      },
    ];

    linkedState.approvals = linkedState.approvals.map((approval) =>
      approval.id === "approval-thursday"
        ? {
            ...approval,
            executionStatus: "needs_operator",
            steps: approval.steps.map((step) =>
              step.id === "approval-thursday-publish"
                ? {
                    ...step,
                    status: "needs_operator",
                    note: "Finish the publish in Membership Toolkit.",
                    externalUrl:
                      "https://simondselementarypta.membershiptoolkit.com/dashboard/newsletters/draft",
                  }
                : step,
            ),
          }
        : approval,
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => linkedState,
      text: async () => JSON.stringify(linkedState),
    });

    render(
      <DashboardShell
        authEnabled={false}
        gmailConnectUrl="/auth/login"
        tokenVaultConfigured={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /mtk runbook/i }));

    expect(
      await screen.findByRole("link", { name: /duplicate the draft/i }),
    ).toHaveAttribute(
      "href",
      "https://simondselementarypta.membershiptoolkit.com/dashboard/newsletter/03458-nl20260324102059-064017800-1824091692",
    );
    expect(
      screen.getAllByRole("link", { name: /update the draft/i })[0],
    ).toHaveAttribute(
      "href",
      "https://simondselementarypta.membershiptoolkit.com/dashboard/newsletters/draft",
    );

    fireEvent.click(screen.getByRole("button", { name: /drafts/i }));

    expect(
      await screen.findByRole("link", { name: /update the draft/i }),
    ).toHaveAttribute(
      "href",
      "https://simondselementarypta.membershiptoolkit.com/dashboard/newsletters/draft",
    );
  });
});
