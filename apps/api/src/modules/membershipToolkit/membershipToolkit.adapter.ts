import type { DemoState, NewsletterDraft } from "@pta-pilot/shared";
import { env } from "../../config/env";
import { BrowserManualMembershipToolkitAdapter } from "./adapters/browser-manual.adapter";
import { MockMembershipToolkitAdapter } from "./adapters/mock.adapter";

export interface MembershipToolkitAdapter {
  getLastNewsletter(state: DemoState): Promise<NewsletterDraft>;
  duplicateNewsletter(
    state: DemoState,
    audience: NewsletterDraft["audience"],
  ): Promise<NewsletterDraft>;
  updateNewsletterDraft(
    state: DemoState,
    draft: NewsletterDraft,
  ): Promise<NewsletterDraft>;
  publishTeacherVersion(state: DemoState): Promise<DemoState>;
  scheduleParentVersion(
    state: DemoState,
    scheduledFor: string,
  ): Promise<DemoState>;
}

export function createMembershipToolkitAdapter(): MembershipToolkitAdapter {
  if (env.MEMBERSHIP_TOOLKIT_MODE === "manual") {
    return new BrowserManualMembershipToolkitAdapter();
  }

  return new MockMembershipToolkitAdapter();
}
