import assert from "node:assert/strict";
import test from "node:test";

import { MdmError } from "../errors/mdm-error";
import { mapDbError, type ZoneRepository } from "../repositories/zone.repository";
import { ZoneService } from "./zone.service";
import { parseCreateBody } from "./zone-validation";

const sample = {
  code: "Z-SOUTH",
  name: "South Zone",
  description: "Geographical side for southern divisions",
  validFrom: "2026-04-01",
  reason: "New record",
};

test("duplicate zone code maps to 409", () => {
  const error = mapDbError({ code: "23505", constraint: "zone_code_udx" });
  assert.ok(error instanceof MdmError);
  assert.equal(error.status, 409);
  assert.equal(error.errorCode, "CONFLICT");
  assert.equal(error.field, "code");
});

test("latitude is rejected", () => {
  assert.throws(
    () => parseCreateBody({ ...sample, latitude: 13.08 }),
    (error: unknown) => error instanceof MdmError && error.status === 400 && error.field === "latitude",
  );
});

test("soft-delete of a zone that has divisions returns HAS_CHILDREN", async () => {
  const repo = {
    hasDivisions: async () => true,
    withTransaction: async () => {
      throw new Error("should not delete");
    },
  };
  const service = new ZoneService(repo as unknown as ZoneRepository);
  await assert.rejects(
    () => service.remove("11111111-1111-4111-8111-111111111111", "tester"),
    (error: unknown) => error instanceof MdmError && error.status === 409 && error.errorCode === "HAS_CHILDREN",
  );
});
