import type { DemoState, NewsletterDraft } from "@pta-pilot/shared";
import {
  duplicateLastNewsletter,
  withNewsletterDelivery,
} from "../../newsletter/template-engine";
import type {
  MembershipToolkitAdapter,
  MembershipToolkitOperationResult,
} from "../membershipToolkit.adapter";

export class BrowserManualMembershipToolkitAdapter
  implements MembershipToolkitAdapter
{
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
        lastSyncedAt: new Date().toISOString(),
      },
    );

    return {
      draft,
      step: {
        id: `manual-duplicate-${crypto.randomUUID()}`,
        label: `Duplicate ${audience} draft in Membership Toolkit`,
        type: "duplicate",
        status: "needs_operator",
        note:
          "Open Membership Toolkit, duplicate the newsletter, then paste the resulting direct URL here to continue.",
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
    return {
      draft: structuredClone(draft),
      step: {
        id: `manual-publish-${crypto.randomUUID()}`,
        label: "Publish teacher newsletter in Membership Toolkit",
        type: "publish",
        status: "needs_operator",
        note:
          "Publish the teacher newsletter manually, then paste the live direct URL so PTA Pilot can continue with the Gmail release email.",
      },
    };
  }

  async scheduleNewsletter(
    draft: NewsletterDraft,
    scheduledFor: string,
  ): Promise<MembershipToolkitOperationResult> {
    return {
      draft: structuredClone(draft),
      step: {
        id: `manual-schedule-${crypto.randomUUID()}`,
        label: "Schedule parent newsletter in Membership Toolkit",
        type: "schedule",
        status: "needs_operator",
        note: `Schedule the parent newsletter for ${scheduledFor}, then confirm the direct URL or external identifier here.`,
        outputs: {
          scheduledFor,
        },
      },
    };
  }
}
