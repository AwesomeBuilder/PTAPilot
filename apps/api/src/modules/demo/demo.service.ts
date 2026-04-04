import type { Express } from "express";
import type {
  AddMockMessageInput,
  ApprovalAction,
  ApprovalEditInput,
  ApprovalExecutionStatus,
  ApprovalExecutionStep,
  ApprovalStepManualCompleteInput,
  AuditEntry,
  DemoState,
  ExtractedContentItem,
  FlyerRecommendation,
  InboxArtifactUploadInput,
  NewsletterDraft,
  SetupUpdateInput,
  WorkflowStage,
} from "@pta-pilot/shared";
import { env } from "../../config/env";
import type { RequestContext } from "../../lib/request-context";
import { RuntimeStore } from "../../lib/runtime-store";
import { getTokenVaultStatus } from "../auth/token-vault";
import { GeminiService } from "../ai/gemini.service";
import {
  decideIfFlyerNeeded,
  generateFlyerBrief,
  generateFlyerImage,
} from "../flyer/flyer.service";
import { createInboxArtifact } from "../inbox/artifact-storage";
import { refreshCalendarArtifactFromSource } from "../inbox/calendar-source";
import { createGmailAdapter } from "../inbox/gmail/gmail.adapter";
import { createMembershipToolkitAdapter } from "../membershipToolkit/membershipToolkit.adapter";
import {
  buildContentWorkspace,
  rebuildContentWorkspaceFromDrafts,
} from "../newsletter/content-workspace";
import {
  buildSectionsFromExtracted,
  deriveAudienceDraftTitle,
  deriveParentDraftFromTeacher,
  diffNewsletterDrafts,
  duplicateLastNewsletter as buildDuplicateNewsletter,
  withNewsletterDelivery,
} from "../newsletter/template-engine";
import { refreshPlannerState, shouldSkipParentSend } from "../planner/workflow";

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

function dedupeEmails(addresses: string[]) {
  return Array.from(
    new Set(addresses.map((address) => address.trim()).filter(Boolean)),
  );
}

function deriveExecutionStatus(
  steps: ApprovalExecutionStep[],
): ApprovalExecutionStatus {
  if (!steps.length || steps.every((step) => step.status === "pending")) {
    return "not_started";
  }

  if (steps.some((step) => step.status === "running")) {
    return "running";
  }

  if (steps.some((step) => step.status === "failed")) {
    return "failed";
  }

  if (steps.some((step) => step.status === "needs_operator")) {
    return "needs_operator";
  }

  if (steps.every((step) => step.status === "completed")) {
    return "completed";
  }

  if (
    steps.every((step) => ["completed", "skipped"].includes(step.status)) &&
    steps.some((step) => step.status === "skipped")
  ) {
    return "skipped";
  }

  return "running";
}

function describeDiffEntry(entry: string, verb: "Added" | "Removed") {
  const [sectionTitle, itemTitle] = entry.split(":");
  return `${verb} "${itemTitle}" in ${sectionTitle}`;
}

function getReusableGmailDraft(approval: ApprovalAction) {
  if (
    approval.gmailExecution?.lastAction !== "draft_saved" ||
    !approval.gmailExecution.draftId
  ) {
    return undefined;
  }

  return {
    deliveryPath: approval.gmailExecution.deliveryPath,
    draftId: approval.gmailExecution.draftId,
    draftMessageId: approval.gmailExecution.draftMessageId,
    threadId: approval.gmailExecution.threadId,
  };
}

function getStageForApproval(actionId: string): WorkflowStage | null {
  switch (actionId) {
    case "approval-monday":
      return "monday_reminder";
    case "approval-wednesday":
      return "wednesday_draft";
    case "approval-thursday":
      return "thursday_teacher_release";
    case "approval-sunday":
      return "sunday_parent_schedule";
    default:
      return null;
  }
}

function resetApprovalForTesting(approval: ApprovalAction): ApprovalAction {
  return {
    ...approval,
    status: "pending",
    executionStatus: "not_started",
    updatedAt: new Date().toISOString(),
    gmailExecution: undefined,
    steps: approval.steps.map((step) => ({
      ...step,
      status: "pending",
      startedAt: undefined,
      completedAt: undefined,
      note: undefined,
      errorMessage: undefined,
      externalUrl: undefined,
      outputs: undefined,
    })),
  };
}

function resetNewsletterForTesting(draft: NewsletterDraft): NewsletterDraft {
  return {
    ...draft,
    status: "draft",
    publishedAt: undefined,
    scheduledFor: undefined,
    delivery: undefined,
  };
}

export class DemoService {
  private readonly aiService = new GeminiService();

  private readonly liveGmail = createGmailAdapter("live");

  private readonly membershipToolkit = createMembershipToolkitAdapter();

  constructor(private readonly store: RuntimeStore) {}

  private findApproval(state: DemoState, actionId: string) {
    const action = state.approvals.find((approval) => approval.id === actionId);

    if (!action) {
      throw new Error(`Approval action ${actionId} was not found.`);
    }

    return action;
  }

