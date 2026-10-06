import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { CompartmentInput, VehicleInput } from "../services/vehicle-types";

const SELECT_LIST = `
  v.id, v.code, v.plate, v.vin, v.make, v.model, v.model_year as "modelYear",
  v.vehicle_class as "vehicleClass",
  v.shipping_point_id as "shippingPointId", sp.code as "shippingPointCode", sp.name as "shippingPointName",
  v.division_id as "divisionId", d.code as "divisionCode", d.name as "divisionName",
  v.cost_centre_id as "costCentreId",
  v.capacity::float8 as capacity,
  v.capacity_uom_id as "capacityUomId", u.code as "capacityUomCode",
  v.gvw_kg::float8 as "gvwKg", v.tare_kg::float8 as "tareKg",
  v.height_m::float8 as "heightM", v.length_m::float8 as "lengthM",
  v.hazmat_class as "hazmatClass", v.axle_config as "axleConfig",
  v.ptl_min_pct::float8 as "ptlMinPct", v.gps_device_id as "gpsDeviceId",
  v.insurance_expiry::text as "insuranceExpiry", v.fitness_expiry::text as "fitnessExpiry",
  v.permit_expiry::text as "permitExpiry",
  v.valid_from::text as "validFrom", v.valid_to::text as "validTo",
  v.reason, v.change_note as "changeNote", v.status, v.version_no as "versionNo",
  v.external_id as "externalId", v.created_at as "createdAt", v.updated_at as "updatedAt"
`;

