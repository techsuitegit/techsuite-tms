import assert from "node:assert/strict";
import test from "node:test";

import { evaluateBlocks } from "./driver.service";

test("licence expired raises DRIVER_DL_EXPIRED", () => {
  const blocks = evaluateBlocks(
    { dlValidTo: "2026-10-01", hazEndorsed: true, hazEndorsementTo: "2027-01-01" },
    "2026-11-04",
    [],
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.code, "DRIVER_DL_EXPIRED");
});

test("non-DG load with hazEndorsed false is eligible", () => {
  const blocks = evaluateBlocks(
    { dlValidTo: "2027-10-18", hazEndorsed: false, hazEndorsementTo: null },
    "2026-11-04",
    [],
  );
  assert.equal(blocks.length, 0);
});

test("DG load with hazEndorsed false raises ABSENT", () => {
  const blocks = evaluateBlocks(
    { dlValidTo: "2027-10-18", hazEndorsed: false, hazEndorsementTo: null },
    "2026-11-04",
    ["Class 3"],
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.code, "DRIVER_DG_ENDORSEMENT_ABSENT");
});

test("DG load with expired endorsement raises EXPIRED after licence check", () => {
  const blocks = evaluateBlocks(
    { dlValidTo: "2025-01-01", hazEndorsed: true, hazEndorsementTo: "2026-10-31" },
    "2026-11-04",
    ["Class 3"],
  );
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.code, "DRIVER_DL_EXPIRED");
  assert.equal(blocks[1]?.code, "DRIVER_DG_ENDORSEMENT_EXPIRED");
});