  private saveApproval(state: DemoState, nextAction: ApprovalAction) {
    state.approvals = state.approvals.map((approval) =>
      approval.id === nextAction.id ? nextAction : approval,
    );
    return nextAction;
  }

  private updateApproval(
    state: DemoState,
    actionId: string,
    updater: (approval: ApprovalAction) => ApprovalAction,
  ) {
    const current = this.findApproval(state, actionId);
    return this.saveApproval(state, {
      ...updater(current),
      updatedAt: new Date().toISOString(),
    });
  }

  private updateApprovalStep(
    state: DemoState,
    actionId: string,
    stepId: string,
    update: Partial<ApprovalExecutionStep>,
  ) {
    return this.updateApproval(state, actionId, (approval) => {
      const steps = approval.steps.map((step) =>
        step.id === stepId
          ? {
              ...step,
              ...update,
            }
          : step,
      );

      return {
        ...approval,
        steps,
        executionStatus: deriveExecutionStatus(steps),
      };
    });
  }

  private markDownstreamSteps(
    state: DemoState,
    actionId: string,
    stepIds: string[],
    status: Extract<ApprovalExecutionStep["status"], "skipped">,
    note: string,
  ) {
    return this.updateApproval(state, actionId, (approval) => {
      const steps = approval.steps.map((step) =>
        stepIds.includes(step.id)
          ? {
              ...step,
              status,
              note,
              completedAt: new Date().toISOString(),
            }
          : step,
      );

      return {
        ...approval,
        steps,
        executionStatus: deriveExecutionStatus(steps),
      };
    });
  }

  private advancePlannerAfterAction(state: DemoState, actionId: string) {
    const stage = getStageForApproval(actionId);

    if (!stage || state.planner.currentStage !== stage) {
      return;
    }

    const action = this.findApproval(state, actionId);

    if (!["completed", "skipped"].includes(action.executionStatus)) {
      return;
    }

    const currentIndex = state.planner.timeline.findIndex(
      (entry) => entry.stage === stage,
    );

    if (
      currentIndex === -1 ||
      currentIndex >= state.planner.timeline.length - 1
    ) {
      return;
    }

    state.planner = refreshPlannerState(
      {
        ...state.planner,
        currentStage: state.planner.timeline[currentIndex + 1]?.stage ?? stage,
      },
      state.setup.schoolBreaks,
    );
  }

  private resolveGmailRecipients(state: DemoState, action: ApprovalAction) {
    if (action.type === "send_board_draft_email") {
      const boardRecipients = dedupeEmails(
        state.setup.contacts
          .filter((contact) =>
            /(pta|board|president|vice president|vp|secretary|treasurer|chair)/i.test(
              contact.role,
            ),
          )
          .map((contact) => contact.email),
      );

      if (!boardRecipients.length) {
        throw new Error(
          "No board-review recipients are configured in Settings > Contacts. Add PTA board contacts in Staff and board contacts before sending a live Gmail board review email.",
        );
      }

      return boardRecipients;
    }

    if (action.type === "send_reminder_email") {
      const memberRecipients = dedupeEmails(
        state.setup.memberRecipients.map((recipient) => recipient.email),
      );

      if (!memberRecipients.length) {
        throw new Error(
          "No PTA member recipients are configured in Setup. Add the member email list before sending the Monday reminder through live Gmail.",
        );
      }

      return memberRecipients;
    }

    if (action.type === "publish_teacher_version") {
      const teacherReleaseRecipients = dedupeEmails(
        state.setup.contacts
          .filter((contact) => /(principal|teacher rep)/i.test(contact.role))
          .map((contact) => contact.email),
      );

      if (!teacherReleaseRecipients.length) {
        throw new Error(
          "Add Principal and Teacher Rep contacts in Setup before PTA Pilot can send the Thursday teacher release email.",
        );
      }

      return teacherReleaseRecipients;
    }

    throw new Error(`Approval ${action.id} is not a supported live Gmail action.`);
  }

  private buildTeacherReleaseMessage(state: DemoState, action: ApprovalAction) {
    const teacherDraft = state.newsletters.teachers;
    const diff = diffNewsletterDrafts(state.newsletters.board, teacherDraft);
    const changeLines = [
      ...diff.added.slice(0, 3).map((entry) => describeDiffEntry(entry, "Added")),
      ...diff.removed
        .slice(0, 2)
        .map((entry) => describeDiffEntry(entry, "Removed")),
    ];

    const body = [
      action.body.trim(),
      teacherDraft.delivery?.directUrl
        ? `Direct link: ${teacherDraft.delivery.directUrl}`
        : "",
      changeLines.length
        ? `Teacher-specific changes:\n${changeLines.map((line) => `- ${line}`).join("\n")}`
        : "Teacher-specific changes:\n- Published the current teacher edition and captured the direct link for staff.",
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      subject: action.subject,
      body,
    };
  }

  private buildSuggestionKey(item: Pick<ExtractedContentItem, "title" | "summary">) {
    return `${item.title}::${item.summary}`;
  }

