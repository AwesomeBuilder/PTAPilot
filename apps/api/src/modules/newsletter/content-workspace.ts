import type {
  AudienceVersion,
  ContentPriority,
  ContentSourceReference,
  ContentWorkspaceState,
  DemoState,
  ExtractedContentItem,
  MembershipToolkitBaseline,
  MtkRunbookStep,
  NewsletterDraft,
  NewsletterItem,
  NewsletterSection,
  ProposedNewsletterEdit,
  ProposedNewsletterEditGroup,
  ProposedNewsletterEditKind,
} from "@pta-pilot/shared";
import {
  resolveMembershipToolkitDraftsUrl,
  resolveMembershipToolkitDuplicateUrl,
} from "@pta-pilot/shared";
import {
  deriveAudienceDraftTitle,
  deriveParentDraftFromTeacher,
} from "./template-engine";

type CalendarDigest = {
  rawText?: string;
  thisWeek: string[];
  comingUp: string[];
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 3);
}

function overlapScore(left: string, right: string) {
  const leftTokens = new Set(significantTokens(left));
  const rightTokens = new Set(significantTokens(right));

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  let shared = 0;

  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  });

  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function toSourceReference(
  item: ExtractedContentItem,
): ContentSourceReference {
  return {
    id: `source-${item.id}`,
    source: item.source,
    label: `${item.source.toUpperCase()} ${item.sourceRef}`,
    ref: item.sourceRef,
  };
}

function calendarSourceReference(text: string): ContentSourceReference {
  return {
    id: `calendar-${crypto.randomUUID()}`,
    source: "calendar",
    label: "Calendar source",
    ref: text.slice(0, 120),
  };
}

function sectionKindForItem(
  item: ExtractedContentItem,
): NewsletterSection["kind"] {
  const text = `${item.title} ${item.summary}`;

  if (/teacher|staff|library|lunch|faculty/i.test(text)) {
    return "teacher_note";
  }

  if (/principal/i.test(text)) {
    return "principal_note";
  }

  if (item.priority === "urgent") {
    return "urgent_schoolwide";
  }

  return "events";
}

function sectionTitleForKind(kind: NewsletterSection["kind"]) {
  switch (kind) {
    case "urgent_schoolwide":
      return "Urgent schoolwide items";
    case "events":
      return "Events and reminders";
    case "teacher_note":
      return "Teacher notes";
    case "principal_note":
      return "Principal notes";
    case "flyer":
      return "Flyers";
    default:
      return "Community";
  }
}

function findSection(
  sections: NewsletterSection[],
  kind: NewsletterSection["kind"],
) {
  return sections.find((section) => section.kind === kind && !section.locked);
}

function ensureSection(
  sections: NewsletterSection[],
  kind: NewsletterSection["kind"],
) {
  const existing = findSection(sections, kind);

  if (existing) {
    return existing;
  }

  const section: NewsletterSection = {
    id: `generated-section-${kind}`,
    title: sectionTitleForKind(kind),
    kind,
    items: [],
  };

  sections.unshift(section);
  return section;
}

function toDraftItem(item: ExtractedContentItem): NewsletterItem {
  return {
    id: `draft-item-${item.id}`,
    title: item.title,
    body: item.summary,
    priority: item.priority,
    sourceBadges: [item.source.toUpperCase(), item.sourceRef],
    flyerRecommended: item.recommendedAsFlyer,
    provenance: [toSourceReference(item)],
  };
}

function mergeSourceBadges(existing: string[], incoming: string[]) {
  return Array.from(new Set([...existing, ...incoming]));
}

function mergeProvenance(
  existing: ContentSourceReference[] | undefined,
  incoming: ContentSourceReference[],
) {
  const merged = [...(existing ?? [])];

  incoming.forEach((reference) => {
    if (
      !merged.some(
        (current) =>
          current.source === reference.source && current.ref === reference.ref,
      )
    ) {
      merged.push(reference);
    }
  });

  return merged;
}

