import { access, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright";
import type {
  ContentPriority,
  ContentSourceReference,
  DemoState,
  MembershipToolkitBaseline,
  NewsletterItem,
  NewsletterSection,
} from "@pta-pilot/shared";
import { env } from "../../config/env";

function createMembershipToolkitReference(
  sourceUrl: string | undefined,
  ref: string,
): ContentSourceReference {
  return {
    id: `baseline-source-${crypto.randomUUID()}`,
    source: "membership_toolkit",
    label: "Membership Toolkit baseline",
    ref: sourceUrl ?? ref,
  };
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToLines(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|table|ul|ol|li|h[1-6]|td)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, " "),
  )
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeHeading(raw: string) {
  const heading = raw.replace(/[:\-]+$/, "").trim();

  if (/^[A-Z0-9\s/&]+$/.test(heading)) {
    return heading;
  }

  return heading;
}

function isSectionHeadingLine(line: string) {
  if (!line || line.length > 48) {
    return false;
  }

  if (
    /^(THIS WEEK|COMING UP|COMMUNITY|SPONSORS|QUICK LINKS|TEACHER NOTES|SIMONDS PTA|FROM THE PTA)$/i.test(
      line,
    )
  ) {
    return true;
  }

  if (/[.!?]/.test(line)) {
    return false;
  }

  if (/\d{1,2}\/\d{1,2}/.test(line) || /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(line)) {
    return false;
  }

  return line.split(/\s+/).length <= 5;
}

function isDateHeading(line: string) {
  return (
    /\d{1,2}\/\d{1,2}/.test(line) ||
    /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i.test(
      line,
    )
  );
}

function inferPriority(sectionTitle: string): ContentPriority {
  if (/urgent|attendance/i.test(sectionTitle)) {
    return "urgent";
  }

  if (/this week|coming up|event|teacher|principal/i.test(sectionTitle)) {
    return "time_sensitive";
  }

  return "evergreen";
}

function inferSectionKind(
  title: string,
): NewsletterSection["kind"] {
  if (/urgent|attendance/i.test(title)) {
    return "urgent_schoolwide";
  }

  if (/teacher|staff/i.test(title)) {
    return "teacher_note";
  }

  if (/principal/i.test(title)) {
    return "principal_note";
  }

  if (/flyer/i.test(title)) {
    return "flyer";
  }

  if (/this week|coming up|event|program|calendar/i.test(title)) {
    return "events";
  }

  return "community";
}

function inferLockedReason(title: string) {
  if (/sponsor/i.test(title)) {
    return "Stable sponsor block from Membership Toolkit.";
  }

  if (/quick links?|resources|directory/i.test(title)) {
    return "Stable quick-links or resources block from Membership Toolkit.";
  }

  if (/footer|contact|membership toolkit/i.test(title)) {
    return "Stable footer/contact block from Membership Toolkit.";
  }

  return undefined;
}

function buildItemsFromLines(
  lines: string[],
  sectionTitle: string,
  sourceUrl: string | undefined,
): NewsletterItem[] {
  const items: NewsletterItem[] = [];
  let currentPrefix = "";

  lines.forEach((line, index) => {
    if (isDateHeading(line)) {
      currentPrefix = line;
      return;
    }

    const content = line.replace(/^-+\s*/, "").trim();

    if (!content) {
      return;
    }

    const body = currentPrefix ? `${currentPrefix} — ${content}` : content;
    items.push({
      id: `baseline-item-${sectionTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`,
      title: body.slice(0, 120),
      body,
      priority: inferPriority(sectionTitle),
      sourceBadges: ["Membership Toolkit"],
      provenance: [createMembershipToolkitReference(sourceUrl, sectionTitle)],
    });
  });

  if (!items.length && currentPrefix) {
    items.push({
      id: `baseline-item-${sectionTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-0`,
      title: currentPrefix.slice(0, 120),
      body: currentPrefix,
      priority: inferPriority(sectionTitle),
      sourceBadges: ["Membership Toolkit"],
      provenance: [createMembershipToolkitReference(sourceUrl, sectionTitle)],
    });
  }

  return items;
}

function buildSectionsFromGroups(
  groups: Array<{ title: string; lines: string[] }>,
  sourceUrl: string | undefined,
) {
  return groups
    .map((group, index) => {
      const title = normalizeHeading(group.title);
      const items = buildItemsFromLines(group.lines, title, sourceUrl);
      const lockedReason = inferLockedReason(title);

      return {
        id: `baseline-section-${index}`,
        title,
        kind: inferSectionKind(title),
        items,
        locked: Boolean(lockedReason),
        lockedReason,
      } satisfies NewsletterSection;
    })
    .filter((section) => section.items.length);
}