  private filterUnplacedSuggestions(
    state: DemoState,
    extractedItems: ExtractedContentItem[],
  ) {
    const placed = new Set(
      [state.newsletters.board, state.newsletters.teachers].flatMap((draft) =>
        draft.sections.flatMap((section) =>
          section.items.map((item) => this.buildSuggestionKey({
            title: item.title,
            summary: item.body,
          })),
        ),
      ),
    );

    return extractedItems.filter(
      (item) => !placed.has(this.buildSuggestionKey(item)),
    );
  }

  private mergeOperationalDraft(
    current: NewsletterDraft,
    next: NewsletterDraft,
  ): NewsletterDraft {
    return {
      ...next,
      status: current.status,
      publishedAt: current.publishedAt ?? next.publishedAt,
      scheduledFor: current.scheduledFor ?? next.scheduledFor,
      delivery:
        current.delivery && Object.keys(current.delivery).length
          ? current.delivery
          : next.delivery,
    };
  }

  private async refreshContentWorkspace(
    state: DemoState,
    requestContext?: RequestContext,
    options?: {
      recordFailure?: boolean;
      recordAudit?: boolean;
      syncGmail?: boolean;
    },
  ) {
    const shouldSyncGmail = options?.syncGmail ?? true;
    const gmailSync = shouldSyncGmail
      ? await this.syncLiveGmailInbox(state, requestContext, {
          recordFailure: options?.recordFailure,
        })
      : {
          synced: false,
          reminderReplies: 0,
          threads: state.inbox.gmailThreads,
        };

    state.inbox.artifacts = await Promise.all(
      state.inbox.artifacts.map((artifact) =>
        artifact.type === "calendar_screenshot"
          ? refreshCalendarArtifactFromSource(artifact)
          : Promise.resolve(artifact),
      ),
    );

    const baseline = await this.membershipToolkit.getBaseline(state);
    const extractedItems = await this.aiService.extractStructuredContent(state);
    const generated = buildContentWorkspace(state, {
      baseline,
      extractedItems,
    });

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
    state.contentWorkspace = generated.contentWorkspace;
    state.newsletters.lastPublishedParent = {
      ...state.newsletters.lastPublishedParent,
      title: baseline.title,
      summary: baseline.note ?? "Most recent sent parent newsletter baseline.",
      sections: structuredClone(baseline.sections),
      delivery: {
        ...state.newsletters.lastPublishedParent.delivery,
        directUrl:
          baseline.sourceUrl ??
          state.newsletters.lastPublishedParent.delivery?.directUrl,
        lastSyncedAt: baseline.retrievedAt,
      },
    };
    state.newsletters.board = this.mergeOperationalDraft(
      state.newsletters.board,
      generated.newsletters.board,
    );
    state.newsletters.teachers = this.mergeOperationalDraft(
      state.newsletters.teachers,
      generated.newsletters.teachers,
    );
    state.newsletters.parents = this.mergeOperationalDraft(
      state.newsletters.parents,
      generated.newsletters.parents,
    );
    state.inbox.unplacedSuggestions = this.filterUnplacedSuggestions(
      state,
      extractedItems,
    );
    state.flyerRecommendations = flyerRecommendations;
    state.approvals = generated.approvals.map((approval) => ({
      ...approval,
      executionStatus:
        approval.executionStatus ?? deriveExecutionStatus(approval.steps),
    }));

    if (options?.recordAudit ?? true) {
      state.auditLog.unshift(
        buildAuditEntry(
          "ingestion",
          "membership_toolkit",
          baseline.retrievalMode === "automatic"
            ? `Pulled the latest Membership Toolkit baseline from ${baseline.sourceUrl ?? "the sent-newsletter feed"}.`
            : baseline.note ??
                "Used the stored PTA Pilot newsletter baseline as a fallback.",
        ),
      );
      state.auditLog.unshift(
        buildAuditEntry(
          "ingestion",
          "ai",
          `Ingested Gmail, mock channels, the MTK baseline, and the calendar source into a structured content workspace with ${generated.contentWorkspace.proposedEdits.length} proposed edit(s).`,
        ),
      );
    }

    if (gmailSync.synced && (options?.recordAudit ?? true)) {
      state.auditLog.unshift(
        buildAuditEntry(
          "ingestion",
          "gmail",
          `Synced ${gmailSync.threads.length} live Gmail thread(s), including ${gmailSync.reminderReplies} reply message(s) from the reminder thread.`,
        ),
      );
    }
  }

