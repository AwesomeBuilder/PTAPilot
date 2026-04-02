import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  ApprovalAction,
  ApprovalExecutionStatus,
  ApprovalExecutionStep,
  DemoState,
} from "@pta-pilot/shared";
import { seedDemoState } from "@pta-pilot/shared";

const PLACEHOLDER_NEWSLETTER_URL =
  "https://lincolnpta.membershiptoolkit.com/newsletter/last-week";

function isPlaceholderNewsletterUrl(value: string | undefined) {
  return value === PLACEHOLDER_NEWSLETTER_URL;
}

function sanitizePlaceholderNewsletterUrl(state: DemoState): DemoState {
  const nextState = structuredClone(state);

  nextState.inbox.artifacts = nextState.inbox.artifacts
    .map((artifact) =>
      artifact.type === "previous_newsletter_link" &&
      isPlaceholderNewsletterUrl(artifact.originalUrl)
        ? {
            ...artifact,
            originalUrl: undefined,
            note:
              "Placeholder previous-newsletter URL removed. Add the real latest sent Membership Toolkit newsletter URL if auto-discovery is unavailable.",
          }
        : artifact,
    )
    .filter(
      (artifact) =>
        artifact.type !== "previous_newsletter_link" || Boolean(artifact.originalUrl),
    );

  if (isPlaceholderNewsletterUrl(nextState.newsletters.lastPublishedParent.delivery?.directUrl)) {
    nextState.newsletters.lastPublishedParent.delivery = {
      ...(nextState.newsletters.lastPublishedParent.delivery ?? {}),
      directUrl: undefined,
      externalId:
        nextState.newsletters.lastPublishedParent.delivery?.externalId ===
        "mtk-last-week"
          ? undefined
          : nextState.newsletters.lastPublishedParent.delivery?.externalId,
    };
  }

  if (
    nextState.contentWorkspace.baseline &&
    isPlaceholderNewsletterUrl(nextState.contentWorkspace.baseline.sourceUrl)
  ) {
    nextState.contentWorkspace.baseline.sourceUrl = undefined;
    nextState.contentWorkspace.baseline.note =
      "Placeholder previous-newsletter URL removed. Add the real latest sent Membership Toolkit newsletter URL or enable live discovery.";
  }

  nextState.contentWorkspace.runbook = nextState.contentWorkspace.runbook.map((step) =>
    isPlaceholderNewsletterUrl(step.targetUrl)
      ? {
          ...step,
          targetUrl: undefined,
        }
      : step,
  );

  return nextState;
}

function mergeWithSeed<T>(seed: T, value: unknown): T {
  if (Array.isArray(seed)) {
    return (Array.isArray(value) ? value : seed) as T;
  }

  if (seed && typeof seed === "object") {
    const nextValue =
      value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const mergedEntries = Object.entries(seed as Record<string, unknown>).map(
      ([key, seedValue]) => [key, mergeWithSeed(seedValue, nextValue[key])],
    );

    return {
      ...(seed as Record<string, unknown>),
      ...(nextValue as Record<string, unknown>),
      ...Object.fromEntries(mergedEntries),
    } as T;
  }

  return (value === undefined ? seed : value) as T;
}

function deriveExecutionStatus(
  steps: ApprovalExecutionStep[],
): ApprovalExecutionStatus {
  if (!steps.length || steps.every((step) => step.status === "pending")) {
    return "not_started";
  }

  if (steps.some((step) => step.status === "running")) {
    return "running";
  }

  if (steps.some((step) => step.status === "failed")) {
    return "failed";
  }

  if (steps.some((step) => step.status === "needs_operator")) {
    return "needs_operator";
  }

  if (steps.every((step) => step.status === "completed")) {
    return "completed";
  }

  if (
    steps.every((step) => ["completed", "skipped"].includes(step.status)) &&
    steps.some((step) => step.status === "skipped")
  ) {
    return "skipped";
  }

  return "running";
}

function normalizeApprovalSteps(
  seedSteps: ApprovalExecutionStep[],
  steps: unknown,
): ApprovalExecutionStep[] {
  if (!Array.isArray(steps)) {
    return structuredClone(seedSteps);
  }

  return steps
    .filter(
      (step): step is Record<string, unknown> =>
        Boolean(step) && typeof step === "object",
    )
    .map((step, index) => {
      const stepId = typeof step.id === "string" ? step.id : undefined;
      const seedStep =
        seedSteps.find((candidate) => candidate.id === stepId) ?? seedSteps[index];

      return seedStep
        ? mergeWithSeed(seedStep, step)
        : (step as unknown as ApprovalExecutionStep);
    });
}

function normalizeApprovals(approvals: unknown): ApprovalAction[] {
  const seedApprovals = seedDemoState.approvals;

  if (!Array.isArray(approvals)) {
    return structuredClone(seedApprovals);
  }

  const normalizedApprovals = approvals
    .filter(
      (approval): approval is Record<string, unknown> =>
        Boolean(approval) && typeof approval === "object",
    )
    .map((approval, index) => {
      const approvalId =
        typeof approval.id === "string" ? approval.id : undefined;
      const seedApproval =
        seedApprovals.find((candidate) => candidate.id === approvalId) ??
        seedApprovals[index];
      const steps = normalizeApprovalSteps(
        seedApproval?.steps ?? [],
        approval.steps,
      );

      const mergedApproval = seedApproval
        ? mergeWithSeed(seedApproval, approval)
        : (approval as unknown as ApprovalAction);

      return {
        ...mergedApproval,
        steps,
        executionStatus:
          typeof approval.executionStatus === "string"
            ? (approval.executionStatus as ApprovalExecutionStatus)
            : deriveExecutionStatus(steps),
      } satisfies ApprovalAction;
    });

  const seenIds = new Set(normalizedApprovals.map((approval) => approval.id));
  const missingSeedApprovals = seedApprovals
    .filter((approval) => !seenIds.has(approval.id))
    .map((approval) => structuredClone(approval));

  return [...normalizedApprovals, ...missingSeedApprovals];
}

export class RuntimeStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<DemoState> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as DemoState;
      const state = mergeWithSeed(structuredClone(seedDemoState), parsed);
      const sanitizedState = sanitizePlaceholderNewsletterUrl(state);

      return {
        ...sanitizedState,
        approvals: normalizeApprovals(sanitizedState.approvals),
      };
    } catch {
      const initialState = structuredClone(seedDemoState);
      await this.write(initialState);
      return initialState;
    }
  }

  async write(state: DemoState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), "utf-8");
  }
}
