import type { DemoState, NewsletterDraft } from "@pta-pilot/shared";
import {
  resolveMembershipToolkitDraftsUrl,
  resolveMembershipToolkitDuplicateUrl,
} from "@pta-pilot/shared";
import {
  deriveAudienceDraftTitle,
  duplicateLastNewsletter,
  withNewsletterDelivery,
} from "../../newsletter/template-engine";
import { readMembershipToolkitBaseline } from "../baseline-reader";
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

  async getBaseline(state: DemoState) {
    return readMembershipToolkitBaseline(state, {
      allowBrowserDiscovery: true,
    });
  }

  async duplicateNewsletter(
    state: DemoState,
    audience: NewsletterDraft["audience"],
    sourceDraft?: NewsletterDraft,
  ): Promise<MembershipToolkitOperationResult> {
    const sourceUrl =
      audience === "parents"
        ? state.newsletters.teachers.delivery?.directUrl ??
          sourceDraft?.delivery?.directUrl ??
          state.newsletters.lastPublishedParent.delivery?.directUrl
        : sourceDraft?.delivery?.directUrl ??
          state.newsletters.lastPublishedParent.delivery?.directUrl;
    const source = sourceDraft ?? state.newsletters.lastPublishedParent;
    const draft = withNewsletterDelivery(
      duplicateLastNewsletter(
        source,
        audience,
        deriveAudienceDraftTitle(source.title, audience),
      ),
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
        externalUrl: resolveMembershipToolkitDuplicateUrl(sourceUrl),
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
    state: DemoState,
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
        externalUrl: resolveMembershipToolkitDraftsUrl(
          draft.delivery?.directUrl,
          state.newsletters.lastPublishedParent.delivery?.directUrl,
        ),
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
        externalUrl: resolveMembershipToolkitDraftsUrl(draft.delivery?.directUrl),
        outputs: {
          scheduledFor,
        },
      },
    };
  }
}
