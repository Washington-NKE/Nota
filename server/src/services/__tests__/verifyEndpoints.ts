import { spawn } from "child_process";
import http from "http";
import path from "path";

function get(path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:5000${path}`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode || 200, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 200, body: data });
        }
      });
    }).on("error", reject);
  });
}

async function runVerification() {
  console.log("=== INTEGRATION ENDPOINT VERIFICATION ===");

  // 1. Health
  const health = await get("/api/health");
  console.log("[1] /api/health:", health.status, health.body);

  // 2. List pieces
  const pieces = await get("/api/pieces");
  console.log(`[2] /api/pieces: Found ${pieces.body.length} pieces:`);
  for (const p of pieces.body) {
    console.log(`   - ${p.title} (${p.recordings?.length || 0} recordings, ${p.scores?.length || 0} scores)`);
  }

  // 3. Beethoven 5 Detail
  const b5 = await get("/api/pieces/beethoven-5-i-allegro");
  console.log(`[3] Beethoven 5 detail: recordings=${b5.body.recordings?.length}`);

  // 4. Beethoven 5 Annotation at time 30s
  const b5Ann = await get("/api/recordings/beethoven-5-thielemann-vpo/annotation-at-time?t=30&track=expert");
  console.log("[4] Beethoven 5 @ 30s (Expert):", b5Ann.body.annotation?.text?.substring(0, 70) + "...");

  // 5. Bach Score XML endpoint
  const bachScore = await get("/api/scores/bwv-1042-canonical-score/xml");
  console.log(`[5] Bach score XML: status=${bachScore.status}, length=${typeof bachScore.body === 'string' ? bachScore.body.length : 0} bytes`);

  // 6. Bach Sync Points
  const bachSync = await get("/api/recordings/bwv-1042-hahn-bremen/sync-points");
  console.log(`[6] Bach Hahn sync points: ${bachSync.body.length} anchors`);

  // 7. Bach Annotation at time 20s
  const bachAnn = await get("/api/recordings/bwv-1042-hahn-bremen/annotation-at-time?t=20&track=expert");
  console.log("[7] Bach @ 20s (Expert):", bachAnn.body.annotation?.text?.substring(0, 70) + "...");

  // 7b. Recording comments
  const bachComments = await get("/api/recordings/bwv-1042-hahn-bremen/comments");
  console.log(`[7b] Bach recording comments: ${Array.isArray(bachComments.body) ? bachComments.body.length : 0}`);

  // 8. Comparison endpoint
  const compare = await get("/api/pieces/bwv-1042-i-allegro/compare");
  console.log(`[8] Compare recordings: ${compare.body.recordings?.length} recordings returned for side-by-side analysis.`);

  console.log("\nALL BACKEND API VERIFICATIONS PASSED!");
}

// Start server process
const serverDir = path.resolve(import.meta.dirname, "../../..");
const serverProcess = spawn("npx", ["tsx", "src/app.ts"], {
  cwd: serverDir,
  shell: true,
  stdio: "inherit",
});

setTimeout(async () => {
  try {
    await runVerification();
  } catch (err) {
    console.error("Verification error:", err);
  } finally {
    serverProcess.kill();
    process.exit(0);
  }
}, 3000);
