import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";

/** Shared + module-specific gindexmst codes for branch-schema PKs (no UUID defaults). */
export const BRANCH_INDEX = {
  VERSION: "BVER",
  AUDIT: "BAUD",
  QUAL_RUN: "QRUN",
  RANK_RUN: "RRUN",
  RANK_SCORE: "ORS",
  RANK_WEIGHT_COMPONENT: "RWC",
  PRICING_RULE_CONDITION: "PRCN",
  RESERVATION: "RSV",
  RESERVATION_EVENT: "RSVE",
  STOCK_DECLARATION: "RDEC",
  RESERVATION_OVERRIDE: "RSOR",
} as const;

type IndexRow = {
  noprefix: string | null;
  nosuffix: string | null;
  nolength: number | null;
  lastno: number | null;
  padding: boolean | null;
};

type Db = Pool | PoolClient;

function formatAllocated(row: IndexRow, n: number): string {
  const prefix = row.noprefix ?? "";
  const suffix = row.nosuffix ?? "";
  if (row.padding) {
    return `${prefix}${String(n).padStart(row.nolength ?? 0, "0")}${suffix}`;
  }
  return `${prefix}${n}${suffix}`;
}

/** Atomically bump gindexmst and return one formatted id (safe inside a transaction). */
export async function allocateGindexId(db: Db, code: string): Promise<string> {
  const ids = await allocateGindexIds(db, code, 1);
  return ids[0]!;
}

/** Atomically reserve `count` ids and return them in ascending order. */
export async function allocateGindexIds(db: Db, code: string, count: number): Promise<string[]> {
  if (!code.trim()) throw new MdmError("VALIDATION", "code is required", 400, "code");
  if (!Number.isInteger(count) || count < 1) {
    throw new MdmError("VALIDATION", "count must be a positive integer", 400, "count");
  }
  const result = await db.query<IndexRow>(
    `update public.gindexmst
     set lastno = coalesce(lastno, 0) + $2
     where code = $1
     returning noprefix, nosuffix, nolength, lastno, padding`,
    [code, count],
  );
  const row = result.rows[0];
  if (!row) throw new MdmError("NOT_FOUND", "GindexMst index was not found", 404, "code");
  const end = row.lastno ?? 0;
  const start = end - count + 1;
  const ids: string[] = [];
  for (let n = start; n <= end; n++) ids.push(formatAllocated(row, n));
  return ids;
}
