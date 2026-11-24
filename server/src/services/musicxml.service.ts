import { XMLParser } from "fast-xml-parser";
import AdmZip from "adm-zip";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false,
  htmlEntities: false,
  isArray: (name) => ["part", "measure", "note", "score-part", "score-instrument"].includes(name),
});

export interface ParsedMeasure {
  number: number;
  originalNumber: string;
  timeSignature: string | null;
  keyFifths: number | null;
  tempo: string | null;
  noteCount: number;
  restCount: number;
}

export interface ParsedPart {
  id: string;
  name: string;
  instrument: string | null;
  measures: ParsedMeasure[];
}

export interface ParsedScore {
  title: string | null;
  composer: string | null;
  measureCount: number;
  parts: ParsedPart[];
  rawXml: string;
}

const MAX_DECOMPRESSED_BYTES = 50 * 1024 * 1024; // 50MB protection limit

/**
 * Extracts and returns the raw XML string from a file buffer, whether it is
 * plain .musicxml/.xml or compressed .mxl (ZIP format).
 */
export function extractMusicXmlString(buffer: Buffer, originalFilename: string): string {
  const isMxl = originalFilename.toLowerCase().endsWith(".mxl") ||
    (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04);

  if (!isMxl) {
    const text = buffer.toString("utf-8");
    if (/<!DOCTYPE/i.test(text) || /<!ENTITY/i.test(text)) {
      throw new Error("Invalid file content: XML document type declarations and entities are not allowed.");
    }
    if (!text.includes("<score-partwise") && !text.includes("<score-timewise")) {
      throw new Error("Invalid file content: Expected a MusicXML document.");
    }
    return text;
  }

  // Handle compressed .mxl archive
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch (err) {
    throw new Error(`Failed to read compressed MXL archive: ${(err as Error).message}`);
  }

  const zipEntries = zip.getEntries();
  let totalDecompressedSize = 0;
  for (const entry of zipEntries) {
    if (entry.entryName.includes("..") || entry.entryName.startsWith("/") || entry.entryName.startsWith("\\")) {
      throw new Error("Malicious MXL archive: Path traversal detected.");
    }
    totalDecompressedSize += entry.header.size;
    if (totalDecompressedSize > MAX_DECOMPRESSED_BYTES) {
      throw new Error("Decompression bomb protection: Uncompressed size exceeds 50MB limit.");
    }
  }

  // 1. Look for META-INF/container.xml
  const containerEntry = zip.getEntry("META-INF/container.xml");
  let rootfilePath: string | null = null;

  if (containerEntry) {
    try {
      const containerXml = zip.readAsText(containerEntry);
      const containerDoc = parser.parse(containerXml);
      const rootfile = containerDoc?.container?.rootfiles?.rootfile;
      if (Array.isArray(rootfile)) {
        rootfilePath = rootfile[0]?.["@_full-path"];
      } else if (rootfile) {
        rootfilePath = rootfile["@_full-path"];
      }
    } catch {
      // Fallback to searching for .xml or .musicxml if container parse fails
    }
  }

  // 2. If container specified a rootfile, extract it
  if (rootfilePath) {
    if (rootfilePath.includes("..") || rootfilePath.startsWith("/") || rootfilePath.startsWith("\\")) {
      throw new Error("Malicious MXL archive: Invalid root document path.");
    }
    const rootEntry = zip.getEntry(rootfilePath);
    if (rootEntry) {
      const rootXml = zip.readAsText(rootEntry);
      if (/<!DOCTYPE/i.test(rootXml) || /<!ENTITY/i.test(rootXml)) {
        throw new Error("Invalid MXL root: XML document type declarations and entities are not allowed.");
      }
      if (!rootXml.includes("<score-partwise") && !rootXml.includes("<score-timewise")) {
        throw new Error("The MXL root file is not a valid MusicXML score.");
      }
      return rootXml;
    }
  }

  // 3. Fallback: find the first non-META-INF .xml or .musicxml entry
  for (const entry of zipEntries) {
    const name = entry.entryName.toLowerCase();
    if (!name.startsWith("meta-inf/") && (name.endsWith(".xml") || name.endsWith(".musicxml"))) {
      const rootXml = zip.readAsText(entry);
      if (/<!DOCTYPE/i.test(rootXml) || /<!ENTITY/i.test(rootXml)) {
        throw new Error("Invalid MXL root: XML document type declarations and entities are not allowed.");
      }
      if (rootXml.includes("<score-partwise") || rootXml.includes("<score-timewise")) {
        return rootXml;
      }
    }
  }

  throw new Error("Could not find a valid MusicXML score document inside the MXL archive.");
}

