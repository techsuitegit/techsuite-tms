import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { HaulierInput } from "../services/haulier-types";

const SELECT_LIST = `
  h.id, h.code, h.name, h.registration,
  h.dispatch_contact as "dispatchContact", h.dispatch_phone as "dispatchPhone", h.email,
  h.vehicle_types as "vehicleTypes", h.units_available as "unitsAvailable", h.zone_ids as "zoneIds",
  h.hazmat_certified as "hazmatCertified", h.rate_basis as "rateBasis", h.rate::float8 as rate,
  h.min_charge::float8 as "minCharge", h.demurrage::float8 as demurrage,
  h.fuel_surcharge::float8 as "fuelSurcharge", h.surcharge_unit as "surchargeUnit",
  h.contract_start::text as "contractStart", h.contract_end::text as "contractEnd",
  h.insurance_expiry::text as "insuranceExpiry", h.payment_terms_text as "paymentTermsText",
  h.rating::float8 as rating, h.on_time_pct::float8 as "onTimePct", h.accuracy_pct::float8 as "accuracyPct",
  h.trips_ytd as "tripsYtd", h.volume_ytd::float8 as "volumeYtd", h.notes,
  h.valid_from::text as "validFrom", h.valid_to::text as "validTo",
  h.reason, h.change_note as "changeNote", h.status, h.version_no as "versionNo",
  h.external_id as "externalId", h.created_at as "createdAt", h.updated_at as "updatedAt"
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "h.code",
  name: "h.name",
  status: "h.status",
  validFrom: "h.valid_from",
  contractEnd: "h.contract_end",
  updatedAt: "h.updated_at",
};

export type HaulierRow = {
  id: string;
  status: string;
  version_no: number;
  rate: number;
};

export type HaulierListQuery = {
  q: string;
  status: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class HaulierRepository {
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

  async list(query: HaulierListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["h.deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(h.code ilike $${values.length} or h.name ilike $${values.length})`);
    }
    if (query.status) {
      values.push(query.status);
      where.push(`h.status = $${values.length}`);
    }
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.haulier h where ${where.join(" and ")}`,
      values,
    );
    values.push(query.pageSize, offset);
    const result = await this.pool.query(
      `select ${SELECT_LIST} from branch.haulier h
       where ${where.join(" and ")}
       order by ${sortCol} asc
       limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return { rows: result.rows, total: Number(count.rows[0]?.total ?? 0) };
  }

  async findById(id: string) {
    const result = await this.pool.query(
      `select ${SELECT_LIST} from branch.haulier h where h.id=$1 and h.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async insert(client: PoolClient, input: HaulierInput, actor: string, id: string) {
    const inserted = await client.query(
      `insert into branch.haulier (
         id, code, name, registration, dispatch_contact, dispatch_phone, email,
         vehicle_types, units_available, zone_ids, hazmat_certified,
         rate_basis, rate, min_charge, demurrage, fuel_surcharge, surcharge_unit,
         contract_start, contract_end, insurance_expiry, payment_terms_text,
         rating, on_time_pct, accuracy_pct, trips_ytd, volume_ytd, notes,
         valid_from, valid_to, reason, change_note, status, version_no, external_id,
         created_by, updated_by
       ) values (
         $1,
         $2,$3,$4,$5,$6,$7,
         $8::text[],$9,$10::text[],$11,
         $12,$13,$14,$15,$16,$17,
         $18,$19,$20,$21,
         $22,$23,$24,$25,$26,$27,
         $28,$29,$30,$31,'DRAFT',1,$32,
         $33,$33
       )
       returning id, status, version_no as "versionNo"`,
      [id, ...insertValues(input, actor)],
    );
    return inserted.rows[0] as { id: string; status: string; versionNo: number };
  }

  async update(client: PoolClient, id: string, input: HaulierInput, actor: string, status: string) {
    const values = insertValues(input, actor);
    await client.query(
      `update branch.haulier set
         code=$1, name=$2, registration=$3, dispatch_contact=$4, dispatch_phone=$5, email=$6,
         vehicle_types=$7::text[], units_available=$8, zone_ids=$9::text[], hazmat_certified=$10,
         rate_basis=$11, rate=$12, min_charge=$13, demurrage=$14, fuel_surcharge=$15, surcharge_unit=$16,
         contract_start=$17, contract_end=$18, insurance_expiry=$19, payment_terms_text=$20,
         rating=$21, on_time_pct=$22, accuracy_pct=$23, trips_ytd=$24, volume_ytd=$25, notes=$26,
         valid_from=$27, valid_to=$28, reason=$29, change_note=$30, external_id=$31,
         status=$33, version_no=version_no+1, updated_at=now(), updated_by=$32
       where id=$34 and deleted_at is null`,
      [...values, status, id],
    );
  }

  async setStatus(client: PoolClient, id: string, status: string, note: string | null, actor: string) {
    await client.query(
      `update branch.haulier
       set status=$1, version_no=version_no+1, change_note=coalesce($2, change_note), updated_at=now(), updated_by=$3
       where id=$4`,
      [status, note, actor, id],
    );
  }

  async lock(client: PoolClient, id: string): Promise<HaulierRow> {
    const result = await client.query<HaulierRow>(
      `select id, status, version_no, rate::float8 as rate
       from branch.haulier where id=$1 and deleted_at is null for update`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("NOT_FOUND", "Haulier was not found", 404);
    return row;
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.haulier_version (haulier_id, version_no, snapshot, recorded_by)
       select id, version_no, to_jsonb(h), $2 from branch.haulier h where id=$1`,
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
      `insert into branch.haulier_audit (haulier_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.haulier_version where haulier_id=$1 order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.haulier_audit where haulier_id=$1 order by created_at`,
      [id],
    );
    return result.rows;
  }

  async lookups() {
    const result = await this.pool.query(
      `select id, code, name
       from branch.haulier
       where deleted_at is null and status = 'PUBLISHED'
       order by code`,
    );
    return result.rows;
  }

  async exportRows() {
    const result = await this.pool.query(
      `select ${SELECT_LIST} from branch.haulier h
       where h.deleted_at is null and h.status in ('DRAFT', 'PUBLISHED')
       order by h.code`,
    );
    return result.rows;
  }
}

function insertValues(input: HaulierInput, actor: string) {
  return [
    input.code,
    input.name,
    input.registration,
    input.dispatchContact,
    input.dispatchPhone,
    input.email,
    input.vehicleTypes,
    input.unitsAvailable,
    input.zoneIds,
    input.hazmatCertified,
    input.rateBasis,
    input.rate,
    input.minCharge,
    input.demurrage,
    input.fuelSurcharge,
    input.surchargeUnit,
    input.contractStart,
    input.contractEnd,
    input.insuranceExpiry,
    input.paymentTermsText,
    input.rating,
    input.onTimePct,
    input.accuracyPct,
    input.tripsYtd,
    input.volumeYtd,
    input.notes,
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
  if (pg.code === "23505") return new MdmError("CONFLICT", "Haulier code or externalId already exists", 409);
  if (pg.code === "23514") return new MdmError("VALIDATION", "Haulier failed a database check", 400);
  return error;
}
