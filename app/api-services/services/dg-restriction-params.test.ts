import assert from "node:assert/strict";
import test from "node:test";

import { MdmError } from "../errors/mdm-error";
import type { DgRestrictionKindRow } from "./dg-restriction-types";
import { validateParamsAgainstKind } from "./dg-restriction-validation";

const weightKind: DgRestrictionKindRow = {
  code: "WEIGHT",
  name: "Gross weight limit",
  requiredParams: ["maxKg"],
  paramTypes: { maxKg: "integer" },
  vehicleAttribute: "gvw_kg",
  isTimeScoped: false,
  comparatorStatus: "IMPLEMENTED",
};

const timeKind: DgRestrictionKindRow = {
  code: "TIME",
  name: "Time window",
  requiredParams: [],
  paramTypes: {},
  vehicleAttribute: null,
  isTimeScoped: true,
  comparatorStatus: "IMPLEMENTED",
};

test("WEIGHT missing maxKg → PARAM_REQUIRED", () => {
  assert.throws(
    () => validateParamsAgainstKind({}, weightKind),
    (error: unknown) => error instanceof MdmError && error.errorCode === "PARAM_REQUIRED",
  );
});

test("WEIGHT maxKg string → PARAM_TYPE", () => {
  assert.throws(
    () => validateParamsAgainstKind({ maxKg: "25000" }, weightKind),
    (error: unknown) => error instanceof MdmError && error.errorCode === "PARAM_TYPE",
  );
});

test("WEIGHT unexpected maxkg → PARAM_UNEXPECTED", () => {
  assert.throws(
    () => validateParamsAgainstKind({ maxKg: 25000, maxkg: 1 }, weightKind),
    (error: unknown) => error instanceof MdmError && error.errorCode === "PARAM_UNEXPECTED",
  );
});

test("TIME with any params key → PARAM_UNEXPECTED", () => {
  assert.throws(
    () => validateParamsAgainstKind({ maxKg: 1 }, timeKind),
    (error: unknown) => error instanceof MdmError && error.errorCode === "PARAM_UNEXPECTED",
  );
});

test("WEIGHT valid params accepted", () => {
  assert.doesNotThrow(() => validateParamsAgainstKind({ maxKg: 25000 }, weightKind));
});
