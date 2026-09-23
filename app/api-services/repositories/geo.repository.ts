import type { Pool } from "pg";

import { MdmError } from "../errors/mdm-error";

export type CountryInsert = {
  id: string;
  name: string;
  shortName: string | null;
  telephoneCode: string | null;
  seqNo: number | null;
};

export type StateInsert = {
  countryId: string;
  stateCode: string;
  stateName: string;
  stateShortName: string | null;
};

export type PincodeInsert = {
  countryId: string;
  stateCode: string;
  cityCode: string;
  pincode: string;
};

export class GeoRepository {
  constructor(private readonly pool: Pool) {}

  async listCountries() {
    const result = await this.pool.query(
      `select id, name, shortname as "shortName", telephonecode as "telephoneCode"
       from public.country
       order by seqno nulls last, name`,
    );
    return result.rows;
  }

  async listStates(countryId: string) {
    const result = await this.pool.query(
      `select countryid as "countryId", statecode as "stateCode",
              statename as "stateName", stateshortname as "stateShortName"
       from public.state
       where countryid = $1
       order by statename`,
      [countryId],
    );
    return result.rows;
  }

  async listCities(countryId: string, stateCode: string) {
    const result = await this.pool.query(
      `select countryid as "countryId", statecode as "stateCode",
              citycode as "cityCode", cityname as "cityName"
       from public.city
       where countryid = $1 and statecode = $2
       order by cityname`,
      [countryId, stateCode],
    );
    return result.rows;
  }

  async listPincodes(countryId: string, stateCode: string, cityCode: string | null) {
    const result = await this.pool.query(
      `select p.countryid as "countryId", p.statecode as "stateCode",
              p.citycode as "cityCode", ci.cityname as "cityName", p.pincode
       from public.pincode p
       left join public.city ci
         on ci.countryid = p.countryid and ci.statecode = p.statecode and ci.citycode = p.citycode
       where p.countryid = $1
         and p.statecode = $2
         and ($3::varchar is null or p.citycode = $3)
       order by p.pincode`,
      [countryId, stateCode, cityCode],
    );
    return result.rows;
  }

  async findCountry(id: string) {
    const result = await this.pool.query<{ id: string }>(
      `select id from public.country where id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findState(countryId: string, stateCode: string) {
    const result = await this.pool.query<{ countryid: string; statecode: string }>(
      `select countryid, statecode from public.state where countryid = $1 and statecode = $2`,
      [countryId, stateCode],
    );
    return result.rows[0] ?? null;
  }

  async findCity(countryId: string, stateCode: string, cityCode: string) {
    const result = await this.pool.query<{ citycode: string }>(
      `select citycode from public.city
       where countryid = $1 and statecode = $2 and citycode = $3`,
      [countryId, stateCode, cityCode],
    );
    return result.rows[0] ?? null;
  }

  async findPincode(countryId: string, stateCode: string, cityCode: string, pincode: string) {
    const result = await this.pool.query<{ pincode: string }>(
      `select pincode from public.pincode
       where countryid = $1 and statecode = $2 and citycode = $3 and pincode = $4`,
      [countryId, stateCode, cityCode, pincode],
    );
    return result.rows[0] ?? null;
  }

  async insertCountry(input: CountryInsert, actor: string) {
    try {
      const result = await this.pool.query(
        `insert into public.country (id, name, shortname, telephonecode, seqno, lastupdateby, lastupdatedate)
         values ($1, $2, $3, $4, $5, $6, now())
         returning id, name, shortname as "shortName", telephonecode as "telephoneCode", seqno as "seqNo"`,
        [input.id, input.name, input.shortName, input.telephoneCode, input.seqNo, actor],
      );
      return result.rows[0];
    } catch (error) {
      throw mapDbError(error);
    }
  }

  async insertState(input: StateInsert, actor: string) {
    try {
      const result = await this.pool.query(
        `insert into public.state (countryid, statecode, statename, stateshortname, lastupdateby, lastupdatedate)
         values ($1, $2, $3, $4, $5, now())
         returning countryid as "countryId", statecode as "stateCode",
                   statename as "stateName", stateshortname as "stateShortName"`,
        [input.countryId, input.stateCode, input.stateName, input.stateShortName, actor],
      );
      return result.rows[0];
    } catch (error) {
      throw mapDbError(error);
    }
  }

  async insertPincode(input: PincodeInsert, actor: string) {
    try {
      const result = await this.pool.query(
        `insert into public.pincode (countryid, statecode, citycode, pincode, lastupdateby, lastupdatedate)
         values ($1, $2, $3, $4, $5, now())
         returning countryid as "countryId", statecode as "stateCode",
                   citycode as "cityCode", pincode`,
        [input.countryId, input.stateCode, input.cityCode, input.pincode, actor],
      );
      return result.rows[0];
    } catch (error) {
      throw mapDbError(error);
    }
  }
}

function mapDbError(error: unknown) {
  const pg = error as { code?: string };
  if (pg.code === "23505") return new MdmError("CONFLICT", "Record already exists", 409);
  if (pg.code === "23503") return new MdmError("PARENT_NOT_FOUND", "Country, state, or city was not found", 400);
  return error instanceof Error ? error : new Error(String(error));
}
