export type IntegrationMode = "mock" | "live" | "manual";

export type IntegrationStatus =
  | "connected"
  | "needs_setup"
  | "mock_ready"
  | "manual_ready"
  | "pending";

export type WorkflowStage =
  | "monday_reminder"
  | "collect_updates"
  | "wednesday_draft"
  | "thursday_teacher_release"
  | "sunday_parent_schedule";

export type MessageSource = "gmail" | "whatsapp" | "imessage";

export type AudienceVersion = "board" | "teachers" | "parents";

export type ContentPriority = "urgent" | "time_sensitive" | "evergreen";

export type ApprovalActionType =
  | "send_reminder_email"
  | "send_board_draft_email"
  | "publish_teacher_version"
  | "schedule_parent_version";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Contact {
  id: string;
  name: string;
  role: string;
  email: string;
}

export interface SchoolBreak {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

export interface PlannerTimelineEntry {
  stage: WorkflowStage;
  label: string;
  targetTime: string;
  status: "done" | "active" | "upcoming";
}

export interface IntegrationConfig {
  mode: IntegrationMode;
  status: IntegrationStatus;
  description: string;
  connectedAccountLabel?: string;
}

export interface SetupState {
  auth0AccountEmail?: string;
  contacts: Contact[];
  schoolBreaks: SchoolBreak[];
  integrations: {
    auth0: IntegrationConfig;
    gmail: IntegrationConfig;
    membershipToolkit: IntegrationConfig;
    mockMessages: IntegrationConfig;
    flyer: IntegrationConfig;
  };
}

export interface GmailMessage {
  id: string;
  sender: string;
  senderEmail: string;
  sentAt: string;
  body: string;
}

export interface GmailThread {
  id: string;
  subject: string;
  lastUpdatedAt: string;
  messages: GmailMessage[];
}

export interface MockMessage {
  id: string;
  source: MessageSource;
  sender: string;
  sentAt: string;
  body: string;
  imageUrl?: string;
}

export interface ExtractedContentItem {
  id: string;
  title: string;
  summary: string;
  source: MessageSource;
  sourceRef: string;
  priority: ContentPriority;
  recommendedPlacement: string;
  recommendedAsFlyer: boolean;
}

export interface NewsletterItem {
  id: string;
  title: string;
  body: string;
  priority: ContentPriority;
  sourceBadges: string[];
  flyerRecommended?: boolean;
}

export interface NewsletterSection {
  id: string;
  title: string;
  kind:
    | "urgent_schoolwide"
    | "events"
    | "community"
    | "teacher_note"
    | "principal_note"
    | "flyer";
  items: NewsletterItem[];
}

export interface NewsletterDraft {
  id: string;
  audience: AudienceVersion;
  title: string;
  summary: string;
  status: "draft" | "published" | "scheduled";
  sections: NewsletterSection[];
  scheduledFor?: string;
  publishedAt?: string;
  sourceNewsletterId?: string;
}

export interface FlyerRecommendation {
  id: string;
  title: string;
  brief: string;
  reason: string;
  status: "recommended" | "generated" | "dismissed";
  imageUrl?: string;
}

export interface ApprovalAction {
  id: string;
  type: ApprovalActionType;
  title: string;
  audience: AudienceVersion | "members";
  channel: "gmail" | "membership_toolkit";
  status: ApprovalStatus;
  subject: string;
  body: string;
  scheduledFor?: string;
  rationale: string;
  requiresHumanApproval: true;
  createdAt: string;
  updatedAt: string;
  gmailExecution?: {
    deliveryPath: "mock" | "token_vault" | "identity_provider";
    lastAction: "draft_saved" | "sent";
    draftId?: string;
    draftMessageId?: string;
    threadId?: string;
    sentMessageId?: string;
    note?: string;
    updatedAt: string;
  };
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  integration: string;
  kind: "suggestion" | "execution" | "approval" | "ingestion";
  summary: string;
}

export interface PlannerState {
  currentStage: WorkflowStage;
  timeline: PlannerTimelineEntry[];
  skipNextParentSend: boolean;
  skipReason?: string;
}

export interface PlannerUpdateInput {
  currentStage: WorkflowStage;
  timeline: PlannerTimelineEntry[];
}

export interface InboxState {
  gmailThreads: GmailThread[];
  mockMessages: MockMessage[];
  extractedItems: ExtractedContentItem[];
}

export interface DemoState {
  weekOf: string;
  workspaceTitle: string;
  setup: SetupState;
  planner: PlannerState;
  inbox: InboxState;
  newsletters: {
    board: NewsletterDraft;
    teachers: NewsletterDraft;
    parents: NewsletterDraft;
    lastPublishedParent: NewsletterDraft;
  };
  flyerRecommendations: FlyerRecommendation[];
  approvals: ApprovalAction[];
  auditLog: AuditEntry[];
}

export interface SetupUpdateInput {
  auth0AccountEmail?: string;
  contacts?: Contact[];
  schoolBreaks?: SchoolBreak[];
  integrations?: Partial<SetupState["integrations"]>;
  planner?: PlannerUpdateInput;
}

export interface AddMockMessageInput {
  source: Extract<MockMessage["source"], "whatsapp" | "imessage">;
  sender: string;
  body: string;
  imageUrl?: string;
}

export interface ApprovalEditInput {
  subject: string;
  body: string;
}
