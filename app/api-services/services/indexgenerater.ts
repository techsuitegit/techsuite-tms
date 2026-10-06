import type { Pool } from "pg";

import { MdmError } from "../errors/mdm-error";

type IndexRow = {
  noprefix: string | null;
  nosuffix: string | null;
  nolength: number | null;
  lastno: number | null;
  padding: boolean | null;
};

const SELECT_INDEX = `noprefix, nosuffix, nolength, lastno, padding`;

export function formatIndexNumber(row: IndexRow): string {
  const next = (row.lastno ?? 0) + 1;
  const prefix = row.noprefix ?? "";
  const suffix = row.nosuffix ?? "";
  if (row.padding) {
    return `${prefix}${String(next).padStart(row.nolength ?? 0, "0")}${suffix}`;
  }
  return `${prefix}${next}${suffix}`;
}

export class indexgenerater {
  constructor(private readonly pool: Pool) {}

  async getGindexMst(code: string) {
    requireText(code, "code");
    const row = await this.one(
      `select ${SELECT_INDEX} from public.gindexmst where code = $1`,
      [code],
      "GindexMst",
    );
    return formatIndexNumber(row);
  }

  async updateGindexMst(code: string) {
    requireText(code, "code");
    await this.bump(`update public.gindexmst set lastno = coalesce(lastno, 0) + 1 where code = $1`, [code], "GindexMst");
  }

  async getBindexMst(branchcode: string, code: string) {
    requireText(branchcode, "branchcode");
    requireText(code, "code");
    const row = await this.one(
      `select ${SELECT_INDEX} from public.bindexmst where branch = $1 and code = $2`,
      [branchcode, code],
      "BindexMst",
    );
    return formatIndexNumber(row);
  }

  async updateBindexMst(branchcode: string, code: string) {
    requireText(branchcode, "branchcode");
    requireText(code, "code");
    await this.bump(
      `update public.bindexmst set lastno = coalesce(lastno, 0) + 1 where branch = $1 and code = $2`,
      [branchcode, code],
      "BindexMst",
    );
  }

  async getBindexTrn(branchcode: string, code: string) {
    requireText(branchcode, "branchcode");
    requireText(code, "code");
    const fyid = await this.currentFyId(branchcode);
    const row = await this.one(
      `select ${SELECT_INDEX} from public.bindextrn where branch = $1 and code = $2 and fyid = $3`,
      [branchcode, code, fyid],
      "BindexTrn",
    );
    return formatIndexNumber(row);
  }

  async updateBindexTrn(branchcode: string, code: string) {
    requireText(branchcode, "branchcode");
    requireText(code, "code");
    const fyid = await this.currentFyId(branchcode);
    await this.bump(
      `update public.bindextrn set lastno = coalesce(lastno, 0) + 1 where branch = $1 and code = $2 and fyid = $3`,
      [branchcode, code, fyid],
      "BindexTrn",
    );
  }

  private async currentFyId(branchcode: string) {
    let result;
    try {
      result = await this.pool.query<{ currentfyid: string | number }>(
        `select distinct currentfyid from public.branchcontrol where branchcode = $1`,
        [branchcode],
      );
    } catch (error) {
      const pg = error as { code?: string };
      if (pg.code === "42P01") {
        throw new MdmError("NOT_FOUND", "branchcontrol was not found", 404, "branchcode");
      }
      throw error;
    }
    const ids = result.rows.map((row) => String(row.currentfyid));
    if (ids.length === 0) {
      throw new MdmError("NOT_FOUND", "branchcontrol has no current financial year for this branch", 404, "branchcode");
    }
    if (ids.length > 1) {
      throw new MdmError("CONFLICT", "branchcontrol has more than one current financial year for this branch", 409, "branchcode");
    }
    return ids[0];
  }

  private async one(sql: string, values: unknown[], table: string) {
    const result = await this.pool.query<IndexRow>(sql, values);
    const row = result.rows[0];
    if (!row) throw new MdmError("NOT_FOUND", `${table} index was not found`, 404, "code");
    return row;
  }

  private async bump(sql: string, values: unknown[], table: string) {
    const result = await this.pool.query(sql, values);
    if ((result.rowCount ?? 0) === 0) {
      throw new MdmError("NOT_FOUND", `${table} index was not found`, 404, "code");
    }
  }
}

function requireText(value: string, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new MdmError("VALIDATION", `${field} is required`, 400, field);
  }
}