  private async syncLiveGmailInbox(
    state: DemoState,
    requestContext: RequestContext | undefined,
    options?: { recordFailure?: boolean },
  ) {
    if (
      state.setup.integrations.gmail.mode !== "live" ||
      !requestContext?.userId
    ) {
      return {
        synced: false,
        reminderReplies: 0,
        threads: state.inbox.gmailThreads,
      };
    }

    try {
      const gmailContext = {
        userId: requestContext.userId,
        auth0AccessToken: requestContext.auth0AccessToken,
      };
      const threads = await this.liveGmail.listRecentThreads(state, gmailContext);

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
        gmailContext,
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

  private async executeGmailStep(input: {
    state: DemoState;
    actionId: string;
    stepId: string;
    subject: string;
    body: string;
    recipients: string[];
    requestContext?: RequestContext;
    auditLabel: string;
  }) {
    const { state, actionId, stepId, subject, body, recipients, requestContext } =
      input;

    this.updateApprovalStep(state, actionId, stepId, {
      status: "running",
      startedAt: new Date().toISOString(),
      errorMessage: undefined,
    });

    if (state.setup.integrations.gmail.mode !== "live") {
      this.updateApproval(state, actionId, (approval) => ({
        ...approval,
        gmailExecution: {
          deliveryPath: "mock",
          lastAction: "sent",
          sentMessageId: `mock-message-${crypto.randomUUID()}`,
          note: `Recorded a mock Gmail send for ${recipients.length} recipient(s).`,
          updatedAt: new Date().toISOString(),
        },
      }));
      this.updateApprovalStep(state, actionId, stepId, {
        status: "completed",
        completedAt: new Date().toISOString(),
        note: `Mock Gmail send recorded for ${recipients.length} recipient(s).`,
      });
      state.auditLog.unshift(
        buildAuditEntry(
          "execution",
          "gmail",
          `${input.auditLabel} recorded in mock Gmail mode.`,
        ),
      );
      return;
    }

    if (!requestContext?.userId) {
      this.updateApprovalStep(state, actionId, stepId, {
        status: "failed",
        completedAt: new Date().toISOString(),
        errorMessage:
          "Log in with Auth0 before approving a live Gmail action so PTA Pilot knows which connected account to use.",
      });
      return;
    }

    try {
      const currentApproval = this.findApproval(state, actionId);
      const reusableDraft = getReusableGmailDraft(currentApproval);
      const draft =
        reusableDraft ??
        (await this.liveGmail.createDraft(
          {
            to: recipients,
            subject,
            body,
          },
          {
            userId: requestContext.userId,
            auth0AccessToken: requestContext.auth0AccessToken,
          },
        ));

      const sent = await this.liveGmail.sendEmail(
        {
          to: recipients,
          subject,
          body,
          draftId: draft.draftId,
        },
        {
          userId: requestContext.userId,
          auth0AccessToken: requestContext.auth0AccessToken,
        },
      );

      this.updateApproval(state, actionId, (approval) => ({
        ...approval,
        subject,
        body,
        gmailExecution: {
          deliveryPath: sent.deliveryPath,
          lastAction: "sent",
          threadId: sent.threadId ?? draft.threadId,
          sentMessageId: sent.messageId,
          note: `Sent through live Gmail to ${recipients.length} recipient(s).`,
          updatedAt: new Date().toISOString(),
        },
      }));
      this.updateApprovalStep(state, actionId, stepId, {
        status: "completed",
        completedAt: new Date().toISOString(),
        note: `Sent through live Gmail to ${recipients.length} recipient(s).`,
      });
      state.auditLog.unshift(
        buildAuditEntry(
          "execution",
          "gmail",
          `${input.auditLabel} sent through live Gmail to ${recipients.length} recipient(s).`,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Gmail error.";
      this.updateApprovalStep(state, actionId, stepId, {
        status: "failed",
        completedAt: new Date().toISOString(),
        errorMessage: message,
      });
      state.auditLog.unshift(
        buildAuditEntry(
          "execution",
          "gmail",
          `${input.auditLabel} failed. ${message}`,
        ),
      );
    }
  }

  private applyManualOutputs(
    state: DemoState,
    actionId: string,
    stepId: string,
    input: ApprovalStepManualCompleteInput,
  ) {
    const action = this.findApproval(state, actionId);
    const outputs = input.outputs ?? {};

    if (action.type === "publish_teacher_version" && stepId === "approval-thursday-publish") {
      state.newsletters.teachers = withNewsletterDelivery(state.newsletters.teachers, {
        directUrl: outputs.directUrl ?? state.newsletters.teachers.delivery?.directUrl,
        externalId: outputs.externalId ?? state.newsletters.teachers.delivery?.externalId,
        lastSyncedAt: new Date().toISOString(),
      });
      state.newsletters.teachers.status = "published";
      state.newsletters.teachers.publishedAt =
        state.newsletters.teachers.publishedAt ?? new Date().toISOString();
    }

    if (action.type === "schedule_parent_version") {
      if (stepId === "approval-sunday-duplicate") {
        state.newsletters.parents = withNewsletterDelivery(state.newsletters.parents, {
          directUrl: outputs.directUrl ?? state.newsletters.parents.delivery?.directUrl,
          externalId: outputs.externalId ?? state.newsletters.parents.delivery?.externalId,
          lastSyncedAt: new Date().toISOString(),
        });
      }

      if (stepId === "approval-sunday-schedule") {
        state.newsletters.parents = withNewsletterDelivery(state.newsletters.parents, {
          directUrl: outputs.directUrl ?? state.newsletters.parents.delivery?.directUrl,
          externalId: outputs.externalId ?? state.newsletters.parents.delivery?.externalId,
          lastSyncedAt: new Date().toISOString(),
        });
        state.newsletters.parents.status = "scheduled";
        state.newsletters.parents.scheduledFor =
          outputs.scheduledFor ??
          state.newsletters.parents.scheduledFor ??
          action.scheduledFor;
      }
    }
  }

  private async executeActionWorkflow(
    state: DemoState,
    actionId: string,
    requestContext?: RequestContext,
  ) {
    const action = this.findApproval(state, actionId);

    if (action.status !== "approved") {
      return state;
    }

    if (action.type === "send_board_draft_email" || action.type === "send_reminder_email") {
      const sendStep = action.steps[0];

      if (!sendStep || sendStep.status === "completed") {
        return state;
      }

      try {
        const recipients = this.resolveGmailRecipients(state, action);
        await this.executeGmailStep({
          state,
          actionId,
          stepId: sendStep.id,
          subject: action.subject,
          body: action.body,
          recipients,
          requestContext,
          auditLabel: action.title,
        });
      } catch (error) {
        this.updateApprovalStep(state, actionId, sendStep.id, {
          status: "failed",
          completedAt: new Date().toISOString(),
          errorMessage:
            error instanceof Error ? error.message : "Unable to prepare Gmail send.",
        });
      }

      return state;
    }

    if (action.type === "publish_teacher_version") {
      const publishStep = action.steps.find((step) => step.id === "approval-thursday-publish");
      const sendStep = action.steps.find((step) => step.id === "approval-thursday-send");

      if (!publishStep || !sendStep) {
        return state;
      }

      if (publishStep.status === "pending") {
        this.updateApprovalStep(state, actionId, publishStep.id, {
          status: "running",
          startedAt: new Date().toISOString(),
          errorMessage: undefined,
        });

        try {
          const result = await this.membershipToolkit.publishNewsletter(
            state,
            state.newsletters.teachers,
          );
          state.newsletters.teachers = result.draft;
          this.updateApprovalStep(state, actionId, publishStep.id, {
            status: result.step.status,
            completedAt:
              result.step.status === "completed" ? new Date().toISOString() : undefined,
            note: result.step.note,
            externalUrl: result.step.externalUrl,
            outputs: result.step.outputs,
            errorMessage: result.step.errorMessage,
          });
          state.auditLog.unshift(
            buildAuditEntry(
              "execution",
              "membership_toolkit",
              result.step.status === "completed"
                ? "Teacher newsletter published in Membership Toolkit."
                : `Teacher publish needs operator follow-up. ${result.step.note ?? ""}`.trim(),
            ),
          );
        } catch (error) {
          this.updateApprovalStep(state, actionId, publishStep.id, {
            status: "failed",
            completedAt: new Date().toISOString(),
            errorMessage:
              error instanceof Error
                ? error.message
                : "Teacher publish failed in Membership Toolkit.",
          });
        }
      }

      const refreshedAction = this.findApproval(state, actionId);
      const refreshedPublishStep = refreshedAction.steps.find(
        (step) => step.id === "approval-thursday-publish",
      );
      const refreshedSendStep = refreshedAction.steps.find(
        (step) => step.id === "approval-thursday-send",
      );

      if (
        !refreshedPublishStep ||
        !refreshedSendStep ||
        refreshedPublishStep.status !== "completed" ||
        refreshedSendStep.status === "completed"
      ) {
        return state;
      }

      try {
        const recipients = this.resolveGmailRecipients(state, refreshedAction);
        const teacherReleaseMessage = this.buildTeacherReleaseMessage(
          state,
          refreshedAction,
        );
        await this.executeGmailStep({
          state,
          actionId,
          stepId: refreshedSendStep.id,
          subject: teacherReleaseMessage.subject,
          body: teacherReleaseMessage.body,
          recipients,
          requestContext,
          auditLabel: "Thursday teacher release email",
        });
      } catch (error) {
        this.updateApprovalStep(state, actionId, refreshedSendStep.id, {
          status: "failed",
          completedAt: new Date().toISOString(),
          errorMessage:
            error instanceof Error ? error.message : "Teacher release email failed.",
        });
      }

      return state;
    }

    if (action.type === "schedule_parent_version" && action.scheduledFor) {
      const breakStep = action.steps.find(
        (step) => step.id === "approval-sunday-break-check",
      );
      const deriveStep = action.steps.find((step) => step.id === "approval-sunday-derive");
      const duplicateStep = action.steps.find(
        (step) => step.id === "approval-sunday-duplicate",
      );
      const scheduleStep = action.steps.find(
        (step) => step.id === "approval-sunday-schedule",
      );

      if (!breakStep || !deriveStep || !duplicateStep || !scheduleStep) {
        return state;
      }

      if (breakStep.status === "pending") {
        const skipDecision = shouldSkipParentSend(
          action.scheduledFor,
          state.setup.schoolBreaks,
        );

        this.updateApprovalStep(state, actionId, breakStep.id, {
          status: "completed",
          completedAt: new Date().toISOString(),
          note: skipDecision.skip
            ? skipDecision.reason
            : "No school break overlaps the upcoming school week.",
        });

        if (skipDecision.skip) {
          this.markDownstreamSteps(
            state,
            actionId,
            [deriveStep.id, duplicateStep.id, scheduleStep.id],
            "skipped",
            skipDecision.reason ?? "Skipped because of a school break.",
          );
          state.auditLog.unshift(
            buildAuditEntry(
              "execution",
              "planner",
              skipDecision.reason ?? "Skipped the Sunday parent send.",
            ),
          );
          return state;
        }
      }

      if (deriveStep.status === "pending") {
        if (state.newsletters.teachers.status !== "published") {
          this.updateApprovalStep(state, actionId, deriveStep.id, {
            status: "failed",
            completedAt: new Date().toISOString(),
            errorMessage:
              "Publish the teacher version successfully before scheduling the Sunday parent newsletter.",
          });
          return state;
        }

        state.newsletters.parents = deriveParentDraftFromTeacher(
          state.newsletters.teachers,
        );
        this.updateApprovalStep(state, actionId, deriveStep.id, {
          status: "completed",
          completedAt: new Date().toISOString(),
          note: "Derived the parent version from the published teacher draft.",
        });
      }

      const postDeriveAction = this.findApproval(state, actionId);
      const postDeriveDuplicateStep = postDeriveAction.steps.find(
        (step) => step.id === "approval-sunday-duplicate",
      );
      const postDeriveScheduleStep = postDeriveAction.steps.find(
        (step) => step.id === "approval-sunday-schedule",
      );

      if (postDeriveDuplicateStep?.status === "pending") {
        this.updateApprovalStep(state, actionId, postDeriveDuplicateStep.id, {
          status: "running",
          startedAt: new Date().toISOString(),
        });

        try {
          const result = await this.membershipToolkit.duplicateNewsletter(
            state,
            "parents",
            state.newsletters.parents,
          );
          state.newsletters.parents = result.draft;
          this.updateApprovalStep(state, actionId, postDeriveDuplicateStep.id, {
            status: result.step.status,
            completedAt:
              result.step.status === "completed" ? new Date().toISOString() : undefined,
            note: result.step.note,
            externalUrl: result.step.externalUrl,
            outputs: result.step.outputs,
            errorMessage: result.step.errorMessage,
          });
        } catch (error) {
          this.updateApprovalStep(state, actionId, postDeriveDuplicateStep.id, {
            status: "failed",
            completedAt: new Date().toISOString(),
            errorMessage:
              error instanceof Error
                ? error.message
                : "Parent duplicate failed in Membership Toolkit.",
          });
          return state;
        }
      }

      const beforeScheduleAction = this.findApproval(state, actionId);
      const beforeScheduleDuplicateStep = beforeScheduleAction.steps.find(
        (step) => step.id === "approval-sunday-duplicate",
      );

      if (
        beforeScheduleDuplicateStep &&
        beforeScheduleDuplicateStep.status !== "completed"
      ) {
        return state;
      }

      if (postDeriveScheduleStep?.status === "pending") {
        this.updateApprovalStep(state, actionId, postDeriveScheduleStep.id, {
          status: "running",
          startedAt: new Date().toISOString(),
        });

        try {
          const result = await this.membershipToolkit.scheduleNewsletter(
            state.newsletters.parents,
            action.scheduledFor,
          );
          state.newsletters.parents = result.draft;
          this.updateApprovalStep(state, actionId, postDeriveScheduleStep.id, {
            status: result.step.status,
            completedAt:
              result.step.status === "completed" ? new Date().toISOString() : undefined,
            note: result.step.note,
            externalUrl: result.step.externalUrl,
            outputs: result.step.outputs,
            errorMessage: result.step.errorMessage,
          });
        } catch (error) {
          this.updateApprovalStep(state, actionId, postDeriveScheduleStep.id, {
            status: "failed",
            completedAt: new Date().toISOString(),
            errorMessage:
              error instanceof Error
                ? error.message
                : "Parent schedule failed in Membership Toolkit.",
          });
        }
      }
    }

    return state;
  }

  async getState(requestContext?: RequestContext): Promise<DemoState> {
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
    await this.refreshContentWorkspace(state, requestContext, {
      recordFailure: false,
      recordAudit: false,
    });
    await this.store.write(state);
    return state;
  }

  async updateSetup(input: SetupUpdateInput): Promise<DemoState> {
    const state = await this.store.read();

    if (input.auth0AccountEmail !== undefined) {
      state.setup.auth0AccountEmail = input.auth0AccountEmail || undefined;
    }

    if (input.contacts) {
      state.setup.contacts = input.contacts;
    }

    if (input.memberRecipients) {
      state.setup.memberRecipients = input.memberRecipients;
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

    if (input.planner) {
      state.planner = {
        ...state.planner,
        currentStage: input.planner.currentStage,
        timeline: input.planner.timeline,
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

  async addInboxArtifact(
    input: InboxArtifactUploadInput,
    file?: Express.Multer.File,
  ): Promise<DemoState> {
    const state = await this.store.read();
    const artifact = await createInboxArtifact({
      ...input,
      file:
        file
          ? {
              originalname: file.originalname,
              mimetype: file.mimetype,
              buffer: file.buffer,
            }
          : undefined,
    });

    state.inbox.artifacts.unshift(artifact);

    if (artifact.type === "previous_newsletter_link" && artifact.originalUrl) {
      state.newsletters.lastPublishedParent = withNewsletterDelivery(
        state.newsletters.lastPublishedParent,
        {
          directUrl: artifact.originalUrl,
          lastSyncedAt: artifact.createdAt,
        },
      );
    }

    state.auditLog.unshift(
      buildAuditEntry(
        "ingestion",
        "artifacts",
        artifact.type === "calendar_screenshot"
          ? `Stored ${artifact.label} and extracted OCR text for newsletter context.`
          : `Stored ${artifact.label} for previous-newsletter context.`,
      ),
    );

    await this.store.write(state);
    return state;
  }

  async ingestUpdates(requestContext?: RequestContext): Promise<DemoState> {
    const state = await this.store.read();
    await this.refreshContentWorkspace(state, requestContext, {
      recordFailure: true,
      recordAudit: true,
    });
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

    state.approvals = refreshedApprovals.map((approval) => ({
      ...approval,
      executionStatus:
        approval.executionStatus ?? deriveExecutionStatus(approval.steps),
    }));
    await this.store.write(state);
    return state;
  }

  async duplicateLastNewsletter(): Promise<DemoState> {
    const state = await this.store.read();
    const source = await this.membershipToolkit.getLastNewsletter(state);

    state.newsletters.board = buildDuplicateNewsletter(
      source,
      "board",
      deriveAudienceDraftTitle(source.title, "board"),
    );
    state.newsletters.teachers = buildDuplicateNewsletter(
      source,
      "teachers",
      deriveAudienceDraftTitle(source.title, "teachers"),
    );
    state.newsletters.parents = buildDuplicateNewsletter(
      source,
      "parents",
      deriveAudienceDraftTitle(source.title, "parents"),
    );
    const rebuilt = rebuildContentWorkspaceFromDrafts(state);
    state.contentWorkspace = rebuilt.contentWorkspace;
    state.approvals = rebuilt.approvals.map((approval) => ({
      ...approval,
      executionStatus:
        approval.executionStatus ?? deriveExecutionStatus(approval.steps),
    }));
    state.auditLog.unshift(
      buildAuditEntry(
        "execution",
        "newsletter",
        "Duplicated the last newsletter into this week's local working drafts.",
      ),
    );
    await this.store.write(state);
    return state;
  }

  async resetWorkflowForTesting(requestContext?: RequestContext): Promise<DemoState> {
    const state = await this.store.read();

    state.approvals = state.approvals.map(resetApprovalForTesting);
    state.newsletters.board = resetNewsletterForTesting(state.newsletters.board);
    state.newsletters.teachers = resetNewsletterForTesting(state.newsletters.teachers);
    state.newsletters.parents = resetNewsletterForTesting(state.newsletters.parents);

    await this.refreshContentWorkspace(state, requestContext, {
      recordFailure: false,
      recordAudit: false,
      syncGmail: false,
    });

    state.planner = refreshPlannerState(
      {
        ...state.planner,
        currentStage: "monday_reminder",
      },
      state.setup.schoolBreaks,
    );
    state.auditLog = [
      buildAuditEntry(
        "execution",
        "planner",
        "Reset the workflow to a fresh Monday test state.",
      ),
    ];

    await this.store.write(state);
    return state;
  }

  async editApproval(
    actionId: string,
    input: ApprovalEditInput,
    requestContext?: RequestContext,
  ): Promise<DemoState> {
    const state = await this.store.read();
    const updatedAction = this.updateApproval(state, actionId, (approval) => ({
      ...approval,
      subject: input.subject,
      body: input.body,
    }));

    if (
      updatedAction.channel === "gmail" &&
      state.setup.integrations.gmail.mode === "live" &&
      requestContext?.userId
    ) {
      try {
        const recipients = this.resolveGmailRecipients(state, updatedAction);
        const draft = await this.liveGmail.createDraft(
          {
            to: recipients,
            subject: input.subject,
            body: input.body,
            draftId: getReusableGmailDraft(updatedAction)?.draftId,
          },
          {
            userId: requestContext.userId,
            auth0AccessToken: requestContext.auth0AccessToken,
          },
        );

        this.updateApproval(state, actionId, (approval) => ({
          ...approval,
          gmailExecution: {
            deliveryPath: draft.deliveryPath,
            lastAction: "draft_saved",
            draftId: draft.draftId,
            draftMessageId: draft.draftMessageId,
            threadId: draft.threadId,
            note: `Live Gmail draft synced for ${recipients.length} recipient(s).`,
            updatedAt: new Date().toISOString(),
          },
        }));
        state.auditLog.unshift(
          buildAuditEntry(
            "execution",
            "gmail",
            `Synced a live Gmail draft for ${updatedAction.title}.`,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        state.auditLog.unshift(
          buildAuditEntry(
            "execution",
            "gmail",
            `Saved ${updatedAction.title} locally, but could not sync a live Gmail draft. ${message}`,
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

  async approveAction(
    actionId: string,
    requestContext?: RequestContext,
  ): Promise<DemoState> {
    const state = await this.store.read();
    if (actionId !== "approval-monday") {
      await this.refreshContentWorkspace(state, requestContext, {
        recordFailure: true,
        recordAudit: true,
      });
    }
    const action = this.updateApproval(state, actionId, (approval) => ({
      ...approval,
      status: "approved",
      executionStatus: deriveExecutionStatus(approval.steps),
    }));

    state.auditLog.unshift(
      buildAuditEntry(
        "approval",
        action.channel,
        `Approved ${action.title}. Execution can proceed without further blockers.`,
      ),
    );

    await this.executeActionWorkflow(state, actionId, requestContext);
    this.advancePlannerAfterAction(state, actionId);
    await this.store.write(state);
    return state;
  }

  async retryAction(
    actionId: string,
    requestContext?: RequestContext,
  ): Promise<DemoState> {
    const state = await this.store.read();
    if (actionId !== "approval-monday") {
      await this.refreshContentWorkspace(state, requestContext, {
        recordFailure: true,
        recordAudit: true,
      });
    }
    const action = this.findApproval(state, actionId);
    const retryableStep = action.steps.find((step) =>
      ["failed", "needs_operator"].includes(step.status),
    );

    if (retryableStep) {
      this.updateApprovalStep(state, actionId, retryableStep.id, {
        status: "pending",
        completedAt: undefined,
        startedAt: undefined,
        errorMessage: undefined,
      });
    } else if (
      action.channel === "gmail" &&
      ["send_reminder_email", "send_board_draft_email", "publish_teacher_version"].includes(
        action.type,
      )
    ) {
      const replayStepId =
        action.type === "publish_teacher_version"
          ? "approval-thursday-send"
          : action.steps[0]?.id;

      if (replayStepId) {
        this.updateApprovalStep(state, actionId, replayStepId, {
          status: "pending",
          completedAt: undefined,
          startedAt: undefined,
          errorMessage: undefined,
        });
      }
    }

    state.auditLog.unshift(
      buildAuditEntry(
        "execution",
        "approvals",
        `Retry requested for ${action.title}.`,
      ),
    );

    await this.executeActionWorkflow(state, actionId, requestContext);
    this.advancePlannerAfterAction(state, actionId);
    await this.store.write(state);
    return state;
  }

  async completeManualStep(
    actionId: string,
    stepId: string,
    input: ApprovalStepManualCompleteInput,
    requestContext?: RequestContext,
  ): Promise<DemoState> {
    const state = await this.store.read();

    this.applyManualOutputs(state, actionId, stepId, input);
    this.updateApprovalStep(state, actionId, stepId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      note: input.note,
      outputs: input.outputs,
      errorMessage: undefined,
    });
    state.auditLog.unshift(
      buildAuditEntry(
        "execution",
        "membership_toolkit",
        `Marked ${stepId} complete with operator-provided details.`,
      ),
    );

    await this.refreshContentWorkspace(state, requestContext, {
      recordFailure: false,
      recordAudit: false,
      syncGmail: false,
    });
    await this.executeActionWorkflow(state, actionId, requestContext);
    this.advancePlannerAfterAction(state, actionId);
    await this.store.write(state);
    return state;
  }

  async rejectAction(actionId: string): Promise<DemoState> {
    const state = await this.store.read();
    this.updateApproval(state, actionId, (approval) => ({
      ...approval,
      status: "rejected",
    }));
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

    if (audience === "parents") {
      throw new Error(
        "Parent newsletters are derived from the teacher-approved version and remain read-only in the editor.",
      );
    }

    state.newsletters[audience] = await this.membershipToolkit.updateNewsletterDraft(
      state,
      draft,
    );
    const rebuilt = rebuildContentWorkspaceFromDrafts(state);
    state.contentWorkspace = rebuilt.contentWorkspace;
    state.newsletters.parents = this.mergeOperationalDraft(
      state.newsletters.parents,
      rebuilt.newsletters.parents,
    );
    state.approvals = rebuilt.approvals.map((approval) => ({
      ...approval,
      executionStatus:
        approval.executionStatus ?? deriveExecutionStatus(approval.steps),
    }));
    state.inbox.unplacedSuggestions = this.filterUnplacedSuggestions(
      state,
      state.inbox.extractedItems,
    );
    state.auditLog.unshift(
      buildAuditEntry(
        "execution",
        "newsletter",
        `Saved ${audience} newsletter draft edits.`,
      ),
    );
    await this.store.write(state);
    return state;
  }
}
