import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { CylinderInput } from "../services/cylinder-types";

const SELECT_LIST = `
  c.id, c.code, c.serial, c.rfid, c.size,
  c.material_id as "materialId", m.code as "materialCode", m.name as "materialName",
  c.tare_kg::float8 as "tareKg", c.fill_capacity::float8 as "fillCapacity",
  c.valve_type as "valveType", c.requalification_due::text as "requalificationDue",
  c.custody_state as "custodyState", c.location_text as "locationText",
  c.shipping_point_id as "shippingPointId", sp.code as "shippingPointCode", sp.name as "shippingPointName",
  c.valid_from::text as "validFrom", c.valid_to::text as "validTo",
  c.reason, c.change_note as "changeNote", c.status, c.version_no as "versionNo",
  c.external_id as "externalId", c.created_at as "createdAt", c.updated_at as "updatedAt"
`;

const FROM_JOINS = `
  from branch.cylinder c
  join branch.material m on m.id = c.material_id
  left join branch.shipping_point sp on sp.id = c.shipping_point_id
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "c.code",
  serial: "c.serial",
  status: "c.status",
  validFrom: "c.valid_from",
  updatedAt: "c.updated_at",
};

export type CylinderRow = {
  id: string;
  status: string;
  version_no: number;
  reason: string;
  requalification_due: string;
};

export type CylinderListQuery = {
  q: string;
  status: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class CylinderRepository {
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

  async list(query: CylinderListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["c.deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(c.code ilike $${values.length} or c.serial ilike $${values.length})`);
    }
    if (query.status) {
      values.push(query.status);
      where.push(`c.status = $${values.length}`);
    }
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.cylinder c where ${where.join(" and ")}`,
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
      `select ${SELECT_LIST} ${FROM_JOINS} where c.id=$1 and c.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findMaterialStatus(materialId: string) {
    const result = await this.pool.query<{ status: string }>(
      `select status from branch.material where id=$1 and deleted_at is null`,
      [materialId],
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

  async insert(client: PoolClient, input: CylinderInput, actor: string) {
    const inserted = await client.query(
      `insert into branch.cylinder (
         code, serial, rfid, size, material_id, tare_kg, fill_capacity, valve_type,
         requalification_due, custody_state, location_text, shipping_point_id,
         valid_from, valid_to, reason, change_note, status, version_no, external_id,
         created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'DRAFT',1,$17,$18,$18
       )
       returning id, status, version_no as "versionNo"`,
      insertValues(input, actor),
    );
    return inserted.rows[0] as { id: string; status: string; versionNo: number };
  }

  async update(client: PoolClient, id: string, input: CylinderInput, actor: string, status: string) {
    const values = insertValues(input, actor);
    await client.query(
      `update branch.cylinder set
         code=$1, serial=$2, rfid=$3, size=$4, material_id=$5, tare_kg=$6, fill_capacity=$7, valve_type=$8,
         requalification_due=$9, custody_state=$10, location_text=$11, shipping_point_id=$12,
         valid_from=$13, valid_to=$14, reason=$15, change_note=$16, external_id=$17,
         status=$19, version_no=version_no+1, updated_at=now(), updated_by=$18
       where id=$20 and deleted_at is null`,
      [...values, status, id],
    );
  }

  async setStatus(client: PoolClient, id: string, status: string, note: string | null, actor: string) {
    await client.query(
      `update branch.cylinder
       set status=$1, version_no=version_no+1, change_note=coalesce($2, change_note), updated_at=now(), updated_by=$3
       where id=$4`,
      [status, note, actor, id],
    );
  }

  async lock(client: PoolClient, id: string): Promise<CylinderRow> {
    const result = await client.query<CylinderRow>(
      `select id, status, version_no, reason, requalification_due::text as requalification_due
       from branch.cylinder where id=$1 and deleted_at is null for update`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("NOT_FOUND", "Cylinder was not found", 404);
    return row;
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.cylinder_version (cylinder_id, version_no, snapshot, recorded_by)
       select id, version_no, to_jsonb(c), $2 from branch.cylinder c where id=$1`,
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
      `insert into branch.cylinder_audit (cylinder_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.cylinder_version where cylinder_id=$1 order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.cylinder_audit where cylinder_id=$1 order by created_at`,
      [id],
    );
    return result.rows;
  }

  async lookups() {
    const result = await this.pool.query(
      `select id, code, code as name
       from branch.cylinder
       where deleted_at is null and status = 'PUBLISHED'
       order by code`,
    );
    return result.rows;
  }

  async exportRows() {
    const result = await this.pool.query(
      `select ${SELECT_LIST} ${FROM_JOINS}
       where c.deleted_at is null and c.status in ('DRAFT', 'PUBLISHED')
       order by c.code`,
    );
    return result.rows;
  }
}

function insertValues(input: CylinderInput, actor: string) {
  return [
    input.code,
    input.serial,
    input.rfid,
    input.size,
    input.materialId,
    input.tareKg,
    input.fillCapacity,
    input.valveType,
    input.requalificationDue,
    input.custodyState,
    input.locationText,
    input.shippingPointId,
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
  if (pg.code === "23505" && pg.constraint === "cylinder_serial_udx") {
    return new MdmError("CONFLICT", "serial already exists", 409, "serial");
  }
  if (pg.code === "23505" && pg.constraint === "cylinder_rfid_udx") {
    return new MdmError("CONFLICT", "rfid already exists", 409, "rfid");
  }
  if (pg.code === "23505") return new MdmError("CONFLICT", "Cylinder code, serial, or externalId already exists", 409);
  if (pg.code === "23503") return new MdmError("PARENT_NOT_FOUND", "Material or Shipping Point was not found", 400);
  if (pg.code === "23514") return new MdmError("VALIDATION", "Cylinder failed a database check", 400);
  return error;
}
