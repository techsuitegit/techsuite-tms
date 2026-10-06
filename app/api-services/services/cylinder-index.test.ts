import assert from "node:assert/strict";
import test from "node:test";

import type { CylinderRepository } from "../repositories/cylinder.repository";
import type { CylinderInput } from "./cylinder-types";
import { CylinderService } from "./cylinder.service";
import { indexgenerater } from "./indexgenerater";

const input = {
  code: "",
  serial: "CYL-SN-1",
  rfid: null,
  size: "LB20_KG9",
  materialId: "MAT00001",
  tareKg: 9,
  fillCapacity: 20,
  valveType: null,
  requalificationDue: "2027-04-01",
  custodyState: "PLANT",
  locationText: null,
  shippingPointId: null,
  validFrom: "2026-04-01",
  validTo: null,
  reason: "New record",
  changeNote: null,
  externalId: null,
} as CylinderInput;

test("create without a code stores the generated index in cylinder id", async () => {
  const calls: string[] = [];
  let savedId = "";
  let savedCode = "";
  const repo = {
    findMaterialStatus: async () => ({ status: "PUBLISHED" }),
    withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({}),
    insert: async (_client: unknown, row: CylinderInput, _actor: string, id: string) => {
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
      return "CYL00001";
    },
    updateGindexMst: async (code: string) => {
      calls.push(`update:${code}`);
    },
  };
  const service = new CylinderService(repo as unknown as CylinderRepository, index as unknown as indexgenerater);
  const created = await service.create(input, "tester");
  assert.deepEqual(calls, ["get:CYL", "update:CYL"]);
  assert.equal(savedId, "CYL00001");
  assert.equal(savedCode, "CYL00001");
  assert.equal(created.id, "CYL00001");
  assert.equal(created.code, "CYL00001");
});
