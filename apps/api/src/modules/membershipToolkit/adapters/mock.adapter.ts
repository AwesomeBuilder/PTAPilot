import type { DemoState, NewsletterDraft } from "@pta-pilot/shared";
import {
  duplicateLastNewsletter,
  withNewsletterDelivery,
} from "../../newsletter/template-engine";
import type {
  MembershipToolkitAdapter,
  MembershipToolkitOperationResult,
} from "../membershipToolkit.adapter";

export class MockMembershipToolkitAdapter implements MembershipToolkitAdapter {
  async getLastNewsletter(state: DemoState): Promise<NewsletterDraft> {
    return structuredClone(state.newsletters.lastPublishedParent);
  }

  async duplicateNewsletter(
    state: DemoState,
    audience: NewsletterDraft["audience"],
    sourceDraft?: NewsletterDraft,
  ): Promise<MembershipToolkitOperationResult> {
    const source = sourceDraft ?? state.newsletters.lastPublishedParent;
    const titleMap = {
      board: "Lincoln PTA Board Review Draft",
      teachers: "Lincoln PTA Teacher Edition",
      parents: "Lincoln PTA Parent Newsletter",
    } as const;

    const draft = withNewsletterDelivery(
      duplicateLastNewsletter(source, audience, titleMap[audience]),
      {
        externalId: `mock-${audience}-${crypto.randomUUID()}`,
        directUrl: `https://mock.membership-toolkit.local/${audience}/${crypto.randomUUID()}`,
      },
    );

    return {
      draft,
      step: {
        id: `mtk-duplicate-${crypto.randomUUID()}`,
        label: `Duplicate ${audience} draft`,
        type: "duplicate",
        status: "completed",
        completedAt: new Date().toISOString(),
        note: "Mock Membership Toolkit duplicate completed locally.",
        externalUrl: draft.delivery?.directUrl,
      },
    };
  }

  async updateNewsletterDraft(
    _state: DemoState,
    draft: NewsletterDraft,
  ): Promise<NewsletterDraft> {
    return withNewsletterDelivery(structuredClone(draft), {
      lastSyncedAt: new Date().toISOString(),
    });
  }

  async publishNewsletter(
    _state: DemoState,
    draft: NewsletterDraft,
  ): Promise<MembershipToolkitOperationResult> {
    const publishedDraft = withNewsletterDelivery(structuredClone(draft), {
      externalId: draft.delivery?.externalId ?? `mock-publish-${crypto.randomUUID()}`,
      directUrl:
        draft.delivery?.directUrl ??
        `https://mock.membership-toolkit.local/published/${crypto.randomUUID()}`,
      lastSyncedAt: new Date().toISOString(),
    });
    publishedDraft.status = "published";
    publishedDraft.publishedAt = new Date().toISOString();

    return {
      draft: publishedDraft,
      step: {
        id: `mtk-publish-${crypto.randomUUID()}`,
        label: "Publish newsletter",
        type: "publish",
        status: "completed",
        completedAt: new Date().toISOString(),
        note: "Mock publish completed locally.",
        externalUrl: publishedDraft.delivery?.directUrl,
        outputs: {
          directUrl: publishedDraft.delivery?.directUrl ?? "",
          externalId: publishedDraft.delivery?.externalId ?? "",
        },
      },
    };
  }

  async scheduleNewsletter(
    draft: NewsletterDraft,
    scheduledFor: string,
  ): Promise<MembershipToolkitOperationResult> {
    const scheduledDraft = withNewsletterDelivery(structuredClone(draft), {
      externalId: draft.delivery?.externalId ?? `mock-schedule-${crypto.randomUUID()}`,
      directUrl:
        draft.delivery?.directUrl ??
        `https://mock.membership-toolkit.local/scheduled/${crypto.randomUUID()}`,
      lastSyncedAt: new Date().toISOString(),
    });
    scheduledDraft.status = "scheduled";
    scheduledDraft.scheduledFor = scheduledFor;

    return {
      draft: scheduledDraft,
      step: {
        id: `mtk-schedule-${crypto.randomUUID()}`,
        label: "Schedule newsletter",
        type: "schedule",
        status: "completed",
        completedAt: new Date().toISOString(),
        note: "Mock schedule completed locally.",
        externalUrl: scheduledDraft.delivery?.directUrl,
        outputs: {
          scheduledFor,
          directUrl: scheduledDraft.delivery?.directUrl ?? "",
          externalId: scheduledDraft.delivery?.externalId ?? "",
        },
      },
    };
  }
}
