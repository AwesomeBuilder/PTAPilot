/* eslint-disable @next/next/no-img-element */
"use client";

import { format } from "date-fns";
import {
  ArrowClockwise,
  ArrowRight,
  ChatsCircle,
  CheckCircle,
  EnvelopeSimple,
  GearSix,
  LinkSimple,
  ListChecks,
  NotePencil,
  ShieldCheck,
  SignIn,
  SignOut,
  Sparkle,
  Users,
} from "@phosphor-icons/react";
import { startTransition, useCallback, useEffect, useState } from "react";
import type {
  AddMockMessageInput,
  ApprovalAction,
  Contact,
  DemoState,
  MemberRecipient,
  SchoolBreak,
  SetupUpdateInput,
  WorkflowStage,
} from "@pta-pilot/shared";
import { seedDemoState } from "@pta-pilot/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/api";
import { cn } from "@/lib/utils";

type MenuKey =
  | "dashboard"
  | "drafts"
  | "sent"
  | "runbook"
  | "messages"
  | "settings";

type SettingsSectionKey =
  | "contacts"
  | "newsletterUrl"
  | "breaks"
  | "account"
  | "audit";

type Viewer = {
  sub?: string | null;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
};

type Notice = {
  tone: "info" | "success" | "error";
  message: string;
} | null;

type ApprovalDraftMap = Record<
  string,
  {
    subject: string;
    body: string;
  }
>;

type SetupDraft = {
  auth0AccountEmail: string;
  contacts: Contact[];
  memberRecipients: MemberRecipient[];
  schoolBreaks: SchoolBreak[];
};

type ArtifactDraftState = {
  previousNewsletterUrl: string;
  previousNewsletterNote: string;
};

type AuthStatusResponse = {
  tokenVault: {
    configured: boolean;
    missing: string[];
    provider: string;
    note: string;
  };
  managementApi: {
    configured: boolean;
    missing: string[];
    note: string;
  };
  gmail: {
    connection: string;
    requiredScopes: string[];
    grantedScopes: string[];
    missingScopes: string[];
    connected: boolean;
    liveReady: boolean;
    managementApiConfigured: boolean;
    tokenVaultConfigured: boolean;
    actionPath: "identity_provider" | "token_vault" | "unavailable";
    note: string;
  };
};

const menuDefinitions: Array<{
  key: MenuKey;
  label: string;
  icon: typeof ListChecks;
}> = [
  { key: "dashboard", label: "Dashboard", icon: ListChecks },
  { key: "drafts", label: "Drafts", icon: NotePencil },
  { key: "sent", label: "Sent emails", icon: EnvelopeSimple },
  { key: "runbook", label: "MTK runbook", icon: CheckCircle },
  { key: "messages", label: "Messages", icon: ChatsCircle },
  { key: "settings", label: "Settings", icon: GearSix },
];

const settingsSections: Array<{
  key: SettingsSectionKey;
  label: string;
  icon: typeof Users;
}> = [
  { key: "contacts", label: "Contacts", icon: Users },
  { key: "newsletterUrl", label: "Newsletter URL", icon: LinkSimple },
  { key: "breaks", label: "Breaks", icon: Sparkle },
  { key: "account", label: "Account", icon: GearSix },
  { key: "audit", label: "Audit log", icon: ShieldCheck },
];

function BrandLogo({
  className,
  alt = "PTA Pilot logo",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src="/pta-pilot-logo.png"
      alt={alt}
      className={cn(
        "rounded-[1.25rem] border border-white/10 bg-[#02060d] object-cover shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_18px_42px_rgba(45,200,255,0.16)]",
        className,
      )}
    />
  );
}

function createSetupDraft(state: DemoState): SetupDraft {
  return {
    auth0AccountEmail: state.setup.auth0AccountEmail ?? "",
    contacts: structuredClone(state.setup.contacts),
    memberRecipients: structuredClone(state.setup.memberRecipients),
    schoolBreaks: structuredClone(state.setup.schoolBreaks),
  };
}

function createApprovalDrafts(approvals: ApprovalAction[]): ApprovalDraftMap {
  return Object.fromEntries(
    approvals.map((approval) => [
      approval.id,
      {
        subject: approval.subject,
        body: approval.body,
      },
    ]),
  ) as ApprovalDraftMap;
}

function createArtifactDrafts(state: DemoState): ArtifactDraftState {
  const latestPreviousLink = state.inbox.artifacts.find(
    (artifact) => artifact.type === "previous_newsletter_link",
  );

  return {
    previousNewsletterUrl:
      latestPreviousLink?.originalUrl ??
      state.newsletters.lastPublishedParent.delivery?.directUrl ??
      "",
    previousNewsletterNote: latestPreviousLink?.note ?? "",
  };
}

function createSetupPayload(setupDraft: SetupDraft): SetupUpdateInput {
  return {
    auth0AccountEmail: setupDraft.auth0AccountEmail.trim(),
    contacts: setupDraft.contacts,
    memberRecipients: setupDraft.memberRecipients,
    schoolBreaks: setupDraft.schoolBreaks,
  };
}

const DISPLAY_VALUE_LABELS: Record<string, string> = {
  ai: "AI",
  auth0: "Auth0",
  gmail: "Gmail",
  imessage: "iMessage",
  membershiptoolkit: "Membership Toolkit",
  mockmessages: "Mock Messages",
  pta: "PTA",
  tokenvault: "Token Vault",
  whatsapp: "WhatsApp",
};

const DISPLAY_TOKEN_LABELS: Record<string, string> = {
  ai: "AI",
  api: "API",
  auth0: "Auth0",
  gmail: "Gmail",
  pta: "PTA",
};

function formatDisplayLabel(value: string) {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  const compact = normalized.replace(/\s+/g, "").toLowerCase();
  const directLabel = DISPLAY_VALUE_LABELS[compact];

  if (directLabel) {
    return directLabel;
  }

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const lowerToken = token.toLowerCase();
      return (
        DISPLAY_TOKEN_LABELS[lowerToken] ??
        `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`
      );
    })
    .join(" ");
}

function formatDateTime(value: string | undefined) {
  if (!value) {
    return "Not scheduled";
  }

  return format(new Date(value), "EEE, MMM d • h:mm a");
}

