import assert from "node:assert/strict";
import test from "node:test";

import type { MaterialRepository } from "../repositories/material.repository";
import type { UomRepository } from "../repositories/uom.repository";
import { indexgenerater } from "./indexgenerater";
import { MaterialService } from "./material.service";
import type { MaterialInput } from "./material-types";

const input = {
  code: "",
  name: "Test material",
  baseUomId: "11111111-1111-4111-8111-111111111111",
  validFrom: "2026-04-01",
  reason: "New record",
} as MaterialInput;

test("create without a code stores the generated index in material id", async () => {
  const calls: string[] = [];
  let savedCode = "";
  let savedId = "";
  const uom = {
    findById: async () => ({ status: "PUBLISHED", dimension: "VOLUME" }),
  };
  const index = {
    getGindexMst: async (code: string) => {
      calls.push(`get:${code}`);
      return "MAT00001";
    },
    updateGindexMst: async (code: string) => {
      calls.push(`update:${code}`);
    },
  };
  const repo = {
    withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({}),
    insert: async (_client: unknown, row: MaterialInput, _actor: string, _status: string, id: string) => {
      savedCode = row.code;
      savedId = id;
      return { id, status: "DRAFT", versionNo: 1, externalId: null };
    },
    snapshot: async () => undefined,
    audit: async () => undefined,
  };
  const service = new MaterialService(
    repo as unknown as MaterialRepository,
    uom as unknown as UomRepository,
    index as unknown as indexgenerater,
  );
  const created = await service.create(input, "tester");
  assert.deepEqual(calls, ["get:MAT", "update:MAT"]);
  assert.equal(savedId, "MAT00001");
  assert.equal(savedCode, "MAT00001");
  assert.equal(created.id, "MAT00001");
});
