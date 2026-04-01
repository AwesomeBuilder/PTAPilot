import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import type { InboxArtifact, InboxArtifactType } from "@pta-pilot/shared";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { env } from "../../config/env";

function getUploadDirectory() {
  return join(dirname(env.DEMO_RUNTIME_STATE_PATH), "uploads");
}

function buildLabel(type: InboxArtifactType, provided?: string) {
  if (provided?.trim()) {
    return provided.trim();
  }

  return type === "previous_newsletter_link"
    ? "Previous newsletter link"
    : "Calendar screenshot";
}

async function preprocessImage(buffer: Buffer) {
  return sharp(buffer)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width: 2200, withoutEnlargement: true })
    .grayscale()
    .normalize()
    .png()
    .toBuffer();
}

async function runOcr(buffer: Buffer) {
  const worker = await createWorker("eng");

  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return text.trim();
  } finally {
    await worker.terminate();
  }
}

export async function createInboxArtifact(input: {
  type: InboxArtifactType;
  label?: string;
  originalUrl?: string;
  note?: string;
  file?: {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
  };
}): Promise<InboxArtifact> {
  const baseArtifact: InboxArtifact = {
    id: `artifact-${crypto.randomUUID()}`,
    type: input.type,
    label: buildLabel(input.type, input.label),
    createdAt: new Date().toISOString(),
    source: "manual",
    originalUrl: input.originalUrl,
    note: input.note,
  };

  if (input.type === "previous_newsletter_link") {
    if (!input.originalUrl) {
      throw new Error("A previous newsletter URL is required for link artifacts.");
    }

    return baseArtifact;
  }

  if (!input.file) {
    throw new Error("A calendar screenshot file is required for OCR artifacts.");
  }

  const uploadDir = getUploadDirectory();
  await mkdir(uploadDir, { recursive: true });

  const extension = extname(input.file.originalname) || ".png";
  const fileName = `${baseArtifact.id}${extension}`;
  const processedFileName = `${baseArtifact.id}-processed.png`;
  const originalPath = join(uploadDir, fileName);
  const processedPath = join(uploadDir, processedFileName);
  const processedBuffer = await preprocessImage(input.file.buffer);
  const extractedText = await runOcr(processedBuffer);

  await writeFile(originalPath, input.file.buffer);
  await writeFile(processedPath, processedBuffer);

  return {
    ...baseArtifact,
    fileName: input.file.originalname,
    mimeType: input.file.mimetype,
    storedPath: processedPath,
    extractedText,
  };
}
