import "dotenv/config";
import express from "express";
import cors from "cors";
import { pathToFileURL } from "url";
import { clerkMiddleware } from "@clerk/express";

import pieceRoutes from "./routes/piece.routes";
import scoreRoutes from "./routes/score.routes";
import recordingRoutes from "./routes/recording.routes";
import commentRoutes from "./routes/comment.routes";
import { errorMiddleware } from "./middleware/error.middleware";

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

// Public health check
app.get("/api/health", (_req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));

// Populates req.auth on every request
app.use(clerkMiddleware());

app.use("/api/pieces", pieceRoutes);
app.use("/api/scores", scoreRoutes);
app.use("/api/recordings", recordingRoutes);
app.use("/api/comments", commentRoutes);

app.use(errorMiddleware);

export { app };

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`Nota server listening on :${port}`));
}