const FROM_JOINS = `
  from branch.vehicle v
  join branch.shipping_point sp on sp.id = v.shipping_point_id
  join branch.division d on d.id = v.division_id
  join branch.uom u on u.id = v.capacity_uom_id
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "v.code",
  plate: "v.plate",
  status: "v.status",
  validFrom: "v.valid_from",
  updatedAt: "v.updated_at",
};

export type VehicleRow = { id: string; status: string; version_no: number };

export type VehicleListQuery = {
  q: string;
  status: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class VehicleRepository {
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

  async list(query: VehicleListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["v.deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(v.code ilike $${values.length} or v.plate ilike $${values.length})`);
    }
    if (query.status) {
      values.push(query.status);
      where.push(`v.status = $${values.length}`);
    }
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.vehicle v where ${where.join(" and ")}`,
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
      `select ${SELECT_LIST} ${FROM_JOINS} where v.id=$1 and v.deleted_at is null`,
      [id],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    row.compartments = await this.compartments(id);
    return row;
  }

  async compartments(vehicleId: string) {
    const result = await this.pool.query(
      `select c.id, c.seq, c.material_id as "materialId", m.code as "materialCode", m.name as "materialName",
              c.volume::float8 as volume
       from branch.vehicle_compartment c
       left join branch.material m on m.id = c.material_id
       where c.vehicle_id = $1
       order by c.seq`,
      [vehicleId],
    );
    return result.rows;
  }

  async findShippingPoint(shippingPointId: string) {
    const result = await this.pool.query<{ status: string; divisionId: string }>(
      `select status, division_id as "divisionId"
       from branch.shipping_point where id=$1 and deleted_at is null`,
      [shippingPointId],
    );
    return result.rows[0] ?? null;
  }

  async findDivisionStatus(divisionId: string) {
    const result = await this.pool.query<{ status: string }>(
      `select status from branch.division where id=$1 and deleted_at is null`,
      [divisionId],
    );
    return result.rows[0] ?? null;
  }

  async findUomStatus(uomId: string) {
    const result = await this.pool.query<{ status: string }>(
      `select status from branch.uom where id=$1 and deleted_at is null`,
      [uomId],
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

  async insert(client: PoolClient, input: VehicleInput, actor: string, id: string) {
    const inserted = await client.query(
      `insert into branch.vehicle (
         id, code, plate, vin, make, model, model_year, vehicle_class,
         shipping_point_id, division_id, cost_centre_id, capacity, capacity_uom_id,
         gvw_kg, tare_kg, height_m, length_m, hazmat_class, axle_config, ptl_min_pct, gps_device_id,
         insurance_expiry, fitness_expiry, permit_expiry,
         valid_from, valid_to, reason, change_note, status, version_no, external_id,
         created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
         $22,$23,$24,$25,$26,$27,$28,'DRAFT',1,$29,$30,$30
       )
       returning id, status, version_no as "versionNo"`,
      [id, ...insertValues(input, actor)],
    );
    const row = inserted.rows[0] as { id: string; status: string; versionNo: number };
    await this.replaceCompartments(client, row.id, input.compartments);
    return row;
  }

  async update(client: PoolClient, id: string, input: VehicleInput, actor: string, status: string) {
    const values = insertValues(input, actor);
    await client.query(
      `update branch.vehicle set
         code=$1, plate=$2, vin=$3, make=$4, model=$5, model_year=$6, vehicle_class=$7,
         shipping_point_id=$8, division_id=$9, cost_centre_id=$10, capacity=$11, capacity_uom_id=$12,
         gvw_kg=$13, tare_kg=$14, height_m=$15, length_m=$16, hazmat_class=$17, axle_config=$18,
         ptl_min_pct=$19, gps_device_id=$20, insurance_expiry=$21, fitness_expiry=$22, permit_expiry=$23,
         valid_from=$24, valid_to=$25, reason=$26, change_note=$27, external_id=$28,
         status=$30, version_no=version_no+1, updated_at=now(), updated_by=$29
       where id=$31 and deleted_at is null`,
      [...values, status, id],
    );
    await this.replaceCompartments(client, id, input.compartments);
  }

  async replaceCompartments(client: PoolClient, vehicleId: string, compartments: CompartmentInput[]) {
    await client.query(`delete from branch.vehicle_compartment where vehicle_id=$1`, [vehicleId]);
    for (const row of compartments) {
      if (!row.id) throw new MdmError("VALIDATION", "Vehicle compartment id is required", 500);
      await client.query(
        `insert into branch.vehicle_compartment (id, vehicle_id, seq, material_id, volume)
         values ($1,$2,$3,$4,$5)`,
        [row.id, vehicleId, row.seq, row.materialId, row.volume],
      );
    }
  }

  async setStatus(client: PoolClient, id: string, status: string, note: string | null, actor: string) {
    await client.query(
      `update branch.vehicle
       set status=$1, version_no=version_no+1, change_note=coalesce($2, change_note), updated_at=now(), updated_by=$3
       where id=$4`,
      [status, note, actor, id],
    );
  }

  async lock(client: PoolClient, id: string): Promise<VehicleRow> {
    const result = await client.query<VehicleRow>(
      `select id, status, version_no from branch.vehicle where id=$1 and deleted_at is null for update`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("NOT_FOUND", "Vehicle was not found", 404);
    return row;
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.vehicle_version (vehicle_id, version_no, snapshot, recorded_by)
       select v.id, v.version_no, jsonb_build_object(
         'vehicle', to_jsonb(v),
         'compartments', coalesce((
           select jsonb_agg(to_jsonb(c) order by c.seq)
           from branch.vehicle_compartment c where c.vehicle_id = v.id
         ), '[]'::jsonb)
       ), $2
       from branch.vehicle v where v.id=$1`,
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
      `insert into branch.vehicle_audit (vehicle_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.vehicle_version where vehicle_id=$1 order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.vehicle_audit where vehicle_id=$1 order by created_at`,
      [id],
    );
    return result.rows;
  }

  async lookups() {
    const result = await this.pool.query(
      `select id, code, plate as name
       from branch.vehicle
       where deleted_at is null and status = 'PUBLISHED'
       order by code`,
    );
    return result.rows;
  }

  async exportRows() {
    const result = await this.pool.query(
      `select ${SELECT_LIST},
              coalesce((
                select jsonb_agg(jsonb_build_object('seq', c.seq, 'materialId', c.material_id, 'volume', c.volume) order by c.seq)
                from branch.vehicle_compartment c where c.vehicle_id = v.id
              ), '[]'::jsonb) as compartments
       ${FROM_JOINS}
       where v.deleted_at is null and v.status in ('DRAFT', 'PUBLISHED')
       order by v.code`,
    );
    return result.rows;
  }
}

function insertValues(input: VehicleInput, actor: string) {
  return [
    input.code,
    input.plate,
    input.vin,
    input.make,
    input.model,
    input.modelYear,
    input.vehicleClass,
    input.shippingPointId,
    input.divisionId,
    input.costCentreId,
    input.capacity,
    input.capacityUomId,
    input.gvwKg,
    input.tareKg,
    input.heightM,
    input.lengthM,
    input.hazmatClass,
    input.axleConfig,
    input.ptlMinPct,
    input.gpsDeviceId,
    input.insuranceExpiry,
    input.fitnessExpiry,
    input.permitExpiry,
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
  if (pg.code === "23505") {
    if (pg.constraint === "vehicle_plate_udx") {
      return new MdmError("CONFLICT", "plate already exists", 409, "plate");
    }
    return new MdmError("CONFLICT", "Vehicle code, plate, or externalId already exists", 409);
  }
  if (pg.code === "23503") {
    return new MdmError("PARENT_NOT_FOUND", "Shipping Point, Division, UOM, or Material was not found", 400);
  }
  if (pg.code === "23514") return new MdmError("VALIDATION", "Vehicle failed a database check", 400);
  return error;
}
