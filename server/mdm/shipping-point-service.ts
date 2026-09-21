import type { Pool, PoolClient } from "pg";

import { MdmError } from "./mdm-error";
import type { ShippingPointInput } from "./shipping-point-types";
import { parseCreateBody } from "./shipping-point-validation";

const SELECT_LIST = `
  sp.id, sp.code, sp.name, sp.division_id as "divisionId", d.code as "divisionCode", d.name as "divisionName",
  sp.type, sp.address, sp.latitude::float8 as latitude, sp.longitude::float8 as longitude,
  sp.geofence_radius_m as "geofenceRadiusM", sp.opening_hours as "openingHours",
  sp.loading_bays as "loadingBays", sp.loading_rate_lpm::float8 as "loadingRateLpm",
  sp.mid_shift_reload as "midShiftReload", sp.products_stocked as "productsStocked",
  sp.lead_dispatcher as "leadDispatcher", sp.phone, sp.hazmat_class as "hazmatClass",
  sp.permit_no as "permitNo", sp.permit_expiry as "permitExpiry", sp.erp_ref as "erpRef",
  sp.valid_from as "validFrom", sp.valid_to as "validTo", sp.reason, sp.change_note as "changeNote",
  sp.status, sp.version_no as "versionNo", sp.external_id as "externalId",
  sp.created_at as "createdAt", sp.updated_at as "updatedAt"
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "sp.code",
  name: "sp.name",
  status: "sp.status",
  validFrom: "sp.valid_from",
  updatedAt: "sp.updated_at",
};

export class ShippingPointService {
  constructor(private readonly pool: Pool) {}

  async list(query: URLSearchParams) {
    const q = query.get("q")?.trim() ?? "";
    const status = query.get("status")?.trim() || null;
    const page = Math.max(1, Number(query.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.get("pageSize") ?? 20) || 20));
    const sortKey = query.get("sort")?.trim() || "updatedAt";
    const sortCol = SORT_COLUMNS[sortKey] ?? SORT_COLUMNS.updatedAt;
    const offset = (page - 1) * pageSize;

    const values: unknown[] = [];
    const where = ["sp.deleted_at is null"];
    if (q) {
      values.push(`%${q}%`);
      where.push(`(sp.code ilike $${values.length} or sp.name ilike $${values.length})`);
    }
    if (status) {
      values.push(status);
      where.push(`sp.status = $${values.length}`);
    }

    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.shipping_point sp where ${where.join(" and ")}`,
      values,
    );
    values.push(pageSize, offset);
    const result = await this.pool.query(
      `select ${SELECT_LIST}
       from branch.shipping_point sp
       join branch.division d on d.id = sp.division_id
       where ${where.join(" and ")}
       order by ${sortCol} asc
       limit $${values.length - 1} offset $${values.length}`,
      values,
    );

    return {
      items: result.rows.map(serializeRow),
      total: Number(count.rows[0]?.total ?? 0),
      page,
    };
  }

  async getById(id: string) {
    const row = await this.load(id);
    if (!row) throw new MdmError("NOT_FOUND", "Shipping Point was not found", 404);
    return serializeRow(row);
  }

  async create(input: ShippingPointInput, actor: string) {
    await this.assertPublishedDivision(input.divisionId);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const inserted = await client.query(
        `insert into branch.shipping_point (
           code, name, division_id, type, address, latitude, longitude, geofence_radius_m,
           opening_hours, loading_bays, loading_rate_lpm, mid_shift_reload, products_stocked,
           lead_dispatcher, phone, hazmat_class, permit_no, permit_expiry, erp_ref,
           valid_from, valid_to, reason, change_note, status, version_no, external_id,
           created_by, updated_by
         ) values (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
           'DRAFT', 1, $24, $25, $25
         )
         returning id, status, version_no as "versionNo"`,
        insertValues(input, actor),
      );
      const row = inserted.rows[0];
      await this.snapshot(client, row.id, actor);
      await this.audit(client, row.id, "CREATE", actor, input.changeNote ?? null, { status: "DRAFT" });
      await client.query("commit");
      return { id: row.id, status: "DRAFT" as const, versionNo: row.versionNo };
    } catch (error) {
      await client.query("rollback");
      throw mapDbError(error);
    } finally {
      client.release();
    }
  }

  async update(id: string, input: ShippingPointInput, actor: string) {
    await this.assertPublishedDivision(input.divisionId);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const current = await this.lock(client, id);
      if (current.status === "PENDING") {
        throw new MdmError("LOCKED", "PENDING Shipping Point cannot be amended", 409);
      }
      if (current.version_no !== input.versionNo) {
        throw new MdmError("STALE_VERSION", "record changed by another user", 409);
      }
      const nextStatus = current.status === "PUBLISHED" ? "PUBLISHED" : current.status;
      const values = insertValues(input, actor);
      await client.query(
        `update branch.shipping_point set
           code=$1, name=$2, division_id=$3, type=$4, address=$5, latitude=$6, longitude=$7,
           geofence_radius_m=$8, opening_hours=$9, loading_bays=$10, loading_rate_lpm=$11,
           mid_shift_reload=$12, products_stocked=$13, lead_dispatcher=$14, phone=$15,
           hazmat_class=$16, permit_no=$17, permit_expiry=$18, erp_ref=$19, valid_from=$20,
           valid_to=$21, reason=$22, change_note=$23, external_id=$24,
           status=$26, version_no=version_no+1, updated_at=now(), updated_by=$25
         where id=$27 and deleted_at is null`,
        [...values, nextStatus, id],
      );
      const updated = await this.lock(client, id);
      await this.snapshot(client, id, actor);
      await this.audit(client, id, "UPDATE", actor, input.changeNote ?? null, { versionNo: updated.version_no });
      await client.query("commit");
      return { id, versionNo: updated.version_no };
    } catch (error) {
      await client.query("rollback");
      throw mapDbError(error);
    } finally {
      client.release();
    }
  }

  async submit(id: string, reason: string, actor: string) {
    if (!reason.trim()) throw new MdmError("VALIDATION", "reason is required", 400, "reason");
    return this.transition(id, actor, reason, (current) => {
      if (current.status !== "DRAFT") throw new MdmError("CONFLICT", "Only DRAFT rows can be submitted", 409);
      return { status: "PUBLISHED", action: "SUBMIT" };
    });
  }

  async approve(id: string, note: string | null, actor: string) {
    return this.transition(id, actor, note, (current) => {
      if (current.status !== "PENDING") throw new MdmError("CONFLICT", "Only PENDING rows can be approved", 409);
      return { status: "PUBLISHED", action: "APPROVE" };
    });
  }

  async reject(id: string, note: string, actor: string) {
    if (!note.trim()) throw new MdmError("VALIDATION", "note is required", 400, "note");
    return this.transition(id, actor, note, (current) => {
      if (current.status !== "PENDING") throw new MdmError("CONFLICT", "Only PENDING rows can be rejected", 409);
      return { status: "REJECTED", action: "REJECT" };
    });
  }

  async versions(id: string) {
    await this.getById(id);
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.shipping_point_version
       where shipping_point_id = $1
       order by version_no`,
      [id],
    );
    return { versions: result.rows };
  }

  async auditLog(id: string) {
    await this.getById(id);
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.shipping_point_audit
       where shipping_point_id = $1
       order by created_at`,
      [id],
    );
    return { events: result.rows };
  }

  async lookups() {
    const result = await this.pool.query(
      `select id, code, name
       from branch.shipping_point
       where deleted_at is null and status = 'PUBLISHED'
       order by code`,
    );
    return result.rows;
  }

  async importRows(rows: Record<string, unknown>[], actor: string) {
    const accepted: { id: string; code: string }[] = [];
    const rejected: { row: number; code?: string; message: string; field?: string }[] = [];
    for (const [index, row] of rows.entries()) {
      try {
        const input = parseCreateBody(row);
        const created = await this.create(input, actor);
        accepted.push({ id: created.id, code: input.code });
      } catch (error) {
        const mapped = error instanceof MdmError ? error : mapDbError(error);
        rejected.push({
          row: index + 1,
          code: typeof row.code === "string" ? row.code : undefined,
          message: mapped.message,
          field: mapped instanceof MdmError ? mapped.field : undefined,
        });
      }
    }
    return { accepted, rejected };
  }

  async exportCsv() {
    const result = await this.pool.query(
      `select ${SELECT_LIST}
       from branch.shipping_point sp
       join branch.division d on d.id = sp.division_id
       where sp.deleted_at is null and sp.status in ('PUBLISHED', 'DRAFT')
       order by sp.code`,
    );
    const headers = [
      "id",
      "code",
      "name",
      "divisionId",
      "type",
      "address",
      "latitude",
      "longitude",
      "status",
      "validFrom",
      "versionNo",
    ];
    const lines = [headers.join(",")];
    for (const row of result.rows.map(serializeRow)) {
      lines.push(headers.map((key) => csvCell((row as Record<string, unknown>)[key])).join(","));
    }
    return lines.join("\n");
  }

  private async transition(
    id: string,
    actor: string,
    note: string | null,
    next: (current: ShippingPointRow) => { status: string; action: string },
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const current = await this.lock(client, id);
      const result = next(current);
      await client.query(
        `update branch.shipping_point
         set status=$1, version_no=version_no+1, change_note=$2, updated_at=now(), updated_by=$3
         where id=$4`,
        [result.status, note, actor, id],
      );
      const updated = await this.lock(client, id);
      await this.snapshot(client, id, actor);
      await this.audit(client, id, result.action, actor, note, { status: result.status });
      await client.query("commit");
      return { status: result.status };
    } catch (error) {
      await client.query("rollback");
      throw mapDbError(error);
    } finally {
      client.release();
    }
  }

  private async assertPublishedDivision(divisionId: string) {
    const result = await this.pool.query<{ status: string }>(
      `select status from branch.division where id=$1 and deleted_at is null`,
      [divisionId],
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("PARENT_NOT_FOUND", "Division was not found", 400, "divisionId");
    if (row.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Division must be PUBLISHED", 400, "divisionId");
    }
  }

  private async load(id: string) {
    const result = await this.pool.query(
      `select ${SELECT_LIST}
       from branch.shipping_point sp
       join branch.division d on d.id = sp.division_id
       where sp.id=$1 and sp.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  private async lock(client: PoolClient, id: string): Promise<ShippingPointRow> {
    const result = await client.query<ShippingPointRow>(
      `select id, status, version_no from branch.shipping_point where id=$1 and deleted_at is null for update`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("NOT_FOUND", "Shipping Point was not found", 404);
    return row;
  }

  private async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.shipping_point_version (shipping_point_id, version_no, snapshot, recorded_by)
       select id, version_no, to_jsonb(sp), $2
       from branch.shipping_point sp
       where id=$1`,
      [id, actor],
    );
  }

  private async audit(
    client: PoolClient,
    id: string,
    action: string,
    actor: string,
    note: string | null,
    payload: Record<string, unknown>,
  ) {
    await client.query(
      `insert into branch.shipping_point_audit (shipping_point_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }
}

type ShippingPointRow = { id: string; status: string; version_no: number };

function insertValues(input: ShippingPointInput, actor: string) {
  return [
    input.code,
    input.name,
    input.divisionId,
    input.type,
    input.address,
    input.latitude,
    input.longitude,
    input.geofenceRadiusM ?? null,
    input.openingHours ?? null,
    input.loadingBays ?? null,
    input.loadingRateLpm ?? null,
    input.midShiftReload ?? null,
    input.productsStocked ?? [],
    input.leadDispatcher ?? null,
    input.phone ?? null,
    input.hazmatClass ?? null,
    input.permitNo ?? null,
    input.permitExpiry ?? null,
    input.erpRef ?? null,
    input.validFrom,
    input.validTo ?? null,
    input.reason,
    input.changeNote ?? null,
    input.externalId ?? null,
    actor,
  ];
}

function serializeRow(row: Record<string, unknown>) {
  return {
    ...row,
    permitExpiry: dateOnly(row.permitExpiry),
    validFrom: dateOnly(row.validFrom),
    validTo: dateOnly(row.validTo),
  };
}

function dateOnly(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  return value ?? null;
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function mapDbError(error: unknown): MdmError | unknown {
  if (error instanceof MdmError) return error;
  const pg = error as { code?: string; constraint?: string };
  if (pg.code === "23505") return new MdmError("CONFLICT", "Shipping Point code or externalId already exists", 409);
  if (pg.code === "23503") return new MdmError("PARENT_NOT_FOUND", "Division was not found", 400, "divisionId");
  if (pg.code === "23514") return new MdmError("VALIDATION", "Shipping Point failed a database check", 400);
  return error;
}
