import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { MaterialInput } from "../services/material-types";

const SELECT_LIST = `
  m.id, m.code, m.name, m.industry_desc as "industryDesc", m.basic_material as "basicMaterial",
  m.material_group as "materialGroup", m.item_category_group as "itemCategoryGroup",
  m.auth_group as "authGroup", m.cross_plant as "crossPlant", m.long_text as "longText",
  m.dg_profile as "dgProfile", m.dg_pack_status as "dgPackStatus", m.packaging_code as "packagingCode",
  m.env_relevant as "envRelevant", m.in_bulk_liquid as "inBulkLiquid", m.highly_viscous as "highlyViscous",
  m.un_number as "unNumber",
  m.base_uom_id as "baseUomId", bu.code as "baseUomCode", bu.name as "baseUomName",
  m.alt_uom_id as "altUomId", au.code as "altUomCode", au.name as "altUomName",
  m.alt_factor::float8 as "altFactor",
  m.gross_weight::float8 as "grossWeight", m.weight_uom_id as "weightUomId",
  wu.code as "weightUomCode", wu.name as "weightUomName",
  m.net_weight::float8 as "netWeight",
  m.volume::float8 as volume, m.volume_uom_id as "volumeUomId",
  vu.code as "volumeUomCode", vu.name as "volumeUomName",
  m.dimensions, m.ean, m.ean_category as "eanCategory",
  m.valid_from::text as "validFrom", m.valid_to::text as "validTo",
  m.reason, m.change_note as "changeNote",
  m.status, m.version_no as "versionNo", m.external_id as "externalId",
  m.created_at as "createdAt", m.updated_at as "updatedAt"
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "m.code",
  name: "m.name",
  status: "m.status",
  validFrom: "m.valid_from",
  updatedAt: "m.updated_at",
};

export type MaterialRow = {
  id: string;
  status: string;
  version_no: number;
  code: string;
  base_uom_id: string;
  dg_profile: string | null;
  un_number: string | null;
  alt_uom_id: string | null;
  alt_factor: string | null;
  weight_uom_id: string | null;
  volume_uom_id: string | null;
  external_id: string | null;
};

export type MaterialListQuery = {
  q: string;
  status: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class MaterialRepository {
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

  async list(query: MaterialListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["m.deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(m.code ilike $${values.length} or m.name ilike $${values.length})`);
    }
    if (query.status) {
      values.push(query.status);
      where.push(`m.status = $${values.length}`);
    }

    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.material m where ${where.join(" and ")}`,
      values,
    );
    values.push(query.pageSize, offset);
    const result = await this.pool.query(
      `select ${SELECT_LIST}
       from branch.material m
       join branch.uom bu on bu.id = m.base_uom_id
       left join branch.uom au on au.id = m.alt_uom_id
       left join branch.uom wu on wu.id = m.weight_uom_id
       left join branch.uom vu on vu.id = m.volume_uom_id
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
       from branch.material m
       join branch.uom bu on bu.id = m.base_uom_id
       left join branch.uom au on au.id = m.alt_uom_id
       left join branch.uom wu on wu.id = m.weight_uom_id
       left join branch.uom vu on vu.id = m.volume_uom_id
       where m.id=$1 and m.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async lock(client: PoolClient, id: string): Promise<MaterialRow> {
    const result = await client.query<MaterialRow>(
      `select id, status, version_no, code, base_uom_id, dg_profile, un_number,
              alt_uom_id, alt_factor::text, weight_uom_id, volume_uom_id, external_id
       from branch.material
       where id=$1 and deleted_at is null
       for update`,
      [id],
    );
    if (!result.rows[0]) throw new MdmError("NOT_FOUND", "Material was not found", 404);
    return result.rows[0];
  }

  async findByExternalId(client: PoolClient, externalId: string) {
    const result = await client.query<MaterialRow>(
      `select id, status, version_no, code, base_uom_id, dg_profile, un_number,
              alt_uom_id, alt_factor::text, weight_uom_id, volume_uom_id, external_id
       from branch.material
       where external_id=$1 and deleted_at is null
       for update`,
      [externalId],
    );
    return result.rows[0] ?? null;
  }

  async insert(client: PoolClient, input: MaterialInput, actor: string, status: "DRAFT" | "PUBLISHED") {
    const inserted = await client.query(
      `insert into branch.material (
         code, name, industry_desc, basic_material, material_group, item_category_group,
         auth_group, cross_plant, long_text, dg_profile, dg_pack_status, packaging_code,
         env_relevant, in_bulk_liquid, highly_viscous, un_number,
         base_uom_id, alt_uom_id, alt_factor, gross_weight, weight_uom_id,
         net_weight, volume, volume_uom_id, dimensions, ean, ean_category,
         valid_from, valid_to, reason, change_note, status, version_no, external_id,
         created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
         $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,1,$33,$34,$34
       )
       returning id, status, version_no as "versionNo", external_id as "externalId"`,
      [...insertValues(input), status, input.externalId ?? null, actor],
    );
    return inserted.rows[0] as { id: string; status: string; versionNo: number; externalId: string | null };
  }

  async update(client: PoolClient, id: string, input: MaterialInput, actor: string, status: string) {
    const values = insertValues(input);
    await client.query(
      `update branch.material set
         code=$1, name=$2, industry_desc=$3, basic_material=$4, material_group=$5,
         item_category_group=$6, auth_group=$7, cross_plant=$8, long_text=$9,
         dg_profile=$10, dg_pack_status=$11, packaging_code=$12,
         env_relevant=$13, in_bulk_liquid=$14, highly_viscous=$15, un_number=$16,
         base_uom_id=$17, alt_uom_id=$18, alt_factor=$19, gross_weight=$20, weight_uom_id=$21,
         net_weight=$22, volume=$23, volume_uom_id=$24, dimensions=$25, ean=$26, ean_category=$27,
         valid_from=$28, valid_to=$29, reason=$30, change_note=$31, external_id=$32,
         status=$33, version_no=version_no+1, updated_at=now(), updated_by=$34
       where id=$35 and deleted_at is null`,
      [...values, input.externalId ?? null, status, actor, id],
    );
  }

  async setStatus(client: PoolClient, id: string, status: string, note: string | null, actor: string) {
    await client.query(
      `update branch.material
       set status=$1, version_no=version_no+1, change_note=$2, updated_at=now(), updated_by=$3
       where id=$4`,
      [status, note, actor, id],
    );
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.material_version (material_id, version_no, snapshot, recorded_by)
       select id, version_no, to_jsonb(m), $2
       from branch.material m
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
      `insert into branch.material_audit (material_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.material_version
       where material_id = $1
       order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.material_audit
       where material_id = $1
       order by created_at`,
      [id],
    );
    return result.rows;
  }

  async lookups() {
    const result = await this.pool.query(
      `select id, code, name
       from branch.material
       where deleted_at is null and status = 'PUBLISHED'
       order by code`,
    );
    return result.rows;
  }
}

