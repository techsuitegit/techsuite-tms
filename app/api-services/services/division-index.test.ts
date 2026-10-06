import assert from "node:assert/strict";
import test from "node:test";

import type { DivisionRepository } from "../repositories/division.repository";
import type { DivisionInput } from "./division-types";
import { DivisionService } from "./division.service";
import { indexgenerater } from "./indexgenerater";

const input = {
  code: "",
  name: "Chennai Division",
  legalEntityId: "33333333-3333-4333-8333-333333333333",
  zoneId: "22222222-2222-4222-8222-222222222222",
  postalCode: "600001",
  city: "Chennai",
  country: "IN",
  timeZone: "Asia/Kolkata",
  validFrom: "2026-04-01",
  reason: "New record",
} as DivisionInput;

test("create without a code stores the generated index in division id", async () => {
  const calls: string[] = [];
  let savedId = "";
  let savedCode = "";
  const repo = {
    findCountry: async () => ({ id: "IND" }),
    findZone: async () => ({ status: "PUBLISHED" }),
    findLegalEntity: async () => "missing-table" as const,
    withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({}),
    insert: async (_client: unknown, row: DivisionInput, _actor: string, id: string) => {
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
      return "DIV00001";
    },
    updateGindexMst: async (code: string) => {
      calls.push(`update:${code}`);
    },
  };
  const service = new DivisionService(repo as unknown as DivisionRepository, index as unknown as indexgenerater);
  const created = await service.create(input, "tester");
  assert.deepEqual(calls, ["get:DIV", "update:DIV"]);
  assert.equal(savedId, "DIV00001");
  assert.equal(savedCode, "DIV00001");
  assert.equal(created.id, "DIV00001");
});
