import fs from "fs";
import path from "path";
import { PrismaClient, AnnotationTrack } from "@prisma/client";
import { parseMusicXml } from "../src/services/musicxml.service";
import { parseTimestampAnalysisFile, commitTimestampImport } from "../src/services/timestampImporter.service";

const prisma = new PrismaClient();
const resourcesDir = path.resolve(import.meta.dirname, "../../timestamps and resources");

async function main() {
  console.log("Starting Nota database seeding...");

  // ==========================================
  // 1. BACH: Violin Concerto in E major, BWV 1042: I. Allegro
  // ==========================================
  console.log("\n[1/3] Processing Bach BWV 1042...");
  const bachPiece = await prisma.piece.upsert({
    where: { id: "bwv-1042-i-allegro" },
    update: {},
    create: {
      id: "bwv-1042-i-allegro",
      title: "Violin Concerto in E major, BWV 1042: I. Allegro",
      composer: "Johann Sebastian Bach",
      year: 1720,
      coverUrl: "/assets/many-notes.jpg",
    },
  });

  // Load and parse real MusicXML
  const bachXmlPath = path.join(resourcesDir, "Bach violin concert in E major BWV_1042.musicxml");
  let bachScore: any = null;
  if (fs.existsSync(bachXmlPath)) {
    console.log("  Loading MusicXML for Bach BWV 1042...");
    const bachXml = fs.readFileSync(bachXmlPath, "utf-8");
    const parsedBach = parseMusicXml(bachXml);

    bachScore = await prisma.score.upsert({
      where: { id: "bwv-1042-canonical-score" },
      update: {
        musicXmlContent: bachXml,
        measureCount: parsedBach.measureCount,
      },
      create: {
        id: "bwv-1042-canonical-score",
        pieceId: bachPiece.id,
        title: "BWV 1042 Full Score (E major)",
        musicXmlUrl: `/api/scores/bwv-1042-canonical-score/xml`,
        musicXmlContent: bachXml,
        measureCount: parsedBach.measureCount,
      },
    });

    // Populate score parts
    for (const part of parsedBach.parts) {
      await prisma.scorePart.upsert({
        where: { id: `bwv-1042-part-${part.id}` },
        update: { name: part.name, instrument: part.instrument },
        create: {
          id: `bwv-1042-part-${part.id}`,
          scoreId: bachScore.id,
          partId: part.id,
          name: part.name,
          instrument: part.instrument,
        },
      });
    }

    // Populate measures for primary part
    const primaryPart = parsedBach.parts[0];
    if (primaryPart) {
      for (const [positionIndex, m] of primaryPart.measures.entries()) {
        const existingMeasure = await prisma.scoreMeasure.findFirst({
          where: { scoreId: bachScore.id, measureNumber: m.number },
        });
        const measureData = {
          scoreId: bachScore.id,
          measureNumber: m.number,
          originalNumber: m.originalNumber,
          positionIndex,
          isPickup: positionIndex === 0 && m.originalNumber.startsWith("0"),
          timeSignature: m.timeSignature,
          keyFifths: m.keyFifths,
          tempo: m.tempo,
          noteCount: m.noteCount,
          restCount: m.restCount,
        };
        if (existingMeasure) {
          await prisma.scoreMeasure.update({
            where: { id: existingMeasure.id },
            data: measureData,
          });
        } else {
          await prisma.scoreMeasure.create({ data: measureData });
        }
      }
    }
    console.log(`  Bach MusicXML saved: ${parsedBach.measureCount} measures across ${parsedBach.parts.length} parts.`);
  }

  // Performance A: Hilary Hahn
  const bachRec1 = await prisma.recording.upsert({
    where: { id: "bwv-1042-hahn-bremen" },
    update: {},
    create: {
      id: "bwv-1042-hahn-bremen",
      pieceId: bachPiece.id,
      performer: "Hilary Hahn (violin) · Deutsche Kammerphilharmonie Bremen · cond. Omer Meir Wellber",
      year: 2020,
      provider: "youtube",
      youtubeVideoId: "DgfyryZJES4",
      durationSec: 495,
    },
  });

  // Performance B: Shunske Sato (for Comparison module)
  const bachRec2 = await prisma.recording.upsert({
    where: { id: "bwv-1042-sato-netherlands" },
    update: {},
    create: {
      id: "bwv-1042-sato-netherlands",
      pieceId: bachPiece.id,
      performer: "Shunske Sato (violin) · Netherlands Bach Society",
      year: 2019,
      provider: "youtube",
      youtubeVideoId: "24ja_j3fMsk",
      durationSec: 468,
    },
  });

  // Import Bach timestamps from bwv_1042_timestamps.txt
  const bachTxtPath = path.join(resourcesDir, "bwv_1042_timestamps.txt");
  if (fs.existsSync(bachTxtPath)) {
    const bachTxt = fs.readFileSync(bachTxtPath, "utf-8");
    await commitTimestampImport({
      recordingId: bachRec1.id,
      pieceId: bachPiece.id,
      track: AnnotationTrack.expert,
      content: bachTxt,
      author: "Musicologist Analysis File",
    });

    // Also import for layman track
    await commitTimestampImport({
      recordingId: bachRec1.id,
      pieceId: bachPiece.id,
      track: AnnotationTrack.layman,
      content: bachTxt,
      author: "Musicologist Analysis File",
    });
  }

  // Seed verified anchors for Performance A (Hahn)
  if (bachScore) {
    const hahnAnchors = [
      { measureNumber: 1, timestampSec: 5.0 },
      { measureNumber: 4, timestampSec: 13.0 },
      { measureNumber: 7, timestampSec: 20.0 },
      { measureNumber: 9, timestampSec: 26.0 },
      { measureNumber: 12, timestampSec: 34.0 },
      { measureNumber: 15, timestampSec: 42.0 },
      { measureNumber: 17, timestampSec: 48.0 },
      { measureNumber: 22, timestampSec: 58.0 },
      { measureNumber: 25, timestampSec: 67.0 },
      { measureNumber: 28, timestampSec: 73.0 },
      { measureNumber: 30, timestampSec: 78.0 },
      { measureNumber: 31, timestampSec: 81.0 },
      { measureNumber: 33, timestampSec: 87.0 },
      { measureNumber: 35, timestampSec: 92.0 },
      { measureNumber: 38, timestampSec: 101.0 },
      { measureNumber: 40, timestampSec: 105.0 },
      { measureNumber: 43, timestampSec: 113.0 },
      { measureNumber: 46, timestampSec: 120.0 },
      { measureNumber: 48, timestampSec: 126.0 },
      { measureNumber: 52, timestampSec: 138.0 },
      { measureNumber: 68, timestampSec: 181.0 },
      { measureNumber: 80, timestampSec: 214.0 },
      { measureNumber: 90, timestampSec: 245.0 },
      { measureNumber: 100, timestampSec: 273.0 },
      { measureNumber: 110, timestampSec: 298.0 },
      { measureNumber: 120, timestampSec: 337.0 },
      { measureNumber: 140, timestampSec: 386.0 },
      { measureNumber: 160, timestampSec: 436.0 },
      { measureNumber: 173, timestampSec: 465.0 },
    ];

    for (const a of hahnAnchors) {
      await prisma.syncPoint.upsert({
        where: {
          recordingId_measureNumber: {
            recordingId: bachRec1.id,
            measureNumber: a.measureNumber,
          },
        },
        update: { timestampSec: a.timestampSec, scoreId: bachScore.id },
        create: {
          recordingId: bachRec1.id,
          scoreId: bachScore.id,
          measureNumber: a.measureNumber,
          timestampSec: a.timestampSec,
        },
      });
    }

    // Anchors for Performance B (Sato, slightly different tempo)
    const satoAnchors = [
      { measureNumber: 1, timestampSec: 3.5 },
      { measureNumber: 4, timestampSec: 11.2 },
      { measureNumber: 7, timestampSec: 18.0 },
      { measureNumber: 9, timestampSec: 23.5 },
      { measureNumber: 12, timestampSec: 31.0 },
      { measureNumber: 15, timestampSec: 39.0 },
      { measureNumber: 52, timestampSec: 130.0 },
      { measureNumber: 68, timestampSec: 172.0 },
      { measureNumber: 120, timestampSec: 320.0 },
      { measureNumber: 173, timestampSec: 445.0 },
    ];
    for (const a of satoAnchors) {
      await prisma.syncPoint.upsert({
        where: {
          recordingId_measureNumber: {
            recordingId: bachRec2.id,
            measureNumber: a.measureNumber,
          },
        },
        update: { timestampSec: a.timestampSec, scoreId: bachScore.id },
        create: {
          recordingId: bachRec2.id,
          scoreId: bachScore.id,
          measureNumber: a.measureNumber,
          timestampSec: a.timestampSec,
        },
      });
    }
  }

  // ==========================================
  // 2. BEETHOVEN: Symphony No. 5 in C minor, Op. 67: I. Allegro con brio
  // ==========================================
  console.log("\n[2/3] Processing Beethoven Symphony No. 5...");
  const beethovenPiece = await prisma.piece.upsert({
    where: { id: "beethoven-5-i-allegro" },
    update: {},
    create: {
      id: "beethoven-5-i-allegro",
      title: "Symphony No. 5 in C minor, Op. 67: I. Allegro con brio",
      composer: "Ludwig van Beethoven",
      year: 1808,
      coverUrl: "/assets/cello.jpg",
    },
  });

  // Primary Performance (Christian Thielemann / Vienna Philharmonic)
  const beethovenRec1 = await prisma.recording.upsert({
    where: { id: "beethoven-5-thielemann-vpo" },
    update: {},
    create: {
      id: "beethoven-5-thielemann-vpo",
      pieceId: beethovenPiece.id,
      performer: "Christian Thielemann · Wiener Philharmoniker",
      year: 2012,
      provider: "youtube",
      youtubeVideoId: "jv2W2cCEgkY",
      durationSec: 442,
    },
  });

  // Second Performance for Comparison (Leonard Bernstein)
  const beethovenRec2 = await prisma.recording.upsert({
    where: { id: "beethoven-5-bernstein-vpo" },
    update: {},
    create: {
      id: "beethoven-5-bernstein-vpo",
      pieceId: beethovenPiece.id,
      performer: "Leonard Bernstein · Wiener Philharmoniker",
      year: 1977,
      provider: "youtube",
      youtubeVideoId: "1lHOYvIhLxo",
      durationSec: 490,
    },
  });

  // Import Beethoven 5 I.txt using the reusable importer
  const b5TxtPath = path.join(resourcesDir, "beethoven 5 I.txt");
  if (fs.existsSync(b5TxtPath)) {
    console.log("  Importing Beethoven 5 timestamp file (beethoven 5 I.txt)...");
    const b5Txt = fs.readFileSync(b5TxtPath, "utf-8");

    // Expert track (preserves exact musicological analysis wording)
    const expResult = await commitTimestampImport({
      recordingId: beethovenRec1.id,
      pieceId: beethovenPiece.id,
      track: AnnotationTrack.expert,
      content: b5Txt,
      author: "Curator Analysis",
    });
    console.log(`  Expert track imported: ${expResult.importedCount} items.`);

    // Layman track (educational friendly adaptation)
    const laymanB5Txt = b5Txt
      .replace(/statement of purpose\(fate motive\)/g, "famous four-note 'fate motive'")
      .replace(/oboe cadenza/g, "expressive solo oboe passage")
      .replace(/recapitulation/g, "return of the opening melodies");

    const layResult = await commitTimestampImport({
      recordingId: beethovenRec1.id,
      pieceId: beethovenPiece.id,
      track: AnnotationTrack.layman,
      content: laymanB5Txt,
      author: "Educational Layman Adaptation",
    });
    console.log(`  Layman track imported: ${layResult.importedCount} items.`);
  }

  // ==========================================
  // 3. MOZART: Piano Sonata No. 16 in C major, K. 545: I. Allegro
  // ==========================================
  console.log("\n[3/3] Processing Mozart Piano Sonata K. 545...");
  const mozartPiece = await prisma.piece.upsert({
    where: { id: "mozart-k545-i-allegro" },
    update: {},
    create: {
      id: "mozart-k545-i-allegro",
      title: "Piano Sonata No. 16 in C major, K. 545: I. Allegro",
      composer: "Wolfgang Amadeus Mozart",
      year: 1788,
      coverUrl: "/assets/bass-cleff.png",
    },
  });

  const mozartXmlPath = path.join(
    resourcesDir,
    "piano-sonata-no-16-in-c-major-k-545-mozart-wolfgang-amadeus.musicxml"
  );
  let mozartScore: any = null;
  if (fs.existsSync(mozartXmlPath)) {
    console.log("  Loading MusicXML for Mozart K. 545...");
    const mozartXml = fs.readFileSync(mozartXmlPath, "utf-8");
    const parsedMozart = parseMusicXml(mozartXml);

    mozartScore = await prisma.score.upsert({
      where: { id: "mozart-k545-score" },
      update: {
        musicXmlContent: mozartXml,
        measureCount: parsedMozart.measureCount,
      },
      create: {
        id: "mozart-k545-score",
        pieceId: mozartPiece.id,
        title: "K. 545 Urtext Score",
        musicXmlUrl: `/api/scores/mozart-k545-score/xml`,
        musicXmlContent: mozartXml,
        measureCount: parsedMozart.measureCount,
      },
    });

    console.log(`  Mozart MusicXML saved: ${parsedMozart.measureCount} measures.`);
  }

  const mozartRec = await prisma.recording.upsert({
    where: { id: "mozart-k545-recording" },
    update: {},
    create: {
      id: "mozart-k545-recording",
      pieceId: mozartPiece.id,
      performer: "Tiffany Poon (piano)",
      year: 2021,
      provider: "youtube",
      youtubeVideoId: "1vHx6PZg3fA",
      durationSec: 270,
    },
  });

  const k545TxtPath = path.join(resourcesDir, "K.545 movement I.txt");
  if (fs.existsSync(k545TxtPath)) {
    console.log("  Importing Mozart K. 545 timestamps...");
    const k545Txt = fs.readFileSync(k545TxtPath, "utf-8");
    await commitTimestampImport({
      recordingId: mozartRec.id,
      pieceId: mozartPiece.id,
      track: AnnotationTrack.expert,
      content: k545Txt,
      author: "Classical Sonata Analysis",
    });
    await commitTimestampImport({
      recordingId: mozartRec.id,
      pieceId: mozartPiece.id,
      track: AnnotationTrack.layman,
      content: k545Txt,
      author: "Classical Sonata Analysis",
    });
  }

  // Seed sample contextual comment
  const demoUserId = "demo-curator";
  await prisma.user.upsert({
    where: { id: demoUserId },
    update: {},
    create: { id: demoUserId, name: "Dr. Clara Schumann", email: "clara@nota.edu" },
  });

  await prisma.comment.create({
    data: {
      userId: demoUserId,
      pieceId: beethovenPiece.id,
      recordingId: beethovenRec1.id,
      timestampSec: 18.0,
      measureNumber: 1,
      body: "Notice how the fate motive rhythm (short-short-short-long) permeates not just the melody, but the entire rhythmic accompaniment throughout the movement.",
    },
  });

  console.log("\nNota database seeding COMPLETED successfully!");
}

main()
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
