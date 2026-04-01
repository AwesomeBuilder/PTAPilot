import { access, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright";
import type { DemoState, NewsletterDraft } from "@pta-pilot/shared";
import { env } from "../../../config/env";
import {
  duplicateLastNewsletter,
  withNewsletterDelivery,
} from "../../newsletter/template-engine";
import type {
  MembershipToolkitAdapter,
  MembershipToolkitOperationResult,
} from "../membershipToolkit.adapter";

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export class LiveMembershipToolkitAdapter implements MembershipToolkitAdapter {
  async getLastNewsletter(state: DemoState): Promise<NewsletterDraft> {
    return structuredClone(state.newsletters.lastPublishedParent);
  }

  private async bootstrapSession() {
    if (!env.MEMBERSHIP_TOOLKIT_BASE_URL) {
      return {
        authenticated: false,
        reason:
          "Set MEMBERSHIP_TOOLKIT_BASE_URL before PTA Pilot can open a live Membership Toolkit session.",
      };
    }

    const browser = await chromium.launch({ headless: true });
    const storageStatePath = env.MEMBERSHIP_TOOLKIT_STORAGE_STATE_PATH;
    const context = await browser.newContext(
      storageStatePath && (await fileExists(storageStatePath))
        ? { storageState: storageStatePath }
        : undefined,
    );
    const page = await context.newPage();

    try {
      await page.goto(env.MEMBERSHIP_TOOLKIT_BASE_URL, {
        waitUntil: "domcontentloaded",
        timeout: env.MEMBERSHIP_TOOLKIT_LOGIN_TIMEOUT_MS,
      });

      const emailSelector =
        "input[type='email'], input[name='email'], input[name='username']";
      const passwordSelector = "input[type='password'], input[name='password']";
      const submitSelector = "button[type='submit'], input[type='submit']";
      const hasEmailField = (await page.locator(emailSelector).count()) > 0;
      const hasPasswordField = (await page.locator(passwordSelector).count()) > 0;

      if (
        hasEmailField &&
        hasPasswordField &&
        env.MEMBERSHIP_TOOLKIT_USERNAME &&
        env.MEMBERSHIP_TOOLKIT_PASSWORD
      ) {
        await page.locator(emailSelector).first().fill(env.MEMBERSHIP_TOOLKIT_USERNAME);
        await page
          .locator(passwordSelector)
          .first()
          .fill(env.MEMBERSHIP_TOOLKIT_PASSWORD);

        if ((await page.locator(submitSelector).count()) > 0) {
          await Promise.allSettled([
            page.waitForLoadState("networkidle", {
              timeout: env.MEMBERSHIP_TOOLKIT_LOGIN_TIMEOUT_MS,
            }),
            page.locator(submitSelector).first().click(),
          ]);
        }
      }

      if (storageStatePath) {
        await mkdir(dirname(storageStatePath), { recursive: true });
        await context.storageState({ path: storageStatePath });
      }

      return {
        authenticated: true,
        reason:
          "A live browser session was prepared. Complete the Membership Toolkit action, then confirm the resulting URL or identifier in PTA Pilot.",
      };
    } catch (error) {
      return {
        authenticated: false,
        reason:
          error instanceof Error
            ? `Unable to prepare a Membership Toolkit session automatically. ${error.message}`
            : "Unable to prepare a Membership Toolkit session automatically.",
      };
    } finally {
      await context.close();
      await browser.close();
    }
  }

  private buildDraft(
    state: DemoState,
    audience: NewsletterDraft["audience"],
    sourceDraft?: NewsletterDraft,
  ) {
    const source = sourceDraft ?? state.newsletters.lastPublishedParent;
    const titleMap = {
      board: "Lincoln PTA Board Review Draft",
      teachers: "Lincoln PTA Teacher Edition",
      parents: "Lincoln PTA Parent Newsletter",
    } as const;

    return withNewsletterDelivery(
      duplicateLastNewsletter(source, audience, titleMap[audience]),
      {
        lastSyncedAt: new Date().toISOString(),
      },
    );
  }

  async duplicateNewsletter(
    state: DemoState,
    audience: NewsletterDraft["audience"],
    sourceDraft?: NewsletterDraft,
  ): Promise<MembershipToolkitOperationResult> {
    const session = await this.bootstrapSession();
    const draft = this.buildDraft(state, audience, sourceDraft);

    return {
      draft,
      step: {
        id: `live-duplicate-${crypto.randomUUID()}`,
        label: `Duplicate ${audience} draft in Membership Toolkit`,
        type: "duplicate",
        status: "needs_operator",
        note: session.reason,
        externalUrl: env.MEMBERSHIP_TOOLKIT_BASE_URL,
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
    const session = await this.bootstrapSession();

    return {
      draft: structuredClone(draft),
      step: {
        id: `live-publish-${crypto.randomUUID()}`,
        label: "Publish teacher newsletter in Membership Toolkit",
        type: "publish",
        status: "needs_operator",
        note: session.reason,
        externalUrl: env.MEMBERSHIP_TOOLKIT_BASE_URL,
      },
    };
  }

  async scheduleNewsletter(
    draft: NewsletterDraft,
    scheduledFor: string,
  ): Promise<MembershipToolkitOperationResult> {
    const session = await this.bootstrapSession();

    return {
      draft: structuredClone(draft),
      step: {
        id: `live-schedule-${crypto.randomUUID()}`,
        label: "Schedule parent newsletter in Membership Toolkit",
        type: "schedule",
        status: "needs_operator",
        note: `${session.reason} Schedule for ${scheduledFor} and then confirm the resulting URL or identifier here.`,
        externalUrl: env.MEMBERSHIP_TOOLKIT_BASE_URL,
        outputs: {
          scheduledFor,
        },
      },
    };
  }
}
