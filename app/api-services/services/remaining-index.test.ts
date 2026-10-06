import assert from "node:assert/strict";
import test from "node:test";

import type { PtlThresholdRepository } from "../repositories/ptl-threshold.repository";
import type { UomRepository } from "../repositories/uom.repository";
import type { ZoneRepository } from "../repositories/zone.repository";
import { indexgenerater } from "./indexgenerater";
import { PtlThresholdService } from "./ptl-threshold.service";
import type { PtlThresholdInput } from "./ptl-threshold-types";
import { UomService } from "./uom.service";
import type { UomInput } from "./uom-types";
import { ZoneService } from "./zone.service";
import type { ZoneInput } from "./zone-types";

function fakeIndex(issued: string) {
  const calls: string[] = [];
  return {
    calls,
    index: {
      getGindexMst: async (code: string) => {
        calls.push(`get:${code}`);
        return issued;
      },
      updateGindexMst: async (code: string) => {
        calls.push(`update:${code}`);
      },
    },
  };
}

test("create without a code stores the generated index in zone id", async () => {
  const { calls, index } = fakeIndex("ZON00001");
  let saved = "";
  const repo = {
    withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({}),
    insert: async (_client: unknown, row: ZoneInput, _actor: string, id: string) => {
      saved = `${id}:${row.code}`;
      return { id, status: "DRAFT", versionNo: 1 };
    },
    snapshot: async () => undefined,
    audit: async () => undefined,
  };
  const created = await new ZoneService(repo as unknown as ZoneRepository, index as unknown as indexgenerater).create(
    { code: "", name: "South", description: null, validFrom: "2026-04-01", validTo: null, reason: "New record", changeNote: null, externalId: null } as ZoneInput,
    "tester",
  );
  assert.deepEqual(calls, ["get:ZON", "update:ZON"]);
  assert.equal(saved, "ZON00001:ZON00001");
  assert.equal(created.id, "ZON00001");
});

test("create without a code stores the generated index in uom id", async () => {
  const { calls, index } = fakeIndex("UOM00001");
  let saved = "";
  const repo = {
    withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({}),
    insert: async (_client: unknown, row: UomInput, _actor: string, id: string) => {
      saved = `${id}:${row.code}`;
      return { id, status: "PUBLISHED", versionNo: 1, externalId: null };
    },
    snapshot: async () => undefined,
    audit: async () => undefined,
  };
  const created = await new UomService(repo as unknown as UomRepository, index as unknown as indexgenerater).create(
    {
      code: "",
      name: "Litre",
      isBase: true,
      factorToBase: 1,
      decimalPlaces: 0,
      rounding: "HALF_UP",
      dimension: "VOLUME",
      validFrom: "2026-04-01",
      validTo: null,
      reason: "New record",
      changeNote: null,
      externalId: null,
    } as UomInput,
    "tester",
  );
  assert.deepEqual(calls, ["get:UOM", "update:UOM"]);
  assert.equal(saved, "UOM00001:UOM00001");
  assert.equal(created.code, "UOM00001");
});

test("create without a code stores the generated index in ptl threshold id", async () => {
  const { calls, index } = fakeIndex("PTL00001");
  let saved = "";
  const repo = {
    withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({}),
    insert: async (_client: unknown, row: PtlThresholdInput, _actor: string, id: string) => {
      saved = `${id}:${row.code}`;
      return { id, status: "DRAFT", versionNo: 1 };
    },
    snapshot: async () => undefined,
    audit: async () => undefined,
  };
  const created = await new PtlThresholdService(
    repo as unknown as PtlThresholdRepository,
    index as unknown as indexgenerater,
  ).create(
    {
      code: "",
      vehicleClass: "BOBTAIL_LPG",
      minLoadPct: 80,
      belowAction: "WARN",
      urgentExempt: false,
      overrideRole: null,
      validFrom: "2026-04-01",
      validTo: null,
      reason: "New record",
      changeNote: null,
      externalId: null,
    } as PtlThresholdInput,
    "tester",
  );
  assert.deepEqual(calls, ["get:PTL", "update:PTL"]);
  assert.equal(saved, "PTL00001:PTL00001");
  assert.equal(created.id, "PTL00001");
});
