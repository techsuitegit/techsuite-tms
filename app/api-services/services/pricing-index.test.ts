import assert from "node:assert/strict";
import test from "node:test";

import type { PricingProcedureRepository } from "../repositories/pricing-procedure.repository";
import type { PricingProcedureInput, PricingRuleInput } from "./pricing-procedure-types";
import { PricingProcedureService } from "./pricing-procedure.service";
import { indexgenerater } from "./indexgenerater";

const input = {
  code: "",
  name: "Standard delivery",
  accessSequence: "CUSTOMER",
  active: true,
  rules: [
    {
      code: "",
      priority: 10,
      join: "AND",
      amount: 25,
      conditions: [{ variable: "TRUCK_TYPE", operator: "EQ", value: "BOBTAIL" }],
    },
  ],
  validFrom: "2026-04-01",
  validTo: null,
  reason: "New record",
  changeNote: null,
  externalId: null,
} as PricingProcedureInput;

test("create without codes stores generated indexes in procedure and rule ids", async () => {
  const calls: string[] = [];
  const issued = ["PRC00001", "PRL00001"];
  let savedId = "";
  let savedCode = "";
  let savedRule: PricingRuleInput | undefined;
  const repo = {
    withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({}),
    insert: async (_client: unknown, row: PricingProcedureInput, _actor: string, id: string) => {
      savedCode = row.code;
      savedId = id;
      savedRule = row.rules[0];
      return { id, status: "DRAFT", versionNo: 1 };
    },
    snapshot: async () => undefined,
    audit: async () => undefined,
  };
  const index = {
    getGindexMst: async (code: string) => {
      calls.push(`get:${code}`);
      return issued[calls.filter((item) => item.startsWith("get:")).length - 1];
    },
    updateGindexMst: async (code: string) => {
      calls.push(`update:${code}`);
    },
  };
  const service = new PricingProcedureService(
    repo as unknown as PricingProcedureRepository,
    index as unknown as indexgenerater,
  );
  const created = await service.create(input, "tester");
  assert.deepEqual(calls, ["get:PRC", "update:PRC", "get:PRL", "update:PRL"]);
  assert.equal(savedId, "PRC00001");
  assert.equal(savedCode, "PRC00001");
  assert.equal(savedRule?.id, "PRL00001");
  assert.equal(savedRule?.code, "PRL00001");
  assert.equal(created.id, "PRC00001");
  assert.equal(created.code, "PRC00001");
});
