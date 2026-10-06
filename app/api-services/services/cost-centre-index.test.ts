import assert from "node:assert/strict";
import test from "node:test";

import type { CostCentreRepository } from "../repositories/cost-centre.repository";
import type { CostCentreInput } from "./cost-centre-types";
import { CostCentreService } from "./cost-centre.service";
import { indexgenerater } from "./indexgenerater";

const input = {
  code: "",
  name: "Chennai Delivery Ops",
  divisionId: "11111111-1111-4111-8111-111111111111",
  shippingPointId: null,
  type: "DELIVERY",
  budgetOwner: null,
  defaultGl: null,
  annualBudget: null,
  active: true,
  validFrom: "2026-04-01",
  validTo: null,
  reason: "New record",
  changeNote: null,
  externalId: null,
} as CostCentreInput;

test("create without a code stores the generated index in cost centre id", async () => {
  const calls: string[] = [];
  let savedId = "";
  let savedCode = "";
  const repo = {
    findDivision: async () => ({ status: "PUBLISHED" }),
    withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({}),
    insert: async (_client: unknown, row: CostCentreInput, _actor: string, id: string) => {
      savedCode = row.code;
      savedId = id;
      return { id, status: "DRAFT", versionNo: 1 };
    },
    snapshot: async () => undefined,
    audit: async () => undefined,
  };
  const index = {
    getGindexMst: async (code: string) => {
      calls.push(`get:${code}`);
      return "CCT00001";
    },
    updateGindexMst: async (code: string) => {
      calls.push(`update:${code}`);
    },
  };
  const service = new CostCentreService(repo as unknown as CostCentreRepository, index as unknown as indexgenerater);
  const created = await service.create(input, "tester");
  assert.deepEqual(calls, ["get:CCT", "update:CCT"]);
  assert.equal(savedId, "CCT00001");
  assert.equal(savedCode, "CCT00001");
  assert.equal(created.id, "CCT00001");
  assert.equal(created.code, "CCT00001");
});
