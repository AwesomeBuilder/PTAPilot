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
import { createGmailAdapter } from "../inbox/gmail/gmail.adapter";
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

function dedupeEmails(addresses: string[]) {
  return Array.from(
    new Set(addresses.map((address) => address.trim()).filter(Boolean)),
  );
}

export class DemoService {
  private readonly aiService = new GeminiService();

  private readonly liveGmail = createGmailAdapter("live");

  private readonly membershipToolkit = createMembershipToolkitAdapter();

  constructor(private readonly store: RuntimeStore) {}

  private resolveGmailRecipients(state: DemoState, action: ApprovalAction) {
    if (action.type === "send_board_draft_email") {
      const boardRecipients = dedupeEmails(
        state.setup.contacts
          .filter((contact) =>
            /(pta|board|president|secretary)/i.test(contact.role),
          )
          .map((contact) => contact.email),
      );

      if (!boardRecipients.length) {
        throw new Error(
          "No board-review recipients are configured in Setup. Add PTA board contacts before sending a live Gmail board review email.",
        );
      }

      return boardRecipients;
    }

    if (action.type === "send_reminder_email") {
      throw new Error(
        "Live Gmail send for the PTA members reminder stays blocked in this MVP because no real member recipient list is configured yet. Keep that action in mock mode or add explicit recipients first.",
      );
    }

    throw new Error(`Approval ${action.id} is not a supported live Gmail action.`);
  }

  private async syncLiveGmailInbox(
    state: DemoState,
    userId: string | undefined,
    options?: { recordFailure?: boolean },
  ) {
    if (state.setup.integrations.gmail.mode !== "live" || !userId) {
      return {
        synced: false,
        reminderReplies: 0,
        threads: state.inbox.gmailThreads,
      };
    }

    try {
      const threads = await this.liveGmail.listRecentThreads(state, { userId });

      if (!threads.length) {
        return {
          synced: false,
          reminderReplies: 0,
          threads: state.inbox.gmailThreads,
        };
      }

      const reminderReplies = await this.liveGmail.fetchRepliesFromReminderThread(
        {
          ...state,
          inbox: {
            ...state.inbox,
            gmailThreads: threads,
          },
        },
        { userId },
      );

      state.inbox.gmailThreads = threads;

      return {
        synced: true,
        reminderReplies: reminderReplies.length,
        threads,
      };
    } catch (error) {
      if (options?.recordFailure) {
        const message = error instanceof Error ? error.message : "Unknown error";
        state.auditLog.unshift(
          buildAuditEntry(
            "execution",
            "gmail",
            `Live Gmail sync was skipped. ${message}`,
          ),
        );
      }

      return {
        synced: false,
        reminderReplies: 0,
        threads: state.inbox.gmailThreads,
      };
    }
  }

  async getState(userId?: string): Promise<DemoState> {
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
    await this.syncLiveGmailInbox(state, userId);
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

  async ingestUpdates(userId?: string): Promise<DemoState> {
    const state = await this.store.read();
    const gmailSync = await this.syncLiveGmailInbox(state, userId, {
      recordFailure: true,
    });
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
    if (gmailSync.synced) {
      state.auditLog.unshift(
        buildAuditEntry(
          "ingestion",
          "gmail",
          `Synced ${gmailSync.threads.length} live Gmail thread(s), including ${gmailSync.reminderReplies} reply message(s) from the reminder thread.`,
        ),
      );
    }
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
    userId?: string,
  ): Promise<DemoState> {
    const state = await this.store.read();
    state.approvals = replaceApproval(state.approvals, actionId, {
      subject: input.subject,
      body: input.body,
    });

    const action = state.approvals.find((approval) => approval.id === actionId);

    if (
      action &&
      action.channel === "gmail" &&
      state.setup.integrations.gmail.mode === "live" &&
      userId
    ) {
      try {
        const recipients = this.resolveGmailRecipients(state, action);
        const draft = await this.liveGmail.createDraft(
          {
            to: recipients,
            subject: input.subject,
            body: input.body,
            draftId: action.gmailExecution?.draftId,
          },
          { userId },
        );

        state.approvals = replaceApproval(state.approvals, actionId, {
          gmailExecution: {
            deliveryPath: draft.deliveryPath,
            lastAction: "draft_saved",
            draftId: draft.draftId,
            draftMessageId: draft.draftMessageId,
            threadId: draft.threadId,
            note: `Live Gmail draft synced for ${recipients.length} recipient(s).`,
            updatedAt: new Date().toISOString(),
          },
        });
        state.auditLog.unshift(
          buildAuditEntry(
            "execution",
            "gmail",
            `Synced a live Gmail draft for ${action.title}.`,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        state.auditLog.unshift(
          buildAuditEntry(
            "execution",
            "gmail",
            `Saved ${action.title} locally, but could not sync a live Gmail draft. ${message}`,
          ),
        );
      }
    }

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

  async approveAction(actionId: string, userId?: string): Promise<DemoState> {
    const state = await this.store.read();
    const action = state.approvals.find((approval) => approval.id === actionId);

    if (!action) {
      throw new Error(`Approval action ${actionId} was not found.`);
    }

    if (action.channel === "gmail" && state.setup.integrations.gmail.mode === "live") {
      if (!userId) {
        throw new Error(
          "Log in with Auth0 before approving a live Gmail action so PTA Pilot knows which connected account to use.",
        );
      }

      const recipients = this.resolveGmailRecipients(state, action);
      const draft =
        action.gmailExecution?.draftId
          ? {
              deliveryPath: action.gmailExecution.deliveryPath,
              draftId: action.gmailExecution.draftId,
              draftMessageId: action.gmailExecution.draftMessageId,
              threadId: action.gmailExecution.threadId,
            }
          : await this.liveGmail.createDraft(
              {
                to: recipients,
                subject: action.subject,
                body: action.body,
              },
              { userId },
            );

      const sent = await this.liveGmail.sendEmail(
        {
          to: recipients,
          subject: action.subject,
          body: action.body,
          draftId: draft.draftId,
        },
        { userId },
      );

      state.approvals = replaceApproval(state.approvals, actionId, {
        status: "approved",
        gmailExecution: {
          deliveryPath: sent.deliveryPath,
          lastAction: "sent",
          draftId: draft.draftId,
          draftMessageId: draft.draftMessageId,
          threadId: sent.threadId ?? draft.threadId,
          sentMessageId: sent.messageId,
          note: `Sent through live Gmail to ${recipients.length} recipient(s).`,
          updatedAt: new Date().toISOString(),
        },
      });
      state.auditLog.unshift(
        buildAuditEntry(
          "execution",
          "gmail",
          `Sent ${action.title} through live Gmail to ${recipients.length} recipient(s) using the ${sent.deliveryPath === "identity_provider" ? "Auth0 identity-provider token fallback" : "Token Vault"} path.`,
        ),
      );
    } else {
      state.approvals = replaceApproval(state.approvals, actionId, {
        status: "approved",
      });
    }

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
