import type { ExtractedContentItem, FlyerRecommendation } from "@pta-pilot/shared";

const schoolImagePool = [
  "https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1588072432836-e10032774350?auto=format&fit=crop&w=1200&q=80",
];

export function decideIfFlyerNeeded(content: ExtractedContentItem): boolean {
  const combined = `${content.title} ${content.summary}`.toLowerCase();
  return (
    content.priority !== "evergreen" &&
    /volunteer|night|fair|event|showcase|festival|sign up/.test(combined)
  );
}

export function generateFlyerBrief(content: ExtractedContentItem): string {
  return `Create a cheerful PTA flyer for "${content.title}" with clear event timing, a school-friendly illustration style, and a bold callout based on: ${content.summary}`;
}

export async function generateFlyerImage(
  recommendation: FlyerRecommendation,
): Promise<string> {
  const index = recommendation.title.length % schoolImagePool.length;
  return schoolImagePool[index] ?? schoolImagePool[0]!;
}
