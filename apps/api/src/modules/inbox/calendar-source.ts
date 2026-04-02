import type { InboxArtifact } from "@pta-pilot/shared";
import { extractTextFromImageBuffer } from "./artifact-storage";
import { env } from "../../config/env";

function extractGoogleDrawingId(url: string) {
  const match = url.match(/docs\.google\.com\/drawings\/d\/([^/]+)/i);
  return match?.[1];
}

export function deriveGoogleDrawingsExportUrl(url: string) {
  const drawingId = extractGoogleDrawingId(url);

  if (!drawingId) {
    return null;
  }

  return `https://docs.google.com/drawings/d/${drawingId}/export/png`;
}

export async function refreshCalendarArtifactFromSource(
  artifact: InboxArtifact,
): Promise<InboxArtifact> {
  if (env.NODE_ENV === "test") {
    return artifact;
  }

  if (artifact.type !== "calendar_screenshot" || !artifact.originalUrl) {
    return artifact;
  }

  const exportUrl = deriveGoogleDrawingsExportUrl(artifact.originalUrl);

  if (!exportUrl) {
    return artifact;
  }

  try {
    const response = await fetch(exportUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(2_500),
      headers: {
        "User-Agent": "PTA Pilot Calendar Sync",
      },
    });

    if (!response.ok) {
      return artifact;
    }

    const mimeType = response.headers.get("content-type") ?? "";

    if (!mimeType.startsWith("image/")) {
      return artifact;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const { extractedText } = await extractTextFromImageBuffer(buffer);

    return {
      ...artifact,
      source: "live",
      mimeType,
      extractedText: extractedText || artifact.extractedText,
      note:
        "Calendar artifact refreshed from the public Google Drawings export before ingestion.",
    };
  } catch {
    return artifact;
  }
}
