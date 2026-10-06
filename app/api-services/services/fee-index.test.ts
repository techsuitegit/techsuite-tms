import assert from "node:assert/strict";
import test from "node:test";

import type { FeeRepository } from "../repositories/fee.repository";
import type { FeeInput } from "./fee-types";
import { FeeService } from "./fee.service";
import { indexgenerater } from "./indexgenerater";

const input = {
  code: "",
  name: "Delivery fee",
  feeType: "DELIVERY",
  chargeType: "FLAT_PER_DELIVERY",
  rate: 100,
  currency: "INR",
  validFrom: "2026-04-01",
  validTo: null,
  reason: "New record",
  changeNote: null,
  externalId: null,
} as FeeInput;

test("create without a code stores the generated index in fee id", async () => {
  const calls: string[] = [];
  let savedId = "";
  let savedCode = "";
  const repo = {
    withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({}),
    insert: async (_client: unknown, row: FeeInput, _actor: string, id: string) => {
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
      return "FEE00001";
    },
    updateGindexMst: async (code: string) => {
      calls.push(`update:${code}`);
    },
  };
  const service = new FeeService(repo as unknown as FeeRepository, index as unknown as indexgenerater);
  const created = await service.create(input, "tester");
  assert.deepEqual(calls, ["get:FEE", "update:FEE"]);
  assert.equal(savedId, "FEE00001");
  assert.equal(savedCode, "FEE00001");
  assert.equal(created.id, "FEE00001");
  assert.equal(created.code, "FEE00001");
});
