import {
  interpolateScorePosition,
  validateSyncMap,
  type SyncAnchor,
} from "../syncEngine.service";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedCount++;
    console.log(`  ✓ ${testName}`);
  } else {
    failedCount++;
    console.error(`  ✗ ${testName}${detail ? `: ${detail}` : ""}`);
  }
}

console.log("=== SYNCHRONIZATION ENGINE UNIT TESTS ===");

// 1. Empty map test
{
  const res = interpolateScorePosition([], 10.0);
  assert(res.status === "empty_map", "Empty map returns status empty_map");
  assert(res.measureNumber === null, "Empty map returns null measure");
}

// 2. Single anchor test
{
  const anchors: SyncAnchor[] = [{ timestampSec: 15.0, measureNumber: 5 }];
  const before = interpolateScorePosition(anchors, 10.0);
  assert(before.status === "before_first_anchor", "Single anchor: time before anchor returns before_first_anchor");
  assert(before.measureNumber === null, "Single anchor: time before anchor has null measure");

  const at = interpolateScorePosition(anchors, 15.0);
  assert(at.status === "single_anchor" && at.measureNumber === 5, "Single anchor: exact time returns measure 5");

  const after = interpolateScorePosition(anchors, 25.0);
  assert(after.status === "single_anchor" && after.measureNumber === 5, "Single anchor: after anchor returns measure 5");
}

// 3. Two valid anchors test
{
  const anchors: SyncAnchor[] = [
    { timestampSec: 10.0, measureNumber: 1 },
    { timestampSec: 20.0, measureNumber: 5 },
  ];
  // At midpoint (15.0s), position should be 1 + 0.5 * (5 - 1) = 3.0
  const mid = interpolateScorePosition(anchors, 15.0);
  assert(mid.status === "interpolated", "Two anchors: midpoint returns interpolated status");
  assert(mid.continuousScorePosition === 3.0, `Two anchors: midpoint position is 3.0 (got ${mid.continuousScorePosition})`);
  assert(mid.measureNumber === 3, `Two anchors: midpoint measure is 3 (got ${mid.measureNumber})`);

  // Exact anchor match
  const exact0 = interpolateScorePosition(anchors, 10.0);
  assert(exact0.status === "exact_match", "Two anchors: exact start returns exact_match");
  assert(exact0.measureNumber === 1, "Two anchors: start measure is 1");

  // Before first anchor
  const before = interpolateScorePosition(anchors, 5.0);
  assert(before.status === "before_first_anchor", "Two anchors: before first anchor returns before_first_anchor");
  assert(before.measureNumber === null, "Two anchors: before first anchor measure is null");

  // After last anchor
  const after = interpolateScorePosition(anchors, 25.0);
  assert(after.status === "after_last_anchor", "Two anchors: after last anchor returns after_last_anchor");
  assert(after.measureNumber === 5, "Two anchors: after last anchor returns measure 5");
}

// 4. Multiple anchors & continuous measure transitions
{
  const anchors: SyncAnchor[] = [
    { timestampSec: 0.0, measureNumber: 1 },
    { timestampSec: 10.0, measureNumber: 6 },
    { timestampSec: 25.0, measureNumber: 16 },
    { timestampSec: 40.0, measureNumber: 31 },
  ];

  // At 5.0s in [0, 10], alpha = 0.5, pos = 1 + 2.5 = 3.5 -> measure 3
  const t5 = interpolateScorePosition(anchors, 5.0);
  assert(t5.measureNumber === 3, `Multiple anchors: measure at 5s is 3 (got ${t5.measureNumber})`);
  assert(t5.continuousScorePosition === 3.5, `Multiple anchors: pos at 5s is 3.5 (got ${t5.continuousScorePosition})`);

  // At 17.5s in [10, 25], alpha = 7.5 / 15 = 0.5, pos = 6 + 0.5 * 10 = 11.0 -> measure 11
  const t17 = interpolateScorePosition(anchors, 17.5);
  assert(t17.measureNumber === 11, `Multiple anchors: measure at 17.5s is 11 (got ${t17.measureNumber})`);
}

// 5. Out-of-order input anchors handling
{
  const outOfOrder: SyncAnchor[] = [
    { timestampSec: 30.0, measureNumber: 10 },
    { timestampSec: 10.0, measureNumber: 1 },
    { timestampSec: 20.0, measureNumber: 5 },
  ];
  // Engine must sort anchors internally
  const res = interpolateScorePosition(outOfOrder, 15.0);
  assert(res.continuousScorePosition === 3.0, "Out-of-order anchors: correctly sorted and interpolated");
}

// 6. Seeking forward and seeking backward determinism
{
  const anchors: SyncAnchor[] = [
    { timestampSec: 0.0, measureNumber: 1 },
    { timestampSec: 20.0, measureNumber: 10 },
    { timestampSec: 40.0, measureNumber: 20 },
  ];
  const queryForward = [5.0, 15.0, 25.0, 35.0].map((t) => interpolateScorePosition(anchors, t).measureNumber);
  const queryBackward = [35.0, 25.0, 15.0, 5.0].map((t) => interpolateScorePosition(anchors, t).measureNumber).reverse();

  assert(
    JSON.stringify(queryForward) === JSON.stringify(queryBackward),
    "Seeking forward and backward is completely deterministic"
  );
}

// 7. Validation: detects duplicate timestamps and out-of-order measures
{
  const invalidTimestamps: SyncAnchor[] = [
    { timestampSec: 10.0, measureNumber: 1 },
    { timestampSec: 10.0, measureNumber: 2 }, // duplicate timestamp!
  ];
  const valResult = validateSyncMap(invalidTimestamps);
  assert(!valResult.isValid, "Validation: detects duplicate timestamps as invalid");
  assert(valResult.errors.length > 0, "Validation: reports errors for duplicate timestamps");

  const decreasingMeasures: SyncAnchor[] = [
    { timestampSec: 10.0, measureNumber: 5 },
    { timestampSec: 20.0, measureNumber: 3 }, // decreasing measure!
  ];
  const decResult = validateSyncMap(decreasingMeasures);
  assert(!decResult.isValid, "Validation: detects decreasing measures as invalid");
}

// 8. Division by zero protection
{
  const zeroInterval: SyncAnchor[] = [
    { timestampSec: 10.0, measureNumber: 1 },
    { timestampSec: 10.0, measureNumber: 1 },
  ];
  const zeroRes = interpolateScorePosition(zeroInterval, 10.0);
  assert(zeroRes.measureNumber === 1, "Division by zero guard handles coincident points gracefully");
}

// 9. Duplicate score positions are invalid
{
  const duplicatePositions: SyncAnchor[] = [
    { timestampSec: 10.0, measureNumber: 5 },
    { timestampSec: 20.0, measureNumber: 5 },
  ];
  const result = validateSyncMap(duplicatePositions);
  assert(!result.errors.some((error) => error.includes("decreasing")), "Duplicate score positions are represented by warnings, not score regressions");
  assert(result.warnings.length > 0, "Duplicate score positions produce a validation warning");
}

console.log(`\nTests Summary: ${passedCount} passed, ${failedCount} failed.`);
if (failedCount > 0) {
  process.exit(1);
} else {
  console.log("All synchronization unit tests PASSED successfully!\n");
}
