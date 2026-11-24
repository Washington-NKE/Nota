import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { prisma } from "../config/prisma";
import { parseMusicXml, extractMusicXmlString } from "../services/musicxml.service";

interface UploadRequest extends Request {
  file?: Express.Multer.File;
}

/**
 * Accepts a MusicXML (.musicxml, .xml) or compressed MXL (.mxl) upload,
 * extracts root score XML safely, parses structural elements, and stores
 * score metadata, parts, measures, and XML in the database.
 */
export async function uploadScore(req: UploadRequest, res: Response, next: NextFunction) {
  try {
    const { pieceId } = req.params;
    if (!req.file) {
      return res.status(400).json({ message: "No MusicXML or MXL file uploaded." });
    }

    const piece = await prisma.piece.findUnique({ where: { id: pieceId } });
    if (!piece) {
      return res.status(404).json({ message: "Piece not found." });
    }

    const xmlString = extractMusicXmlString(req.file.buffer, req.file.originalname);
    const parsed = parseMusicXml(xmlString);
    const sourceFingerprint = crypto.createHash("sha256").update(xmlString).digest("hex");
    const existingScoreCount = await prisma.score.count({ where: { pieceId } });

    const score = await prisma.score.create({
      data: {
        pieceId,
        title: parsed.title || req.file.originalname,
        sourceFileName: req.file.originalname,
        sourceFingerprint,
        isCanonical: existingScoreCount === 0,
        musicXmlUrl: `/api/scores/xml-file/${encodeURIComponent(req.file.originalname)}`,
        musicXmlContent: xmlString,
        measureCount: parsed.measureCount,
        parts: {
          create: parsed.parts.map((p) => ({
            partId: p.id,
            name: p.name,
            instrument: p.instrument,
          })),
        },
      },
      include: { parts: true },
    });

    // Populate ScoreMeasures for the primary part (or union of measures)
    const primaryPart = parsed.parts[0];
    if (primaryPart && primaryPart.measures.length > 0) {
      await prisma.scoreMeasure.createMany({
        data: primaryPart.measures.map((m, positionIndex) => ({
          scoreId: score.id,
          measureNumber: m.number,
          originalNumber: m.originalNumber,
          positionIndex,
          isPickup: positionIndex === 0 && m.originalNumber.startsWith("0"),
          timeSignature: m.timeSignature,
          keyFifths: m.keyFifths,
          tempo: m.tempo,
          noteCount: m.noteCount,
          restCount: m.restCount,
        })),
        skipDuplicates: true,
      });
    }

    res.status(201).json({
      score: {
        id: score.id,
        pieceId: score.pieceId,
        title: score.title,
        measureCount: score.measureCount,
        createdAt: score.createdAt,
      },
      parts: score.parts,
      measureCount: parsed.measureCount,
    });
  } catch (err) {
    next(err);
  }
}

export async function getScore(req: Request, res: Response, next: NextFunction) {
  try {
    const { pieceId } = req.params;
    const score = await prisma.score.findFirst({
      where: { pieceId },
      orderBy: { createdAt: "desc" },
      include: { parts: true },
    });
    if (!score) return res.status(404).json({ message: "No score uploaded for this piece yet." });

    res.json({
      id: score.id,
      pieceId: score.pieceId,
      title: score.title,
      measureCount: score.measureCount,
      musicXmlUrl: score.musicXmlUrl,
      createdAt: score.createdAt,
      parts: score.parts,
    });
  } catch (err) {
    next(err);
  }
}

export async function getScoreById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const score = await prisma.score.findUnique({
      where: { id },
      include: { parts: true, measures: { orderBy: { measureNumber: "asc" } } },
    });
    if (!score) return res.status(404).json({ message: "Score not found." });

    res.json(score);
  } catch (err) {
    next(err);
  }
}

/**
 * Returns raw MusicXML text for Verovio rendering on the frontend.
 */
export async function getScoreXml(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    // id can be a score id or piece id
    const score = await prisma.score.findFirst({
      where: {
        OR: [{ id }, { pieceId: id }],
      },
      orderBy: { createdAt: "desc" },
    });

    if (!score || !score.musicXmlContent) {
      return res.status(404).json({ message: "Score XML content not found." });
    }

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.send(score.musicXmlContent);
  } catch (err) {
    next(err);
  }
}
