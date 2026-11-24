import { Router } from "express";
import * as pieceController from "../controllers/piece.controller";
import * as commentController from "../controllers/comment.controller";
import { requireAuth } from "@clerk/express";
import { requireRole } from "../middleware/authorization.middleware";

const router = Router();

router.get("/", pieceController.listPieces);
router.post("/", requireAuth, requireRole("analyst", "admin"), pieceController.createPiece);
router.get("/search", pieceController.searchPieces);
router.get("/saved", requireAuth, pieceController.listSavedPieces);
router.get("/:id", pieceController.getPiece);
router.get("/:id/compare", pieceController.compareRecordings);
router.post("/:id/recordings", requireAuth, requireRole("analyst", "admin"), pieceController.addRecording);
router.post("/:id/save", requireAuth, pieceController.savePiece);
router.delete("/:id/save", requireAuth, pieceController.unsavePiece);

// Comments associated with this piece
router.get("/:pieceId/comments", commentController.listPieceComments);
router.post("/:pieceId/comments", requireAuth, commentController.createComment);

export default router;
