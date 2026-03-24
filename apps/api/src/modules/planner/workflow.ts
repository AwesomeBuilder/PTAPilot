import type { PlannerState, SchoolBreak } from "@pta-pilot/shared";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function shouldSkipParentSend(
  scheduledFor: string | undefined,
  breaks: SchoolBreak[],
) {
  if (!scheduledFor) {
    return { skip: false };
  }

  const scheduledDate = new Date(scheduledFor);
  const sevenDaysLater = new Date(scheduledDate.getTime() + 7 * ONE_DAY_MS);

  const matchingBreak = breaks.find((schoolBreak) => {
    const breakStart = new Date(`${schoolBreak.startsOn}T00:00:00`);
    return breakStart >= scheduledDate && breakStart <= sevenDaysLater;
  });

  if (!matchingBreak) {
    return { skip: false };
  }

  return {
    skip: true,
    reason: `${matchingBreak.name} starts on ${matchingBreak.startsOn}, so the Sunday parent send should be skipped.`,
  };
}

export function refreshPlannerState(
  planner: PlannerState,
  breaks: SchoolBreak[],
): PlannerState {
  const sundayTarget = planner.timeline.find(
    (entry) => entry.stage === "sunday_parent_schedule",
  );
  const skipDecision = shouldSkipParentSend(sundayTarget?.targetTime, breaks);

  return {
    ...planner,
    skipNextParentSend: skipDecision.skip,
    skipReason: skipDecision.reason,
  };
}
