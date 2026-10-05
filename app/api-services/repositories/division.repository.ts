import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { DivisionInput } from "../services/division-types";

const SELECT_LIST = `
  d.id, d.code, d.name,
  d.legal_entity_id as "legalEntityId",
  d.zone_id as "zoneId", z.code as "zoneCode", z.name as "zoneName",
  d.search_term_1 as "searchTerm1", d.search_term_2 as "searchTerm2",
  d.street, d.district, d.postal_code as "postalCode", d.city, d.country, d.region,
  d.time_zone as "timeZone", d.po_box as "poBox", d.po_box_postal_code as "poBoxPostalCode",
  d.company_postal_code as "companyPostalCode", d.language, d.telephone, d.extension, d.mobile, d.fax, d.email,
  d.standard_method as "standardMethod", d.comments,
  d.valid_from::text as "validFrom", d.valid_to::text as "validTo",
  d.reason, d.change_note as "changeNote", d.status, d.version_no as "versionNo",
  d.external_id as "externalId", d.created_at as "createdAt", d.updated_at as "updatedAt"
`;

const FROM_JOINS = `
  from branch.division d
  left join branch.zone z on z.id = d.zone_id
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "d.code",
  name: "d.name",
  status: "d.status",
  validFrom: "d.valid_from",
  updatedAt: "d.updated_at",
};

export type DivisionRow = {
  id: string;
  status: string;
  version_no: number;
};

export type DivisionListQuery = {
  q: string;
  status: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class DivisionRepository {
  constructor(private readonly pool: Pool) {}

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw mapDbError(error);
    } finally {
      client.release();
    }
  }

  async list(query: DivisionListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["d.deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(d.code ilike $${values.length} or d.name ilike $${values.length} or d.city ilike $${values.length})`);
    }
    if (query.status) {
      values.push(query.status);
      where.push(`d.status = $${values.length}`);
    }
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.division d where ${where.join(" and ")}`,
      values,
    );
    values.push(query.pageSize, offset);
    const result = await this.pool.query(
      `select ${SELECT_LIST} ${FROM_JOINS}
       where ${where.join(" and ")}
       order by ${sortCol} asc
       limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return { rows: result.rows, total: Number(count.rows[0]?.total ?? 0) };
  }

  async findById(id: string) {
    const result = await this.pool.query(
      `select ${SELECT_LIST} ${FROM_JOINS} where d.id=$1 and d.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findZone(zoneId: string) {
    const result = await this.pool.query<{ status: string }>(
      `select status from branch.zone where id=$1 and deleted_at is null`,
      [zoneId],
    );
    return result.rows[0] ?? null;
  }

  async findCountry(code: string) {
    const result = await this.pool.query(
      `select id from public.country
       where upper(id) = upper($1) or upper(coalesce(shortname, '')) = upper($1)
       limit 1`,
      [code],
    );
    return result.rows[0] ?? null;
  }

  async findLegalEntity(id: string): Promise<{ status: string } | "missing-table" | null> {
    const present = await this.pool.query<{ name: string | null }>(`select to_regclass('branch.legal_entity') as name`);
    if (!present.rows[0]?.name) return "missing-table";
    const result = await this.pool.query<{ status: string }>(
      `select status from branch.legal_entity where id=$1 and deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async hasChildren(id: string) {
    const result = await this.pool.query(
      `select 1 from branch.shipping_point where division_id=$1 and deleted_at is null
       union all
       select 1 from branch.vehicle where division_id=$1 and deleted_at is null
       limit 1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async insert(client: PoolClient, input: DivisionInput, actor: string) {
    const inserted = await client.query(
      `insert into branch.division (
         code, name, legal_entity_id, zone_id, search_term_1, search_term_2, street, district,
         postal_code, city, country, region, time_zone, po_box, po_box_postal_code, company_postal_code,
         language, telephone, extension, mobile, fax, email, standard_method, comments,
         valid_from, valid_to, reason, change_note, external_id, status, version_no, created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,
         'DRAFT', 1, $30, $30
       )
       returning id, status, version_no as "versionNo"`,
      insertValues(input, actor),
    );
    return inserted.rows[0] as { id: string; status: string; versionNo: number };
  }

  async update(client: PoolClient, id: string, input: DivisionInput, actor: string, status: string) {
    const values = insertValues(input, actor);
    await client.query(
      `update branch.division set
         code=$1, name=$2, legal_entity_id=$3, zone_id=$4, search_term_1=$5, search_term_2=$6, street=$7, district=$8,
         postal_code=$9, city=$10, country=$11, region=$12, time_zone=$13, po_box=$14, po_box_postal_code=$15,
         company_postal_code=$16, language=$17, telephone=$18, extension=$19, mobile=$20, fax=$21, email=$22,
         standard_method=$23, comments=$24, valid_from=$25, valid_to=$26, reason=$27, change_note=$28, external_id=$29,
         status=$31, version_no=version_no+1, updated_at=now(), updated_by=$30
       where id=$32 and deleted_at is null`,
      [...values, status, id],
    );
  }

  async setStatus(client: PoolClient, id: string, status: string, note: string | null, actor: string) {
    await client.query(
      `update branch.division
       set status=$1, version_no=version_no+1, change_note=coalesce($2, change_note), updated_at=now(), updated_by=$3
       where id=$4 and deleted_at is null`,
      [status, note, actor, id],
    );
  }

  async softDelete(client: PoolClient, id: string, actor: string) {
    await client.query(
      `update branch.division
       set deleted_at=now(), version_no=version_no+1, updated_at=now(), updated_by=$2
       where id=$1 and deleted_at is null`,
      [id, actor],
    );
  }

  async lock(client: PoolClient, id: string): Promise<DivisionRow> {
    const result = await client.query<DivisionRow>(
      `select id, status, version_no from branch.division where id=$1 and deleted_at is null for update`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("NOT_FOUND", "Division was not found", 404);
    return row;
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.division_version (division_id, version_no, snapshot, recorded_by)
       select id, version_no, to_jsonb(d), $2 from branch.division d where id=$1`,
      [id, actor],
    );
  }

  async audit(
    client: PoolClient,
    id: string,
    action: string,
    actor: string,
    note: string | null,
    payload: Record<string, unknown>,
  ) {
    await client.query(
      `insert into branch.division_audit (division_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.division_version where division_id=$1 order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.division_audit where division_id=$1 order by created_at`,
      [id],
    );
    return result.rows;
  }

  async lookups() {
    const result = await this.pool.query(
      `select id, code, name from branch.division
       where deleted_at is null and status = 'PUBLISHED'
       order by code`,
    );
    return result.rows;
  }

  async exportRows() {
    const result = await this.pool.query(
      `select ${SELECT_LIST} ${FROM_JOINS}
       where d.deleted_at is null and d.status in ('DRAFT', 'PUBLISHED')
       order by d.code`,
    );
    return result.rows;
  }
}

function insertValues(input: DivisionInput, actor: string) {
  return [
    input.code,
    input.name,
    input.legalEntityId,
    input.zoneId,
    input.searchTerm1,
    input.searchTerm2,
    input.street,
    input.district,
    input.postalCode,
    input.city,
    input.country,
    input.region,
    input.timeZone,
    input.poBox,
    input.poBoxPostalCode,
    input.companyPostalCode,
    input.language,
    input.telephone,
    input.extension,
    input.mobile,
    input.fax,
    input.email,
    input.standardMethod,
    input.comments,
    input.validFrom,
    input.validTo,
    input.reason,
    input.changeNote,
    input.externalId,
    actor,
  ];
}

export function mapDbError(error: unknown): MdmError | unknown {
  if (error instanceof MdmError) return error;
  const pg = error as { code?: string; constraint?: string };
  if (pg.code === "23505" && pg.constraint === "division_code_udx") {
    return new MdmError("CONFLICT", "Division code already exists", 409, "code");
  }
  if (pg.code === "23505") {
    return new MdmError("CONFLICT", "Division code or externalId already exists", 409);
  }
  if (pg.code === "23503") return new MdmError("PARENT_NOT_FOUND", "Zone was not found", 400, "zoneId");
  if (pg.code === "23514") return new MdmError("VALIDATION", "Division failed a database check", 400);
  return error;
}
