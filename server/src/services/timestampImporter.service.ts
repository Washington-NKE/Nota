import crypto from "crypto";
import { prisma } from "../config/prisma";
import type { AnnotationTrack } from "@prisma/client";

export interface ParsedTimestampItem {
  index: number;
  section: string | null;
  subsection: string | null;
  startTimestampSec: number;
  endTimestampSec: number | null;
  timestampRaw: string;
  text: string;
  measureRangeStart: number | null;
  measureRangeEnd: number | null;
}

export interface ImportPreviewResult {
  fingerprint: string;
  pieceTitleHint?: string;
  itemCount: number;
  sections: string[];
  durationEstimateSec: number;
  items: ParsedTimestampItem[];
  warnings: string[];
}

export function parseTimeString(timeStr: string): number {
  const parts = timeStr.trim().split(":").map((p) => parseFloat(p));
  if (parts.some((p) => Number.isNaN(p))) {
    throw new Error(`Invalid time token: "${timeStr}"`);
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] ?? 0;
}

export function parseTimestampAnalysisFile(content: string): ImportPreviewResult {
  const lines = content.split(/\r?\n/);
  const items: ParsedTimestampItem[] = [];
  const sectionsFound = new Set<string>();
  const warnings: string[] = [];

  let currentSection: string | null = null;
  let currentSubsection: string | null = null;
  let currentItem: Partial<ParsedTimestampItem> | null = null;
  const itemTexts: string[] = [];

  const timeRangeRegex = /^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)/;
  const singleTimeRegex = /^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*$/;

  function finalizeCurrentItem() {
    if (currentItem && currentItem.startTimestampSec != null) {
      const fullText = itemTexts.join(" ").trim();
      if (fullText) {
        items.push({
          index: items.length + 1,
          section: currentItem.section ?? currentSection,
          subsection: currentItem.subsection ?? currentSubsection,
          startTimestampSec: currentItem.startTimestampSec,
          endTimestampSec: currentItem.endTimestampSec ?? null,
          timestampRaw: currentItem.timestampRaw ?? "",
          text: fullText,
          measureRangeStart: null,
          measureRangeEnd: null,
        });
      }
      currentItem = null;
      itemTexts.length = 0;
    }
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // 1. Check Section headers FIRST (e.g. exposition, development, recapitulation, coda)
    const lower = trimmed.toLowerCase();
    const isSectionHeader =
      lower === "exposition" ||
      lower === "development" ||
      lower === "recapitulation" ||
      lower === "coda" ||
      lower.startsWith("section one") ||
      lower.startsWith("section two") ||
      lower.startsWith("section three") ||
      lower.startsWith("section four") ||
      lower === "exposition repeat" ||
      lower === "development repeat" ||
      lower === "recapitulation repeat";

    if (isSectionHeader) {
      finalizeCurrentItem();
      currentSection = trimmed;
      sectionsFound.add(trimmed);
      currentSubsection = null;
      continue;
    }

    // 2. Check Subsection headers (e.g. "part one: ...", "part two", "part 1:")
    const isSubsectionHeader =
      lower.startsWith("part 1:") ||
      lower.startsWith("part 2:") ||
      lower.startsWith("part 3:") ||
      lower.startsWith("part 4:") ||
      lower.startsWith("part 5:") ||
      lower.startsWith("part one") ||
      lower.startsWith("part two") ||
      lower.startsWith("part three") ||
      lower.startsWith("part four") ||
      lower.startsWith("part five");

    if (isSubsectionHeader && !currentItem) {
      currentSubsection = trimmed;
      continue;
    }

    // 3. Check Timestamp range
    const rangeMatch = trimmed.match(timeRangeRegex);
    if (rangeMatch) {
      finalizeCurrentItem();
      const startSec = parseTimeString(rangeMatch[1]);
      const parsedEndSec = parseTimeString(rangeMatch[2]);
      const endSec = parsedEndSec >= startSec ? parsedEndSec : null;
      if (endSec == null) {
        warnings.push(
          `Reversed timestamp range ignored for item at ${rangeMatch[1]}-${rangeMatch[2]}; the original text and timestamp are preserved.`
        );
      }
      currentItem = {
        section: currentSection,
        subsection: currentSubsection,
        startTimestampSec: startSec,
        endTimestampSec: endSec,
        timestampRaw: `${rangeMatch[1]}-${rangeMatch[2]}`,
      };
      continue;
    }

    // 4. Check Single timestamp
    const singleMatch = trimmed.match(singleTimeRegex);
    if (singleMatch) {
      finalizeCurrentItem();
      const startSec = parseTimeString(singleMatch[1]);
      currentItem = {
        section: currentSection,
        subsection: currentSubsection,
        startTimestampSec: startSec,
        endTimestampSec: null,
        timestampRaw: singleMatch[1],
      };
      continue;
    }

    // 5. Active item text
    if (currentItem) {
      itemTexts.push(trimmed);
      continue;
    }

    // Standalone metadata line before first timestamp
    if (!currentSubsection) {
      currentSubsection = trimmed;
    }
  }

  finalizeCurrentItem();

  const fingerprint = crypto.createHash("sha256").update(content.trim()).digest("hex");

  const durationEstimateSec = items.reduce(
    (max, it) => Math.max(max, it.endTimestampSec ?? it.startTimestampSec),
    0
  );

  return {
    fingerprint,
    itemCount: items.length,
    sections: Array.from(sectionsFound),
    durationEstimateSec,
    items,
    warnings,
  };
}

export interface CommitImportInput {
  recordingId: string;
  pieceId: string;
  track: AnnotationTrack;
  content: string;
  author?: string;
}

export async function commitTimestampImport({
  recordingId,
  pieceId,
  track,
  content,
  author = "Curator / Importer",
}: CommitImportInput) {
  const preview = parseTimestampAnalysisFile(content);

  const existingCount = await prisma.annotation.count({
    where: {
      recordingId,
      track,
      sourceFingerprint: preview.fingerprint,
    },
  });

  if (existingCount > 0) {
    return {
      success: true,
      alreadyImported: true,
      message: `Content already imported for this recording with fingerprint ${preview.fingerprint.substring(0, 8)}...`,
      importedCount: existingCount,
    };
  }

  const createdAnnotations = await prisma.$transaction(
    preview.items.map((item) =>
      prisma.annotation.create({
        data: {
          recordingId,
          pieceId,
          track,
          section: item.section,
          subsection: item.subsection,
          startTimestampSec: item.startTimestampSec,
          endTimestampSec: item.endTimestampSec,
          measureRangeStart: null,
          measureRangeEnd: null,
          title: item.subsection ?? (item.section ? `${item.section} (${item.timestampRaw})` : item.timestampRaw),
          text: item.text,
          author,
          sourceFingerprint: preview.fingerprint,
        },
      })
    )
  );

  return {
    success: true,
    alreadyImported: false,
    importedCount: createdAnnotations.length,
    fingerprint: preview.fingerprint,
    sections: preview.sections,
  };
}