function withUserQuery(path: string, userId?: string | null) {
  if (!userId) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}userId=${encodeURIComponent(userId)}`;
}

function getApprovalExecutionIssue(approval: ApprovalAction) {
  const blockingStep = approval.steps.find(
    (step) =>
      ["failed", "needs_operator"].includes(step.status) &&
      (step.errorMessage || step.note),
  );

  if (!blockingStep) {
    return null;
  }

  return {
    label: blockingStep.label,
    message: blockingStep.errorMessage ?? blockingStep.note ?? "",
    tone: blockingStep.status,
    externalUrl: blockingStep.externalUrl,
    actionLabel: getMembershipToolkitActionLabel(blockingStep.type),
  };
}

function getMembershipToolkitActionLabel(action: string) {
  if (action === "duplicate") {
    return "Duplicate the draft";
  }

  if (["edit", "publish", "schedule", "test_send"].includes(action)) {
    return "Update the draft";
  }

  return "Open in MTK";
}

function getStatusTone(status: string) {
  const normalized = status.toLowerCase();

  if (
    ["approved", "connected", "done", "published", "completed", "scheduled"].includes(normalized)
  ) {
    return {
      container:
        "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
      dot: "bg-emerald-300",
    };
  }

  if (["active", "current_focus"].includes(normalized)) {
    return {
      container: "border-primary/25 bg-primary/10 text-primary",
      dot: "bg-primary",
    };
  }

  if (["needs_setup", "rejected", "failed"].includes(normalized)) {
    return {
      container: "border-rose-400/20 bg-rose-400/10 text-rose-100",
      dot: "bg-rose-300",
    };
  }

  if (["running", "pending", "not_started", "needs_operator", "skipped"].includes(normalized)) {
    return {
      container: "border-amber-300/20 bg-amber-400/10 text-amber-100",
      dot: "bg-amber-300",
    };
  }

  return {
    container: "border-border/80 bg-background/65 text-muted-foreground",
    dot: "bg-muted-foreground/70",
  };
}

function StatusIndicator({
  status,
  label,
  className,
}: {
  status?: string | null;
  label?: string;
  className?: string;
}) {
  const normalizedStatus = status?.trim() ? status : "unknown";
  const tone = getStatusTone(normalizedStatus);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[0.64rem] font-semibold tracking-[0.18em] uppercase",
        tone.container,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", tone.dot)} />
      <span>{label ?? formatDisplayLabel(normalizedStatus)}</span>
    </span>
  );
}

function isEmailDraft(approval: ApprovalAction) {
  return approval.channel === "gmail" || approval.type === "publish_teacher_version";
}

function isSentEmail(approval: ApprovalAction) {
  return isEmailDraft(approval) && approval.executionStatus === "completed";
}

function setPlannerCurrentStage(
  planner: DemoState["planner"],
  stage: WorkflowStage,
): DemoState["planner"] {
  const activeIndex = planner.timeline.findIndex((entry) => entry.stage === stage);
  const resolvedIndex = activeIndex === -1 ? 0 : activeIndex;

  return {
    ...planner,
    currentStage: planner.timeline[resolvedIndex]?.stage ?? stage,
    timeline: planner.timeline.map((entry, index) => ({
      ...entry,
      status:
        index < resolvedIndex
          ? "done"
          : index === resolvedIndex
            ? "active"
            : "upcoming",
    })),
  };
}

function getActiveStageEntry(state: DemoState) {
  return (
    state.planner.timeline.find((entry) => entry.status === "active") ??
    state.planner.timeline.find((entry) => entry.stage === state.planner.currentStage) ??
    state.planner.timeline[0]
  );
}

type PrimaryCta =
  | {
      type: "ingest";
      title: string;
      detail: string;
      label: string;
    }
  | {
      type: "open";
      title: string;
      detail: string;
      label: string;
      view: MenuKey;
    };

function getPrimaryCta(state: DemoState): PrimaryCta | null {
  switch (state.planner.currentStage) {
    case "collect_updates":
      return {
        type: "ingest",
        title: "Pull in the latest updates",
        detail: "Refresh the runbook from email and messages.",
        label: "Ingest updates",
      };
    case "wednesday_draft":
      return {
        type: "open",
        title: "Review the board draft email",
        detail: "Tighten the copy before the board review goes out.",
        label: "Open drafts",
        view: "drafts",
      };
    case "thursday_teacher_release":
      return {
        type: "open",
        title: "Confirm the teacher release",
        detail: "Check the release copy and then send it.",
        label: "Open drafts",
        view: "drafts",
      };
    case "sunday_parent_schedule":
      return {
        type: "open",
        title: "Check the parent send runbook",
        detail: "Make sure the MTK steps still match this week's signals.",
        label: "Open runbook",
        view: "runbook",
      };
    case "monday_reminder":
      {
        const mondayApproval = state.approvals.find(
          (approval) => approval.id === "approval-monday",
        );

        return {
          type: "open",
          title: "Review the Monday reminder",
          detail:
            mondayApproval?.executionStatus === "completed"
              ? "Open the reminder draft to review it or send it again."
              : "Confirm the reminder draft before it is sent.",
          label: "Open drafts",
          view: "drafts",
        };
      }
    default:
      return null;
  }
}

function getStageApprovalId(stage: WorkflowStage) {
  switch (stage) {
    case "monday_reminder":
      return "approval-monday";
    case "wednesday_draft":
      return "approval-wednesday";
    case "thursday_teacher_release":
      return "approval-thursday";
    default:
      return null;
  }
}

function getVisibleDraftApprovals(
  approvals: ApprovalAction[],
  activeStage: WorkflowStage,
) {
  const focusedApprovalId = getStageApprovalId(activeStage);

  return approvals
    .filter(
      (approval) =>
        isEmailDraft(approval) &&
        approval.status !== "rejected" &&
        (approval.executionStatus !== "completed" || approval.id === focusedApprovalId),
    )
    .sort((left, right) => {
      if (left.id === focusedApprovalId) {
        return -1;
      }

      if (right.id === focusedApprovalId) {
        return 1;
      }

      return 0;
    });
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Card className="brand-panel">
      <CardContent className="space-y-2 py-5">
        <p className="text-[0.68rem] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
          {label}
        </p>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="brand-panel">
      <CardContent className="py-10">
        <div className="rounded-[1.5rem] border border-dashed border-border/80 bg-background/60 p-6 text-center">
          <p className="text-base font-medium">{title}</p>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardView({
  state,
  notice,
  onPrimaryAction,
  onSetActiveStage,
  isMutating,
}: {
  state: DemoState;
  notice: Notice;
  onPrimaryAction: () => void;
  onSetActiveStage: (stage: WorkflowStage) => void;
  isMutating: boolean;
}) {
  const activeStage = getActiveStageEntry(state);
  const nextStage = state.planner.timeline.find((entry) => entry.status === "upcoming");
  const draftsCount = getVisibleDraftApprovals(
    state.approvals,
    state.planner.currentStage,
  ).length;
  const sentCount = state.approvals.filter(isSentEmail).length;
  const cta = getPrimaryCta(state);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card className="brand-panel">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <StatusIndicator status="active" label="Active stage" />
              <StatusIndicator status={activeStage?.status ?? state.planner.currentStage} />
            </div>
            <CardTitle className="text-2xl">{activeStage?.label ?? formatDisplayLabel(state.planner.currentStage)}</CardTitle>
            <CardDescription>
              {nextStage ? `Next: ${nextStage.label} • ${formatDateTime(nextStage.targetTime)}` : "No next stage queued."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {state.planner.timeline.map((entry) => (
                <div
                  key={entry.stage}
                  className={cn(
                    "rounded-[1.35rem] border p-4",
                    entry.status === "active"
                      ? "border-primary/30 bg-primary/10"
                      : "border-border/80 bg-background/70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{entry.label}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {formatDateTime(entry.targetTime)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StatusIndicator status={entry.status} />
                      {entry.status !== "active" ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => onSetActiveStage(entry.stage)}
                          disabled={isMutating}
                          aria-label={`Set ${entry.label} active`}
                        >
                          Set active
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {notice ? (
              <div
                aria-live="polite"
                className={cn(
                  "rounded-[1.25rem] border px-4 py-3 text-sm",
                  notice.tone === "success" &&
                    "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
                  notice.tone === "error" &&
                    "border-rose-400/20 bg-rose-400/10 text-rose-100",
                  notice.tone === "info" &&
                    "border-primary/20 bg-primary/10 text-primary",
                )}
              >
                {notice.message}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="brand-panel">
          <CardHeader>
            <CardTitle>Primary CTA</CardTitle>
            <CardDescription>
              {cta ? cta.detail : "No immediate action."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {cta ? (
              <>
                <div className="rounded-[1.5rem] border border-primary/20 bg-primary/10 p-5">
                  <p className="text-lg font-semibold">{cta.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{cta.detail}</p>
                </div>
                <Button className="w-full justify-between" onClick={onPrimaryAction}>
                  {cta.label}
                  <ArrowRight className="size-4" />
                </Button>
              </>
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border/80 bg-background/60 p-5">
                <p className="font-medium">Nothing blocking the workflow right now.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Available drafts" value={draftsCount} />
        <MetricCard label="Sent emails" value={sentCount} />
        <MetricCard
          label="Last ingest"
          value={
            state.contentWorkspace.lastIngestedAt
              ? format(new Date(state.contentWorkspace.lastIngestedAt), "MMM d")
              : "Never"
          }
        />
      </div>
    </div>
  );
}

function DraftsView({
  approvals,
  activeStage,
  approvalDrafts,
  onDraftChange,
  onSave,
  onApprove,
  onReject,
  onRetry,
  isMutating,
}: {
  approvals: ApprovalAction[];
  activeStage: WorkflowStage;
  approvalDrafts: ApprovalDraftMap;
  onDraftChange: (actionId: string, field: "subject" | "body", value: string) => void;
  onSave: (actionId: string) => void;
  onApprove: (actionId: string) => void;
  onReject: (actionId: string) => void;
  onRetry: (actionId: string) => void;
  isMutating: boolean;
}) {
  const drafts = getVisibleDraftApprovals(approvals, activeStage);
  const focusedApprovalId = getStageApprovalId(activeStage);

  if (!drafts.length) {
    return (
      <EmptyState
        title="No email drafts"
        description="Pending outbound drafts will land here before they are sent."
      />
    );
  }

  return (
    <div className="space-y-4">
      {drafts.map((approval) => {
        const draft = approvalDrafts[approval.id] ?? {
          subject: approval.subject,
          body: approval.body,
        };
        const executionIssue = getApprovalExecutionIssue(approval);
        const isFocusedApproval = approval.id === focusedApprovalId;
        const canReplayCompletedApproval =
          isFocusedApproval && approval.executionStatus === "completed";

        return (
          <Card key={approval.id} className="brand-panel">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <StatusIndicator status={approval.status} />
                <StatusIndicator status={approval.executionStatus} />
                <Badge variant="outline">{formatDisplayLabel(approval.audience)}</Badge>
              </div>
              <CardTitle>{approval.title}</CardTitle>
              <CardDescription>
                Updated {formatDateTime(approval.updatedAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`${approval.id}-subject`}>Subject</Label>
                <Input
                  id={`${approval.id}-subject`}
                  value={draft.subject}
                  onChange={(event) =>
                    onDraftChange(approval.id, "subject", event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${approval.id}-body`}>Body</Label>
                <Textarea
                  id={`${approval.id}-body`}
                  rows={8}
                  value={draft.body}
                  onChange={(event) =>
                    onDraftChange(approval.id, "body", event.target.value)
                  }
                />
              </div>
              {executionIssue ? (
                <div
                  className={cn(
                    "rounded-[1.15rem] border px-4 py-3 text-sm",
                    executionIssue.tone === "failed"
                      ? "border-rose-400/35 bg-rose-500/10 text-rose-100"
                      : "border-amber-400/35 bg-amber-500/10 text-amber-50",
                  )}
                >
                  <p className="font-medium">
                    {executionIssue.tone === "failed"
                      ? "Last send failed"
                      : "Operator follow-up required"}
                  </p>
                  <p className="mt-1 opacity-90">
                    {executionIssue.label}: {executionIssue.message}
                  </p>
                  {executionIssue.externalUrl ? (
                    <div className="mt-3">
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={executionIssue.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {executionIssue.actionLabel}
                          <ArrowRight className="size-4" />
                        </a>
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {canReplayCompletedApproval ? (
                <div className="rounded-[1.15rem] border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary">
                  <p className="font-medium">This stage already ran once.</p>
                  <p className="mt-1 opacity-90">
                    Save any edits, then use Send again to replay this draft while
                    the stage is active.
                  </p>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onSave(approval.id)}
                  disabled={isMutating}
                >
                  Save draft
                </Button>
                {canReplayCompletedApproval ? (
                  <Button
                    type="button"
                    onClick={() => onRetry(approval.id)}
                    disabled={isMutating}
                  >
                    Send again
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => onApprove(approval.id)}
                    disabled={isMutating}
                  >
                    Approve and run
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onReject(approval.id)}
                  disabled={isMutating}
                >
                  Reject
                </Button>
                {["failed", "needs_operator"].includes(approval.executionStatus) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onRetry(approval.id)}
                    disabled={isMutating}
                  >
                    Retry
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function SentEmailsView({ approvals }: { approvals: ApprovalAction[] }) {
  const sentEmails = approvals.filter(isSentEmail);

  if (!sentEmails.length) {
    return (
      <EmptyState
        title="No sent emails"
        description="Completed outbound emails will show up here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {sentEmails.map((approval) => (
        <Card key={approval.id} className="brand-panel">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <StatusIndicator status="completed" label="Sent" />
              <Badge variant="outline">{formatDisplayLabel(approval.audience)}</Badge>
            </div>
            <CardTitle>{approval.subject}</CardTitle>
            <CardDescription>
              {approval.executionStatus === "completed"
                ? formatDateTime(approval.updatedAt)
                : "Not sent"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-[1.4rem] border border-border/80 bg-background/70 p-4 text-sm leading-6 whitespace-pre-wrap">
              {approval.body}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RunbookView({
  state,
  onIngest,
  isMutating,
}: {
  state: DemoState;
  onIngest: () => void;
  isMutating: boolean;
}) {
  const baseline = state.contentWorkspace.baseline;

  return (
    <div className="space-y-4">
      <Card className="brand-panel">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>MTK runbook</CardTitle>
              <CardDescription>
                Inferred from the last newsletter plus this week&apos;s email and message intake.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={onIngest} disabled={isMutating}>
              Refresh inputs
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="brand-panel" size="sm">
          <CardHeader>
            <CardTitle>Last newsletter</CardTitle>
            <CardDescription>
              {baseline ? baseline.sourceLabel : "No baseline detected"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {baseline ? (
              <>
                <div className="rounded-[1.2rem] border border-border/80 bg-background/70 p-4">
                  <p className="font-medium">{baseline.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Retrieved {formatDateTime(baseline.retrievedAt)}
                  </p>
                </div>
                {baseline.sections.map((section) => (
                  <div
                    key={section.id}
                    className="rounded-[1.2rem] border border-border/80 bg-background/60 p-4"
                  >
                    <p className="font-medium">{section.title}</p>
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      {section.items.map((item) => (
                        <p key={item.id}>{item.title}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Add the latest newsletter URL in Settings to seed the runbook.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="brand-panel" size="sm">
          <CardHeader>
            <CardTitle>Signals</CardTitle>
            <CardDescription>
              {state.inbox.gmailThreads.length} email thread
              {state.inbox.gmailThreads.length === 1 ? "" : "s"} and{" "}
              {state.inbox.mockMessages.length} mock message
              {state.inbox.mockMessages.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.inbox.extractedItems.map((item) => (
              <div
                key={item.id}
                className="rounded-[1.2rem] border border-border/80 bg-background/60 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{formatDisplayLabel(item.source)}</Badge>
                  <StatusIndicator status={item.priority} />
                </div>
                <p className="mt-3 font-medium">{item.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="brand-panel" size="sm">
          <CardHeader>
            <CardTitle>Run steps</CardTitle>
            <CardDescription>
              {state.contentWorkspace.runbook.length} step
              {state.contentWorkspace.runbook.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.contentWorkspace.runbook.map((step) => (
              <div
                key={step.id}
                className="rounded-[1.2rem] border border-border/80 bg-background/60 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusIndicator status={step.completionState} />
                  <Badge variant="outline">{formatDisplayLabel(step.action)}</Badge>
                </div>
                <p className="mt-3 font-medium">{step.title}</p>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {step.instructions.map((instruction) => (
                    <p key={instruction}>{instruction}</p>
                  ))}
                </div>
                {step.targetUrl ? (
                  <div className="mt-4">
                    <Button asChild variant="outline" size="sm">
                      <a href={step.targetUrl} target="_blank" rel="noreferrer">
                        {getMembershipToolkitActionLabel(step.action)}
                        <ArrowRight className="size-4" />
                      </a>
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="brand-panel">
        <CardHeader>
          <CardTitle>Proposed changes</CardTitle>
          <CardDescription>
            Structured changes inferred from the current intake.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {state.contentWorkspace.proposedEdits.map((edit) => (
            <div
              key={edit.id}
              className="rounded-[1.2rem] border border-border/80 bg-background/60 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{formatDisplayLabel(edit.kind)}</Badge>
                <StatusIndicator
                  status={edit.manualReview ? "needs_operator" : "completed"}
                  label={edit.manualReview ? "Manual review" : "Ready"}
                />
              </div>
              <p className="mt-3 font-medium">{edit.title}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {edit.proposedValue ?? edit.baselineValue}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MessagesView({
  messages,
  draft,
  setDraft,
  onSubmit,
  isMutating,
}: {
  messages: DemoState["inbox"]["mockMessages"];
  draft: AddMockMessageInput;
  setDraft: React.Dispatch<React.SetStateAction<AddMockMessageInput>>;
  onSubmit: () => void;
  isMutating: boolean;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card className="brand-panel">
        <CardHeader>
          <CardTitle>New mock message</CardTitle>
          <CardDescription>Drop in a test WhatsApp or iMessage update.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mock-source">Source</Label>
            <select
              id="mock-source"
              className="flex h-9 w-full rounded-4xl border border-border bg-input/30 px-3 text-sm outline-none"
              value={draft.source}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  source: event.target.value as AddMockMessageInput["source"],
                }))
              }
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="imessage">iMessage</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mock-sender">Sender</Label>
            <Input
              id="mock-sender"
              value={draft.sender}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  sender: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mock-body">Message</Label>
            <Textarea
              id="mock-body"
              rows={6}
              value={draft.body}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  body: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mock-image-url">Image URL</Label>
            <Input
              id="mock-image-url"
              placeholder="Optional"
              value={draft.imageUrl ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  imageUrl: event.target.value,
                }))
              }
            />
          </div>
          <Button type="button" onClick={onSubmit} disabled={isMutating}>
            Add mock message
          </Button>
        </CardContent>
      </Card>

      <Card className="brand-panel">
        <CardHeader>
          <CardTitle>Mock messages</CardTitle>
          <CardDescription>{messages.length} message{messages.length === 1 ? "" : "s"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className="rounded-[1.2rem] border border-border/80 bg-background/60 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{formatDisplayLabel(message.source)}</Badge>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(message.sentAt)}
                </p>
              </div>
              <p className="mt-3 font-medium">{message.sender}</p>
              <p className="mt-2 text-sm text-muted-foreground">{message.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ContactSection({
  setupDraft,
  newContact,
  newMemberRecipient,
  setNewContact,
  setNewMemberRecipient,
  onUpdateContact,
  onRemoveContact,
  onAddContact,
  onUpdateMemberRecipient,
  onRemoveMemberRecipient,
  onAddMemberRecipient,
}: {
  setupDraft: SetupDraft;
  newContact: { name: string; role: string; email: string };
  newMemberRecipient: { name: string; email: string };
  setNewContact: React.Dispatch<
    React.SetStateAction<{ name: string; role: string; email: string }>
  >;
  setNewMemberRecipient: React.Dispatch<
    React.SetStateAction<{ name: string; email: string }>
  >;
  onUpdateContact: (contactId: string, field: keyof Omit<Contact, "id">, value: string) => void;
  onRemoveContact: (contactId: string) => void;
  onAddContact: () => void;
  onUpdateMemberRecipient: (
    recipientId: string,
    field: keyof Omit<MemberRecipient, "id">,
    value: string,
  ) => void;
  onRemoveMemberRecipient: (recipientId: string) => void;
  onAddMemberRecipient: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card className="brand-panel">
        <CardHeader>
          <CardTitle>Staff and board contacts</CardTitle>
          <CardDescription>
            Used for the Wednesday board review and Thursday teacher release emails.
            Add roles like PTA President, PTA Secretary, Principal, or Teacher Rep,
            then save settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!setupDraft.contacts.length ? (
            <div className="rounded-[1.2rem] border border-dashed border-border/80 bg-background/40 p-4 text-sm text-muted-foreground">
              No board/staff contacts saved yet. The board review email does not use
              the Recipients list below.
            </div>
          ) : null}
          {setupDraft.contacts.map((contact) => (
            <div
              key={contact.id}
              className="grid gap-3 rounded-[1.2rem] border border-border/80 bg-background/60 p-4 md:grid-cols-[1fr_1fr_1.2fr_auto]"
            >
              <Input
                aria-label={`${contact.name} name`}
                value={contact.name}
                onChange={(event) =>
                  onUpdateContact(contact.id, "name", event.target.value)
                }
              />
              <Input
                aria-label={`${contact.name} role`}
                value={contact.role}
                onChange={(event) =>
                  onUpdateContact(contact.id, "role", event.target.value)
                }
              />
              <Input
                aria-label={`${contact.name} email`}
                value={contact.email}
                onChange={(event) =>
                  onUpdateContact(contact.id, "email", event.target.value)
                }
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => onRemoveContact(contact.id)}
              >
                Remove
              </Button>
            </div>
          ))}
          <Separator />
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.2fr_auto]">
            <Input
              placeholder="Name"
              value={newContact.name}
              onChange={(event) =>
                setNewContact((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
            <Input
              placeholder="Role"
              value={newContact.role}
              onChange={(event) =>
                setNewContact((current) => ({
                  ...current,
                  role: event.target.value,
                }))
              }
            />
            <Input
              placeholder="Email"
              value={newContact.email}
              onChange={(event) =>
                setNewContact((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
            <Button type="button" variant="outline" onClick={onAddContact}>
              Add contact
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="brand-panel">
        <CardHeader>
          <CardTitle>Monday reminder recipients</CardTitle>
          <CardDescription>
            Used only for the Monday member reminder email. This list is not used
            for the Wednesday board review email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {setupDraft.memberRecipients.map((recipient) => (
            <div
              key={recipient.id}
              className="grid gap-3 rounded-[1.2rem] border border-border/80 bg-background/60 p-4 md:grid-cols-[1fr_1.2fr_auto]"
            >
              <Input
                aria-label={`${recipient.name} recipient name`}
                value={recipient.name}
                onChange={(event) =>
                  onUpdateMemberRecipient(recipient.id, "name", event.target.value)
                }
              />
              <Input
                aria-label={`${recipient.name} recipient email`}
                value={recipient.email}
                onChange={(event) =>
                  onUpdateMemberRecipient(recipient.id, "email", event.target.value)
                }
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => onRemoveMemberRecipient(recipient.id)}
              >
                Remove
              </Button>
            </div>
          ))}
          <Separator />
          <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_auto]">
            <Input
              placeholder="Name"
              value={newMemberRecipient.name}
              onChange={(event) =>
                setNewMemberRecipient((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
            <Input
              placeholder="Email"
              value={newMemberRecipient.email}
              onChange={(event) =>
                setNewMemberRecipient((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
            <Button type="button" variant="outline" onClick={onAddMemberRecipient}>
              Add recipient
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NewsletterUrlSection({
  artifactDrafts,
  setArtifactDrafts,
  onSave,
  isMutating,
}: {
  artifactDrafts: ArtifactDraftState;
  setArtifactDrafts: React.Dispatch<React.SetStateAction<ArtifactDraftState>>;
  onSave: () => void;
  isMutating: boolean;
}) {
  return (
    <Card className="brand-panel">
      <CardHeader>
        <CardTitle>Last newsletter URL</CardTitle>
        <CardDescription>
          Use the latest sent newsletter as the MTK runbook baseline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="previous-newsletter-url">URL</Label>
          <Input
            id="previous-newsletter-url"
            value={artifactDrafts.previousNewsletterUrl}
            onChange={(event) =>
              setArtifactDrafts((current) => ({
                ...current,
                previousNewsletterUrl: event.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="previous-newsletter-note">Note</Label>
          <Textarea
            id="previous-newsletter-note"
            rows={4}
            value={artifactDrafts.previousNewsletterNote}
            onChange={(event) =>
              setArtifactDrafts((current) => ({
                ...current,
                previousNewsletterNote: event.target.value,
              }))
            }
          />
        </div>
        <Button type="button" onClick={onSave} disabled={isMutating}>
          Save newsletter URL
        </Button>
      </CardContent>
    </Card>
  );
}

function BreaksSection({
  setupDraft,
  newBreak,
  setNewBreak,
  onUpdateBreak,
  onRemoveBreak,
  onAddBreak,
}: {
  setupDraft: SetupDraft;
  newBreak: { name: string; startsOn: string; endsOn: string };
  setNewBreak: React.Dispatch<
    React.SetStateAction<{ name: string; startsOn: string; endsOn: string }>
  >;
  onUpdateBreak: (breakId: string, field: keyof Omit<SchoolBreak, "id">, value: string) => void;
  onRemoveBreak: (breakId: string) => void;
  onAddBreak: () => void;
}) {
  return (
    <Card className="brand-panel">
      <CardHeader>
        <CardTitle>School breaks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {setupDraft.schoolBreaks.map((schoolBreak) => (
          <div
            key={schoolBreak.id}
            className="grid gap-3 rounded-[1.2rem] border border-border/80 bg-background/60 p-4 md:grid-cols-[1.1fr_1fr_1fr_auto]"
          >
            <Input
              value={schoolBreak.name}
              onChange={(event) =>
                onUpdateBreak(schoolBreak.id, "name", event.target.value)
              }
            />
            <Input
              type="date"
              value={schoolBreak.startsOn}
              onChange={(event) =>
                onUpdateBreak(schoolBreak.id, "startsOn", event.target.value)
              }
            />
            <Input
              type="date"
              value={schoolBreak.endsOn}
              onChange={(event) =>
                onUpdateBreak(schoolBreak.id, "endsOn", event.target.value)
              }
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => onRemoveBreak(schoolBreak.id)}
            >
              Remove
            </Button>
          </div>
        ))}
        <Separator />
        <div className="grid gap-3 md:grid-cols-[1.1fr_1fr_1fr_auto]">
          <Input
            placeholder="Break name"
            value={newBreak.name}
            onChange={(event) =>
              setNewBreak((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
          <Input
            type="date"
            value={newBreak.startsOn}
            onChange={(event) =>
              setNewBreak((current) => ({
                ...current,
                startsOn: event.target.value,
              }))
            }
          />
          <Input
            type="date"
            value={newBreak.endsOn}
            onChange={(event) =>
              setNewBreak((current) => ({
                ...current,
                endsOn: event.target.value,
              }))
            }
          />
          <Button type="button" variant="outline" onClick={onAddBreak}>
            Add break
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountSection({
  authEnabled,
  gmailConnectUrl,
  tokenVaultConfigured,
  user,
  authStatus,
  authStatusError,
  isRefreshingAuthStatus,
  setupDraft,
  setSetupDraft,
  onRefreshAuthStatus,
}: {
  authEnabled: boolean;
  gmailConnectUrl: string;
  tokenVaultConfigured: boolean;
  user?: Viewer | null;
  authStatus: AuthStatusResponse | null;
  authStatusError: string | null;
  isRefreshingAuthStatus: boolean;
  setupDraft: SetupDraft;
  setSetupDraft: React.Dispatch<React.SetStateAction<SetupDraft>>;
  onRefreshAuthStatus: () => void;
}) {
  const effectiveTokenVaultConfigured =
    authStatus?.tokenVault.configured ?? tokenVaultConfigured;
  const gmailStatus = authStatus?.gmail.liveReady
    ? "connected"
    : authStatus?.gmail.connected
      ? "pending"
      : authEnabled
        ? "needs_setup"
        : "pending";

  return (
    <div className="space-y-4">
      <Card className="brand-panel">
        <CardHeader>
          <CardTitle>Login and delivery status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <StatusIndicator
              status={user?.email ? "connected" : authEnabled ? "pending" : "completed"}
              label={authEnabled ? "Auth0" : "Demo mode"}
            />
            <StatusIndicator status={gmailStatus} label="Gmail" />
            <StatusIndicator
              status={effectiveTokenVaultConfigured ? "connected" : "pending"}
              label="Token Vault"
            />
          </div>
          <div className="rounded-[1.2rem] border border-border/80 bg-background/60 p-4">
            <p className="font-medium">{user?.email ?? "No active login"}</p>
            {authStatusError ? (
              <p className="mt-2 text-sm text-rose-200">{authStatusError}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {authEnabled && !user?.email ? (
              <Button asChild>
                <a href="/auth/login?returnTo=/">
                  <SignIn className="size-4" />
                  Log in
                </a>
              </Button>
            ) : null}
            {authEnabled && user?.email ? (
              <Button asChild variant="secondary">
                <a href="/auth/logout">
                  <SignOut className="size-4" />
                  Log out
                </a>
              </Button>
            ) : null}
            {authEnabled && user?.email && !authStatus?.gmail.liveReady ? (
              <Button asChild variant="outline">
                <a href={gmailConnectUrl}>Connect Gmail</a>
              </Button>
            ) : null}
            {authEnabled ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onRefreshAuthStatus}
                disabled={isRefreshingAuthStatus}
              >
                <ArrowClockwise className="size-4" />
                Refresh status
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="brand-panel">
        <CardHeader>
          <CardTitle>Operational account email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="auth0-account-email">Account email</Label>
          <Input
            id="auth0-account-email"
            value={setupDraft.auth0AccountEmail}
            onChange={(event) =>
              setSetupDraft((current) => ({
                ...current,
                auth0AccountEmail: event.target.value,
              }))
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function AuditSection({ state }: { state: DemoState }) {
  return (
    <Card className="brand-panel">
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.auditLog.map((entry) => (
          <div
            key={entry.id}
            className="rounded-[1.2rem] border border-border/80 bg-background/60 p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{formatDisplayLabel(entry.integration)}</Badge>
              <Badge variant="secondary">{formatDisplayLabel(entry.kind)}</Badge>
            </div>
            <p className="mt-3 font-medium">{entry.summary}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatDateTime(entry.timestamp)}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SettingsView({
  state,
  activeSection,
  setActiveSection,
  setupDraft,
  setSetupDraft,
  artifactDrafts,
  setArtifactDrafts,
  authEnabled,
  gmailConnectUrl,
  tokenVaultConfigured,
  user,
  authStatus,
  authStatusError,
  isRefreshingAuthStatus,
  newContact,
  setNewContact,
  newMemberRecipient,
  setNewMemberRecipient,
  newBreak,
  setNewBreak,
  onUpdateContact,
  onRemoveContact,
  onAddContact,
  onUpdateMemberRecipient,
  onRemoveMemberRecipient,
  onAddMemberRecipient,
  onUpdateBreak,
  onRemoveBreak,
  onAddBreak,
  onRefreshAuthStatus,
  onSaveSetup,
  onSaveNewsletterUrl,
  hasUnsavedSetupChanges,
  isMutating,
}: {
  state: DemoState;
  activeSection: SettingsSectionKey;
  setActiveSection: React.Dispatch<React.SetStateAction<SettingsSectionKey>>;
  setupDraft: SetupDraft;
  setSetupDraft: React.Dispatch<React.SetStateAction<SetupDraft>>;
  artifactDrafts: ArtifactDraftState;
  setArtifactDrafts: React.Dispatch<React.SetStateAction<ArtifactDraftState>>;
  authEnabled: boolean;
  gmailConnectUrl: string;
  tokenVaultConfigured: boolean;
  user?: Viewer | null;
  authStatus: AuthStatusResponse | null;
  authStatusError: string | null;
  isRefreshingAuthStatus: boolean;
  newContact: { name: string; role: string; email: string };
  setNewContact: React.Dispatch<
    React.SetStateAction<{ name: string; role: string; email: string }>
  >;
  newMemberRecipient: { name: string; email: string };
  setNewMemberRecipient: React.Dispatch<
    React.SetStateAction<{ name: string; email: string }>
  >;
  newBreak: { name: string; startsOn: string; endsOn: string };
  setNewBreak: React.Dispatch<
    React.SetStateAction<{ name: string; startsOn: string; endsOn: string }>
  >;
  onUpdateContact: (contactId: string, field: keyof Omit<Contact, "id">, value: string) => void;
  onRemoveContact: (contactId: string) => void;
  onAddContact: () => void;
  onUpdateMemberRecipient: (
    recipientId: string,
    field: keyof Omit<MemberRecipient, "id">,
    value: string,
  ) => void;
  onRemoveMemberRecipient: (recipientId: string) => void;
  onAddMemberRecipient: () => void;
  onUpdateBreak: (breakId: string, field: keyof Omit<SchoolBreak, "id">, value: string) => void;
  onRemoveBreak: (breakId: string) => void;
  onAddBreak: () => void;
  onRefreshAuthStatus: () => void;
  onSaveSetup: () => void;
  onSaveNewsletterUrl: () => void;
  hasUnsavedSetupChanges: boolean;
  isMutating: boolean;
}) {
  let sectionContent: React.ReactNode;

  if (activeSection === "contacts") {
    sectionContent = (
      <ContactSection
        setupDraft={setupDraft}
        newContact={newContact}
        newMemberRecipient={newMemberRecipient}
        setNewContact={setNewContact}
        setNewMemberRecipient={setNewMemberRecipient}
        onUpdateContact={onUpdateContact}
        onRemoveContact={onRemoveContact}
        onAddContact={onAddContact}
        onUpdateMemberRecipient={onUpdateMemberRecipient}
        onRemoveMemberRecipient={onRemoveMemberRecipient}
        onAddMemberRecipient={onAddMemberRecipient}
      />
    );
  } else if (activeSection === "newsletterUrl") {
    sectionContent = (
      <NewsletterUrlSection
        artifactDrafts={artifactDrafts}
        setArtifactDrafts={setArtifactDrafts}
        onSave={onSaveNewsletterUrl}
        isMutating={isMutating}
      />
    );
  } else if (activeSection === "breaks") {
    sectionContent = (
      <BreaksSection
        setupDraft={setupDraft}
        newBreak={newBreak}
        setNewBreak={setNewBreak}
        onUpdateBreak={onUpdateBreak}
        onRemoveBreak={onRemoveBreak}
        onAddBreak={onAddBreak}
      />
    );
  } else if (activeSection === "account") {
    sectionContent = (
      <AccountSection
        authEnabled={authEnabled}
        gmailConnectUrl={gmailConnectUrl}
        tokenVaultConfigured={tokenVaultConfigured}
        user={user}
        authStatus={authStatus}
        authStatusError={authStatusError}
        isRefreshingAuthStatus={isRefreshingAuthStatus}
        setupDraft={setupDraft}
        setSetupDraft={setSetupDraft}
        onRefreshAuthStatus={onRefreshAuthStatus}
      />
    );
  } else {
    sectionContent = <AuditSection state={state} />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
      <Card className="brand-panel h-fit">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Contacts, newsletter source, breaks, account, and audit history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {settingsSections.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveSection(key)}
              className={cn(
                "flex w-full items-center justify-between rounded-[1.1rem] border px-4 py-3 text-left transition",
                activeSection === key
                  ? "border-primary/25 bg-primary/10"
                  : "border-border/70 bg-background/50 hover:bg-muted/40",
              )}
            >
              <span className="flex items-center gap-3">
                <Icon className="size-4" />
                <span className="text-sm font-medium">{label}</span>
              </span>
            </button>
          ))}
          <Separator className="my-3" />
          <Button
            type="button"
            className="w-full"
            onClick={onSaveSetup}
            disabled={!hasUnsavedSetupChanges || isMutating}
          >
            Save settings
          </Button>
        </CardContent>
      </Card>

      <div>{sectionContent}</div>
    </div>
  );
}

export function DashboardShell({
  authEnabled,
  gmailConnectUrl,
  tokenVaultConfigured,
  user,
}: {
  authEnabled: boolean;
  gmailConnectUrl: string;
  tokenVaultConfigured: boolean;
  user?: Viewer | null;
}) {
  const [activeView, setActiveView] = useState<MenuKey>("dashboard");
  const [settingsSection, setSettingsSection] =
    useState<SettingsSectionKey>("contacts");
  const [snapshot, setSnapshot] = useState<DemoState>(seedDemoState);
  const [setupDraft, setSetupDraft] = useState<SetupDraft>(
    createSetupDraft(seedDemoState),
  );
  const [approvalDrafts, setApprovalDrafts] = useState<ApprovalDraftMap>(
    createApprovalDrafts(seedDemoState.approvals),
  );
  const [artifactDrafts, setArtifactDrafts] = useState<ArtifactDraftState>(
    createArtifactDrafts(seedDemoState),
  );
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [authStatusError, setAuthStatusError] = useState<string | null>(null);
  const [isRefreshingAuthStatus, setIsRefreshingAuthStatus] = useState(false);
  const [notice, setNotice] = useState<Notice>({
    tone: "info",
    message: "Loading the backend snapshot. Seeded data will be used if the API is offline.",
  });
  const [isMutating, setIsMutating] = useState(false);
  const [newContact, setNewContact] = useState({
    name: "",
    role: "",
    email: "",
  });
  const [newMemberRecipient, setNewMemberRecipient] = useState({
    name: "",
    email: "",
  });
  const [newBreak, setNewBreak] = useState({
    name: "",
    startsOn: "",
    endsOn: "",
  });
  const [mockMessageDraft, setMockMessageDraft] = useState<AddMockMessageInput>({
    source: "whatsapp",
    sender: "Demo sender",
    body: "",
    imageUrl: "",
  });

  const refreshSnapshot = useCallback(async () => {
    try {
      const nextState = await fetchJson<DemoState>(
        withUserQuery("/api/bootstrap", user?.sub),
      );
      startTransition(() => {
        setSnapshot(nextState);
      });
      setNotice({
        tone: "success",
        message: "Loaded live data from the local PTA Pilot API.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setNotice({
        tone: "error",
        message: `Backend unavailable, showing seeded mock data instead. ${message}`,
      });
    }
  }, [user?.sub]);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  useEffect(() => {
    setSetupDraft(createSetupDraft(snapshot));
    setApprovalDrafts(createApprovalDrafts(snapshot.approvals));
    setArtifactDrafts(createArtifactDrafts(snapshot));
  }, [snapshot]);

  const refreshAuthStatus = useCallback(async () => {
    if (!authEnabled) {
      setIsRefreshingAuthStatus(false);
      setAuthStatus(null);
      setAuthStatusError(null);
      return;
    }

    try {
      setIsRefreshingAuthStatus(true);
      const nextStatus = await fetchJson<AuthStatusResponse>(
        withUserQuery("/api/auth/status", user?.sub),
      );
      setAuthStatus(nextStatus);
      setAuthStatusError(null);
    } catch (error) {
      setAuthStatus(null);
      setAuthStatusError(
        error instanceof Error
          ? error.message
          : "Unable to load auth status from the local API.",
      );
    } finally {
      setIsRefreshingAuthStatus(false);
    }
  }, [authEnabled, user?.sub]);

  useEffect(() => {
    void refreshAuthStatus();
  }, [refreshAuthStatus]);

  const hasUnsavedSetupChanges =
    JSON.stringify(createSetupPayload(setupDraft)) !==
    JSON.stringify(createSetupPayload(createSetupDraft(snapshot)));

  async function runMutation(
    label: string,
    action: () => Promise<DemoState>,
    successMessage: string,
  ) {
    try {
      setIsMutating(true);
      setNotice({ tone: "info", message: label });
      const nextState = await action();
      startTransition(() => {
        setSnapshot(nextState);
      });
      setNotice({
        tone: "success",
        message: successMessage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setNotice({
        tone: "error",
        message: `${label} failed. ${message}`,
      });
    } finally {
      setIsMutating(false);
    }
  }

  async function saveSetupDraft() {
    await runMutation(
      "Saving settings",
      () =>
        fetchJson<DemoState>("/api/setup", {
          method: "POST",
          body: JSON.stringify(createSetupPayload(setupDraft)),
        }),
      "Settings saved.",
    );
  }

  async function ingestUpdates() {
    await runMutation(
      "Ingesting email and message updates",
      () =>
        fetchJson<DemoState>(withUserQuery("/api/inbox/ingest", user?.sub), {
          method: "POST",
        }),
      "Inbox updates were ingested and the runbook was refreshed.",
    );
  }

  async function savePlannerStage(stage: WorkflowStage) {
    const nextPlanner = setPlannerCurrentStage(snapshot.planner, stage);

    await runMutation(
      `Setting ${formatDisplayLabel(stage)} active`,
      () =>
        fetchJson<DemoState>("/api/setup", {
          method: "POST",
          body: JSON.stringify({
            planner: {
              currentStage: nextPlanner.currentStage,
              timeline: nextPlanner.timeline,
            },
          }),
        }),
      `${formatDisplayLabel(stage)} is now the active stage.`,
    );
  }

  async function savePreviousNewsletterLink() {
    const formData = new FormData();
    formData.append("type", "previous_newsletter_link");
    formData.append("originalUrl", artifactDrafts.previousNewsletterUrl);

    if (artifactDrafts.previousNewsletterNote.trim()) {
      formData.append("note", artifactDrafts.previousNewsletterNote.trim());
    }

    await runMutation(
      "Saving newsletter URL",
      () =>
        fetchJson<DemoState>("/api/inbox/artifacts", {
          method: "POST",
          body: formData,
        }),
      "Newsletter URL saved.",
    );
  }

  async function submitMockMessage() {
    await runMutation(
      "Adding a mock message",
      () =>
        fetchJson<DemoState>("/api/inbox/mock-messages", {
          method: "POST",
          body: JSON.stringify({
            ...mockMessageDraft,
            imageUrl: mockMessageDraft.imageUrl || undefined,
          }),
        }),
      "Mock message added.",
    );

    setMockMessageDraft((current) => ({
      source: current.source,
      sender: "Demo sender",
      body: "",
      imageUrl: "",
    }));
  }

  async function saveApproval(actionId: string) {
    const draft = approvalDrafts[actionId];

    if (!draft) {
      return;
    }

    await runMutation(
      "Saving email draft",
      () =>
        fetchJson<DemoState>(
          withUserQuery(`/api/actions/${actionId}/edit`, user?.sub),
          {
            method: "POST",
            body: JSON.stringify(draft),
          },
        ),
      "Email draft saved.",
    );
  }

  async function approveAction(actionId: string) {
    await runMutation(
      "Approving action",
      () =>
        fetchJson<DemoState>(
          withUserQuery(`/api/actions/${actionId}/approve`, user?.sub),
          {
            method: "POST",
          },
        ),
      "Action approved.",
    );
  }

  async function rejectAction(actionId: string) {
    await runMutation(
      "Rejecting action",
      () =>
        fetchJson<DemoState>(`/api/actions/${actionId}/reject`, {
          method: "POST",
        }),
      "Action rejected.",
    );
  }

  async function retryActionExecution(actionId: string) {
    await runMutation(
      "Retrying action",
      () =>
        fetchJson<DemoState>(
          withUserQuery(`/api/actions/${actionId}/retry`, user?.sub),
          {
            method: "POST",
          },
        ),
      "Retry requested.",
    );
  }

  function handlePrimaryAction() {
    const cta = getPrimaryCta(snapshot);

    if (!cta) {
      return;
    }

    if (cta.type === "ingest") {
      void ingestUpdates();
      return;
    }

    setActiveView(cta.view);
  }

  function updateContactField(
    contactId: string,
    field: keyof Omit<Contact, "id">,
    value: string,
  ) {
    setSetupDraft((current) => ({
      ...current,
      contacts: current.contacts.map((contact) =>
        contact.id === contactId
          ? {
              ...contact,
              [field]: value,
            }
          : contact,
      ),
    }));
  }

  function removeContact(contactId: string) {
    setSetupDraft((current) => ({
      ...current,
      contacts: current.contacts.filter((contact) => contact.id !== contactId),
    }));
  }

  function addContactToDraft() {
    if (!newContact.name || !newContact.role || !newContact.email) {
      return;
    }

    setSetupDraft((current) => ({
      ...current,
      contacts: [
        ...current.contacts,
        {
          id: `contact-${crypto.randomUUID()}`,
          ...newContact,
        },
      ],
    }));
    setNewContact({ name: "", role: "", email: "" });
  }

  function updateMemberRecipientField(
    recipientId: string,
    field: keyof Omit<MemberRecipient, "id">,
    value: string,
  ) {
    setSetupDraft((current) => ({
      ...current,
      memberRecipients: current.memberRecipients.map((recipient) =>
        recipient.id === recipientId
          ? {
              ...recipient,
              [field]: value,
            }
          : recipient,
      ),
    }));
  }

  function removeMemberRecipient(recipientId: string) {
    setSetupDraft((current) => ({
      ...current,
      memberRecipients: current.memberRecipients.filter(
        (recipient) => recipient.id !== recipientId,
      ),
    }));
  }

  function addMemberRecipientToDraft() {
    if (!newMemberRecipient.name || !newMemberRecipient.email) {
      return;
    }

    setSetupDraft((current) => ({
      ...current,
      memberRecipients: [
        ...current.memberRecipients,
        {
          id: `member-${crypto.randomUUID()}`,
          ...newMemberRecipient,
        },
      ],
    }));
    setNewMemberRecipient({ name: "", email: "" });
  }

  function updateBreakField(
    breakId: string,
    field: keyof Omit<SchoolBreak, "id">,
    value: string,
  ) {
    setSetupDraft((current) => ({
      ...current,
      schoolBreaks: current.schoolBreaks.map((schoolBreak) =>
        schoolBreak.id === breakId
          ? {
              ...schoolBreak,
              [field]: value,
            }
          : schoolBreak,
      ),
    }));
  }

  function removeBreak(breakId: string) {
    setSetupDraft((current) => ({
      ...current,
      schoolBreaks: current.schoolBreaks.filter(
        (schoolBreak) => schoolBreak.id !== breakId,
      ),
    }));
  }

  function addBreakToDraft() {
    if (!newBreak.name || !newBreak.startsOn || !newBreak.endsOn) {
      return;
    }

    setSetupDraft((current) => ({
      ...current,
      schoolBreaks: [
        ...current.schoolBreaks,
        {
          id: `break-${crypto.randomUUID()}`,
          ...newBreak,
        },
      ],
    }));
    setNewBreak({ name: "", startsOn: "", endsOn: "" });
  }

  const draftCount = getVisibleDraftApprovals(
    snapshot.approvals,
    snapshot.planner.currentStage,
  ).length;
  const sentCount = snapshot.approvals.filter(isSentEmail).length;
  const messageCount = snapshot.inbox.mockMessages.length;

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_16%_12%,rgba(45,200,255,0.18),transparent_32%),radial-gradient(circle_at_84%_8%,rgba(73,112,255,0.2),transparent_28%)]" />
      <div className="relative mx-auto grid max-w-[1600px] gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-4 xl:self-start">
          <Card className="brand-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <BrandLogo className="size-14 p-1.5" />
                <div className="space-y-1">
                  <span className="block text-xl font-semibold tracking-tight">
                    PTA Pilot
                  </span>
                  <span className="block text-[0.68rem] font-semibold tracking-[0.32em] text-primary/80 uppercase">
                    Weekly comms
                  </span>
                </div>
              </CardTitle>
              <CardDescription>{snapshot.workspaceTitle}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {menuDefinitions.map(({ key, label, icon: Icon }) => {
                const count =
                  key === "drafts"
                    ? draftCount
                    : key === "sent"
                      ? sentCount
                      : key === "messages"
                        ? messageCount
                        : null;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveView(key)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-[1.15rem] border px-4 py-3 text-left transition",
                      activeView === key
                        ? "border-primary/25 bg-primary/10"
                        : "border-border/70 bg-background/50 hover:bg-muted/40",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="size-4" />
                      <span className="text-sm font-medium">{label}</span>
                    </span>
                    {typeof count === "number" && count > 0 ? (
                      <span className="text-xs font-semibold text-muted-foreground">
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-4">
          <Card className="brand-panel">
            <CardContent className="flex flex-col gap-4 py-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusIndicator
                    status="active"
                    label={getActiveStageEntry(snapshot)?.label ?? "Active stage"}
                  />
                  <Badge variant="outline">
                    {snapshot.contentWorkspace.lastIngestedAt
                      ? `Last ingest ${formatDateTime(snapshot.contentWorkspace.lastIngestedAt)}`
                      : "No ingest yet"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Keep the main surface focused on the current stage, the next action, and the operational views.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void refreshSnapshot()}
                  disabled={isMutating || isRefreshingAuthStatus}
                >
                  <ArrowClockwise className="size-4" />
                  Refresh
                </Button>
                {authEnabled && !user?.email ? (
                  <Button asChild>
                    <a href="/auth/login?returnTo=/">Log in</a>
                  </Button>
                ) : null}
                {authEnabled && user?.email ? (
                  <Button asChild variant="secondary">
                    <a href="/auth/logout">Log out</a>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {activeView === "dashboard" ? (
            <DashboardView
              state={snapshot}
              notice={notice}
              onPrimaryAction={handlePrimaryAction}
              onSetActiveStage={(stage) => void savePlannerStage(stage)}
              isMutating={isMutating}
            />
          ) : null}

          {activeView === "drafts" ? (
            <DraftsView
              approvals={snapshot.approvals}
              activeStage={snapshot.planner.currentStage}
              approvalDrafts={approvalDrafts}
              onDraftChange={(actionId, field, value) =>
                setApprovalDrafts((current) => ({
                  ...current,
                  [actionId]: {
                    ...(current[actionId] ?? {
                      subject: "",
                      body: "",
                    }),
                    [field]: value,
                  },
                }))
              }
              onSave={(actionId) => void saveApproval(actionId)}
              onApprove={(actionId) => void approveAction(actionId)}
              onReject={(actionId) => void rejectAction(actionId)}
              onRetry={(actionId) => void retryActionExecution(actionId)}
              isMutating={isMutating}
            />
          ) : null}

          {activeView === "sent" ? (
            <SentEmailsView approvals={snapshot.approvals} />
          ) : null}

          {activeView === "runbook" ? (
            <RunbookView
              state={snapshot}
              onIngest={() => void ingestUpdates()}
              isMutating={isMutating}
            />
          ) : null}

          {activeView === "messages" ? (
            <MessagesView
              messages={snapshot.inbox.mockMessages}
              draft={mockMessageDraft}
              setDraft={setMockMessageDraft}
              onSubmit={() => void submitMockMessage()}
              isMutating={isMutating}
            />
          ) : null}

          {activeView === "settings" ? (
            <SettingsView
              state={snapshot}
              activeSection={settingsSection}
              setActiveSection={setSettingsSection}
              setupDraft={setupDraft}
              setSetupDraft={setSetupDraft}
              artifactDrafts={artifactDrafts}
              setArtifactDrafts={setArtifactDrafts}
              authEnabled={authEnabled}
              gmailConnectUrl={gmailConnectUrl}
              tokenVaultConfigured={tokenVaultConfigured}
              user={user}
              authStatus={authStatus}
              authStatusError={authStatusError}
              isRefreshingAuthStatus={isRefreshingAuthStatus}
              newContact={newContact}
              setNewContact={setNewContact}
              newMemberRecipient={newMemberRecipient}
              setNewMemberRecipient={setNewMemberRecipient}
              newBreak={newBreak}
              setNewBreak={setNewBreak}
              onUpdateContact={updateContactField}
              onRemoveContact={removeContact}
              onAddContact={addContactToDraft}
              onUpdateMemberRecipient={updateMemberRecipientField}
              onRemoveMemberRecipient={removeMemberRecipient}
              onAddMemberRecipient={addMemberRecipientToDraft}
              onUpdateBreak={updateBreakField}
              onRemoveBreak={removeBreak}
              onAddBreak={addBreakToDraft}
              onRefreshAuthStatus={() => void refreshAuthStatus()}
              onSaveSetup={() => void saveSetupDraft()}
              onSaveNewsletterUrl={() => void savePreviousNewsletterLink()}
              hasUnsavedSetupChanges={hasUnsavedSetupChanges}
              isMutating={isMutating}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
