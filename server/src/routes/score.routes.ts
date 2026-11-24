import { Router } from "express";
import multer from "multer";
import * as scoreController from "../controllers/score.controller";
import { requireAuth } from "@clerk/express";
import { requireRole } from "../middleware/authorization.middleware";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB upload limit
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (!name.endsWith(".musicxml") && !name.endsWith(".xml") && !name.endsWith(".mxl")) {
      cb(new Error("Only .musicxml, .xml, and .mxl files are allowed."));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

router.get("/:pieceId", scoreController.getScore);
router.get("/:id/detail", scoreController.getScoreById);
router.get("/:id/xml", scoreController.getScoreXml);
router.post(
  "/:pieceId/upload",
  requireAuth,
  requireRole("analyst", "admin"),
  upload.single("file"),
  scoreController.uploadScore
);

export default router;
