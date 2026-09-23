import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { TerminalInput } from "../services/terminal-types";

const SELECT_LIST = `
  t.id, t.code, t.name, t.ownership,
  t.shipping_point_id as "shippingPointId", sp.code as "shippingPointCode", sp.name as "shippingPointName",
  t.vendor_id as "vendorId", v.code as "vendorCode", v.name as "vendorName",
  t.is_parent as "isParent", t.address,
  t.country_id as "countryId", c.name as "countryName",
  t.state_code as "stateCode", s.statename as "stateName",
  t.city_code as "cityCode", ci.cityname as "cityName", t.pincode,
  t.latitude::float8 as latitude, t.longitude::float8 as longitude,
  t.products_available as "productsAvailable", t.rack_price_ref as "rackPriceRef",
  t.freight_to_sp::float8 as "freightToSp", t.hazmat_class as "hazmatClass",
  t.valid_from as "validFrom", t.valid_to as "validTo", t.reason, t.change_note as "changeNote",
  t.status, t.version_no as "versionNo", t.external_id as "externalId",
  t.created_at as "createdAt", t.updated_at as "updatedAt"
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "t.code",
  name: "t.name",
  status: "t.status",
  validFrom: "t.valid_from",
  updatedAt: "t.updated_at",
};

export type TerminalRow = { id: string; status: string; version_no: number };

export type TerminalListQuery = {
  q: string;
  status: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class TerminalRepository {
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

  async list(query: TerminalListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["t.deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(t.code ilike $${values.length} or t.name ilike $${values.length})`);
    }
    if (query.status) {
      values.push(query.status);
      where.push(`t.status = $${values.length}`);
    }

    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.terminal t where ${where.join(" and ")}`,
      values,
    );
    values.push(query.pageSize, offset);
    const result = await this.pool.query(
      `select ${SELECT_LIST}
       from branch.terminal t
       join branch.shipping_point sp on sp.id = t.shipping_point_id
       left join branch.vendor v on v.id = t.vendor_id
       left join public.country c on c.id = t.country_id
       left join public.state s on s.countryid = t.country_id and s.statecode = t.state_code
       left join public.city ci on ci.countryid = t.country_id and ci.statecode = t.state_code and ci.citycode = t.city_code
       where ${where.join(" and ")}
       order by ${sortCol} asc
       limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return { rows: result.rows, total: Number(count.rows[0]?.total ?? 0) };
  }

  async findById(id: string) {
    const result = await this.pool.query(
      `select ${SELECT_LIST}
       from branch.terminal t
       join branch.shipping_point sp on sp.id = t.shipping_point_id
       left join branch.vendor v on v.id = t.vendor_id
       left join public.country c on c.id = t.country_id
       left join public.state s on s.countryid = t.country_id and s.statecode = t.state_code
       left join public.city ci on ci.countryid = t.country_id and ci.statecode = t.state_code and ci.citycode = t.city_code
       where t.id=$1 and t.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findShippingPointStatus(shippingPointId: string) {
    const result = await this.pool.query<{ status: string }>(
      `select status from branch.shipping_point where id=$1 and deleted_at is null`,
      [shippingPointId],
    );
    return result.rows[0] ?? null;
  }

  async findVendorForSupplier(vendorId: string) {
    const result = await this.pool.query<{ status: string; type: string }>(
      `select status, type from branch.vendor where id=$1 and deleted_at is null`,
      [vendorId],
    );
    return result.rows[0] ?? null;
  }

  async insert(client: PoolClient, input: TerminalInput, actor: string) {
    const inserted = await client.query(
      `insert into branch.terminal (
         code, name, ownership, shipping_point_id, vendor_id, is_parent, address,
         country_id, state_code, city_code, pincode,
         latitude, longitude, products_available, rack_price_ref, freight_to_sp, hazmat_class,
         valid_from, valid_to, reason, change_note, status, version_no, external_id,
         created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
         'DRAFT', 1, $22, $23, $23
       )
       returning id, status, version_no as "versionNo"`,
      insertValues(input, actor),
    );
    return inserted.rows[0] as { id: string; status: string; versionNo: number };
  }

  async update(client: PoolClient, id: string, input: TerminalInput, actor: string, status: string) {
    const values = insertValues(input, actor);
    await client.query(
      `update branch.terminal set
         code=$1, name=$2, ownership=$3, shipping_point_id=$4, vendor_id=$5, is_parent=$6,
         address=$7, country_id=$8, state_code=$9, city_code=$10, pincode=$11,
         latitude=$12, longitude=$13, products_available=$14, rack_price_ref=$15,
         freight_to_sp=$16, hazmat_class=$17, valid_from=$18, valid_to=$19, reason=$20,
         change_note=$21, external_id=$22,
         status=$24, version_no=version_no+1, updated_at=now(), updated_by=$23
       where id=$25 and deleted_at is null`,
      [...values, status, id],
    );
  }

  async clearOtherParents(client: PoolClient, shippingPointId: string, keepId: string) {
    await client.query(
      `update branch.terminal
       set is_parent=false, updated_at=now()
       where shipping_point_id=$1 and id<>$2 and deleted_at is null and is_parent=true`,
      [shippingPointId, keepId],
    );
  }

  async setStatus(client: PoolClient, id: string, status: string, note: string | null, actor: string) {
    await client.query(
      `update branch.terminal
       set status=$1, version_no=version_no+1, change_note=$2, updated_at=now(), updated_by=$3
       where id=$4`,
      [status, note, actor, id],
    );
  }

  async lock(client: PoolClient, id: string): Promise<TerminalRow> {
    const result = await client.query<TerminalRow>(
      `select id, status, version_no from branch.terminal where id=$1 and deleted_at is null for update`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("NOT_FOUND", "Terminal was not found", 404);
    return row;
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.terminal_version (terminal_id, version_no, snapshot, recorded_by)
       select id, version_no, to_jsonb(t), $2
       from branch.terminal t
       where id=$1`,
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
      `insert into branch.terminal_audit (terminal_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.terminal_version
       where terminal_id = $1
       order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.terminal_audit
       where terminal_id = $1
       order by created_at`,
      [id],
    );
    return result.rows;
  }

  async lookups() {
    const result = await this.pool.query(
      `select id, code, name
       from branch.terminal
       where deleted_at is null and status = 'PUBLISHED'
       order by code`,
    );
    return result.rows;
  }

  async exportRows() {
    const result = await this.pool.query(
      `select ${SELECT_LIST}
       from branch.terminal t
       join branch.shipping_point sp on sp.id = t.shipping_point_id
       left join branch.vendor v on v.id = t.vendor_id
       left join public.country c on c.id = t.country_id
       left join public.state s on s.countryid = t.country_id and s.statecode = t.state_code
       left join public.city ci on ci.countryid = t.country_id and ci.statecode = t.state_code and ci.citycode = t.city_code
       where t.deleted_at is null and t.status in ('PUBLISHED', 'DRAFT')
       order by t.code`,
    );
    return result.rows;
  }
}

function insertValues(input: TerminalInput, actor: string) {
  return [
    input.code,
    input.name,
    input.ownership,
    input.shippingPointId,
    input.vendorId ?? null,
    input.isParent,
    input.address,
    input.countryId,
    input.stateCode,
    input.cityCode,
    input.pincode,
    input.latitude ?? null,
    input.longitude ?? null,
    input.productsAvailable ?? [],
    input.rackPriceRef ?? null,
    input.freightToSp ?? null,
    input.hazmatClass ?? null,
    input.validFrom,
    input.validTo ?? null,
    input.reason,
    input.changeNote ?? null,
    input.externalId ?? null,
    actor,
  ];
}

export function mapDbError(error: unknown): MdmError | unknown {
  if (error instanceof MdmError) return error;
  const pg = error as { code?: string };
  if (pg.code === "23505") return new MdmError("CONFLICT", "Terminal code or externalId already exists", 409);
  if (pg.code === "23503") return new MdmError("PARENT_NOT_FOUND", "Shipping Point, Vendor, or geo code was not found", 400);
  if (pg.code === "23514") return new MdmError("VALIDATION", "Terminal failed a database check", 400);
  return error;
}
