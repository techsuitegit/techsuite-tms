import assert from "node:assert/strict";
import test from "node:test";

import type { HaulierRepository } from "../repositories/haulier.repository";
import type { HaulierInput } from "./haulier-types";
import { HaulierService } from "./haulier.service";
import { indexgenerater } from "./indexgenerater";

const input = {
  code: "",
  name: "South Haulier",
  registration: null,
  dispatchContact: null,
  dispatchPhone: null,
  email: null,
  vehicleTypes: ["CYLINDER_TRUCK"],
  unitsAvailable: null,
  zoneIds: null,
  hazmatCertified: false,
  rateBasis: "PER_TRIP",
  rate: 500,
  minCharge: null,
  demurrage: null,
  fuelSurcharge: null,
  surchargeUnit: "PCT",
  contractStart: "2026-04-01",
  contractEnd: "2027-03-31",
  insuranceExpiry: null,
  paymentTermsText: null,
  rating: null,
  onTimePct: null,
  accuracyPct: null,
  tripsYtd: null,
  volumeYtd: null,
  notes: null,
  validFrom: "2026-04-01",
  validTo: null,
  reason: "New record",
  changeNote: null,
  externalId: null,
} as HaulierInput;

test("create without a code stores the generated index in haulier id", async () => {
  const calls: string[] = [];
  let savedId = "";
  let savedCode = "";
  const repo = {
    withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({}),
    insert: async (_client: unknown, row: HaulierInput, _actor: string, id: string) => {
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
      return "HAU00001";
    },
    updateGindexMst: async (code: string) => {
      calls.push(`update:${code}`);
    },
  };
  const service = new HaulierService(repo as unknown as HaulierRepository, index as unknown as indexgenerater);
  const created = await service.create(input, "tester");
  assert.deepEqual(calls, ["get:HAU", "update:HAU"]);
  assert.equal(savedId, "HAU00001");
  assert.equal(savedCode, "HAU00001");
  assert.equal(created.id, "HAU00001");
  assert.equal(created.code, "HAU00001");
});
