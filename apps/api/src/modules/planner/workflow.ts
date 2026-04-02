import type { PlannerState, SchoolBreak } from "@pta-pilot/shared";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function shouldSkipParentSend(
  scheduledFor: string | undefined,
  breaks: SchoolBreak[],
) {
  if (!scheduledFor) {
    return { skip: false };
  }

  const scheduledDate = new Date(scheduledFor);
  const nextMonday = new Date(scheduledDate.getTime() + ONE_DAY_MS);
  const nextFriday = new Date(scheduledDate.getTime() + 5 * ONE_DAY_MS);
  const mondayDate = formatDateOnly(nextMonday);
  const fridayDate = formatDateOnly(nextFriday);

  const matchingBreak = breaks.find((schoolBreak) => {
    return (
      schoolBreak.startsOn <= fridayDate && schoolBreak.endsOn >= mondayDate
    );
  });

  if (!matchingBreak) {
    return { skip: false };
  }

  return {
    skip: true,
    reason: `${matchingBreak.name} overlaps the school week of ${mondayDate} through ${fridayDate}, so the Sunday parent send should be skipped.`,
  };
}

export function normalizePlannerState(planner: PlannerState): PlannerState {
  const activeIndex = planner.timeline.findIndex(
    (entry) => entry.stage === planner.currentStage,
  );
  const currentIndex = activeIndex === -1 ? 0 : activeIndex;

  return {
    ...planner,
    currentStage:
      planner.timeline[currentIndex]?.stage ?? planner.currentStage,
    timeline: planner.timeline.map((entry, index) => ({
      ...entry,
      status:
        index < currentIndex
          ? "done"
          : index === currentIndex
            ? "active"
            : "upcoming",
    })),
  };
}

export function refreshPlannerState(
  planner: PlannerState,
  breaks: SchoolBreak[],
): PlannerState {
  const normalizedPlanner = normalizePlannerState(planner);
  const sundayTarget = normalizedPlanner.timeline.find(
    (entry) => entry.stage === "sunday_parent_schedule",
  );
  const skipDecision = shouldSkipParentSend(sundayTarget?.targetTime, breaks);

  return {
    ...normalizedPlanner,
    skipNextParentSend: skipDecision.skip,
    skipReason: skipDecision.reason,
  };
}
