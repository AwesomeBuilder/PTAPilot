/* eslint-disable @next/next/no-img-element */
"use client";

import {
  startTransition,
  useEffect,
  useEffectEvent,
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
  Sparkle,
} from "@phosphor-icons/react";
import type {
  AddMockMessageInput,
  ApprovalAction,
  ApprovalEditInput,
  AudienceVersion,
  Contact,
  DemoState,
  IntegrationMode,
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
  const [mockMessageDraft, setMockMessageDraft] = useState<AddMockMessageInput>({
    source: "whatsapp",
    sender: "Demo sender",
    body: "",
    imageUrl: "",
  });

  useEffect(() => {
    void refreshSnapshot();
  }, []);

  useEffect(() => {
    setSetupDraft(createSetupDraft(snapshot));
    setApprovalDrafts(createApprovalDrafts(snapshot.approvals));
  }, [snapshot]);

  async function refreshSnapshot() {
    try {
      const nextState = await fetchJson<DemoState>("/api/bootstrap");
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
  }

  const refreshAuthStatus = useEffectEvent(async () => {
    if (!authEnabled) {
      setAuthStatus(null);
      return;
    }

    try {
      const query = user?.sub ? `?userId=${encodeURIComponent(user.sub)}` : "";
      const nextStatus = await fetchJson<AuthStatusResponse>(
        `/api/auth/status${query}`,
      );
      setAuthStatus(nextStatus);
    } catch {
      setAuthStatus(null);
    }
  });

  useEffect(() => {
    void refreshAuthStatus();
  }, [authEnabled, user?.sub]);

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
        fetchJson<DemoState>("/api/inbox/ingest", {
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
        fetchJson<DemoState>(`/api/actions/${actionId}/edit`, {
          method: "POST",
          body: JSON.stringify(draft),
        }),
      "Approval draft updated.",
    );
  }

  async function approveAction(actionId: string) {
    await runMutation(
      "Approving risky action",
      () =>
        fetchJson<DemoState>(`/api/actions/${actionId}/approve`, {
          method: "POST",
        }),
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
    <div className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1680px] gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside className="xl:sticky xl:top-4 xl:self-start">
          <Card className="border border-white/40 bg-white/75 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <Sparkle className="size-5" />
                </div>
                PTA Pilot
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
                          setActiveView("inbox");
                          return;
                        }
                        if (stage.stage === "wednesday_draft") {
                          setActiveView("newsletter");
                          return;
                        }
                        if (
                          stage.stage === "monday_reminder" ||
                          stage.stage === "thursday_teacher_release" ||
                          stage.stage === "sunday_parent_schedule"
                        ) {
                          setActiveView("actions");
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
                    onClick={() => setActiveView(key)}
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

        <main className="space-y-4">
          <Card className="border border-white/40 bg-white/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-3">
                <span>Believable hackathon demo flow</span>
                <Badge variant={tokenVaultConfigured ? "default" : "secondary"}>
                  Token Vault {tokenVaultConfigured ? "configured" : "scaffolded"}
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
                      "inline-flex rounded-full px-3 py-1 text-xs font-medium",
                      notice.tone === "success" && "bg-emerald-100 text-emerald-900",
                      notice.tone === "error" && "bg-rose-100 text-rose-900",
                      notice.tone === "info" && "bg-slate-100 text-slate-900",
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
          <Card className="border border-white/40 bg-white/80 backdrop-blur">
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
  return (
    <div className="grid gap-4 2xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="border border-white/40 bg-white/80 backdrop-blur">
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
                  <Badge
                    variant={
                      authStatus?.gmail.liveReady ? "default" : "secondary"
                    }
                  >
                    {authStatus?.gmail.liveReady ? "live ready" : "not ready"}
                  </Badge>
                  <Badge
                    variant={
                      authStatus?.managementApi.configured ? "secondary" : "outline"
                    }
                  >
                    Mgmt API{" "}
                    {authStatus?.managementApi.configured
                      ? "configured"
                      : "not configured"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {authStatus?.gmail.note ??
                    "Sign in with Auth0 and request Gmail scopes to verify Token Vault connection status."}
                </p>
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
            {(
              Object.entries(setupDraft.integrations) as Array<
                [keyof SetupDraft["integrations"], SetupDraft["integrations"][keyof SetupDraft["integrations"]]]
              >
            ).map(([key, integration]) => (
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
        <Card className="border border-white/40 bg-white/80 backdrop-blur">
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

        <Card className="border border-white/40 bg-white/80 backdrop-blur">
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
      <Card className="border border-white/40 bg-white/80 backdrop-blur">
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
        <Card className="border border-white/40 bg-white/80 backdrop-blur">
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

        <Card className="border border-white/40 bg-white/80 backdrop-blur">
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
      <Card className="border border-white/40 bg-white/80 backdrop-blur">
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
        <Card className="border border-white/40 bg-white/80 backdrop-blur">
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

        <Card className="border border-white/40 bg-white/80 backdrop-blur">
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
            className="border border-white/40 bg-white/80 backdrop-blur"
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
    <Card className="border border-white/40 bg-white/80 backdrop-blur">
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
