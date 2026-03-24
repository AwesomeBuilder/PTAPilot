import type { DemoState, NewsletterDraft } from "@pta-pilot/shared";
import { duplicateLastNewsletter } from "../../newsletter/template-engine";
import type { MembershipToolkitAdapter } from "../membershipToolkit.adapter";

export class MockMembershipToolkitAdapter implements MembershipToolkitAdapter {
  async getLastNewsletter(state: DemoState): Promise<NewsletterDraft> {
    return structuredClone(state.newsletters.lastPublishedParent);
  }

  async duplicateNewsletter(
    state: DemoState,
    audience: NewsletterDraft["audience"],
  ): Promise<NewsletterDraft> {
    const source = state.newsletters.lastPublishedParent;
    const titleMap = {
      board: "Lincoln PTA Board Review Draft",
      teachers: "Lincoln PTA Teacher Edition",
      parents: "Lincoln PTA Parent Newsletter",
    } as const;

    return duplicateLastNewsletter(source, audience, titleMap[audience]);
  }

  async updateNewsletterDraft(
    _state: DemoState,
    draft: NewsletterDraft,
  ): Promise<NewsletterDraft> {
    return structuredClone(draft);
  }

  async publishTeacherVersion(state: DemoState): Promise<DemoState> {
    const nextState = structuredClone(state);
    nextState.newsletters.teachers.status = "published";
    nextState.newsletters.teachers.publishedAt = new Date().toISOString();
    return nextState;
  }

  async scheduleParentVersion(
    state: DemoState,
    scheduledFor: string,
  ): Promise<DemoState> {
    const nextState = structuredClone(state);
    nextState.newsletters.parents.status = "scheduled";
    nextState.newsletters.parents.scheduledFor = scheduledFor;
    return nextState;
  }
}
