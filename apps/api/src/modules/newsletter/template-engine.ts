import type {
  AudienceVersion,
  ExtractedContentItem,
  NewsletterDraft,
  NewsletterDeliveryMeta,
  NewsletterItem,
  NewsletterSection,
} from "@pta-pilot/shared";

const priorityRank = {
  urgent: 0,
  time_sensitive: 1,
  evergreen: 2,
} as const;

function buildNewsletterItem(item: ExtractedContentItem): NewsletterItem {
  return {
    id: `newsletter-item-${item.id}`,
    title: item.title,
    body: item.summary,
    priority: item.priority,
    sourceBadges: [item.source.toUpperCase(), item.sourceRef],
    flyerRecommended: item.recommendedAsFlyer,
  };
}

function stripKnownDraftSuffix(title: string) {
  return title
    .replace(/\bBoard Review Draft\b/i, "")
    .replace(/\bTeacher Edition\b/i, "")
    .replace(/\bParent Newsletter\b/i, "")
    .replace(/\bNewsletter\b/i, "")
    .replace(
      /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\s*-\s*\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDraftBaseTitle(title: string) {
  const stripped = stripKnownDraftSuffix(title);
  return stripped || "PTA";
}

export function deriveAudienceDraftTitle(
  sourceTitle: string,
  audience: AudienceVersion,
) {
  const baseTitle = normalizeDraftBaseTitle(sourceTitle);

  if (audience === "board") {
    return `${baseTitle} Board Review Draft`;
  }

  if (audience === "teachers") {
    return `${baseTitle} Teacher Edition`;
  }

  return `${baseTitle} Parent Newsletter`;
}

export function buildSectionsFromExtracted(
  extractedItems: ExtractedContentItem[],
): NewsletterSection[] {
  const sorted = [...extractedItems].sort(
    (left, right) => priorityRank[left.priority] - priorityRank[right.priority],
  );

  const urgentItems = sorted
    .filter((item) => item.priority === "urgent")
    .map(buildNewsletterItem);
  const eventItems = sorted
    .filter((item) => item.priority !== "urgent")
    .map(buildNewsletterItem);

  const sections: NewsletterSection[] = [
    {
      id: "generated-urgent",
      title: "Urgent schoolwide items",
      kind: "urgent_schoolwide",
      items: urgentItems,
    },
    {
      id: "generated-events",
      title: "Events and reminders",
      kind: "events",
      items: eventItems,
    },
  ];

  return sections.filter((section) => section.items.length > 0);
}

export function duplicateLastNewsletter(
  source: NewsletterDraft,
  audience: AudienceVersion,
  title: string,
): NewsletterDraft {
  const cloned = structuredClone(source);
  return {
    ...cloned,
    id: `newsletter-${audience}-draft`,
    audience,
    title,
    summary: `Duplicated from ${source.title} and ready for ${audience} edits.`,
    status: "draft",
    publishedAt: undefined,
    scheduledFor: undefined,
    sourceNewsletterId: source.id,
    delivery: {},
  };
}

export function withNewsletterDelivery(
  draft: NewsletterDraft,
  update: NewsletterDeliveryMeta,
): NewsletterDraft {
  return {
    ...draft,
    delivery: {
      ...(draft.delivery ?? {}),
      ...update,
    },
  };
}

export function diffNewsletterDrafts(
  source: NewsletterDraft,
  target: NewsletterDraft,
) {
  const sourceEntries = new Set(
    source.sections.flatMap((section) =>
      section.items.map((item) => `${section.title}:${item.title}:${item.body}`),
    ),
  );
  const targetEntries = new Set(
    target.sections.flatMap((section) =>
      section.items.map((item) => `${section.title}:${item.title}:${item.body}`),
    ),
  );

  const added = [...targetEntries].filter((entry) => !sourceEntries.has(entry));
  const removed = [...sourceEntries].filter((entry) => !targetEntries.has(entry));

  return {
    added,
    removed,
  };
}

export function deriveParentDraftFromTeacher(
  teacherDraft: NewsletterDraft,
): NewsletterDraft {
  const parentSections = teacherDraft.sections.filter(
    (section) => section.kind !== "teacher_note",
  );

  return {
    ...structuredClone(teacherDraft),
    id: "newsletter-parent-draft",
    audience: "parents",
    title: deriveAudienceDraftTitle(teacherDraft.title, "parents"),
    summary: "Derived from the teacher-approved version for Sunday parent scheduling.",
    status: "draft",
    publishedAt: undefined,
    scheduledFor: undefined,
    delivery: {},
    sections: parentSections,
    sourceNewsletterId: teacherDraft.id,
  };
}