function findMatchingItem(
  sections: NewsletterSection[],
  item: ExtractedContentItem,
) {
  const candidates = sections.flatMap((section) =>
    section.locked
      ? []
      : section.items.map((current) => ({
          section,
          item: current,
          score: Math.max(
            overlapScore(current.title, item.title),
            overlapScore(current.body, item.summary),
          ),
        })),
  );

  return candidates
    .filter((candidate) => candidate.score >= 0.45)
    .sort((left, right) => right.score - left.score)[0];
}

function draftFromBaseline(
  baseline: MembershipToolkitBaseline,
  audience: AudienceVersion,
  title: string,
  summary: string,
): NewsletterDraft {
  return {
    id: `newsletter-${audience}-draft`,
    audience,
    title,
    summary,
    status: "draft",
    sections: structuredClone(baseline.sections),
    sourceNewsletterId: baseline.id,
    delivery: {},
  };
}

function parseCalendarLines(text: string | undefined): string[] {
  if (!text?.trim()) {
    return [];
  }

  const normalized = text
    .replace(/\s{2,}/g, " ")
    .replace(/([.])\s+(?=[A-Z])/g, "$1\n")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (normalized.length > 1) {
    return normalized;
  }

  return text
    .split(/(?<=\.)\s+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function buildCalendarDigest(
  state: DemoState,
): CalendarDigest {
  const calendarArtifact = state.inbox.artifacts.find(
    (artifact) => artifact.type === "calendar_screenshot",
  );

  const lines = parseCalendarLines(calendarArtifact?.extractedText);
  const midpoint = lines.length > 2 ? Math.ceil(lines.length / 2) : lines.length;

  return {
    rawText: calendarArtifact?.extractedText,
    thisWeek: lines.slice(0, midpoint),
    comingUp: lines.slice(midpoint),
  };
}

function upsertCalendarItem(
  section: NewsletterSection,
  title: string,
  lines: string[],
  priority: ContentPriority,
) {
  if (!lines.length) {
    return;
  }

  const body = lines.join("\n");
  const existing = section.items.find((item) => item.title === title);

  if (existing) {
    existing.body = body;
    existing.priority = priority;
    existing.sourceBadges = mergeSourceBadges(existing.sourceBadges, ["CALENDAR"]);
    existing.provenance = mergeProvenance(existing.provenance, [
      calendarSourceReference(body),
    ]);
    return;
  }

  section.items.unshift({
    id: `calendar-item-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title,
    body,
    priority,
    sourceBadges: ["CALENDAR"],
    provenance: [calendarSourceReference(body)],
  });
}

function sortItems(section: NewsletterSection) {
  const rank: Record<ContentPriority, number> = {
    urgent: 0,
    time_sensitive: 1,
    evergreen: 2,
  };

  section.items.sort((left, right) => rank[left.priority] - rank[right.priority]);
}

function buildBoardDraft(
  baseline: MembershipToolkitBaseline,
  extractedItems: ExtractedContentItem[],
  state: DemoState,
) {
  const draft = draftFromBaseline(
    baseline,
    "board",
    deriveAudienceDraftTitle(baseline.title, "board"),
    "Working source of truth for the Wednesday board review email and MTK patch runbook.",
  );
  const sections = draft.sections;

  extractedItems.forEach((item) => {
    const match = findMatchingItem(sections, item);

    if (match) {
      match.item.title = item.title;
      match.item.body = item.summary;
      match.item.priority = item.priority;
      match.item.flyerRecommended = item.recommendedAsFlyer;
      match.item.sourceBadges = mergeSourceBadges(match.item.sourceBadges, [
        item.source.toUpperCase(),
        item.sourceRef,
      ]);
      match.item.provenance = mergeProvenance(match.item.provenance, [
        toSourceReference(item),
      ]);
      return;
    }

    const section = ensureSection(sections, sectionKindForItem(item));
    section.items.unshift(toDraftItem(item));
  });

  const calendarDigest = buildCalendarDigest(state);
  const eventSection = ensureSection(sections, "events");
  upsertCalendarItem(
    eventSection,
    "This week calendar highlights",
    calendarDigest.thisWeek,
    "time_sensitive",
  );
  upsertCalendarItem(
    eventSection,
    "Coming up calendar highlights",
    calendarDigest.comingUp,
    "time_sensitive",
  );

  sections.forEach(sortItems);
  draft.sections = sections.filter((section) => section.items.length);

  return {
    draft,
    calendarDigest,
  };
}

function buildTeacherDraft(
  boardDraft: NewsletterDraft,
  extractedItems: ExtractedContentItem[],
): NewsletterDraft {
  const teacherDraft = draftFromBaseline(
    {
      id: boardDraft.id,
      title: boardDraft.title,
      sourceUrl: boardDraft.delivery?.directUrl,
      sourceLabel: "Board working draft",
      discoveredAt: new Date().toISOString(),
      retrievedAt: new Date().toISOString(),
      retrievalMode: "automatic",
      sections: boardDraft.sections,
    },
    "teachers",
    deriveAudienceDraftTitle(boardDraft.title, "teachers"),
    "Teacher release draft derived from the board working draft with staff-only notes preserved.",
  );

  const teacherOnlyItems = extractedItems.filter((item) =>
    /teacher|staff|library|lunch|faculty/i.test(`${item.title} ${item.summary}`),
  );

  if (teacherOnlyItems.length) {
    const teacherSection = ensureSection(teacherDraft.sections, "teacher_note");
    teacherOnlyItems.forEach((item) => {
      const existing = teacherSection.items.find(
        (current) => normalizeText(current.title) === normalizeText(item.title),
      );

      if (existing) {
        existing.body = item.summary;
        existing.sourceBadges = mergeSourceBadges(existing.sourceBadges, [
          item.source.toUpperCase(),
          item.sourceRef,
        ]);
        existing.provenance = mergeProvenance(existing.provenance, [
          toSourceReference(item),
        ]);
        return;
      }

      teacherSection.items.push(toDraftItem(item));
    });
    sortItems(teacherSection);
  }

  return teacherDraft;
}

function inferEditGroup(
  targetSection: string,
  kind: ProposedNewsletterEditKind,
): ProposedNewsletterEditGroup {
  if (kind === "keep_locked" || /sponsor|quick links?|resources|footer/i.test(targetSection)) {
    return "evergreen_locked";
  }

  if (/teacher/i.test(targetSection)) {
    return "teacher_only";
  }

  if (/urgent|attendance|principal/i.test(targetSection)) {
    return "urgent_schoolwide";
  }

  return "time_sensitive_events";
}

function createEdit(
  kind: ProposedNewsletterEditKind,
  targetSection: string,
  title: string,
  options: {
    baselineValue?: string;
    proposedValue?: string;
    provenance?: ContentSourceReference[];
    note?: string;
    confidence?: number;
    manualReview?: boolean;
  } = {},
): ProposedNewsletterEdit {
  return {
    id: `proposed-edit-${crypto.randomUUID()}`,
    kind,
    group: inferEditGroup(targetSection, kind),
    title,
    targetSection,
    baselineValue: options.baselineValue,
    proposedValue: options.proposedValue,
    provenance: options.provenance ?? [],
    confidence: options.confidence ?? 0.84,
    manualReview: options.manualReview ?? false,
    note: options.note,
  };
}

function flattenDraft(draft: NewsletterDraft) {
  return draft.sections.flatMap((section) =>
    section.items.map((item) => ({
      section,
      item,
      key: `${normalizeText(item.title)}::${normalizeText(item.body)}`,
      titleKey: normalizeText(item.title),
    })),
  );
}

function buildProposedEdits(
  baseline: MembershipToolkitBaseline,
  boardDraft: NewsletterDraft,
): ProposedNewsletterEdit[] {
  const edits: ProposedNewsletterEdit[] = [];
  const baselineEntries = flattenDraft({
    id: baseline.id,
    audience: "parents",
    title: baseline.title,
    summary: baseline.sourceLabel,
    status: "draft",
    sections: baseline.sections,
  });
  const draftEntries = flattenDraft(boardDraft);

  baseline.sections
    .filter((section) => section.locked)
    .forEach((section) => {
      edits.push(
        createEdit("keep_locked", section.title, section.title, {
          baselineValue: section.items.map((item) => item.body).join("\n"),
          provenance: section.items.flatMap((item) => item.provenance ?? []),
          note: section.lockedReason,
          confidence: 0.99,
        }),
      );
    });

  draftEntries.forEach(({ section, item, titleKey }) => {
    const sameTitle = baselineEntries.find((entry) => entry.titleKey === titleKey);

    if (!sameTitle) {
      edits.push(
        createEdit("add", section.title, item.title, {
          proposedValue: item.body,
          provenance: item.provenance,
          manualReview: Boolean(item.flyerRecommended),
        }),
      );
      return;
    }

    if (sameTitle.section.title !== section.title) {
      edits.push(
        createEdit("move", section.title, item.title, {
          baselineValue: sameTitle.section.title,
          proposedValue: section.title,
          provenance: item.provenance,
          note: `Move this item from ${sameTitle.section.title} to ${section.title}.`,
          confidence: 0.76,
          manualReview: true,
        }),
      );
    }

    if (normalizeText(sameTitle.item.body) !== normalizeText(item.body)) {
      edits.push(
        createEdit("modify", section.title, item.title, {
          baselineValue: sameTitle.item.body,
          proposedValue: item.body,
          provenance: item.provenance,
          confidence: 0.88,
          manualReview: false,
        }),
      );
    }
  });

  baselineEntries
    .filter(({ section }) => !section.locked)
    .forEach(({ section, item, key, titleKey }) => {
      const exactMatch = draftEntries.some((entry) => entry.key === key);

      if (exactMatch) {
        return;
      }

      const similarTitle = draftEntries.some((entry) => entry.titleKey === titleKey);

      if (similarTitle) {
        return;
      }

      edits.push(
        createEdit("remove", section.title, item.title, {
          baselineValue: item.body,
          provenance: item.provenance,
          confidence: 0.8,
          manualReview: true,
        }),
      );
    });

  return edits;
}

function groupInstructions(
  edits: ProposedNewsletterEdit[],
  audienceLabel: string,
) {
  if (!edits.length) {
    return [`Review the ${audienceLabel} newsletter and confirm there are no content changes to apply.`];
  }

  return edits.map((edit) => {
    if (edit.kind === "keep_locked") {
      return `Keep the ${edit.targetSection} block unchanged because it is treated as a locked evergreen section.`;
    }

    if (edit.kind === "remove") {
      return `Remove "${edit.title}" from ${edit.targetSection}.`;
    }

    if (edit.kind === "modify") {
      return `Update "${edit.title}" in ${edit.targetSection} to: ${edit.proposedValue ?? edit.title}`;
    }

    if (edit.kind === "move") {
      return edit.note ?? `Move "${edit.title}" into ${edit.targetSection}.`;
    }

    return `Add "${edit.title}" to ${edit.targetSection}: ${edit.proposedValue ?? edit.title}`;
  });
}

function buildRunbook(
  baseline: MembershipToolkitBaseline,
  boardDraft: NewsletterDraft,
  teacherDraft: NewsletterDraft,
  parentDraft: NewsletterDraft,
  proposedEdits: ProposedNewsletterEdit[],
  state: DemoState,
): MtkRunbookStep[] {
  const teacherPublishStep = state.approvals
    .find((approval) => approval.id === "approval-thursday")
    ?.steps.find((step) => step.id === "approval-thursday-publish");
  const parentDuplicateStep = state.approvals
    .find((approval) => approval.id === "approval-sunday")
    ?.steps.find((step) => step.id === "approval-sunday-duplicate");
  const parentScheduleStep = state.approvals
    .find((approval) => approval.id === "approval-sunday")
    ?.steps.find((step) => step.id === "approval-sunday-schedule");
  const draftsDashboardUrl = resolveMembershipToolkitDraftsUrl(
    boardDraft.delivery?.directUrl,
    teacherDraft.delivery?.directUrl,
    parentDraft.delivery?.directUrl,
    baseline.sourceUrl,
    state.newsletters.lastPublishedParent.delivery?.directUrl,
  );
  const boardDuplicateUrl = resolveMembershipToolkitDuplicateUrl(
    baseline.sourceUrl,
    state.newsletters.lastPublishedParent.delivery?.directUrl,
  );
  const parentDuplicateUrl = resolveMembershipToolkitDuplicateUrl(
    teacherDraft.delivery?.directUrl,
    parentDraft.delivery?.directUrl,
    baseline.sourceUrl,
    state.newsletters.lastPublishedParent.delivery?.directUrl,
  );
  const teacherDraftUrl =
    teacherDraft.delivery?.directUrl &&
    teacherDraft.delivery.directUrl.includes("/dashboard/")
      ? teacherDraft.delivery.directUrl
      : draftsDashboardUrl;
  const parentDraftUrl =
    parentDraft.delivery?.directUrl &&
    parentDraft.delivery.directUrl.includes("/dashboard/")
      ? parentDraft.delivery.directUrl
      : draftsDashboardUrl;

  return [
    {
      id: "runbook-duplicate-board",
      title: "Duplicate the latest sent newsletter for board review",
      audience: "board_review",
      action: "duplicate",
      targetUrl: boardDuplicateUrl,
      instructions: [
        "Open the latest sent newsletter in Membership Toolkit.",
        `Duplicate the newsletter and rename it to "${boardDraft.title}".`,
      ],
      requiredOutputs: ["directUrl", "externalId"],
      completionState: "pending",
      note:
        "PTA Pilot treats the duplicated MTK draft as the board-review working copy for the week.",
    },
    {
      id: "runbook-edit-board",
      title: "Apply PTA Pilot's patch plan to the board-review draft",
      audience: "board_review",
      action: "edit",
      targetUrl: draftsDashboardUrl,
      instructions: groupInstructions(proposedEdits, "board review"),
      requiredOutputs: ["directUrl", "externalId"],
      completionState: "pending",
      note:
        "Use the patch list in order, keeping sponsor, quick-link, and footer blocks stable unless a human explicitly changes them.",
    },
    {
      id: "runbook-test-board",
      title: "Trigger a Membership Toolkit board-review test send",
      audience: "board_review",
      action: "test_send",
      targetUrl: draftsDashboardUrl,
      instructions: [
        `Use the current MTK draft for "${boardDraft.title}" and trigger a test newsletter to the PTA board and content owners.`,
        "Paste the direct MTK draft URL back into PTA Pilot after the test send.",
      ],
      requiredOutputs: ["directUrl"],
      completionState: "pending",
    },
    {
      id: "runbook-publish-teachers",
      title: "Publish the teacher edition after approval",
      audience: "teachers",
      action: "publish",
      targetUrl: teacherDraftUrl,
      instructions: [
        `Publish the teacher-facing MTK newsletter for "${teacherDraft.title}".`,
        "Confirm the live direct URL and external identifier so PTA Pilot can send the principal and teacher-rep email automatically.",
      ],
      requiredOutputs: ["directUrl", "externalId"],
      completionState:
        teacherPublishStep?.status === "completed" ? "completed" : "pending",
      note: teacherPublishStep?.note,
    },
    {
      id: "runbook-duplicate-parents",
      title: "Duplicate the teacher-approved version for the parent send",
      audience: "parents",
      action: "duplicate",
      targetUrl: parentDuplicateUrl,
      instructions: [
        `Duplicate the approved teacher version and prepare the parent-facing newsletter titled "${parentDraft.title}".`,
        "Keep teacher-only notes out of the parent version.",
      ],
      requiredOutputs: ["directUrl", "externalId"],
      completionState:
        parentDuplicateStep?.status === "completed" ? "completed" : "pending",
      note: parentDuplicateStep?.note,
    },
    {
      id: "runbook-schedule-parents",
      title: "Schedule the parent newsletter",
      audience: "parents",
      action: "schedule",
      targetUrl: parentDraftUrl,
      instructions: [
        `Schedule "${parentDraft.title}" for Sunday at 6:00 PM unless PTA Pilot's break check says to skip.`,
        "Paste the final direct URL, external identifier, and scheduled timestamp back into PTA Pilot.",
      ],
      requiredOutputs: ["directUrl", "externalId", "scheduledFor"],
      completionState:
        parentScheduleStep?.status === "completed" ? "completed" : "pending",
      note: parentScheduleStep?.note,
    },
  ];
}

function buildActionBodyWithBaseline(
  state: DemoState,
  baseline: MembershipToolkitBaseline,
  boardDraft: NewsletterDraft,
  proposedEdits: ProposedNewsletterEdit[],
) {
  return state.approvals.map((approval) => {
    if (approval.id === "approval-monday") {
      return {
        ...approval,
        body: [
          "Good morning PTA families. Sharing the latest published newsletter plus this week's incoming highlights.",
          baseline.sourceUrl
            ? `Current newsletter link: ${baseline.sourceUrl}`
            : "Current newsletter link: pending. Add the latest sent Membership Toolkit URL or enable MTK discovery before sending.",
          "Reply with updates by Wednesday 10 AM so PTA Pilot can build the next draft.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      };
    }

    if (approval.id === "approval-wednesday") {
      return {
        ...approval,
        body: [
          `Hi board team, PTA Pilot staged "${boardDraft.title}" from the latest Membership Toolkit baseline and identified ${proposedEdits.length} proposed change(s).`,
          baseline.sourceUrl
            ? `Baseline newsletter: ${baseline.sourceUrl}`
            : "Baseline newsletter: pending. Add the latest sent Membership Toolkit URL or enable MTK discovery before the board-review pass.",
          "Please review the board-test draft and send edits by Wednesday 5 PM.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      };
    }

    if (approval.id === "approval-thursday") {
      return {
        ...approval,
        body: [
          "Publish the teacher version in Membership Toolkit, then send the direct link to the Principal and Teacher Rep.",
          "PTA Pilot already generated the MTK runbook and patch plan from the approved content workspace.",
        ].join("\n\n"),
      };
    }

    if (approval.id === "approval-sunday") {
      return {
        ...approval,
        body: [
          "Duplicate the teacher-approved MTK newsletter for parents and schedule it for Sunday at 6:00 PM.",
          "PTA Pilot will continue the downstream Gmail notifications after the MTK direct URL and schedule timestamp are recorded.",
        ].join("\n\n"),
      };
    }

    return approval;
  });
}

export function buildContentWorkspace(state: DemoState, input: {
  baseline: MembershipToolkitBaseline;
  extractedItems: ExtractedContentItem[];
}) {
  const { baseline, extractedItems } = input;
  const { draft: boardDraft } = buildBoardDraft(baseline, extractedItems, state);
  const teacherDraft = buildTeacherDraft(boardDraft, extractedItems);
  const parentDraft = deriveParentDraftFromTeacher(teacherDraft);
  const proposedEdits = buildProposedEdits(baseline, boardDraft);
  const runbook = buildRunbook(
    baseline,
    boardDraft,
    teacherDraft,
    parentDraft,
    proposedEdits,
    state,
  );

  return {
    contentWorkspace: {
      lastIngestedAt: new Date().toISOString(),
      baseline,
      proposedEdits,
      runbook,
    } satisfies ContentWorkspaceState,
    newsletters: {
      board: boardDraft,
      teachers: teacherDraft,
      parents: parentDraft,
    },
    approvals: buildActionBodyWithBaseline(
      state,
      baseline,
      boardDraft,
      proposedEdits,
    ),
  };
}

export function rebuildContentWorkspaceFromDrafts(state: DemoState) {
  const baseline = state.contentWorkspace.baseline;

  if (!baseline) {
    return {
      contentWorkspace: state.contentWorkspace,
      newsletters: {
        parents: state.newsletters.parents,
      },
      approvals: state.approvals,
    };
  }

  const parentDraft = deriveParentDraftFromTeacher(state.newsletters.teachers);
  const proposedEdits = buildProposedEdits(baseline, state.newsletters.board);
  const runbook = buildRunbook(
    baseline,
    state.newsletters.board,
    state.newsletters.teachers,
    parentDraft,
    proposedEdits,
    state,
  );

  return {
    contentWorkspace: {
      ...state.contentWorkspace,
      baseline,
      proposedEdits,
      runbook,
      lastIngestedAt: new Date().toISOString(),
    } satisfies ContentWorkspaceState,
    newsletters: {
      parents: parentDraft,
    },
    approvals: buildActionBodyWithBaseline(
      state,
      baseline,
      state.newsletters.board,
      proposedEdits,
    ),
  };
}
