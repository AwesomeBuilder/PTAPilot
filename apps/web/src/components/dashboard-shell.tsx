/* eslint-disable @next/next/no-img-element */
"use client";

import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
  type Dispatch,
  type SetStateAction,
} from "react";
import { format } from "date-fns";
import {
  ArrowRight,
  ArrowClockwise,
  CalendarDots,
  ChatsCircle,
  CheckCircle,
  ClockCountdown,
  EnvelopeSimple,
  GearSix,
  LinkSimple,
  ListChecks,
  NotePencil,
  ShieldCheck,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import type {
  AddMockMessageInput,
  ApprovalAction,
  ApprovalEditInput,
  ApprovalExecutionStatus,
  ApprovalExecutionStep,
  ApprovalStepManualCompleteInput,
  AudienceVersion,
  Contact,
  DemoState,
  ExtractedContentItem,
  IntegrationConfig,
  IntegrationMode,
  IntegrationStatus,
  MemberRecipient,
  NewsletterDraft,
  NewsletterItem,
  NewsletterSection,
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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/api";
import { cn } from "@/lib/utils";

type ViewKey = "setup" | "inbox" | "newsletter" | "actions" | "audit";

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

type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "destructive"
  | "ghost"
  | "link"
  | null
  | undefined;

type ApprovalDraftMap = Record<string, ApprovalEditInput>;

type EditableAudience = Extract<AudienceVersion, "board" | "teachers">;

type NewsletterDraftMap = Record<EditableAudience, NewsletterDraft>;

type ManualStepDraft = ApprovalStepManualCompleteInput & {
  directUrl?: string;
  externalId?: string;
  scheduledFor?: string;
};

type ManualStepDraftMap = Record<string, ManualStepDraft>;

type ArtifactDraftState = {
  previousNewsletterUrl: string;
  previousNewsletterNote: string;
  calendarLabel: string;
  calendarNote: string;
  calendarFile: File | null;
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

type SetupDraft = {
  auth0AccountEmail: string;
  contacts: Contact[];
  memberRecipients: MemberRecipient[];
  schoolBreaks: SchoolBreak[];
  integrations: DemoState["setup"]["integrations"];
  planner: NonNullable<SetupUpdateInput["planner"]>;
};

const viewDefinitions: Array<{
  key: ViewKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { key: "setup", label: "Setup", icon: GearSix },
  { key: "inbox", label: "Inbox", icon: ChatsCircle },
  { key: "newsletter", label: "Newsletter Editor", icon: NotePencil },
  { key: "actions", label: "Actions Review", icon: ListChecks },
  { key: "audit", label: "Audit Log", icon: ShieldCheck },
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
        "rounded-[1.4rem] border border-white/10 bg-[#02060d] object-cover shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_20px_48px_rgba(45,200,255,0.16)]",
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
    integrations: structuredClone(state.setup.integrations),
    planner: {
      currentStage: state.planner.currentStage,
      timeline: structuredClone(state.planner.timeline),
    },
  };
}

function createApprovalDrafts(approvals: ApprovalAction[]) {
  return Object.fromEntries(
    approvals.map((approval) => [
      approval.id,
      {
        subject: approval.subject,
        body: approval.body,
      } satisfies ApprovalEditInput,
    ]),
  ) as ApprovalDraftMap;
}

function createNewsletterDrafts(state: DemoState): NewsletterDraftMap {
  return {
    board: structuredClone(state.newsletters.board),
    teachers: structuredClone(state.newsletters.teachers),
  };
}

function stepDraftKey(actionId: string, stepId: string) {
  return `${actionId}:${stepId}`;
}

function getApprovalSteps(
  approval: Pick<ApprovalAction, "steps"> | { steps?: ApprovalExecutionStep[] },
) {
  return Array.isArray(approval.steps) ? approval.steps : [];
}

function deriveApprovalExecutionStatus(
  approval:
    | Pick<ApprovalAction, "executionStatus" | "steps">
    | {
        executionStatus?: ApprovalExecutionStatus;
        steps?: ApprovalExecutionStep[];
      },
): ApprovalExecutionStatus {
  if (approval.executionStatus) {
    return approval.executionStatus;
  }

  const steps = getApprovalSteps(approval);

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

function createManualStepDrafts(approvals: ApprovalAction[]) {
  return Object.fromEntries(
    approvals.flatMap((approval) =>
      getApprovalSteps(approval).map((step) => [
        stepDraftKey(approval.id, step.id),
        {
          note: step.note ?? "",
          directUrl: step.outputs?.directUrl ?? "",
          externalId: step.outputs?.externalId ?? "",
          scheduledFor: step.outputs?.scheduledFor ?? "",
        } satisfies ManualStepDraft,
      ]),
    ),
  ) as ManualStepDraftMap;
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
    calendarLabel: "Calendar screenshot",
    calendarNote: "",
    calendarFile: null,
  };
}

const DISPLAY_VALUE_LABELS: Record<string, string> = {
  ai: "AI",
  auth0: "Auth0",
  gmail: "Gmail",
  imessage: "iMessage",
  identityprovider: "Identity Provider",
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

function formatDateTimeInput(value: string | undefined) {
  if (!value) {
    return "";
  }

  return format(new Date(value), "yyyy-MM-dd'T'HH:mm");
}

function toIsoDateTime(value: string) {
  return value ? new Date(value).toISOString() : "";
}

function getViewForStage(stage: WorkflowStage): ViewKey {
  if (stage === "collect_updates") {
    return "inbox";
  }

  if (stage === "wednesday_draft") {
    return "newsletter";
  }

  return "actions";
}

function getStageActionCopy(stage: WorkflowStage) {
  if (stage === "collect_updates") {
    return {
      title: "Collect this week’s updates",
      description:
        "Pull in family replies and staff messages before drafting the next newsletter.",
      buttonLabel: "Open inbox",
    };
  }

  if (stage === "wednesday_draft") {
    return {
      title: "Shape the board review draft",
      description:
        "Refine the newsletter structure and confirm the Wednesday board version is ready.",
      buttonLabel: "Open newsletter editor",
    };
  }

  if (stage === "thursday_teacher_release") {
    return {
      title: "Review the teacher release",
      description:
        "Check the approval copy and timing before the teacher-facing version goes out.",
      buttonLabel: "Review actions",
    };
  }

  if (stage === "sunday_parent_schedule") {
    return {
      title: "Confirm the parent send plan",
      description:
        "Verify the parent newsletter schedule and break logic before Sunday automation runs.",
      buttonLabel: "Review actions",
    };
  }

  return {
    title: "Confirm the Monday reminder",
    description:
      "Review the reminder content and make sure the workflow starts the week in the right stage.",
    buttonLabel: "Review actions",
  };
}

function createSetupPayload(setupDraft: SetupDraft): SetupUpdateInput {
  return {
    auth0AccountEmail: setupDraft.auth0AccountEmail.trim(),
    contacts: setupDraft.contacts,
    memberRecipients: setupDraft.memberRecipients,
    schoolBreaks: setupDraft.schoolBreaks,
    integrations: setupDraft.integrations,
    planner: setupDraft.planner,
  };
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
        "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[0.64rem] font-semibold tracking-[0.18em] whitespace-nowrap uppercase",
        tone.container,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", tone.dot)} />
      <span>{label ?? formatDisplayLabel(normalizedStatus)}</span>
    </span>
  );
}

function FlyerPreviewMedia({
  title,
  imageUrl,
}: {
  title: string;
  imageUrl?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!imageUrl || imageFailed) {
    return (
      <div className="flex h-44 w-full items-center justify-center bg-[linear-gradient(135deg,rgba(45,200,255,0.18),rgba(11,21,36,0.86)_40%,rgba(6,14,24,0.98)_100%)] px-6">
        <div className="w-full max-w-sm rounded-[1.5rem] border border-white/10 bg-black/20 p-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <p className="text-[0.68rem] font-semibold tracking-[0.24em] text-primary/80 uppercase">
            Preview unavailable
          </p>
          <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            The recommendation is still available even when the remote preview
            image fails to load.
          </p>
        </div>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={title}
      className="h-44 w-full object-cover"
      referrerPolicy="no-referrer"
      onError={() => setImageFailed(true)}
    />
  );
}

function withUserQuery(path: string, userId?: string | null) {
  if (!userId) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}userId=${encodeURIComponent(userId)}`;
}

function getSuggestionKey(item: Pick<ExtractedContentItem, "title" | "summary">) {
  return `${item.title}::${item.summary}`;
}

function getAuth0IntegrationDisplayStatus(
  integration: IntegrationConfig,
  authEnabled: boolean,
  user?: Viewer | null,
): IntegrationStatus {
  if (user?.email) {
    return "connected";
  }

  if (authEnabled) {
    return "pending";
  }

  return integration.status;
}

function getGmailIntegrationDisplayStatus(
  integration: IntegrationConfig,
  authStatus: AuthStatusResponse | null,
  user?: Viewer | null,
): IntegrationStatus {
  if (!authStatus) {
    return user?.email ? "pending" : integration.status;
  }

  if (authStatus.gmail.liveReady || authStatus.gmail.connected) {
    return "connected";
  }

  if (
    authStatus.gmail.connected ||
    authStatus.tokenVault.configured ||
    authStatus.managementApi.configured ||
    user?.email
  ) {
    return "pending";
  }

  return "needs_setup";
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
  const [activeView, setActiveView] = useState<ViewKey>("setup");
  const [snapshot, setSnapshot] = useState<DemoState>(seedDemoState);
  const [setupDraft, setSetupDraft] = useState<SetupDraft>(
    createSetupDraft(seedDemoState),
  );
  const [newsletterDrafts, setNewsletterDrafts] = useState<NewsletterDraftMap>(
    createNewsletterDrafts(seedDemoState),
  );
  const [approvalDrafts, setApprovalDrafts] = useState<ApprovalDraftMap>(
    createApprovalDrafts(seedDemoState.approvals),
  );
  const [manualStepDrafts, setManualStepDrafts] = useState<ManualStepDraftMap>(
    createManualStepDrafts(seedDemoState.approvals),
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
  const mainRef = useRef<HTMLElement | null>(null);
  const [mockMessageDraft, setMockMessageDraft] = useState<AddMockMessageInput>({
    source: "whatsapp",
    sender: "Demo sender",
    body: "",
    imageUrl: "",
  });
  const [artifactDrafts, setArtifactDrafts] = useState<ArtifactDraftState>(
    createArtifactDrafts(seedDemoState),
  );

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
    setNewsletterDrafts(createNewsletterDrafts(snapshot));
    setApprovalDrafts(createApprovalDrafts(snapshot.approvals));
    setManualStepDrafts(createManualStepDrafts(snapshot.approvals));
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

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([refreshSnapshot(), refreshAuthStatus()]);
  }, [refreshAuthStatus, refreshSnapshot]);

  const effectiveTokenVaultConfigured =
    authStatus?.tokenVault.configured ?? tokenVaultConfigured;
  const pendingApprovalsCount = snapshot.approvals.filter(
    (approval) => approval.status === "pending",
  ).length;
  const hasUnsavedSetupChanges =
    JSON.stringify(createSetupPayload(setupDraft)) !==
    JSON.stringify(createSetupPayload(createSetupDraft(snapshot)));

  function selectView(nextView: ViewKey) {
    setActiveView(nextView);
    requestAnimationFrame(() => {
      if (typeof mainRef.current?.scrollIntoView === "function") {
        mainRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  }

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
      "Saving setup changes",
      () =>
        fetchJson<DemoState>("/api/setup", {
          method: "POST",
          body: JSON.stringify(createSetupPayload(setupDraft)),
        }),
      "Setup changes saved.",
    );
  }

  async function ingestUpdates() {
    await runMutation(
      "Ingesting Gmail replies and mock messages",
      () =>
        fetchJson<DemoState>(withUserQuery("/api/inbox/ingest", user?.sub), {
          method: "POST",
        }),
      "Inbox updates were ingested and the newsletter draft was refreshed.",
    );
  }

  async function duplicateNewsletter() {
    await runMutation(
      "Duplicating the last newsletter",
      () =>
        fetchJson<DemoState>("/api/newsletter/duplicate-last", {
          method: "POST",
        }),
      "Duplicated last newsletter into this week's working drafts.",
    );
  }

  function updateNewsletterDraftState(
    audience: EditableAudience,
    updater: (draft: NewsletterDraft) => NewsletterDraft,
  ) {
    setNewsletterDrafts((current) => ({
      ...current,
      [audience]: updater(current[audience]),
    }));
  }

  function updateNewsletterDraftField(
    audience: EditableAudience,
    field: "title" | "summary",
    value: string,
  ) {
    updateNewsletterDraftState(audience, (draft) => ({
      ...draft,
      [field]: value,
    }));
  }

  function updateSectionTitle(
    audience: EditableAudience,
    sectionId: string,
    value: string,
  ) {
    updateNewsletterDraftState(audience, (draft) => ({
      ...draft,
      sections: draft.sections.map((section) =>
        section.id === sectionId ? { ...section, title: value } : section,
      ),
    }));
  }

  function updateItemField(
    audience: EditableAudience,
    sectionId: string,
    itemId: string,
    field: "title" | "body",
    value: string,
  ) {
    updateNewsletterDraftState(audience, (draft) => ({
      ...draft,
      sections: draft.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.map((item) =>
                item.id === itemId ? { ...item, [field]: value } : item,
              ),
            }
          : section,
      ),
    }));
  }

  function reorderSections(
    audience: EditableAudience,
    event: DragEndEvent,
  ) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    updateNewsletterDraftState(audience, (draft) => {
      const oldIndex = draft.sections.findIndex((section) => section.id === active.id);
      const newIndex = draft.sections.findIndex((section) => section.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return draft;
      }

      return {
        ...draft,
        sections: arrayMove(draft.sections, oldIndex, newIndex),
      };
    });
  }

  function reorderItems(
    audience: EditableAudience,
    sectionId: string,
    event: DragEndEvent,
  ) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    updateNewsletterDraftState(audience, (draft) => ({
      ...draft,
      sections: draft.sections.map((section) => {
        if (section.id !== sectionId) {
          return section;
        }

        const oldIndex = section.items.findIndex((item) => item.id === active.id);
        const newIndex = section.items.findIndex((item) => item.id === over.id);

        if (oldIndex === -1 || newIndex === -1) {
          return section;
        }

        return {
          ...section,
          items: arrayMove(section.items, oldIndex, newIndex),
        };
      }),
    }));
  }

  function placeSuggestion(audience: EditableAudience, suggestion: ExtractedContentItem) {
    updateNewsletterDraftState(audience, (draft) => {
      const preferredKind =
        suggestion.priority === "urgent" ? "urgent_schoolwide" : "events";
      const nextSections = structuredClone(draft.sections);
      const item: NewsletterItem = {
        id: `${audience}-${suggestion.id}-${crypto.randomUUID()}`,
        title: suggestion.title,
        body: suggestion.summary,
        priority: suggestion.priority,
        sourceBadges: [formatDisplayLabel(suggestion.source), suggestion.sourceRef],
        flyerRecommended: suggestion.recommendedAsFlyer,
      };

      const existingSection = nextSections.find(
        (section) => section.kind === preferredKind,
      );

      if (existingSection) {
        existingSection.items.push(item);
      } else {
        nextSections.push({
          id: `${audience}-section-${crypto.randomUUID()}`,
          title:
            suggestion.priority === "urgent"
              ? "Urgent schoolwide items"
              : "Events and reminders",
          kind: preferredKind,
          items: [item],
        } satisfies NewsletterSection);
      }

      return {
        ...draft,
        sections: nextSections,
      };
    });
  }

  async function saveNewsletterDraft(audience: EditableAudience) {
    await runMutation(
      `Saving ${audience} newsletter draft`,
      () =>
        fetchJson<DemoState>(`/api/newsletter/${audience}`, {
          method: "PUT",
          body: JSON.stringify(newsletterDrafts[audience]),
        }),
      `${formatDisplayLabel(audience)} draft saved.`,
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
      "Saving previous newsletter link",
      () =>
        fetchJson<DemoState>("/api/inbox/artifacts", {
          method: "POST",
          body: formData,
        }),
      "Previous newsletter link saved.",
    );
  }

  async function uploadCalendarScreenshot() {
    if (!artifactDrafts.calendarFile) {
      setNotice({
        tone: "error",
        message: "Choose a calendar screenshot before uploading it for OCR.",
      });
      return;
    }

    const formData = new FormData();
    formData.append("type", "calendar_screenshot");
    formData.append("label", artifactDrafts.calendarLabel);
    if (artifactDrafts.calendarNote.trim()) {
      formData.append("note", artifactDrafts.calendarNote.trim());
    }
    formData.append("file", artifactDrafts.calendarFile);

    await runMutation(
      "Uploading calendar screenshot for OCR",
      () =>
        fetchJson<DemoState>("/api/inbox/artifacts", {
          method: "POST",
          body: formData,
        }),
      "Calendar screenshot uploaded and queued into OCR-backed inbox artifacts.",
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
      "Mock message added to the demo inbox.",
    );
    setMockMessageDraft({
      source: mockMessageDraft.source,
      sender: "Demo sender",
      body: "",
      imageUrl: "",
    });
  }

  async function saveApproval(actionId: string) {
    const draft = approvalDrafts[actionId];
    if (!draft) {
      return;
    }

    await runMutation(
      "Saving approval edits",
      () =>
        fetchJson<DemoState>(
          withUserQuery(`/api/actions/${actionId}/edit`, user?.sub),
          {
          method: "POST",
          body: JSON.stringify(draft),
          },
        ),
      "Approval draft updated.",
    );
  }

  async function approveAction(actionId: string) {
    await runMutation(
      "Approving risky action",
      () =>
        fetchJson<DemoState>(
          withUserQuery(`/api/actions/${actionId}/approve`, user?.sub),
          {
          method: "POST",
          },
        ),
      "Action approved. Execution can proceed without additional blockers.",
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
      "Retrying action execution",
      () =>
        fetchJson<DemoState>(
          withUserQuery(`/api/actions/${actionId}/retry`, user?.sub),
          {
            method: "POST",
          },
        ),
      "Action execution retry requested.",
    );
  }

  function updateManualStepDraft(
    actionId: string,
    stepId: string,
    field: keyof ManualStepDraft,
    value: string,
  ) {
    setManualStepDrafts((current) => ({
      ...current,
      [stepDraftKey(actionId, stepId)]: {
        ...(current[stepDraftKey(actionId, stepId)] ?? {}),
        [field]: value,
      },
    }));
  }

  async function completeManualStep(actionId: string, stepId: string) {
    const draft = manualStepDrafts[stepDraftKey(actionId, stepId)] ?? {};
    const outputs = Object.fromEntries(
      Object.entries({
        directUrl: draft.directUrl?.trim(),
        externalId: draft.externalId?.trim(),
        scheduledFor: draft.scheduledFor?.trim(),
      }).filter(([, value]) => Boolean(value)),
    );

    await runMutation(
      "Saving manual execution details",
      () =>
        fetchJson<DemoState>(
          withUserQuery(
            `/api/actions/${actionId}/steps/${stepId}/manual-complete`,
            user?.sub,
          ),
          {
            method: "POST",
            body: JSON.stringify({
              note: draft.note?.trim() || undefined,
              outputs: Object.keys(outputs).length ? outputs : undefined,
            }),
          },
        ),
      "Manual step marked complete.",
    );
  }

  function updateIntegrationMode(
    key: keyof SetupDraft["integrations"],
    mode: IntegrationMode,
  ) {
    setSetupDraft((current) => ({
      ...current,
      integrations: {
        ...current.integrations,
        [key]: {
          ...current.integrations[key],
          mode,
        },
      },
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

  function openWorkflowStage(stage: WorkflowStage) {
    selectView(getViewForStage(stage));
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

  function setCurrentWorkflowStage(stage: WorkflowStage) {
    setSetupDraft((current) => {
      const activeIndex = current.planner.timeline.findIndex(
        (entry) => entry.stage === stage,
      );
      const resolvedIndex = activeIndex === -1 ? 0 : activeIndex;

      return {
        ...current,
        planner: {
          ...current.planner,
          currentStage:
            current.planner.timeline[resolvedIndex]?.stage ?? stage,
          timeline: current.planner.timeline.map((entry, index) => ({
            ...entry,
            status:
              index < resolvedIndex
                ? "done"
                : index === resolvedIndex
                  ? "active"
                  : "upcoming",
          })),
        },
      };
    });
  }

  function updateWorkflowTargetTime(stage: WorkflowStage, value: string) {
    setSetupDraft((current) => ({
      ...current,
      planner: {
        ...current.planner,
        timeline: current.planner.timeline.map((entry) =>
          entry.stage === stage
            ? {
                ...entry,
                targetTime: toIsoDateTime(value),
              }
            : entry,
        ),
      },
    }));
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_16%_12%,rgba(45,200,255,0.18),transparent_32%),radial-gradient(circle_at_84%_8%,rgba(73,112,255,0.2),transparent_28%)]" />
      <div className="relative mx-auto grid max-w-[1680px] gap-5 xl:grid-cols-[292px_minmax(0,1fr)] 2xl:grid-cols-[292px_minmax(0,1fr)_320px]">
        <aside className="xl:sticky xl:top-4 xl:self-start">
          <Card className="brand-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <BrandLogo className="size-14 p-1.5" />
                <div className="space-y-1">
                  <span className="block text-xl font-semibold tracking-tight">
                    PTA Pilot
                  </span>
                  <span className="block text-[0.68rem] font-semibold tracking-[0.34em] text-primary/80 uppercase">
                    AI Comms Control Tower
                  </span>
                </div>
              </CardTitle>
              <CardDescription>
                AI PTA communications agent with explicit approvals before send,
                publish, or schedule actions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/80 bg-background/85 p-4">
                <p className="text-sm font-medium">Current workspace</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {snapshot.workspaceTitle}
                </p>
                <StatusIndicator
                  status={snapshot.planner.currentStage}
                  className="mt-3"
                />
                <Separator className="my-4" />
                <div className="space-y-3">
                  {snapshot.planner.timeline.map((stage) => (
                    <button
                      key={stage.stage}
                      type="button"
                      onClick={() => openWorkflowStage(stage.stage)}
                      className="w-full rounded-[1.35rem] border border-transparent bg-background/35 px-3.5 py-3 text-left transition hover:border-border hover:bg-muted/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 pr-2">
                          <p className="text-sm leading-5 font-medium">
                            {stage.label}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {formatDateTime(stage.targetTime)}
                          </p>
                        </div>
                        <StatusIndicator
                          status={stage.status}
                          className="mt-0.5 shrink-0"
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>

        <main ref={mainRef} className="space-y-4">
          <Card className="brand-panel">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[0.68rem] font-semibold tracking-[0.28em] text-primary uppercase">
                  <BrandLogo
                    className="size-5 rounded-full border-0 bg-transparent p-0 shadow-none"
                    alt=""
                  />
                  PTA Pilot
                </span>
                <span>Believable hackathon demo flow</span>
                <Badge variant={effectiveTokenVaultConfigured ? "default" : "secondary"}>
                  Token Vault {effectiveTokenVaultConfigured ? "configured" : "scaffolded"}
                </Badge>
                <Badge variant={authEnabled ? "secondary" : "outline"}>
                  Auth0 {authEnabled ? "enabled" : "demo mode"}
                </Badge>
              </CardTitle>
              <CardDescription>
                Monday reminder, midweek collection, Wednesday board review,
                Thursday teacher release, Sunday parent scheduling with break
                checks.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {snapshot.planner.skipNextParentSend
                    ? snapshot.planner.skipReason
                    : "Planner currently allows the Sunday parent send for this week."}
                </p>
                {notice ? (
                  <div
                    className={cn(
                      "inline-flex rounded-full px-3 py-1 text-xs font-medium ring-1",
                      notice.tone === "success" &&
                        "bg-emerald-500/14 text-emerald-100 ring-emerald-400/20",
                      notice.tone === "error" &&
                        "bg-rose-500/14 text-rose-100 ring-rose-400/20",
                      notice.tone === "info" &&
                        "bg-primary/12 text-primary ring-primary/20",
                    )}
                  >
                    {notice.message}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshWorkspace()}
                  disabled={isMutating || isRefreshingAuthStatus}
                >
                  <ArrowClockwise className="size-4" />
                  Refresh
                </Button>
                {authEnabled && !user?.email ? (
                  <Button asChild size="sm">
                    <a href="/auth/login?returnTo=/">Log in with Auth0</a>
                  </Button>
                ) : null}
                {authEnabled && user?.email ? (
                  <Button asChild variant="secondary" size="sm">
                    <a href="/auth/logout">Log out</a>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Tabs
            value={activeView}
            onValueChange={(value) => selectView(value as ViewKey)}
            className="space-y-4"
          >
            <Card className="brand-panel overflow-hidden">
              <CardContent className="px-3 py-3">
                <TabsList className="h-auto w-full justify-start items-stretch gap-2 overflow-x-auto rounded-[1.45rem] bg-background/75 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {viewDefinitions.map(({ key, label, icon: Icon }) => {
                    const count =
                      key === "actions"
                        ? pendingApprovalsCount
                        : key === "audit"
                          ? snapshot.auditLog.length
                          : null;

                    return (
                      <TabsTrigger
                        key={key}
                        value={key}
                        className="h-auto min-w-[150px] flex-none items-center justify-between rounded-[1.1rem] px-4 py-3 text-left data-active:bg-primary/10 data-active:text-foreground"
                      >
                        <span className="flex items-center gap-3">
                          <Icon className="size-4" />
                          <span className="text-sm font-medium">{label}</span>
                        </span>
                        {count ? (
                          <span className="text-xs font-semibold text-muted-foreground">
                            {count}
                          </span>
                        ) : null}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </CardContent>
            </Card>

            <TabsContent value="setup">
              <SetupView
                setupDraft={setupDraft}
                authEnabled={authEnabled}
                gmailConnectUrl={gmailConnectUrl}
                authStatus={authStatus}
                authStatusError={authStatusError}
                isRefreshingAuthStatus={isRefreshingAuthStatus}
                user={user}
                onRefreshAuthStatus={() => void refreshAuthStatus()}
                onAuth0EmailChange={(value) =>
                  setSetupDraft((current) => ({
                    ...current,
                    auth0AccountEmail: value,
                  }))
                }
                onIntegrationModeChange={updateIntegrationMode}
                onAddContact={addContactToDraft}
                onAddMemberRecipient={addMemberRecipientToDraft}
                onAddBreak={addBreakToDraft}
                onUpdateContact={updateContactField}
                onUpdateMemberRecipient={updateMemberRecipientField}
                onRemoveContact={removeContact}
                onRemoveMemberRecipient={removeMemberRecipient}
                onUpdateBreak={updateBreakField}
                onRemoveBreak={removeBreak}
                onSetCurrentWorkflowStage={setCurrentWorkflowStage}
                onUpdateWorkflowTargetTime={updateWorkflowTargetTime}
                onOpenWorkflowStage={openWorkflowStage}
                newContact={newContact}
                newMemberRecipient={newMemberRecipient}
                newBreak={newBreak}
                setNewContact={setNewContact}
                setNewMemberRecipient={setNewMemberRecipient}
                setNewBreak={setNewBreak}
                onSave={() => void saveSetupDraft()}
                hasUnsavedChanges={hasUnsavedSetupChanges}
                pendingApprovalsCount={pendingApprovalsCount}
                isMutating={isMutating}
              />
            </TabsContent>

            <TabsContent value="inbox">
              <InboxView
                state={snapshot}
                mockMessageDraft={mockMessageDraft}
                artifactDrafts={artifactDrafts}
                setMockMessageDraft={setMockMessageDraft}
                setArtifactDrafts={setArtifactDrafts}
                onIngest={() => void ingestUpdates()}
                onSubmitMockMessage={() => void submitMockMessage()}
                onSavePreviousNewsletterLink={() => void savePreviousNewsletterLink()}
                onUploadCalendarScreenshot={() => void uploadCalendarScreenshot()}
                isMutating={isMutating}
              />
            </TabsContent>

            <TabsContent value="newsletter">
              <NewsletterView
                state={snapshot}
                newsletterDrafts={newsletterDrafts}
                onDuplicate={() => void duplicateNewsletter()}
                onUpdateDraftField={updateNewsletterDraftField}
                onUpdateSectionTitle={updateSectionTitle}
                onUpdateItemField={updateItemField}
                onSectionDragEnd={reorderSections}
                onItemDragEnd={reorderItems}
                onPlaceSuggestion={placeSuggestion}
                onSaveDraft={saveNewsletterDraft}
                isMutating={isMutating}
              />
            </TabsContent>

            <TabsContent value="actions">
              <ActionsView
                state={snapshot}
                approvalDrafts={approvalDrafts}
                manualStepDrafts={manualStepDrafts}
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
                onSave={saveApproval}
                onApprove={approveAction}
                onReject={rejectAction}
                onRetry={retryActionExecution}
                onManualStepDraftChange={updateManualStepDraft}
                onCompleteManualStep={completeManualStep}
                isMutating={isMutating}
              />
            </TabsContent>

            <TabsContent value="audit">
              <AuditView state={snapshot} />
            </TabsContent>
          </Tabs>
        </main>

        <aside className="xl:col-start-2 2xl:col-start-auto 2xl:sticky 2xl:top-4 2xl:self-start">
          <Card className="brand-panel">
            <CardHeader>
              <CardTitle>Approvals and action log</CardTitle>
              <CardDescription>
                Human review stays in the loop before send, publish, or schedule
                operations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                {snapshot.approvals.map((approval) => (
                  <div
                    key={approval.id}
                    className="rounded-2xl border border-border/80 bg-background/80 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{approval.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDisplayLabel(approval.channel)} •{" "}
                          {formatDisplayLabel(approval.audience)}
                        </p>
                      </div>
                      <StatusIndicator status={approval.status} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {approval.rationale}
                    </p>
                  </div>
                ))}
              </div>

              <Separator />

              <ScrollArea className="h-[380px] pr-4">
                <div className="space-y-3">
                  {snapshot.auditLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-2xl border border-border/80 bg-background/80 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Badge variant="outline">
                          {formatDisplayLabel(entry.integration)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(entry.timestamp)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium">{entry.summary}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDisplayLabel(entry.kind)}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SetupView({
  setupDraft,
  authEnabled,
  gmailConnectUrl,
  authStatus,
  authStatusError,
  isRefreshingAuthStatus,
  user,
  onRefreshAuthStatus,
  onAuth0EmailChange,
  onIntegrationModeChange,
  onAddContact,
  onAddMemberRecipient,
  onAddBreak,
  onUpdateContact,
  onUpdateMemberRecipient,
  onRemoveContact,
  onRemoveMemberRecipient,
  onUpdateBreak,
  onRemoveBreak,
  onSetCurrentWorkflowStage,
  onUpdateWorkflowTargetTime,
  onOpenWorkflowStage,
  newContact,
  newMemberRecipient,
  newBreak,
  setNewContact,
  setNewMemberRecipient,
  setNewBreak,
  onSave,
  hasUnsavedChanges,
  pendingApprovalsCount,
  isMutating,
}: {
  setupDraft: SetupDraft;
  authEnabled: boolean;
  gmailConnectUrl: string;
  authStatus: AuthStatusResponse | null;
  authStatusError: string | null;
  isRefreshingAuthStatus: boolean;
  user?: Viewer | null;
  onRefreshAuthStatus: () => void;
  onAuth0EmailChange: (value: string) => void;
  onIntegrationModeChange: (
    key: keyof SetupDraft["integrations"],
    mode: IntegrationMode,
  ) => void;
  onAddContact: () => void;
  onAddMemberRecipient: () => void;
  onAddBreak: () => void;
  onUpdateContact: (
    contactId: string,
    field: keyof Omit<Contact, "id">,
    value: string,
  ) => void;
  onUpdateMemberRecipient: (
    recipientId: string,
    field: keyof Omit<MemberRecipient, "id">,
    value: string,
  ) => void;
  onRemoveContact: (contactId: string) => void;
  onRemoveMemberRecipient: (recipientId: string) => void;
  onUpdateBreak: (
    breakId: string,
    field: keyof Omit<SchoolBreak, "id">,
    value: string,
  ) => void;
  onRemoveBreak: (breakId: string) => void;
  onSetCurrentWorkflowStage: (stage: WorkflowStage) => void;
  onUpdateWorkflowTargetTime: (stage: WorkflowStage, value: string) => void;
  onOpenWorkflowStage: (stage: WorkflowStage) => void;
  newContact: { name: string; role: string; email: string };
  newMemberRecipient: { name: string; email: string };
  newBreak: { name: string; startsOn: string; endsOn: string };
  setNewContact: Dispatch<
    SetStateAction<{ name: string; role: string; email: string }>
  >;
  setNewMemberRecipient: Dispatch<
    SetStateAction<{ name: string; email: string }>
  >;
  setNewBreak: Dispatch<
    SetStateAction<{ name: string; startsOn: string; endsOn: string }>
  >;
  onSave: () => void;
  hasUnsavedChanges: boolean;
  pendingApprovalsCount: number;
  isMutating: boolean;
}) {
  const integrationEntries = (
    Object.entries(setupDraft.integrations) as Array<
      [
        keyof SetupDraft["integrations"],
        SetupDraft["integrations"][keyof SetupDraft["integrations"]],
      ]
    >
  ).map(([key, integration]) => {
    if (key === "auth0") {
      return [
        key,
        {
          ...integration,
          status: getAuth0IntegrationDisplayStatus(integration, authEnabled, user),
        },
      ] as const;
    }

    if (key === "gmail") {
      return [
        key,
        {
          ...integration,
          status: getGmailIntegrationDisplayStatus(integration, authStatus, user),
        },
      ] as const;
    }

    return [key, integration] as const;
  });

  const liveGmailBadge: { variant: BadgeVariant; label: string } = authStatus
    ? {
        variant: authStatus.gmail.liveReady
          ? "default"
          : authStatus.gmail.connected
            ? "secondary"
            : "outline",
        label: authStatus.gmail.liveReady
          ? "live ready"
          : authStatus.gmail.connected
            ? "live blocked"
            : "awaiting connect",
      }
    : authStatusError
      ? {
          variant: "outline" as const,
          label: "status unavailable",
        }
      : {
          variant: "secondary" as const,
          label: authEnabled ? "checking" : "demo mode",
        };

  const managementBadge: { variant: BadgeVariant; label: string } = authStatus
    ? {
        variant: authStatus.managementApi.configured ? "secondary" : "outline",
        label: authStatus.managementApi.configured ? "configured" : "not configured",
      }
    : authStatusError
      ? {
          variant: "outline" as const,
          label: "unavailable",
        }
      : {
          variant: "secondary" as const,
          label: "checking",
        };

  const connectionBadge: { variant: BadgeVariant; label: string } = authStatus
    ? {
        variant: authStatus.gmail.connected ? "default" : "outline",
        label: authStatus.gmail.connected ? "connected" : "not connected",
      }
    : authStatusError
      ? {
          variant: "outline" as const,
          label: "unknown",
        }
      : {
          variant: "secondary" as const,
          label: user?.email ? "checking" : "signed out",
        };

  const actionPathLabel = authStatus
    ? authStatus.gmail.actionPath === "identity_provider"
      ? "identity fallback"
      : authStatus.gmail.actionPath === "token_vault"
        ? "token vault"
        : "unavailable"
    : authStatusError
      ? "unavailable"
      : "checking";

  const authStatusNote = authStatusError
    ? "Live auth status could not be loaded from the local API. Reload after the API is up, or verify the `/api/auth/status` response in the browser."
    : authStatus
      ? authStatus.gmail.liveReady
        ? authStatus.gmail.note
        : authStatus.gmail.connected
          ? `Gmail is connected, but PTA Pilot cannot run live Gmail actions yet. ${authStatus.gmail.note}`
          : authStatus.gmail.note
      : "Sign in with Auth0 and request Gmail scopes to verify Token Vault connection status.";

  const gmailActionLabel = !user?.email
    ? "Log in with Google + Gmail"
    : !authStatus
      ? "Manage Gmail access"
      : authStatus.gmail.liveReady
        ? "Manage Gmail access"
        : authStatus.gmail.connected
          ? "Retry Gmail access"
          : "Connect Gmail";
  const activeStage =
    setupDraft.planner.timeline.find(
      (entry) => entry.stage === setupDraft.planner.currentStage,
    ) ?? setupDraft.planner.timeline[0];
  const workflowAction = getStageActionCopy(setupDraft.planner.currentStage);
  const liveModeCount = integrationEntries.filter(
    ([, integration]) => integration.mode === "live",
  ).length;
  const primaryActionLabel = hasUnsavedChanges
    ? "Save workspace changes"
    : workflowAction.buttonLabel;
  const primaryActionDescription = hasUnsavedChanges
    ? "Contacts, school breaks, integration modes, and workflow timing edits stay local until you save them."
    : workflowAction.description;

  return (
    <div className="space-y-5">
      <Card className="brand-panel overflow-hidden">
        <CardContent className="grid gap-5 pt-6 xl:grid-cols-[minmax(0,1.2fr)_320px]">
          <div className="rounded-[1.9rem] border border-primary/20 bg-[linear-gradient(135deg,rgba(45,200,255,0.18),rgba(11,21,36,0.92)_45%,rgba(8,15,28,0.98)_100%)] p-6">
            <div className="flex flex-wrap items-center gap-3">
              <StatusIndicator
                status={hasUnsavedChanges ? "active" : "done"}
                label={hasUnsavedChanges ? "Unsaved edits" : "Workspace saved"}
              />
              <span className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                Current stage {formatDisplayLabel(setupDraft.planner.currentStage)}
              </span>
            </div>
            <p className="mt-5 text-xs font-semibold tracking-[0.24em] text-primary/[0.85] uppercase">
              Next action
            </p>
            <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight">
              {hasUnsavedChanges
                ? "Save the workspace before moving to the next step."
                : workflowAction.title}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {primaryActionDescription}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                onClick={
                  hasUnsavedChanges
                    ? onSave
                    : () => onOpenWorkflowStage(setupDraft.planner.currentStage)
                }
                disabled={isMutating}
              >
                {primaryActionLabel}
                <ArrowRight className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenWorkflowStage(setupDraft.planner.currentStage)}
              >
                Open {formatDisplayLabel(getViewForStage(setupDraft.planner.currentStage))}
              </Button>
            </div>
            {activeStage ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Current focus: {activeStage.label} scheduled for{" "}
                {formatDateTime(activeStage.targetTime)}.
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[1.7rem] border border-border/80 bg-background/75 p-5">
              <p className="text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                Board / staff
              </p>
              <p className="mt-3 text-3xl font-semibold">{setupDraft.contacts.length}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Routing contacts for board review, staff release, and recurring approvals.
              </p>
            </div>
            <div className="rounded-[1.7rem] border border-border/80 bg-background/75 p-5">
              <p className="text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                PTA members
              </p>
              <p className="mt-3 text-3xl font-semibold">{setupDraft.memberRecipients.length}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Monday reminder recipients used for member-facing Gmail sends.
              </p>
            </div>
            <div className="rounded-[1.7rem] border border-border/80 bg-background/75 p-5">
              <p className="text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                Calendar checks
              </p>
              <p className="mt-3 text-3xl font-semibold">{setupDraft.schoolBreaks.length}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Break windows that can pause the Sunday parent send.
              </p>
            </div>
            <div className="rounded-[1.7rem] border border-border/80 bg-background/75 p-5">
              <p className="text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                Pending approvals
              </p>
              <p className="mt-3 text-3xl font-semibold">{pendingApprovalsCount}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Approval items waiting before send, publish, or schedule.
              </p>
            </div>
            <div className="rounded-[1.7rem] border border-border/80 bg-background/75 p-5">
              <p className="text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                Live modes
              </p>
              <p className="mt-3 text-3xl font-semibold">{liveModeCount}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Integrations currently configured to run live.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-5">
          <Card className="brand-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="size-4" />
                Workflow controls
              </CardTitle>
              <CardDescription>
                Adjust timing and set the current workflow focus without leaving setup.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {setupDraft.planner.timeline.map((entry) => {
                const isCurrentStage = entry.stage === setupDraft.planner.currentStage;

                return (
                  <div
                    key={entry.stage}
                    className={cn(
                      "rounded-[1.7rem] border p-4",
                      isCurrentStage
                        ? "border-primary/30 bg-primary/[0.08]"
                        : "border-border/80 bg-background/70",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{entry.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Routes to {formatDisplayLabel(getViewForStage(entry.stage))}.
                        </p>
                      </div>
                      <StatusIndicator
                        status={isCurrentStage ? "current_focus" : entry.status}
                        label={
                          isCurrentStage
                            ? "Current focus"
                            : formatDisplayLabel(entry.status)
                        }
                      />
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <div className="space-y-2">
                        <Label htmlFor={`workflow-${entry.stage}`}>Scheduled time</Label>
                        <Input
                          id={`workflow-${entry.stage}`}
                          type="datetime-local"
                          value={formatDateTimeInput(entry.targetTime)}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            onUpdateWorkflowTargetTime(entry.stage, event.target.value)
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={isCurrentStage ? "secondary" : "outline"}
                        className="self-end"
                        onClick={() => onSetCurrentWorkflowStage(entry.stage)}
                      >
                        {isCurrentStage ? "Current stage" : "Set current stage"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="self-end"
                        onClick={() => onOpenWorkflowStage(entry.stage)}
                      >
                        Open view
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="brand-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4" />
                Auth and integrations
              </CardTitle>
              <CardDescription>
                Configure demo identity, Token Vault status, and adapter modes in one place.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="auth0-email">Auth0 account email</Label>
                  <Input
                    id="auth0-email"
                    value={setupDraft.auth0AccountEmail}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      onAuth0EmailChange(event.target.value)
                    }
                    placeholder="you@example.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Current web session: {user?.email ?? "guest demo"} • Auth0{" "}
                    {authEnabled ? "enabled" : "not configured yet"}
                  </p>
                </div>
                <div className="rounded-[1.7rem] border border-border/80 bg-background/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle className="size-4 text-primary" />
                    Human approval guardrail
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    PTA Pilot never silently sends, publishes, or schedules. The action rail remains the final checkpoint for risky operations.
                  </p>
                </div>
              </div>

              <div className="rounded-[1.7rem] border border-border/80 bg-background/70 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">Live Gmail via Token Vault</p>
                      <Badge variant={connectionBadge.variant}>{connectionBadge.label}</Badge>
                      <Badge variant={liveGmailBadge.variant}>{liveGmailBadge.label}</Badge>
                      <Badge variant={managementBadge.variant}>
                        Mgmt API {managementBadge.label}
                      </Badge>
                      <Badge variant="outline">Path {actionPathLabel}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{authStatusNote}</p>
                    <div className="flex flex-wrap gap-2">
                      {(authStatus?.gmail.grantedScopes ?? []).map((scope) => (
                        <Badge key={scope} variant="outline">
                          {scope.replace("https://www.googleapis.com/auth/", "gmail:")}
                        </Badge>
                      ))}
                      {(authStatus?.gmail.missingScopes ?? []).map((scope) => (
                        <Badge key={scope} variant="destructive">
                          missing: {scope.replace("https://www.googleapis.com/auth/", "gmail:")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <a href={gmailConnectUrl}>{gmailActionLabel}</a>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onRefreshAuthStatus}
                      disabled={!authEnabled || isRefreshingAuthStatus}
                    >
                      <ArrowClockwise className="size-4" />
                      {isRefreshingAuthStatus ? "Checking" : "Check status"}
                    </Button>
                    {authEnabled && user?.email ? (
                      <Button asChild variant="outline" size="sm">
                        <a href="/auth/profile">View Auth0 profile</a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {integrationEntries.map(([key, integration]) => (
                  <div
                    key={key}
                    className="rounded-[1.7rem] border border-border/80 bg-background/70 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {formatDisplayLabel(key)}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {integration.description}
                        </p>
                      </div>
                      <StatusIndicator
                        status={integration.status}
                        className="self-start"
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(["mock", "live", "manual"] as IntegrationMode[]).map((mode) => (
                        <Button
                          key={mode}
                          type="button"
                          size="xs"
                          variant={integration.mode === mode ? "default" : "outline"}
                          onClick={() => onIntegrationModeChange(key, mode)}
                          disabled={key === "mockMessages" && mode !== "mock"}
                        >
                          {formatDisplayLabel(mode)}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2 border-t">
              <Button onClick={onSave} disabled={isMutating || !hasUnsavedChanges}>
                {hasUnsavedChanges ? "Save workspace changes" : "All changes saved"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenWorkflowStage(setupDraft.planner.currentStage)}
              >
                Open {formatDisplayLabel(getViewForStage(setupDraft.planner.currentStage))}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="brand-panel">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>PTA member recipients</span>
                <Badge variant="outline">{setupDraft.memberRecipients.length}</Badge>
              </CardTitle>
              <CardDescription>
                Maintain the live member send list used by the Monday reminder approval.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {setupDraft.memberRecipients.length ? (
                <div className="space-y-3">
                  {setupDraft.memberRecipients.map((recipient) => (
                    <div
                      key={recipient.id}
                      className="rounded-[1.7rem] border border-border/80 bg-background/70 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">
                            {recipient.name || "Untitled member"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Included in live Gmail reminder sends after approval.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onRemoveMemberRecipient(recipient.id)}
                          aria-label={`Delete ${recipient.name || "member recipient"}`}
                        >
                          <Trash className="size-4" />
                        </Button>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <Input
                          placeholder="Name"
                          value={recipient.name}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            onUpdateMemberRecipient(
                              recipient.id,
                              "name",
                              event.target.value,
                            )
                          }
                        />
                        <Input
                          placeholder="Email"
                          type="email"
                          value={recipient.email}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            onUpdateMemberRecipient(
                              recipient.id,
                              "email",
                              event.target.value,
                            )
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.7rem] border border-dashed border-border/80 bg-background/60 p-4 text-sm text-muted-foreground">
                  No PTA member recipients yet. Add the live member email list here before approving the Monday reminder send.
                </div>
              )}

              <div className="rounded-[1.7rem] border border-dashed border-primary/20 bg-primary/[0.06] p-4">
                <p className="text-sm font-medium">Add member recipient</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Input
                    placeholder="Name"
                    value={newMemberRecipient.name}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setNewMemberRecipient((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                  <Input
                    placeholder="Email"
                    type="email"
                    value={newMemberRecipient.email}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setNewMemberRecipient((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                </div>
                <Button
                  className="mt-4"
                  variant="outline"
                  size="sm"
                  onClick={onAddMemberRecipient}
                >
                  Add member recipient
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="brand-panel">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>Recurring contacts</span>
                <Badge variant="outline">{setupDraft.contacts.length}</Badge>
              </CardTitle>
              <CardDescription>
                Edit or remove board/staff routing contacts inline, then add new ones below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {setupDraft.contacts.length ? (
                <div className="space-y-3">
                  {setupDraft.contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="rounded-[1.7rem] border border-border/80 bg-background/70 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">
                            {contact.name || "Untitled contact"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Used for recurring routing and review lists.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onRemoveContact(contact.id)}
                          aria-label={`Delete ${contact.name || "contact"}`}
                        >
                          <Trash className="size-4" />
                        </Button>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <Input
                          placeholder="Name"
                          value={contact.name}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            onUpdateContact(contact.id, "name", event.target.value)
                          }
                        />
                        <Input
                          placeholder="Role"
                          value={contact.role}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            onUpdateContact(contact.id, "role", event.target.value)
                          }
                        />
                        <Input
                          placeholder="Email"
                          type="email"
                          value={contact.email}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            onUpdateContact(contact.id, "email", event.target.value)
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.7rem] border border-dashed border-border/80 bg-background/60 p-4 text-sm text-muted-foreground">
                  No recurring contacts yet. Add the people who should receive recurring board, teacher, and school communication workflows.
                </div>
              )}

              <div className="rounded-[1.7rem] border border-dashed border-primary/20 bg-primary/[0.06] p-4">
                <p className="text-sm font-medium">Add contact</p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Input
                    placeholder="Name"
                    value={newContact.name}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setNewContact((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                  <Input
                    placeholder="Role"
                    value={newContact.role}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setNewContact((current) => ({
                        ...current,
                        role: event.target.value,
                      }))
                    }
                  />
                  <Input
                    placeholder="Email"
                    type="email"
                    value={newContact.email}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setNewContact((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                </div>
                <Button className="mt-4" variant="outline" size="sm" onClick={onAddContact}>
                  Add contact
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="brand-panel">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>School breaks</span>
                <Badge variant="outline">{setupDraft.schoolBreaks.length}</Badge>
              </CardTitle>
              <CardDescription>
                Maintain the break calendar that gates the Sunday parent schedule.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {setupDraft.schoolBreaks.length ? (
                <div className="space-y-3">
                  {setupDraft.schoolBreaks.map((schoolBreak) => (
                    <div
                      key={schoolBreak.id}
                      className="rounded-[1.7rem] border border-border/80 bg-background/70 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">
                            {schoolBreak.name || "Untitled break"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Saved breaks are checked before the parent newsletter is scheduled.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onRemoveBreak(schoolBreak.id)}
                          aria-label={`Delete ${schoolBreak.name || "break"}`}
                        >
                          <Trash className="size-4" />
                        </Button>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <Input
                          placeholder="Break name"
                          value={schoolBreak.name}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            onUpdateBreak(schoolBreak.id, "name", event.target.value)
                          }
                        />
                        <Input
                          type="date"
                          value={schoolBreak.startsOn}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            onUpdateBreak(schoolBreak.id, "startsOn", event.target.value)
                          }
                        />
                        <Input
                          type="date"
                          value={schoolBreak.endsOn}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            onUpdateBreak(schoolBreak.id, "endsOn", event.target.value)
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.7rem] border border-dashed border-border/80 bg-background/60 p-4 text-sm text-muted-foreground">
                  No school breaks saved yet. Add closures or vacation windows that should pause Sunday scheduling.
                </div>
              )}

              <div className="rounded-[1.7rem] border border-dashed border-primary/20 bg-primary/[0.06] p-4">
                <p className="text-sm font-medium">Add school break</p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Input
                    placeholder="Break name"
                    value={newBreak.name}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setNewBreak((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                  <Input
                    type="date"
                    value={newBreak.startsOn}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setNewBreak((current) => ({
                        ...current,
                        startsOn: event.target.value,
                      }))
                    }
                  />
                  <Input
                    type="date"
                    value={newBreak.endsOn}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setNewBreak((current) => ({
                        ...current,
                        endsOn: event.target.value,
                      }))
                    }
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Break checks refresh after you save the workspace.
                </p>
                <Button className="mt-4" variant="outline" size="sm" onClick={onAddBreak}>
                  Add break
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InboxView({
  state,
  mockMessageDraft,
  artifactDrafts,
  setMockMessageDraft,
  setArtifactDrafts,
  onIngest,
  onSubmitMockMessage,
  onSavePreviousNewsletterLink,
  onUploadCalendarScreenshot,
  isMutating,
}: {
  state: DemoState;
  mockMessageDraft: AddMockMessageInput;
  artifactDrafts: ArtifactDraftState;
  setMockMessageDraft: Dispatch<SetStateAction<AddMockMessageInput>>;
  setArtifactDrafts: Dispatch<SetStateAction<ArtifactDraftState>>;
  onIngest: () => void;
  onSubmitMockMessage: () => void;
  onSavePreviousNewsletterLink: () => void;
  onUploadCalendarScreenshot: () => void;
  isMutating: boolean;
}) {
  return (
    <div className="grid gap-4 2xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="brand-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChatsCircle className="size-4" />
            Unified inbox
          </CardTitle>
          <CardDescription>
            Gmail reminder replies plus mock WhatsApp and iMessage demo sources.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={onIngest} disabled={isMutating}>
              Ingest updates
            </Button>
            <Button variant="outline" size="sm">
              Gmail via Token Vault
            </Button>
          </div>
          <Tabs defaultValue="gmail">
            <TabsList>
              <TabsTrigger value="gmail">
                <EnvelopeSimple className="size-4" />
                Gmail
              </TabsTrigger>
              <TabsTrigger value="messages">
                <ChatsCircle className="size-4" />
                Mock messages
              </TabsTrigger>
            </TabsList>
            <TabsContent value="gmail" className="space-y-3">
              {state.inbox.gmailThreads.map((thread) => (
                <div
                  key={thread.id}
                  className="rounded-2xl border border-border/80 bg-background/75 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{thread.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        Updated {formatDateTime(thread.lastUpdatedAt)}
                      </p>
                    </div>
                    <Badge variant="secondary">{thread.messages.length} msgs</Badge>
                  </div>
                  <div className="mt-4 space-y-3">
                    {thread.messages.map((message) => (
                      <div
                        key={message.id}
                        className="rounded-2xl border border-border/70 bg-card p-3"
                      >
                        <p className="text-sm font-medium">{message.sender}</p>
                        <p className="text-xs text-muted-foreground">
                          {message.senderEmail} • {formatDateTime(message.sentAt)}
                        </p>
                        <p className="mt-2 text-sm leading-6">{message.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </TabsContent>
            <TabsContent value="messages" className="space-y-3">
              {state.inbox.mockMessages.map((message) => (
                <div
                  key={message.id}
                  className="rounded-2xl border border-border/80 bg-background/75 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{message.sender}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDisplayLabel(message.source)} •{" "}
                        {formatDateTime(message.sentAt)}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {formatDisplayLabel(message.source)}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6">{message.body}</p>
                  {message.imageUrl ? (
                    <img
                      src={message.imageUrl}
                      alt={message.body}
                      className="mt-3 h-36 w-full rounded-2xl object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="brand-panel">
          <CardHeader>
            <CardTitle>Artifact ingestion</CardTitle>
            <CardDescription>
              Save the previous newsletter link and run OCR on a calendar screenshot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <Label htmlFor="previous-newsletter-url">Previous newsletter URL</Label>
              <Input
                id="previous-newsletter-url"
                value={artifactDrafts.previousNewsletterUrl}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setArtifactDrafts((current) => ({
                    ...current,
                    previousNewsletterUrl: event.target.value,
                  }))
                }
                placeholder="https://..."
              />
              <Textarea
                value={artifactDrafts.previousNewsletterNote}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  setArtifactDrafts((current) => ({
                    ...current,
                    previousNewsletterNote: event.target.value,
                  }))
                }
                placeholder="Optional note for reminder/email context"
                className="min-h-24"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={onSavePreviousNewsletterLink}
                disabled={isMutating || !artifactDrafts.previousNewsletterUrl.trim()}
              >
                <LinkSimple className="size-4" />
                Save link
              </Button>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label htmlFor="calendar-screenshot-file">Calendar screenshot</Label>
              <Input
                id="calendar-screenshot-label"
                value={artifactDrafts.calendarLabel}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setArtifactDrafts((current) => ({
                    ...current,
                    calendarLabel: event.target.value,
                  }))
                }
                placeholder="Label"
              />
              <Input
                id="calendar-screenshot-file"
                type="file"
                accept="image/*"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setArtifactDrafts((current) => ({
                    ...current,
                    calendarFile: event.target.files?.[0] ?? null,
                  }))
                }
              />
              <Textarea
                value={artifactDrafts.calendarNote}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  setArtifactDrafts((current) => ({
                    ...current,
                    calendarNote: event.target.value,
                  }))
                }
                placeholder="Optional note for OCR context"
                className="min-h-24"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={onUploadCalendarScreenshot}
                disabled={isMutating || !artifactDrafts.calendarFile}
              >
                <UploadSimple className="size-4" />
                Upload for OCR
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="brand-panel">
          <CardHeader>
            <CardTitle>Mock message composer</CardTitle>
            <CardDescription>
              Send yourself a WhatsApp or iMessage update for demo purposes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(["whatsapp", "imessage"] as const).map((source) => (
                <Button
                  key={source}
                  variant={mockMessageDraft.source === source ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setMockMessageDraft((current) => ({
                      ...current,
                      source,
                    }))
                  }
                >
                  {formatDisplayLabel(source)}
                </Button>
              ))}
            </div>
            <Input
              value={mockMessageDraft.sender}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setMockMessageDraft((current) => ({
                  ...current,
                  sender: event.target.value,
                }))
              }
              placeholder="Sender"
            />
            <Textarea
              value={mockMessageDraft.body}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setMockMessageDraft((current) => ({
                  ...current,
                  body: event.target.value,
                }))
              }
              placeholder="Message body"
              className="min-h-32"
            />
            <Input
              value={mockMessageDraft.imageUrl ?? ""}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setMockMessageDraft((current) => ({
                  ...current,
                  imageUrl: event.target.value,
                }))
              }
              placeholder="Optional image URL"
            />
          </CardContent>
          <CardFooter className="border-t">
            <Button onClick={onSubmitMockMessage} disabled={isMutating}>
              Add mock message
            </Button>
          </CardFooter>
        </Card>

        <Card className="brand-panel">
          <CardHeader>
            <CardTitle>Extracted structured content</CardTitle>
            <CardDescription>
              Gemini-ready shape for placement, flyer recommendation, and
              approval drafting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.inbox.artifacts.length ? (
              <div className="space-y-3">
                {state.inbox.artifacts.map((artifact) => (
                  <div
                    key={artifact.id}
                    className="rounded-2xl border border-border/80 bg-background/75 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{artifact.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDisplayLabel(artifact.type)} • {formatDateTime(artifact.createdAt)}
                        </p>
                      </div>
                      <Badge variant="outline">Artifact</Badge>
                    </div>
                    {artifact.originalUrl ? (
                      <a
                        href={artifact.originalUrl}
                        className="mt-2 block text-sm text-primary underline-offset-4 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {artifact.originalUrl}
                      </a>
                    ) : null}
                    {artifact.extractedText ? (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {artifact.extractedText}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {state.inbox.extractedItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-border/80 bg-background/75 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{item.title}</p>
                  <StatusIndicator status={item.priority} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {formatDisplayLabel(item.source)}
                  </Badge>
                  <Badge variant="outline">
                    {formatDisplayLabel(item.recommendedPlacement)}
                  </Badge>
                  {item.recommendedAsFlyer ? (
                    <Badge variant="secondary">Flyer candidate</Badge>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SortableNewsletterItemCard({
  item,
  onChange,
  canReorder,
}: {
  item: NewsletterItem;
  onChange: (field: "title" | "body", value: string) => void;
  canReorder: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const dragHandleProps = canReorder ? { ...attributes, ...listeners } : {};

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "rounded-2xl border border-border/70 bg-card p-4",
        isDragging && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Input
            value={item.title}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onChange("title", event.target.value)
            }
          />
          <Textarea
            value={item.body}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              onChange("body", event.target.value)
            }
            className="mt-3 min-h-24"
          />
        </div>
        <button
          type="button"
          aria-label={`Reorder item ${item.title}`}
          title={
            canReorder
              ? "Drag to reorder this card"
              : "Add another card to this section before reordering."
          }
          disabled={!canReorder}
          className={cn(
            "rounded-xl border border-border/80 bg-background/60 px-2 py-1 text-xs text-muted-foreground",
            !canReorder && "cursor-not-allowed opacity-50",
          )}
          {...dragHandleProps}
        >
          Drag
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusIndicator status={item.priority} />
        {item.sourceBadges.map((badge) => (
          <Badge key={badge} variant="outline">
            {formatDisplayLabel(badge)}
          </Badge>
        ))}
        {item.flyerRecommended ? (
          <Badge variant="secondary">Flyer recommended</Badge>
        ) : null}
      </div>
    </div>
  );
}

function SortableNewsletterSectionCard({
  audience,
  section,
  canReorderSections,
  onSectionTitleChange,
  onItemFieldChange,
  onItemDragEnd,
}: {
  audience: EditableAudience;
  section: NewsletterSection;
  canReorderSections: boolean;
  onSectionTitleChange: (sectionId: string, value: string) => void;
  onItemFieldChange: (
    sectionId: string,
    itemId: string,
    field: "title" | "body",
    value: string,
  ) => void;
  onItemDragEnd: (sectionId: string, event: DragEndEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id });
  const sectionDragHandleProps = canReorderSections
    ? { ...attributes, ...listeners }
    : {};
  const itemSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "rounded-2xl border border-border/80 bg-background/75 p-5",
        isDragging && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Input
            value={section.title}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onSectionTitleChange(section.id, event.target.value)
            }
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {formatDisplayLabel(section.kind)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{section.items.length} items</Badge>
          <button
            type="button"
            aria-label={`Reorder section ${section.title}`}
            title={
              canReorderSections
                ? "Drag to reorder this section"
                : "Add another section to this draft before reordering."
            }
            disabled={!canReorderSections}
            className={cn(
              "rounded-xl border border-border/80 bg-background/60 px-2 py-1 text-xs text-muted-foreground",
              !canReorderSections && "cursor-not-allowed opacity-50",
            )}
            {...sectionDragHandleProps}
          >
            Drag
          </button>
        </div>
      </div>
      <div className="mt-4">
        <DndContext
          sensors={itemSensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => onItemDragEnd(section.id, event)}
        >
          <SortableContext
            items={section.items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {section.items.map((item) => (
                <SortableNewsletterItemCard
                  key={`${audience}-${section.id}-${item.id}`}
                  item={item}
                  canReorder={section.items.length > 1}
                  onChange={(field, value) =>
                    onItemFieldChange(section.id, item.id, field, value)
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {section.items.length < 2 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Add another card to this section before reordering within it.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function NewsletterView({
  state,
  newsletterDrafts,
  onDuplicate,
  onUpdateDraftField,
  onUpdateSectionTitle,
  onUpdateItemField,
  onSectionDragEnd,
  onItemDragEnd,
  onPlaceSuggestion,
  onSaveDraft,
  isMutating,
}: {
  state: DemoState;
  newsletterDrafts: NewsletterDraftMap;
  onDuplicate: () => void;
  onUpdateDraftField: (
    audience: EditableAudience,
    field: "title" | "summary",
    value: string,
  ) => void;
  onUpdateSectionTitle: (
    audience: EditableAudience,
    sectionId: string,
    value: string,
  ) => void;
  onUpdateItemField: (
    audience: EditableAudience,
    sectionId: string,
    itemId: string,
    field: "title" | "body",
    value: string,
  ) => void;
  onSectionDragEnd: (audience: EditableAudience, event: DragEndEvent) => void;
  onItemDragEnd: (
    audience: EditableAudience,
    sectionId: string,
    event: DragEndEvent,
  ) => void;
  onPlaceSuggestion: (audience: EditableAudience, suggestion: ExtractedContentItem) => void;
  onSaveDraft: (audience: EditableAudience) => void;
  isMutating: boolean;
}) {
  const sectionSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );
  const locallyPlacedSuggestions = new Set(
    Object.values(newsletterDrafts).flatMap((draft) =>
      draft.sections.flatMap((section) =>
        section.items.map((item) =>
          getSuggestionKey({
            title: item.title,
            summary: item.body,
          }),
        ),
      ),
    ),
  );
  const visibleSuggestions = state.inbox.unplacedSuggestions.filter(
    (item) => !locallyPlacedSuggestions.has(getSuggestionKey(item)),
  );

  return (
    <div className="grid gap-4 2xl:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-4">
        {(["board", "teachers"] as const).map((audience) => {
          const draft = newsletterDrafts[audience];
          const baseline = state.newsletters[audience];
          const hasUnsavedChanges =
            JSON.stringify(draft) !== JSON.stringify(baseline);

          return (
            <Card key={audience} className="brand-panel">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <NotePencil className="size-4" />
                    {formatDisplayLabel(audience)} editor
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusIndicator status={draft.status} />
                    {draft.delivery?.directUrl ? (
                      <Badge variant="outline">Direct link captured</Badge>
                    ) : null}
                  </div>
                </CardTitle>
                <CardDescription>
                  Inline editing and drag/drop reordering stay local until you save the draft.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_1.2fr]">
                  <Input
                    value={draft.title}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      onUpdateDraftField(audience, "title", event.target.value)
                    }
                  />
                  <Textarea
                    value={draft.summary}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      onUpdateDraftField(audience, "summary", event.target.value)
                    }
                    className="min-h-24"
                  />
                </div>

                <DndContext
                  sensors={sectionSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => onSectionDragEnd(audience, event)}
                >
                  <SortableContext
                    items={draft.sections.map((section) => section.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-4">
                      {draft.sections.map((section) => (
                        <SortableNewsletterSectionCard
                          key={`${audience}-${section.id}`}
                          audience={audience}
                          section={section}
                          canReorderSections={draft.sections.length > 1}
                          onSectionTitleChange={(sectionId, value) =>
                            onUpdateSectionTitle(audience, sectionId, value)
                          }
                          onItemFieldChange={(sectionId, itemId, field, value) =>
                            onUpdateItemField(
                              audience,
                              sectionId,
                              itemId,
                              field,
                              value,
                            )
                          }
                          onItemDragEnd={(sectionId, event) =>
                            onItemDragEnd(audience, sectionId, event)
                          }
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                {draft.sections.length < 2 ? (
                  <p className="text-xs text-muted-foreground">
                    Add another section to this draft before reordering sections.
                  </p>
                ) : null}
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2 border-t">
                <Button onClick={() => onSaveDraft(audience)} disabled={isMutating}>
                  Save {formatDisplayLabel(audience)} draft
                </Button>
                <Button variant="outline" onClick={onDuplicate} disabled={isMutating}>
                  Duplicate last newsletter
                </Button>
                {hasUnsavedChanges ? (
                  <Badge variant="secondary">Unsaved changes</Badge>
                ) : (
                  <Badge variant="outline">Saved</Badge>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <div className="space-y-4">
        <Card className="brand-panel">
          <CardHeader>
            <CardTitle>Unplaced suggestions</CardTitle>
            <CardDescription>
              Place extracted items into the board or teacher draft without overwriting your current edits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleSuggestions.length ? (
              visibleSuggestions.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-border/80 bg-background/75 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{item.title}</p>
                    <StatusIndicator status={item.priority} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">{formatDisplayLabel(item.source)}</Badge>
                    <Badge variant="outline">
                      {formatDisplayLabel(item.recommendedPlacement)}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPlaceSuggestion("board", item)}
                    >
                      Add to board
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPlaceSuggestion("teachers", item)}
                    >
                      Add to teachers
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border/80 bg-background/60 p-4 text-sm text-muted-foreground">
                All extracted suggestions are already placed in the editable drafts.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="brand-panel">
          <CardHeader>
            <CardTitle>Parent preview</CardTitle>
            <CardDescription>
              The parent version stays read-only here and is derived from the published teacher draft on Sunday.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/80 bg-background/75 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{state.newsletters.parents.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {state.newsletters.parents.summary}
                  </p>
                </div>
                <StatusIndicator status={state.newsletters.parents.status} />
              </div>
            </div>

            {state.newsletters.parents.sections.map((section) => (
              <div
                key={section.id}
                className="rounded-2xl border border-border/80 bg-background/75 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{section.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDisplayLabel(section.kind)}
                    </p>
                  </div>
                  <Badge variant="outline">{section.items.length} items</Badge>
                </div>
                <div className="mt-3 space-y-3">
                  {section.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-border/70 bg-card p-3"
                    >
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="brand-panel">
          <CardHeader>
            <CardTitle>Flyer recommendations</CardTitle>
            <CardDescription>
              Flyer generation stays optional and school/PTA friendly in v1.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {state.flyerRecommendations.map((recommendation) => (
              <div
                key={recommendation.id}
                className="overflow-hidden rounded-2xl border border-border/80 bg-background/75"
              >
                <FlyerPreviewMedia
                  key={`${recommendation.id}-${recommendation.imageUrl ?? "fallback"}`}
                  title={recommendation.title}
                  imageUrl={recommendation.imageUrl}
                />
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{recommendation.title}</p>
                    <StatusIndicator status={recommendation.status} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {recommendation.reason}
                  </p>
                  <p className="mt-3 rounded-2xl bg-muted/60 p-3 text-xs leading-6 text-muted-foreground">
                    {recommendation.brief}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActionsView({
  state,
  approvalDrafts,
  manualStepDrafts,
  onDraftChange,
  onSave,
  onApprove,
  onReject,
  onRetry,
  onManualStepDraftChange,
  onCompleteManualStep,
  isMutating,
}: {
  state: DemoState;
  approvalDrafts: Record<string, ApprovalEditInput>;
  manualStepDrafts: ManualStepDraftMap;
  onDraftChange: (
    actionId: string,
    field: keyof ApprovalEditInput,
    value: string,
  ) => void;
  onSave: (actionId: string) => void;
  onApprove: (actionId: string) => void;
  onReject: (actionId: string) => void;
  onRetry: (actionId: string) => void;
  onManualStepDraftChange: (
    actionId: string,
    stepId: string,
    field: keyof ManualStepDraft,
    value: string,
  ) => void;
  onCompleteManualStep: (actionId: string, stepId: string) => void;
  isMutating: boolean;
}) {
  return (
    <div className="space-y-4">
      {state.approvals.map((approval) => {
        const executionStatus = deriveApprovalExecutionStatus(approval);
        const steps = getApprovalSteps(approval);
        const draft = approvalDrafts[approval.id] ?? {
          subject: approval.subject,
          body: approval.body,
        };

        return (
          <Card
            key={approval.id}
            className="brand-panel"
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>{approval.title}</span>
                <div className="flex items-center gap-2">
                  <StatusIndicator status={approval.status} />
                  <StatusIndicator status={executionStatus} />
                </div>
              </CardTitle>
              <CardDescription>
                {formatDisplayLabel(approval.channel)} •{" "}
                {formatDisplayLabel(approval.audience)} • created{" "}
                {formatDateTime(approval.createdAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/80 bg-background/75 p-4 text-sm text-muted-foreground">
                {approval.rationale}
                {approval.scheduledFor ? (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <ClockCountdown className="size-4" />
                    Proposed timing: {formatDateTime(approval.scheduledFor)}
                  </div>
                ) : null}
              </div>
              {approval.gmailExecution ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-950">
                  <p className="font-medium">
                    Gmail {approval.gmailExecution.lastAction === "sent" ? "send" : "draft"}{" "}
                    synced via{" "}
                    {approval.gmailExecution.deliveryPath === "identity_provider"
                      ? "Auth0 identity fallback"
                      : formatDisplayLabel(approval.gmailExecution.deliveryPath)}
                  </p>
                  <p className="mt-1 text-xs text-emerald-900/80">
                    {approval.gmailExecution.note ?? "Live Gmail metadata is available for this action."}
                  </p>
                  <p className="mt-2 text-xs text-emerald-900/80">
                    Updated {formatDateTime(approval.gmailExecution.updatedAt)}
                  </p>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor={`${approval.id}-subject`}>Subject</Label>
                <Input
                  id={`${approval.id}-subject`}
                  value={draft.subject}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    onDraftChange(approval.id, "subject", event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${approval.id}-body`}>Body / execution note</Label>
                <Textarea
                  id={`${approval.id}-body`}
                  value={draft.body}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    onDraftChange(approval.id, "body", event.target.value)
                  }
                  className="min-h-32"
                />
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium">Execution steps</p>
                {steps.map((step) => {
                  const manualDraft =
                    manualStepDrafts[stepDraftKey(approval.id, step.id)] ?? {};

                  return (
                    <div
                      key={step.id}
                      className="rounded-2xl border border-border/80 bg-background/75 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{step.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDisplayLabel(step.type)}
                          </p>
                        </div>
                        <StatusIndicator status={step.status} />
                      </div>
                      {step.note ? (
                        <p className="mt-2 text-sm text-muted-foreground">{step.note}</p>
                      ) : null}
                      {step.errorMessage ? (
                        <p className="mt-2 text-sm text-rose-200">{step.errorMessage}</p>
                      ) : null}
                      {step.externalUrl ? (
                        <a
                          href={step.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
                        >
                          Open external step
                        </a>
                      ) : null}

                      {step.status === "needs_operator" ? (
                        <div className="mt-4 space-y-3 rounded-2xl border border-dashed border-primary/20 bg-primary/[0.06] p-4">
                          <Textarea
                            value={manualDraft.note ?? ""}
                            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                              onManualStepDraftChange(
                                approval.id,
                                step.id,
                                "note",
                                event.target.value,
                              )
                            }
                            placeholder="Operator note"
                            className="min-h-24"
                          />
                          <div className="grid gap-3 md:grid-cols-2">
                            <Input
                              value={manualDraft.directUrl ?? ""}
                              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                onManualStepDraftChange(
                                  approval.id,
                                  step.id,
                                  "directUrl",
                                  event.target.value,
                                )
                              }
                              placeholder="Direct URL"
                            />
                            <Input
                              value={manualDraft.externalId ?? ""}
                              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                onManualStepDraftChange(
                                  approval.id,
                                  step.id,
                                  "externalId",
                                  event.target.value,
                                )
                              }
                              placeholder="External ID"
                            />
                          </div>
                          <Input
                            value={manualDraft.scheduledFor ?? ""}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              onManualStepDraftChange(
                                approval.id,
                                step.id,
                                "scheduledFor",
                                event.target.value,
                              )
                            }
                            placeholder="Scheduled timestamp"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onCompleteManualStep(approval.id, step.id)}
                            disabled={isMutating}
                          >
                            Mark step complete
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSave(approval.id)}
                disabled={isMutating}
              >
                Save edits
              </Button>
              <Button
                size="sm"
                onClick={() => onApprove(approval.id)}
                disabled={isMutating}
              >
                Approve
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onReject(approval.id)}
                disabled={isMutating}
              >
                Reject
              </Button>
              {["failed", "needs_operator"].includes(executionStatus) ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRetry(approval.id)}
                  disabled={isMutating}
                >
                  Retry execution
                </Button>
              ) : null}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}

function AuditView({ state }: { state: DemoState }) {
  return (
    <Card className="brand-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDots className="size-4" />
          Audit trail
        </CardTitle>
        <CardDescription>
          Every suggestion, approval, ingestion step, and execution is tracked
          with a timestamp and integration label.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[760px] pr-4">
          <div className="space-y-3">
            {state.auditLog.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl border border-border/80 bg-background/75 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {formatDisplayLabel(entry.integration)}
                    </Badge>
                    <Badge variant="secondary">
                      {formatDisplayLabel(entry.kind)}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(entry.timestamp)}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6">{entry.summary}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
