/* eslint-disable @next/next/no-img-element */
"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
  type Dispatch,
  type SetStateAction,
} from "react";
import { format } from "date-fns";
import {
  ArrowClockwise,
  CalendarDots,
  ChatsCircle,
  ClockCountdown,
  EnvelopeSimple,
  GearSix,
  ListChecks,
  NotePencil,
  ShieldCheck,
} from "@phosphor-icons/react";
import type {
  AddMockMessageInput,
  ApprovalAction,
  ApprovalEditInput,
  AudienceVersion,
  Contact,
  DemoState,
  IntegrationConfig,
  IntegrationMode,
  IntegrationStatus,
  SchoolBreak,
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
  schoolBreaks: SchoolBreak[];
  integrations: DemoState["setup"]["integrations"];
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
    schoolBreaks: structuredClone(state.setup.schoolBreaks),
    integrations: structuredClone(state.setup.integrations),
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

function statusBadgeVariant(status: string) {
  if (status === "connected" || status === "approved" || status === "done") {
    return "default" as const;
  }

  if (status === "needs_setup" || status === "rejected") {
    return "destructive" as const;
  }

  return "secondary" as const;
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

  if (authStatus.gmail.liveReady) {
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
  const [approvalDrafts, setApprovalDrafts] = useState<ApprovalDraftMap>(
    createApprovalDrafts(seedDemoState.approvals),
  );
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [authStatusError, setAuthStatusError] = useState<string | null>(null);
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
  }, [snapshot]);

  const refreshAuthStatus = useEffectEvent(async () => {
    if (!authEnabled) {
      setAuthStatus(null);
      setAuthStatusError(null);
      return;
    }

    try {
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
    }
  });

  useEffect(() => {
    void refreshAuthStatus();
  }, [authEnabled, user?.sub]);

  const effectiveTokenVaultConfigured =
    authStatus?.tokenVault.configured ?? tokenVaultConfigured;

  function selectView(nextView: ViewKey) {
    setActiveView(nextView);
    requestAnimationFrame(() => {
      mainRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
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
          body: JSON.stringify(setupDraft),
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

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_16%_12%,rgba(45,200,255,0.18),transparent_32%),radial-gradient(circle_at_84%_8%,rgba(73,112,255,0.2),transparent_28%)]" />
      <div className="relative mx-auto grid max-w-[1680px] gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
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
            <CardContent className="space-y-5">
              <div className="rounded-2xl border border-border/80 bg-background/85 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Current workspace</p>
                    <p className="text-sm text-muted-foreground">
                      {snapshot.workspaceTitle}
                    </p>
                  </div>
                  <Badge variant="secondary">{snapshot.planner.currentStage}</Badge>
                </div>
                <Separator className="my-4" />
                <div className="space-y-3">
                  {snapshot.planner.timeline.map((stage) => (
                    <button
                      key={stage.stage}
                      type="button"
                      onClick={() => {
                        if (stage.stage === "collect_updates") {
                          selectView("inbox");
                          return;
                        }
                        if (stage.stage === "wednesday_draft") {
                          selectView("newsletter");
                          return;
                        }
                        if (
                          stage.stage === "monday_reminder" ||
                          stage.stage === "thursday_teacher_release" ||
                          stage.stage === "sunday_parent_schedule"
                        ) {
                          selectView("actions");
                        }
                      }}
                      className="flex w-full items-start justify-between rounded-2xl border border-transparent px-3 py-2 text-left transition hover:border-border hover:bg-muted/60"
                    >
                      <div>
                        <p className="text-sm font-medium">{stage.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(stage.targetTime)}
                        </p>
                      </div>
                      <Badge variant={statusBadgeVariant(stage.status)}>
                        {stage.status}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="px-1 text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                  Workspace views
                </p>
                {viewDefinitions.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectView(key)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition",
                      activeView === key
                        ? "border-primary/40 bg-primary/10"
                        : "border-transparent bg-background/70 hover:border-border hover:bg-background",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="size-4" />
                      <span className="text-sm font-medium">{label}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {key === "actions"
                        ? snapshot.approvals.filter(
                            (approval) => approval.status === "pending",
                          ).length
                        : key === "audit"
                          ? snapshot.auditLog.length
                          : ""}
                    </span>
                  </button>
                ))}
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
                  onClick={() => void refreshSnapshot()}
                  disabled={isMutating}
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

          {activeView === "setup" ? (
            <SetupView
              setupDraft={setupDraft}
              authEnabled={authEnabled}
              gmailConnectUrl={gmailConnectUrl}
              authStatus={authStatus}
              authStatusError={authStatusError}
              user={user}
              onAuth0EmailChange={(value) =>
                setSetupDraft((current) => ({
                  ...current,
                  auth0AccountEmail: value,
                }))
              }
              onIntegrationModeChange={updateIntegrationMode}
              onAddContact={addContactToDraft}
              onAddBreak={addBreakToDraft}
              newContact={newContact}
              newBreak={newBreak}
              setNewContact={setNewContact}
              setNewBreak={setNewBreak}
              onSave={() => void saveSetupDraft()}
              isMutating={isMutating}
            />
          ) : null}

          {activeView === "inbox" ? (
            <InboxView
              state={snapshot}
              mockMessageDraft={mockMessageDraft}
              setMockMessageDraft={setMockMessageDraft}
              onIngest={() => void ingestUpdates()}
              onSubmitMockMessage={() => void submitMockMessage()}
              isMutating={isMutating}
            />
          ) : null}

          {activeView === "newsletter" ? (
            <NewsletterView
              state={snapshot}
              onDuplicate={() => void duplicateNewsletter()}
              isMutating={isMutating}
            />
          ) : null}

          {activeView === "actions" ? (
            <ActionsView
              state={snapshot}
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
              onSave={saveApproval}
              onApprove={approveAction}
              onReject={rejectAction}
              isMutating={isMutating}
            />
          ) : null}

          {activeView === "audit" ? <AuditView state={snapshot} /> : null}
        </main>

        <aside className="xl:sticky xl:top-4 xl:self-start">
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
                          {approval.channel} • {approval.audience}
                        </p>
                      </div>
                      <Badge variant={statusBadgeVariant(approval.status)}>
                        {approval.status}
                      </Badge>
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
                        <Badge variant="outline">{entry.integration}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(entry.timestamp)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium">{entry.summary}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.kind}
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
  user,
  onAuth0EmailChange,
  onIntegrationModeChange,
  onAddContact,
  onAddBreak,
  newContact,
  newBreak,
  setNewContact,
  setNewBreak,
  onSave,
  isMutating,
}: {
  setupDraft: SetupDraft;
  authEnabled: boolean;
  gmailConnectUrl: string;
  authStatus: AuthStatusResponse | null;
  authStatusError: string | null;
  user?: Viewer | null;
  onAuth0EmailChange: (value: string) => void;
  onIntegrationModeChange: (
    key: keyof SetupDraft["integrations"],
    mode: IntegrationMode,
  ) => void;
  onAddContact: () => void;
  onAddBreak: () => void;
  newContact: { name: string; role: string; email: string };
  newBreak: { name: string; startsOn: string; endsOn: string };
  setNewContact: Dispatch<
    SetStateAction<{ name: string; role: string; email: string }>
  >;
  setNewBreak: Dispatch<
    SetStateAction<{ name: string; startsOn: string; endsOn: string }>
  >;
  onSave: () => void;
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
        variant: authStatus.gmail.liveReady ? "default" : "secondary",
        label: authStatus.gmail.liveReady ? "live ready" : "not ready",
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
    : authStatus?.gmail.note ??
      "Sign in with Auth0 and request Gmail scopes to verify Token Vault connection status.";

  return (
    <div className="grid gap-4 2xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="brand-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            Auth and integrations
          </CardTitle>
          <CardDescription>
            Configure demo identity, Token Vault status, and mock/live adapter
            modes.
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
            <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
              <p className="text-sm font-medium">Human approval guardrail</p>
              <p className="mt-2 text-sm text-muted-foreground">
                PTA Pilot never silently sends, publishes, or schedules. The
                right rail remains the control point for risky actions.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">Live Gmail via Token Vault</p>
                  <Badge variant={liveGmailBadge.variant}>{liveGmailBadge.label}</Badge>
                  <Badge variant={managementBadge.variant}>
                    Mgmt API {managementBadge.label}
                  </Badge>
                  <Badge variant="outline">
                    Path {actionPathLabel}
                  </Badge>
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
                  <a href={gmailConnectUrl}>
                    {user?.email ? "Reconnect Gmail" : "Log in with Google + Gmail"}
                  </a>
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
                className="rounded-2xl border border-border/80 bg-background/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {key.replace(/([A-Z])/g, " $1")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {integration.description}
                    </p>
                  </div>
                  <Badge variant={statusBadgeVariant(integration.status)}>
                    {integration.status}
                  </Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(["mock", "live", "manual"] as IntegrationMode[]).map((mode) => (
                    <Button
                      key={mode}
                      type="button"
                      size="xs"
                      variant={integration.mode === mode ? "default" : "outline"}
                      onClick={() => onIntegrationModeChange(key, mode)}
                      disabled={
                        key === "mockMessages" && mode !== "mock"
                      }
                    >
                      {mode}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter className="border-t">
          <Button onClick={onSave} disabled={isMutating}>
            Save setup
          </Button>
        </CardFooter>
      </Card>

      <div className="space-y-4">
        <Card className="brand-panel">
          <CardHeader>
            <CardTitle>Recurring contacts</CardTitle>
            <CardDescription>
              Principal, Teacher Rep, and PTA board reviewers for recurring
              workflow messages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {setupDraft.contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="rounded-2xl border border-border/80 bg-background/70 p-4"
                >
                  <p className="text-sm font-medium">{contact.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {contact.role} • {contact.email}
                  </p>
                </div>
              ))}
            </div>
            <Separator />
            <div className="grid gap-3 md:grid-cols-3">
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
            <Button variant="outline" size="sm" onClick={onAddContact}>
              Add contact
            </Button>
          </CardContent>
        </Card>

        <Card className="brand-panel">
          <CardHeader>
            <CardTitle>School breaks</CardTitle>
            <CardDescription>
              Sunday scheduling checks this calendar before allowing parent
              newsletter release.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {setupDraft.schoolBreaks.map((schoolBreak) => (
                <div
                  key={schoolBreak.id}
                  className="rounded-2xl border border-border/80 bg-background/70 p-4"
                >
                  <p className="text-sm font-medium">{schoolBreak.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {schoolBreak.startsOn} to {schoolBreak.endsOn}
                  </p>
                </div>
              ))}
            </div>
            <Separator />
            <div className="grid gap-3 md:grid-cols-3">
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
            <Button variant="outline" size="sm" onClick={onAddBreak}>
              Add break
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InboxView({
  state,
  mockMessageDraft,
  setMockMessageDraft,
  onIngest,
  onSubmitMockMessage,
  isMutating,
}: {
  state: DemoState;
  mockMessageDraft: AddMockMessageInput;
  setMockMessageDraft: Dispatch<SetStateAction<AddMockMessageInput>>;
  onIngest: () => void;
  onSubmitMockMessage: () => void;
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
                        {message.source} • {formatDateTime(message.sentAt)}
                      </p>
                    </div>
                    <Badge variant="outline">{message.source}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6">{message.body}</p>
                  {message.imageUrl ? (
                    <img
                      src={message.imageUrl}
                      alt={message.body}
                      className="mt-3 h-36 w-full rounded-2xl object-cover"
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
                  {source}
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
            {state.inbox.extractedItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-border/80 bg-background/75 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{item.title}</p>
                  <Badge variant={statusBadgeVariant(item.priority)}>
                    {item.priority}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">{item.source}</Badge>
                  <Badge variant="outline">{item.recommendedPlacement}</Badge>
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

function NewsletterView({
  state,
  onDuplicate,
  isMutating,
}: {
  state: DemoState;
  onDuplicate: () => void;
  isMutating: boolean;
}) {
  return (
    <div className="grid gap-4 2xl:grid-cols-[1.15fr_0.85fr]">
      <Card className="brand-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <NotePencil className="size-4" />
            Newsletter editor
          </CardTitle>
          <CardDescription>
            Fixed section ordering keeps urgent and time-sensitive content above
            evergreen items.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={onDuplicate} disabled={isMutating}>
              Duplicate last newsletter
            </Button>
            <Badge variant="outline">Audience: board</Badge>
            <Badge variant="secondary">{state.newsletters.board.status}</Badge>
          </div>
          {state.newsletters.board.sections.map((section) => (
            <div
              key={section.id}
              className="rounded-2xl border border-border/80 bg-background/75 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{section.title}</p>
                  <p className="text-xs text-muted-foreground">{section.kind}</p>
                </div>
                <Badge variant="outline">{section.items.length} items</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {section.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-border/70 bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {item.body}
                        </p>
                      </div>
                      <Badge variant={statusBadgeVariant(item.priority)}>
                        {item.priority}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.sourceBadges.map((badge) => (
                        <Badge key={badge} variant="outline">
                          {badge}
                        </Badge>
                      ))}
                      {item.flyerRecommended ? (
                        <Badge variant="secondary">Flyer recommended</Badge>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="brand-panel">
          <CardHeader>
            <CardTitle>Audience variants</CardTitle>
            <CardDescription>
              Teacher and parent versions stay separated from the board draft.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(
              ["teachers", "parents"] as Array<AudienceVersion>
            ).map((audience) => (
              <div
                key={audience}
                className="rounded-2xl border border-border/80 bg-background/75 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium capitalize">{audience}</p>
                    <p className="text-xs text-muted-foreground">
                      {state.newsletters[audience].title}
                    </p>
                  </div>
                  <Badge variant={statusBadgeVariant(state.newsletters[audience].status)}>
                    {state.newsletters[audience].status}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {state.newsletters[audience].summary}
                </p>
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
                {recommendation.imageUrl ? (
                  <img
                    src={recommendation.imageUrl}
                    alt={recommendation.title}
                    className="h-40 w-full object-cover"
                  />
                ) : null}
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{recommendation.title}</p>
                    <Badge variant="secondary">{recommendation.status}</Badge>
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
  onDraftChange,
  onSave,
  onApprove,
  onReject,
  isMutating,
}: {
  state: DemoState;
  approvalDrafts: Record<string, ApprovalEditInput>;
  onDraftChange: (
    actionId: string,
    field: keyof ApprovalEditInput,
    value: string,
  ) => void;
  onSave: (actionId: string) => void;
  onApprove: (actionId: string) => void;
  onReject: (actionId: string) => void;
  isMutating: boolean;
}) {
  return (
    <div className="space-y-4">
      {state.approvals.map((approval) => {
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
                <Badge variant={statusBadgeVariant(approval.status)}>
                  {approval.status}
                </Badge>
              </CardTitle>
              <CardDescription>
                {approval.channel} • {approval.audience} • created{" "}
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
                      : approval.gmailExecution.deliveryPath}
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
                    <Badge variant="outline">{entry.integration}</Badge>
                    <Badge variant="secondary">{entry.kind}</Badge>
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
