import assert from "node:assert/strict";
import test from "node:test";

import { MdmError } from "../errors/mdm-error";
import type { CostCentreRepository } from "../repositories/cost-centre.repository";
import { CostCentreService } from "./cost-centre.service";
import { parseCreateBody, parseUpdateBody } from "./cost-centre-validation";

const divisionId = "11111111-1111-4111-8111-111111111111";

const sample = {
  code: "CC-CHE-DEL",
  name: "Chennai Delivery Ops",
  divisionId,
  type: "DELIVERY",
  active: true,
  validFrom: "2026-04-01",
  reason: "New record",
};

test("POST without division returns 400", () => {
  const { divisionId: _divisionId, ...body } = sample;
  assert.throws(
    () => parseCreateBody(body),
    (error: unknown) => error instanceof MdmError && error.status === 400 && error.field === "divisionId",
  );
});

test("PATCH annualBudget on PUBLISHED creates a PENDING version", async () => {
  let savedStatus = "";
  const repo = {
    findDivision: async () => ({ status: "PUBLISHED" }),
    withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({}),
    lock: async () => ({
      id: "22222222-2222-4222-8222-222222222222",
      status: "PUBLISHED",
      version_no: 2,
      annual_budget: "1000.00",
      default_gl: null,
    }),
    update: async (_client: unknown, _id: string, _input: unknown, _actor: string, status: string) => {
      savedStatus = status;
    },
    snapshot: async () => undefined,
    audit: async () => undefined,
  };
  const service = new CostCentreService(repo as unknown as CostCentreRepository);
  const input = parseUpdateBody({ ...sample, annualBudget: 2500, versionNo: 2 });
  const result = await service.update("22222222-2222-4222-8222-222222222222", input, "tester");
  assert.equal(savedStatus, "PENDING");
  assert.equal(result.status, "PENDING");
});
