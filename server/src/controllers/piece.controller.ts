import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { prisma } from "../config/prisma";

export async function listPieces(_req: Request, res: Response, next: NextFunction) {
  try {
    const pieces = await prisma.piece.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        recordings: true,
        scores: {
          select: {
            id: true,
            pieceId: true,
            title: true,
            measureCount: true,
            musicXmlUrl: true,
            createdAt: true,
          },
        },
      },
    });
    res.json(pieces);
  } catch (err) {
    next(err);
  }
}

export async function createPiece(req: Request, res: Response, next: NextFunction) {
  try {
    const { title, composer, year, coverUrl } = req.body as {
      title?: string;
      composer?: string;
      year?: number;
      coverUrl?: string;
    };

    if (!title || !composer) {
      return res.status(400).json({ message: "title and composer are required." });
    }

    const piece = await prisma.piece.create({
      data: {
        title,
        composer,
        year: year ? Number(year) : null,
        coverUrl,
      },
    });

    res.status(201).json(piece);
  } catch (err) {
    next(err);
  }
}

export async function addRecording(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: pieceId } = req.params;
    const { performer, year, youtubeVideoId, durationSec } = req.body as {
      performer?: string;
      year?: number;
      youtubeVideoId?: string;
      durationSec?: number;
    };

    if (!performer || !youtubeVideoId) {
      return res.status(400).json({ message: "performer and youtubeVideoId are required." });
    }

    const recording = await prisma.recording.create({
      data: {
        pieceId,
        performer,
        year: year ? Number(year) : null,
        youtubeVideoId,
        durationSec: durationSec ? Number(durationSec) : null,
      },
    });

    res.status(201).json(recording);
  } catch (err) {
    next(err);
  }
}

export async function listSavedPieces(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated." });

    const saved = await prisma.savedItem.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { piece: { include: { recordings: { take: 1 } } } },
    });

    res.json(saved.map((s) => s.piece));
  } catch (err) {
    next(err);
  }
}

export async function searchPieces(req: Request, res: Response, next: NextFunction) {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.json([]);

    const pieces = await prisma.piece.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { composer: { contains: q, mode: "insensitive" } },
        ],
      },
      include: { recordings: { take: 1 } },
    });
    res.json(pieces);
  } catch (err) {
    next(err);
  }
}

export async function getPiece(req: Request, res: Response, next: NextFunction) {
  try {
    const piece = await prisma.piece.findUnique({
      where: { id: req.params.id },
      include: {
        recordings: {
          include: {
            syncPoints: { orderBy: { timestampSec: "asc" } },
          },
        },
        scores: true,
      },
    });
    if (!piece) return res.status(404).json({ message: "Piece not found." });

    const { userId } = getAuth(req);
    let savedByCurrentUser = false;
    if (userId) {
      const saved = await prisma.savedItem.findUnique({
        where: { userId_pieceId: { userId, pieceId: piece.id } },
      });
      savedByCurrentUser = Boolean(saved);
    }

    res.json({ ...piece, savedByCurrentUser });
  } catch (err) {
    next(err);
  }
}

export async function compareRecordings(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const piece = await prisma.piece.findUnique({
      where: { id },
      include: {
        recordings: {
          include: {
            syncPoints: { orderBy: { timestampSec: "asc" } },
          },
        },
        scores: true,
      },
    });

    if (!piece) return res.status(404).json({ message: "Piece not found." });

    const recordingIdsParam = req.query.recordings as string | undefined;
    let selectedRecordings = piece.recordings;
    if (recordingIdsParam) {
      const ids = recordingIdsParam.split(",");
      selectedRecordings = piece.recordings.filter((r) => ids.includes(r.id));
    }

    res.json({
      piece: {
        id: piece.id,
        title: piece.title,
        composer: piece.composer,
        year: piece.year,
        scores: piece.scores,
      },
      recordings: selectedRecordings,
      recommendedRecordingId: selectedRecordings[0]?.id ?? null,
    });
  } catch (err) {
    next(err);
  }
}

export async function savePiece(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated." });

    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId },
    });

    await prisma.savedItem.upsert({
      where: { userId_pieceId: { userId, pieceId: req.params.id } },
      update: {},
      create: { userId, pieceId: req.params.id },
    });
    res.status(201).json({ saved: true });
  } catch (err) {
    next(err);
  }
}

export async function unsavePiece(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated." });

    await prisma.savedItem
      .delete({
        where: { userId_pieceId: { userId, pieceId: req.params.id } },
      })
      .catch(() => null);
    res.json({ saved: false });
  } catch (err) {
    next(err);
  }
}
