import assert from "node:assert/strict";
import test from "node:test";

import { MdmError } from "../errors/mdm-error";
import type { DivisionRepository } from "../repositories/division.repository";
import { DivisionService } from "./division.service";
import { parseCreateBody } from "./division-validation";

const zoneId = "22222222-2222-4222-8222-222222222222";
const legalEntityId = "33333333-3333-4333-8333-333333333333";

const sample = {
  code: "DIV-CHE",
  name: "Chennai Division",
  legalEntityId,
  zoneId,
  postalCode: "600001",
  city: "Chennai",
  country: "IN",
  timeZone: "Asia/Kolkata",
  validFrom: "2026-04-01",
  reason: "New record",
};

test("POST without zoneId returns 400", () => {
  const { zoneId: _zoneId, ...body } = sample;
  assert.throws(
    () => parseCreateBody(body),
    (error: unknown) => error instanceof MdmError && error.status === 400 && error.field === "zoneId",
  );
});

test("draft zone parent returns PARENT_NOT_PUBLISHED", async () => {
  const repo = {
    findCountry: async () => ({ id: "IND" }),
    findZone: async () => ({ status: "DRAFT" }),
    findLegalEntity: async () => "missing-table" as const,
  };
  const service = new DivisionService(repo as unknown as DivisionRepository);
  await assert.rejects(
    () => service.create(parseCreateBody(sample), "tester"),
    (error: unknown) =>
      error instanceof MdmError && error.status === 400 && error.errorCode === "PARENT_NOT_PUBLISHED",
  );
});

test("submit of a draft division publishes immediately", async () => {
  const repo = {
    findById: async () => ({ ...sample, status: "DRAFT", versionNo: 1, id: "11111111-1111-4111-8111-111111111111" }),
    findCountry: async () => ({ id: "IND" }),
    findZone: async () => ({ status: "PUBLISHED" }),
    findLegalEntity: async () => "missing-table" as const,
    withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({}),
    lock: async () => ({ id: "11111111-1111-4111-8111-111111111111", status: "DRAFT", version_no: 1 }),
    setStatus: async () => undefined,
    snapshot: async () => undefined,
    audit: async () => undefined,
  };
  const service = new DivisionService(repo as unknown as DivisionRepository);
  const result = await service.submit("11111111-1111-4111-8111-111111111111", "Publish", "tester");
  assert.equal(result.status, "PUBLISHED");
});
