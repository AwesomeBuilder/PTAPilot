import type {
  AddMockMessageInput,
  ApprovalAction,
  ApprovalEditInput,
  AuditEntry,
  DemoState,
  FlyerRecommendation,
  NewsletterDraft,
  SetupUpdateInput,
} from "@pta-pilot/shared";
import { env } from "../../config/env";
import { RuntimeStore } from "../../lib/runtime-store";
import { getTokenVaultStatus } from "../auth/token-vault";
import { GeminiService } from "../ai/gemini.service";
import {
  decideIfFlyerNeeded,
  generateFlyerBrief,
  generateFlyerImage,
} from "../flyer/flyer.service";
import { createMembershipToolkitAdapter } from "../membershipToolkit/membershipToolkit.adapter";
import { buildSectionsFromExtracted } from "../newsletter/template-engine";
import { refreshPlannerState } from "../planner/workflow";

function buildAuditEntry(
  kind: AuditEntry["kind"],
  integration: string,
  summary: string,
): AuditEntry {
  return {
    id: `audit-${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    integration,
    kind,
    summary,
  };
}

function replaceApproval(
  approvals: ApprovalAction[],
  actionId: string,
  update: Partial<ApprovalAction>,
) {
  return approvals.map((approval) =>
    approval.id === actionId
      ? {
          ...approval,
          ...update,
          updatedAt: new Date().toISOString(),
        }
      : approval,
  );
}

export class DemoService {
  private readonly aiService = new GeminiService();

  private readonly membershipToolkit = createMembershipToolkitAdapter();

  constructor(private readonly store: RuntimeStore) {}

  async getState(): Promise<DemoState> {
    const state = await this.store.read();
    state.planner = refreshPlannerState(state.planner, state.setup.schoolBreaks);
    state.setup.integrations.auth0.status = getTokenVaultStatus().configured
      ? "connected"
      : "pending";
    state.setup.integrations.gmail.mode = getTokenVaultStatus().configured
      ? "live"
      : "mock";
    state.setup.integrations.gmail.status = getTokenVaultStatus().configured
      ? "connected"
      : "needs_setup";
    await this.store.write(state);
    return state;
  }

  async updateSetup(input: SetupUpdateInput): Promise<DemoState> {
    const state = await this.store.read();

    if (input.auth0AccountEmail) {
      state.setup.auth0AccountEmail = input.auth0AccountEmail;
    }

    if (input.contacts) {
      state.setup.contacts = input.contacts;
    }

    if (input.schoolBreaks) {
      state.setup.schoolBreaks = input.schoolBreaks;
    }

    if (input.integrations) {
      state.setup.integrations = {
        ...state.setup.integrations,
        ...input.integrations,
      };
    }

    state.planner = refreshPlannerState(state.planner, state.setup.schoolBreaks);
    state.auditLog.unshift(
      buildAuditEntry("suggestion", "setup", "Setup preferences were updated."),
    );
    await this.store.write(state);
    return state;
  }

  async addMockMessage(input: AddMockMessageInput): Promise<DemoState> {
    const state = await this.store.read();
    state.inbox.mockMessages.unshift({
      id: `mock-msg-${crypto.randomUUID()}`,
      source: input.source,
      sender: input.sender,
      body: input.body,
      imageUrl: input.imageUrl,
      sentAt: new Date().toISOString(),
    });
    state.auditLog.unshift(
      buildAuditEntry(
        "ingestion",
        "mock_messages",
        `Added a ${input.source} message from ${input.sender}.`,
      ),
    );
    await this.store.write(state);
    return state;
  }

  async ingestUpdates(): Promise<DemoState> {
    const state = await this.store.read();
    const extractedItems = await this.aiService.extractStructuredContent(state);
    const sections = buildSectionsFromExtracted(extractedItems);

    const flyerRecommendations: FlyerRecommendation[] = await Promise.all(
      extractedItems
        .filter(decideIfFlyerNeeded)
        .slice(0, 2)
        .map(async (item) => {
          const recommendation: FlyerRecommendation = {
            id: `flyer-${item.id}`,
            title: item.title,
            brief: generateFlyerBrief(item),
            reason:
              "This item is time-sensitive and more likely to perform well as a flyer or card.",
            status: "generated",
          };

          return {
            ...recommendation,
            imageUrl: await generateFlyerImage(recommendation),
          };
        }),
    );

    state.inbox.extractedItems = extractedItems;
    state.newsletters.board.sections = sections;
    state.flyerRecommendations = flyerRecommendations;
    state.planner.currentStage = "wednesday_draft";
    state.planner.timeline = state.planner.timeline.map((entry) =>
      entry.stage === "collect_updates"
        ? { ...entry, status: "done" }
        : entry.stage === "wednesday_draft"
          ? { ...entry, status: "active" }
          : entry,
    );

    const refreshedApprovals = await Promise.all(
      state.approvals.map((approval) => this.aiService.draftAction(approval, state)),
    );

    state.approvals = refreshedApprovals;
    state.auditLog.unshift(
      buildAuditEntry(
        "ingestion",
        "ai",
        `Ingested inbox content and extracted ${extractedItems.length} structured updates.`,
      ),
    );
    await this.store.write(state);
    return state;
  }

  async duplicateLastNewsletter(): Promise<DemoState> {
    const state = await this.store.read();
    const boardDraft = await this.membershipToolkit.duplicateNewsletter(
      state,
      "board",
    );
    const teacherDraft = await this.membershipToolkit.duplicateNewsletter(
      state,
      "teachers",
    );
    const parentDraft = await this.membershipToolkit.duplicateNewsletter(
      state,
      "parents",
    );

    state.newsletters.board = boardDraft;
    state.newsletters.teachers = teacherDraft;
    state.newsletters.parents = parentDraft;
    state.auditLog.unshift(
      buildAuditEntry(
        "execution",
        "membership_toolkit",
        "Duplicated the last newsletter into this week's working drafts.",
      ),
    );
    await this.store.write(state);
    return state;
  }

  async editApproval(
    actionId: string,
    input: ApprovalEditInput,
  ): Promise<DemoState> {
    const state = await this.store.read();
    state.approvals = replaceApproval(state.approvals, actionId, {
      subject: input.subject,
      body: input.body,
    });
    state.auditLog.unshift(
      buildAuditEntry(
        "suggestion",
        "approvals",
        `Edited approval content for ${actionId}.`,
      ),
    );
    await this.store.write(state);
    return state;
  }

  async approveAction(actionId: string): Promise<DemoState> {
    const state = await this.store.read();
    const action = state.approvals.find((approval) => approval.id === actionId);

    if (!action) {
      throw new Error(`Approval action ${actionId} was not found.`);
    }

    state.approvals = replaceApproval(state.approvals, actionId, {
      status: "approved",
    });

    if (action.type === "publish_teacher_version") {
      const nextState = await this.membershipToolkit.publishTeacherVersion(state);
      state.newsletters.teachers = nextState.newsletters.teachers;
    }

    if (action.type === "schedule_parent_version" && action.scheduledFor) {
      const nextState = await this.membershipToolkit.scheduleParentVersion(
        state,
        action.scheduledFor,
      );
      state.newsletters.parents = nextState.newsletters.parents;
    }

    state.auditLog.unshift(
      buildAuditEntry(
        "approval",
        action.channel,
        `Approved ${action.title}. Execution can proceed without further blockers.`,
      ),
    );
    await this.store.write(state);
    return state;
  }

  async rejectAction(actionId: string): Promise<DemoState> {
    const state = await this.store.read();
    state.approvals = replaceApproval(state.approvals, actionId, {
      status: "rejected",
    });
    state.auditLog.unshift(
      buildAuditEntry("approval", "approvals", `Rejected ${actionId}.`),
    );
    await this.store.write(state);
    return state;
  }

  async getArchitectureSnapshot() {
    const state = await this.getState();
    return {
      appBaseUrl: env.APP_BASE_URL,
      auth0Configured: getTokenVaultStatus().configured,
      membershipToolkitMode: env.MEMBERSHIP_TOOLKIT_MODE,
      weekOf: state.weekOf,
    };
  }

  async updateNewsletterDraft(
    audience: NewsletterDraft["audience"],
    draft: NewsletterDraft,
  ) {
    const state = await this.store.read();
    state.newsletters[audience] = await this.membershipToolkit.updateNewsletterDraft(
      state,
      draft,
    );
    await this.store.write(state);
    return state;
  }
}
