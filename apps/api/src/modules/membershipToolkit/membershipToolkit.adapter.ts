import type {
  ApprovalExecutionStep,
  DemoState,
  MembershipToolkitBaseline,
  NewsletterDraft,
} from "@pta-pilot/shared";
import { env } from "../../config/env";
import { BrowserManualMembershipToolkitAdapter } from "./adapters/browser-manual.adapter";
import { LiveMembershipToolkitAdapter } from "./adapters/live.adapter";
import { MockMembershipToolkitAdapter } from "./adapters/mock.adapter";

export interface MembershipToolkitOperationResult {
  draft: NewsletterDraft;
  step: ApprovalExecutionStep;
}

export interface MembershipToolkitAdapter {
  getLastNewsletter(state: DemoState): Promise<NewsletterDraft>;
  getBaseline(state: DemoState): Promise<MembershipToolkitBaseline>;
  duplicateNewsletter(
    state: DemoState,
    audience: NewsletterDraft["audience"],
    sourceDraft?: NewsletterDraft,
  ): Promise<MembershipToolkitOperationResult>;
  updateNewsletterDraft(
    state: DemoState,
    draft: NewsletterDraft,
  ): Promise<NewsletterDraft>;
  publishNewsletter(
    state: DemoState,
    draft: NewsletterDraft,
  ): Promise<MembershipToolkitOperationResult>;
  scheduleNewsletter(
    draft: NewsletterDraft,
    scheduledFor: string,
  ): Promise<MembershipToolkitOperationResult>;
}

export function createMembershipToolkitAdapter(): MembershipToolkitAdapter {
  if (env.MEMBERSHIP_TOOLKIT_MODE === "live") {
    return new LiveMembershipToolkitAdapter();
  }

  if (env.MEMBERSHIP_TOOLKIT_MODE === "manual") {
    return new BrowserManualMembershipToolkitAdapter();
  }

  return new MockMembershipToolkitAdapter();
}