/**
 * Parses a MusicXML document into a structured format containing composition metadata,
 * parts, staves, measure ordering, key/time signatures, tempo, and note/rest statistics.
 */
export function parseMusicXml(xml: string): ParsedScore {
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch (err) {
    throw new Error(`XML parsing error: ${(err as Error).message}`);
  }

  const scorePartwise = doc["score-partwise"];
  const scoreTimewise = doc["score-timewise"];
  if (!scorePartwise && !scoreTimewise) {
    throw new Error("Unsupported MusicXML structure: Expected a <score-partwise> or <score-timewise> root element.");
  }
  const scoreDocument = scorePartwise ?? scoreTimewise;

  // Metadata extraction
  const workTitle = scoreDocument.work?.["work-title"] ?? scoreDocument["movement-title"] ?? null;
  const identification = scoreDocument.identification;
  let composer: string | null = null;
  if (identification?.creator) {
    const creators = toArray(identification.creator);
    const composerEntry = creators.find((c: any) => c["@_type"] === "composer") || creators[0];
    composer = typeof composerEntry === "string" ? composerEntry : (composerEntry?.["#text"] ?? null);
  }

  // Part list extraction
  const rawPartsList = toArray(scoreDocument["part-list"]?.["score-part"]);
  const partMap = new Map<string, { name: string; instrument: string | null }>();

  for (const p of rawPartsList) {
    const id = p["@_id"];
    const name = p["part-name"] ?? id;
    let instrument: string | null = null;
    const instruments = toArray(p["score-instrument"]);
    if (instruments.length > 0 && instruments[0]["instrument-name"]) {
      instrument = instruments[0]["instrument-name"];
    }
    partMap.set(id, { name, instrument });
  }

  // Parts extraction
  let rawParts: any[];
  if (scorePartwise) {
    rawParts = toArray(scorePartwise.part);
  } else {
    const timewiseMeasures = toArray(scoreTimewise.measure);
    rawParts = rawPartsList.map((partDef: any) => ({
      "@_id": partDef["@_id"],
      measure: timewiseMeasures.flatMap((measure: any, measureIndex: number) => {
        const matchingParts = toArray(measure.part).filter(
          (measurePart: any) => measurePart["@_id"] === partDef["@_id"]
        );
        return matchingParts.map((measurePart: any) => ({
          "@_number": measure["@_number"] ?? String(measureIndex + 1),
          attributes: measurePart.attributes,
          direction: measurePart.direction,
          note: measurePart.note,
        }));
      }),
    }));
  }
  const parts: ParsedPart[] = rawParts.map((part: any) => {
    const partId = part["@_id"];
    const meta = partMap.get(partId);
    const rawMeasures = toArray(part.measure);
    const measures: ParsedMeasure[] = rawMeasures.map((measure: any, index: number) =>
      parseMeasure(measure, index + 1)
    );

    return {
      id: partId,
      name: meta?.name ?? partId,
      instrument: meta?.instrument ?? null,
      measures,
    };
  });

  // Calculate canonical measure count from the part with the most measures
  const measureCount = parts.reduce((max, p) => Math.max(max, p.measures.length), 0);

  return {
    title: workTitle,
    composer,
    measureCount,
    parts,
    rawXml: xml,
  };
}

function parseMeasure(measure: any, fallbackNumber: number): ParsedMeasure {
  const originalNumber = String(measure["@_number"] ?? fallbackNumber);
  const parsedNum = parseInt(originalNumber, 10);
  const number = Number.isNaN(parsedNum) ? fallbackNumber : parsedNum;

  const attributes = measure.attributes;
  const timeSignature = attributes?.time
    ? `${attributes.time.beats}/${attributes.time["beat-type"]}`
    : null;
  const keyFifths = attributes?.key?.fifths != null ? Number(attributes.key.fifths) : null;

  // Tempo indication
  let tempo: string | null = null;
  if (measure.direction) {
    const directions = toArray(measure.direction);
    for (const d of directions) {
      if (d.sound?.["@_tempo"]) {
        tempo = `${d.sound["@_tempo"]} BPM`;
        break;
      }
      if (d["direction-type"]?.metronome) {
        const metro = d["direction-type"].metronome;
        tempo = `${metro["beat-unit"]} = ${metro["per-minute"]}`;
        break;
      }
    }
  }

  const rawNotes = toArray(measure.note);
  let noteCount = 0;
  let restCount = 0;
  for (const n of rawNotes) {
    if (n.rest != null) {
      restCount++;
    } else {
      noteCount++;
    }
  }

  return {
    number,
    originalNumber,
    timeSignature,
    keyFifths,
    tempo,
    noteCount,
    restCount,
  };
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
