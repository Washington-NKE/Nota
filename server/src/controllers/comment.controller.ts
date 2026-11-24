import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { prisma } from "../config/prisma";

export async function listPieceComments(req: Request, res: Response, next: NextFunction) {
  try {
    const { pieceId } = req.params;
    const comments = await prisma.comment.findMany({
      where: {
        pieceId,
        parentId: null, // Top-level comments
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true } },
        replies: {
          include: {
            user: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    res.json(comments);
  } catch (err) {
    next(err);
  }
}

export async function listRecordingComments(req: Request, res: Response, next: NextFunction) {
  try {
    const { recordingId } = req.params;
    const comments = await prisma.comment.findMany({
      where: {
        recordingId,
        parentId: null,
      },
      orderBy: { timestampSec: "asc" },
      include: {
        user: { select: { id: true, name: true } },
        replies: {
          include: {
            user: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    res.json(comments);
  } catch (err) {
    next(err);
  }
}

export async function createComment(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated." });

    const recordingIdFromRoute = req.params.recordingId;
    const { pieceId, recordingId, parentId, body, timestampSec, measureNumber } = req.body as {
      pieceId?: string;
      recordingId?: string;
      parentId?: string;
      body?: string;
      timestampSec?: number;
      measureNumber?: number;
    };

    if (!body || !body.trim()) {
      return res.status(400).json({ message: "Comment body cannot be empty." });
    }

    // Ensure user row exists
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId },
    });

    let resolvedRecordingId = recordingId ?? recordingIdFromRoute ?? null;
    let resolvedPieceId = pieceId ?? (req.params.pieceId || null);

    if (resolvedRecordingId) {
      const recording = await prisma.recording.findUnique({
        where: { id: resolvedRecordingId },
        select: { pieceId: true },
      });
      if (!recording) {
        return res.status(404).json({ message: "Recording not found." });
      }
      resolvedPieceId = resolvedPieceId ?? recording.pieceId;
    }

    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, pieceId: true, recordingId: true },
      });
      if (!parent) {
        return res.status(404).json({ message: "Parent comment not found." });
      }
      if (
        (resolvedPieceId && parent.pieceId !== resolvedPieceId) ||
        (resolvedRecordingId && parent.recordingId !== resolvedRecordingId)
      ) {
        return res.status(400).json({ message: "Reply must belong to the same piece and recording." });
      }
    }

    const comment = await prisma.comment.create({
      data: {
        userId,
        pieceId: resolvedPieceId,
        recordingId: resolvedRecordingId,
        parentId: parentId || null,
        body: body.trim(),
        timestampSec: timestampSec != null ? Number(timestampSec) : null,
        measureNumber: measureNumber != null ? Number(measureNumber) : null,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
}

export async function deleteComment(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated." });

    const { id } = req.params;
    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      return res.status(404).json({ message: "Comment not found." });
    }

    // Strict ownership check
    if (comment.userId !== userId) {
      return res.status(403).json({ message: "You are not authorized to delete this comment." });
    }

    await prisma.comment.delete({ where: { id } });
    res.json({ success: true, message: "Comment deleted." });
  } catch (err) {
    next(err);
  }
}

export async function updateComment(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated." });

    const { id } = req.params;
    const { body } = req.body as { body?: string };
    if (!body || !body.trim()) {
      return res.status(400).json({ message: "Comment body cannot be empty." });
    }

    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      return res.status(404).json({ message: "Comment not found." });
    }
    if (comment.userId !== userId) {
      return res.status(403).json({ message: "You are not authorized to edit this comment." });
    }

    const updated = await prisma.comment.update({
      where: { id },
      data: { body: body.trim() },
      include: {
        user: { select: { id: true, name: true } },
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}
