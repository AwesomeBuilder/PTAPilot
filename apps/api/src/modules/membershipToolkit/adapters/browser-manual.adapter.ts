import type { DemoState, NewsletterDraft } from "@pta-pilot/shared";
import type { MembershipToolkitAdapter } from "../membershipToolkit.adapter";

export class BrowserManualMembershipToolkitAdapter
  implements MembershipToolkitAdapter
{
  async getLastNewsletter(state: DemoState): Promise<NewsletterDraft> {
    return structuredClone(state.newsletters.lastPublishedParent);
  }

  async duplicateNewsletter(
    state: DemoState,
    audience: NewsletterDraft["audience"],
  ): Promise<NewsletterDraft> {
    return structuredClone(state.newsletters[audience]);
  }

  async updateNewsletterDraft(
    _state: DemoState,
    draft: NewsletterDraft,
  ): Promise<NewsletterDraft> {
    return structuredClone(draft);
  }

  async publishTeacherVersion(state: DemoState): Promise<DemoState> {
    return structuredClone(state);
  }

  async scheduleParentVersion(
    state: DemoState,
    _scheduledFor: string,
  ): Promise<DemoState> {
    return structuredClone(state);
  }
}