function insertValues(input: MaterialInput) {
  return [
    input.code,
    input.name,
    input.industryDesc ?? null,
    input.basicMaterial ?? null,
    input.materialGroup ?? null,
    input.itemCategoryGroup ?? null,
    input.authGroup ?? null,
    input.crossPlant ?? null,
    input.longText ?? null,
    input.dgProfile ?? null,
    input.dgPackStatus ?? null,
    input.packagingCode ?? null,
    input.envRelevant ?? null,
    input.inBulkLiquid ?? null,
    input.highlyViscous ?? null,
    input.unNumber ?? null,
    input.baseUomId,
    input.altUomId ?? null,
    input.altFactor ?? null,
    input.grossWeight ?? null,
    input.weightUomId ?? null,
    input.netWeight ?? null,
    input.volume ?? null,
    input.volumeUomId ?? null,
    input.dimensions ?? null,
    input.ean ?? null,
    input.eanCategory ?? null,
    input.validFrom,
    input.validTo ?? null,
    input.reason,
    input.changeNote ?? null,
  ];
}

export function mapDbError(error: unknown): MdmError | unknown {
  if (error instanceof MdmError) return error;
  const pg = error as { code?: string };
  if (pg.code === "23505") return new MdmError("CONFLICT", "Material code or externalId already exists", 409);
  if (pg.code === "23503") return new MdmError("PARENT_NOT_FOUND", "UOM was not found", 400, "baseUomId");
  if (pg.code === "23514") return new MdmError("VALIDATION", "Material failed a database check", 400);
  return error;
}