export function parseMembershipToolkitNewsletterHtml(
  html: string,
  sourceUrl?: string,
): MembershipToolkitBaseline {
  const titleMatch = html.match(/<title>\s*([^<]+?)\s*<\/title>/i);
  const documentTitle = decodeHtmlEntities(
    titleMatch?.[1]?.replace(/^Newsletter\s*-\s*/i, "").trim() ??
      "Membership Toolkit Newsletter",
  );

  const blockMatches = Array.from(
    html.matchAll(
      /<div[^>]*class="[^"]*mtk-nl-rich-text-editable[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    ),
  )
    .map((match) => match[1])
    .filter((match): match is string => Boolean(match));

  const groups: Array<{ title: string; lines: string[] }> = [];
  let pendingTitle: string | null = null;

  blockMatches.forEach((blockHtml) => {
    const lines = htmlToLines(blockHtml);
    const [firstLine] = lines;

    if (!lines.length) {
      return;
    }

    if (lines.length === 1 && firstLine && isSectionHeadingLine(firstLine)) {
      pendingTitle = normalizeHeading(firstLine);
      return;
    }

    if (pendingTitle) {
      groups.push({
        title: pendingTitle,
        lines,
      });
      pendingTitle = null;
      return;
    }

    let currentTitle: string | null = null;
    let currentLines: string[] = [];

    lines.forEach((line) => {
      if (isSectionHeadingLine(line)) {
        if (currentTitle && currentLines.length) {
          groups.push({ title: currentTitle, lines: currentLines });
        }

        currentTitle = normalizeHeading(line);
        currentLines = [];
        return;
      }

      currentLines.push(line);
    });

    if (currentTitle && currentLines.length) {
      groups.push({ title: currentTitle, lines: currentLines });
    }
  });

  const sections = buildSectionsFromGroups(groups, sourceUrl);

  return {
    id: `mtk-baseline-${crypto.randomUUID()}`,
    title: documentTitle,
    sourceUrl,
    sourceLabel: "Membership Toolkit sent newsletter",
    discoveredAt: new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
    retrievalMode: "automatic",
    sections,
  };
}

function buildFallbackBaseline(
  state: DemoState,
  note: string,
): MembershipToolkitBaseline {
  const sourceUrl =
    state.newsletters.lastPublishedParent.delivery?.directUrl ??
    state.inbox.artifacts.find(
      (artifact) => artifact.type === "previous_newsletter_link",
    )?.originalUrl;

  return {
    id: `mtk-baseline-fallback-${crypto.randomUUID()}`,
    title: state.newsletters.lastPublishedParent.title,
    sourceUrl,
    sourceLabel: "Stored PTA Pilot baseline",
    discoveredAt: new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
    retrievalMode: "fallback",
    note,
    sections: structuredClone(state.newsletters.lastPublishedParent.sections).map(
      (section) => {
        const lockedReason = inferLockedReason(section.title);

        return {
          ...section,
          locked: Boolean(lockedReason) || section.locked,
          lockedReason: section.lockedReason ?? lockedReason,
          items: section.items.map((item) => ({
            ...item,
            provenance:
              item.provenance ??
              [createMembershipToolkitReference(sourceUrl, section.id)],
          })),
        };
      },
    ),
  };
}

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isManualActionLink(link: { text: string; href: string }) {
  const text = link.text.toLowerCase();
  const href = link.href.toLowerCase();

  return (
    /test|release|delete|edit|close|save|duplicate|schedule/.test(text) ||
    /javascript:/.test(href)
  );
}

function isPublicNewsletterUrl(href: string) {
  return /\/newsletter\//i.test(href) && !/\/communications\//i.test(href);
}

function scoreSentNewsletterRow(row: {
  text: string;
  links: Array<{ text: string; href: string }>;
}) {
  const text = row.text.toLowerCase();
  let score = 0;

  if (text.includes("all current contacts")) {
    score += 60;
  }

  if (text.includes("newsletter")) {
    score += 25;
  }

  if (text.includes("parent")) {
    score += 20;
  }

  if (text.includes("community")) {
    score += 10;
  }

  if (text.includes("faculty members")) {
    score -= 45;
  }

  if (text.includes("teacher")) {
    score -= 25;
  }

  if (row.links.some((link) => isPublicNewsletterUrl(link.href))) {
    score += 15;
  }

  return score;
}

async function clickSentTab(page: import("playwright").Page) {
  const tabCandidates = [
    page.getByRole("link", { name: /^sent$/i }).first(),
    page.getByRole("button", { name: /^sent$/i }).first(),
    page.locator("a, button").filter({ hasText: /^sent$/i }).first(),
  ];

  for (const candidate of tabCandidates) {
    if ((await candidate.count()) > 0) {
      await Promise.allSettled([
        page.waitForLoadState("networkidle", {
          timeout: env.MEMBERSHIP_TOOLKIT_LOGIN_TIMEOUT_MS,
        }),
        candidate.click(),
      ]);
      return;
    }
  }
}

