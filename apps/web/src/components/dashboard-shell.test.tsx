import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedDemoState } from "@pta-pilot/shared";
import { DashboardShell } from "./dashboard-shell";

describe("DashboardShell", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend offline")),
    );
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("shows the artifact ingestion tools in the inbox view", async () => {
    render(
      <DashboardShell
        authEnabled={false}
        gmailConnectUrl="/auth/login"
        tokenVaultConfigured={false}
      />,
    );

    const inboxTab = screen.getAllByRole("tab", { name: /inbox/i })[0]!;

    fireEvent.mouseDown(inboxTab);
    fireEvent.click(inboxTab);

    expect(await screen.findByText("Artifact ingestion")).toBeInTheDocument();
    expect(screen.getByText("Previous newsletter URL")).toBeInTheDocument();
  });

  it("shows board and teacher editors in the newsletter view", async () => {
    render(
      <DashboardShell
        authEnabled={false}
        gmailConnectUrl="/auth/login"
        tokenVaultConfigured={false}
      />,
    );

    const newsletterTab = screen.getAllByRole("tab", {
      name: /newsletter editor/i,
    })[0]!;

    fireEvent.mouseDown(newsletterTab);
    fireEvent.click(newsletterTab);

    expect(await screen.findByText("Board editor")).toBeInTheDocument();
    expect(screen.getByText("Teachers editor")).toBeInTheDocument();
  });

  it("disables drag handles when a draft has nothing to reorder", async () => {
    render(
      <DashboardShell
        authEnabled={false}
        gmailConnectUrl="/auth/login"
        tokenVaultConfigured={false}
      />,
    );

    const newsletterTab = screen.getAllByRole("tab", {
      name: /newsletter editor/i,
    })[0]!;

    fireEvent.mouseDown(newsletterTab);
    fireEvent.click(newsletterTab);

    expect(
      await screen.findByText("Add another section to this draft before reordering sections."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Add another card to this section before reordering within it.").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /reorder section teacher notes/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /reorder item staff appreciation lunch timing/i }),
    ).toBeDisabled();
  });

  it("does not crash when the backend returns approvals without steps", async () => {
    const malformedState = {
      ...structuredClone(seedDemoState),
      approvals: seedDemoState.approvals.map(
        ({ executionStatus: _executionStatus, steps: _steps, ...approval }) =>
          approval,
      ),
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(malformedState),
      }),
    );

    render(
      <DashboardShell
        authEnabled={false}
        gmailConnectUrl="/auth/login"
        tokenVaultConfigured={false}
      />,
    );

    const actionsTab = screen.getAllByRole("tab", { name: /actions review/i })[0]!;

    fireEvent.mouseDown(actionsTab);
    fireEvent.click(actionsTab);

    expect(await screen.findByText("Loaded live data from the local PTA Pilot API.")).toBeInTheDocument();
    expect((await screen.findAllByText("Monday reminder email")).length).toBeGreaterThan(0);
  });
});
