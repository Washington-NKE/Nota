import { Router } from "express";
import * as syncController from "../controllers/sync.controller";
import * as commentController from "../controllers/comment.controller";
import { requireAuth } from "@clerk/express";
import { requireRole } from "../middleware/authorization.middleware";

const router = Router();

router.get("/:recordingId/sync-points", syncController.listSyncPoints);
router.post("/:recordingId/sync-points", requireAuth, requireRole("analyst", "admin"), syncController.createSyncPoint);
router.delete("/sync-points/:id", requireAuth, requireRole("analyst", "admin"), syncController.deleteSyncPoint);
router.get("/:recordingId/sync-points/validate", syncController.validateMap);

router.get("/:recordingId/annotation-at-time", syncController.getAnnotationAtTime);
router.get("/:recordingId/annotations", syncController.listAnnotations);
router.post("/:recordingId/annotations", requireAuth, requireRole("analyst", "admin"), syncController.createAnnotation);
router.delete("/annotations/:id", requireAuth, requireRole("analyst", "admin"), syncController.deleteAnnotation);

// Importer routes
router.post("/:recordingId/import-timestamps/preview", syncController.previewTimestampImport);
router.post("/:recordingId/import-timestamps/commit", requireAuth, requireRole("analyst", "admin"), syncController.commitTimestampImportRoute);

router.get("/:recordingId/comments", commentController.listRecordingComments);
router.post("/:recordingId/comments", requireAuth, commentController.createComment);

export default router;