async function extractFirstSentParentNewsletterRow(
  page: import("playwright").Page,
) {
  const rows = await page.locator("tr").evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const text = (node.textContent || "").replace(/\s+/g, " ").trim();
        const links = Array.from(node.querySelectorAll("a")).map((anchor) => ({
          text: (anchor.textContent || "").replace(/\s+/g, " ").trim(),
          href: (anchor as HTMLAnchorElement).href,
        }));

        return { text, links };
      })
      .filter((row) => row.text),
  );

  return rows
    .map((row) => ({
      row,
      score: scoreSentNewsletterRow(row),
    }))
    .filter(({ row }) => row.links.length > 0)
    .sort((left, right) => right.score - left.score)[0]?.row;
}

async function extractPublicNewsletterUrlFromPage(
  page: import("playwright").Page,
) {
  const currentUrl = page.url();

  if (isPublicNewsletterUrl(currentUrl)) {
    return currentUrl;
  }

  const hrefs = await page.locator("a").evaluateAll((anchors) =>
    anchors
      .map((anchor) => (anchor as HTMLAnchorElement).href)
      .filter(Boolean),
  );

  return hrefs.find((href) => isPublicNewsletterUrl(href));
}

async function discoverLatestNewsletterUrlFromBrowser() {
  if (!env.MEMBERSHIP_TOOLKIT_BASE_URL) {
    return undefined;
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
    await page.goto(
      `${env.MEMBERSHIP_TOOLKIT_BASE_URL.replace(/\/$/, "")}/communications/newsletters`,
      {
        waitUntil: "domcontentloaded",
        timeout: env.MEMBERSHIP_TOOLKIT_LOGIN_TIMEOUT_MS,
      },
    );

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

    await clickSentTab(page);

    const sentRow = await extractFirstSentParentNewsletterRow(page);

    let directUrl = sentRow?.links.find((link) =>
      isPublicNewsletterUrl(link.href),
    )?.href;

    if (!directUrl && sentRow) {
      const subjectLink = sentRow.links.find((link) => !isManualActionLink(link));

      if (subjectLink?.href) {
        await page.goto(subjectLink.href, {
          waitUntil: "domcontentloaded",
          timeout: env.MEMBERSHIP_TOOLKIT_LOGIN_TIMEOUT_MS,
        });
        await page.waitForLoadState("networkidle", {
          timeout: env.MEMBERSHIP_TOOLKIT_LOGIN_TIMEOUT_MS,
        }).catch(() => undefined);
        directUrl = await extractPublicNewsletterUrlFromPage(page);
      }
    }

    if (!directUrl) {
      directUrl = await extractPublicNewsletterUrlFromPage(page);
    }

    if (storageStatePath) {
      await mkdir(dirname(storageStatePath), { recursive: true });
      await context.storageState({ path: storageStatePath });
    }

    return directUrl;
  } catch {
    return undefined;
  } finally {
    await context.close();
    await browser.close();
  }
}

function findStoredNewsletterUrl(state: DemoState) {
  return (
    state.newsletters.lastPublishedParent.delivery?.directUrl ??
    state.inbox.artifacts.find(
      (artifact) => artifact.type === "previous_newsletter_link",
    )?.originalUrl
  );
}

export async function readMembershipToolkitBaseline(
  state: DemoState,
  options?: { allowBrowserDiscovery?: boolean },
): Promise<MembershipToolkitBaseline> {
  if (env.NODE_ENV === "test") {
    return buildFallbackBaseline(
      state,
      "Test mode uses the stored PTA Pilot baseline instead of calling Membership Toolkit.",
    );
  }

  const discoveredUrl =
    (options?.allowBrowserDiscovery
      ? await discoverLatestNewsletterUrlFromBrowser()
      : undefined) ?? findStoredNewsletterUrl(state);

  if (!discoveredUrl) {
    return buildFallbackBaseline(
      state,
      "No Membership Toolkit newsletter URL was available, so PTA Pilot used the stored last-published newsletter as the baseline.",
    );
  }

  try {
    const response = await fetch(discoveredUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(2_500),
      headers: {
        "User-Agent": "PTA Pilot Baseline Reader",
      },
    });

    if (!response.ok) {
      return buildFallbackBaseline(
        state,
        `PTA Pilot found the newsletter URL but could not fetch it (${response.status}). Using the stored baseline instead.`,
      );
    }

    const html = await response.text();
    const parsed = parseMembershipToolkitNewsletterHtml(html, discoveredUrl);

    if (!parsed.sections.length) {
      return buildFallbackBaseline(
        state,
        "PTA Pilot fetched the latest newsletter but could not normalize its sections reliably, so it kept the stored baseline.",
      );
    }

    return parsed;
  } catch {
    return buildFallbackBaseline(
      state,
      "PTA Pilot could not reach the latest Membership Toolkit newsletter, so it kept the stored baseline.",
    );
  }
}
