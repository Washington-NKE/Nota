import fs from "fs";
import path from "path";
import { parseTimestampAnalysisFile } from "../timestampImporter.service";

const resourcesDir = path.resolve(import.meta.dirname, "../../../../timestamps and resources");

// 1. Beethoven 5
const b5Path = path.join(resourcesDir, "beethoven 5 I.txt");
const b5 = fs.readFileSync(b5Path, "utf-8");
const p5 = parseTimestampAnalysisFile(b5);
console.log("=== BEETHOVEN 5 PARSING ===");
console.log(`Parsed ${p5.itemCount} items across sections:`, p5.sections);
console.log("First item:", p5.items[0]);
console.log("Fifth item (exposition repeat):", p5.items[4]);
console.log("Last item:", p5.items[p5.items.length - 1]);

// 2. Bach BWV 1042
const bachPath = path.join(resourcesDir, "bwv_1042_timestamps.txt");
const bach = fs.readFileSync(bachPath, "utf-8");
const pBach = parseTimestampAnalysisFile(bach);
console.log("\n=== BACH BWV 1042 PARSING ===");
console.log(`Parsed ${pBach.itemCount} items across sections:`, pBach.sections);
console.log("First item:", pBach.items[0]);
console.log("Last item:", pBach.items[pBach.items.length - 1]);
