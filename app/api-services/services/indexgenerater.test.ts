import assert from "node:assert/strict";
import test from "node:test";

import { formatIndexNumber } from "./indexgenerater";

test("padding on returns prefix, zero-filled next number, and suffix", () => {
  assert.equal(
    formatIndexNumber({ noprefix: "EMP", nosuffix: "", nolength: 5, lastno: 12, padding: true }),
    "EMP00013",
  );
});

test("padding off returns prefix, next number, and suffix", () => {
  assert.equal(
    formatIndexNumber({ noprefix: "JB", nosuffix: "IN", nolength: 5, lastno: 7, padding: false }),
    "JB8IN",
  );
});

test("a missing last number starts at 1", () => {
  assert.equal(
    formatIndexNumber({ noprefix: null, nosuffix: null, nolength: 4, lastno: null, padding: true }),
    "0001",
  );
});
