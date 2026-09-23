import { MdmError } from "../errors/mdm-error";
import type { GeoRepository, PincodeInsert } from "../repositories/geo.repository";
import { parseCountryBody, parsePincodeBody, parseStateBody, requireCode } from "./geo-validation";

export class GeoService {
  constructor(private readonly repo: GeoRepository) {}

  async listCountries() {
    return this.repo.listCountries();
  }

  async listStates(countryId: string | null) {
    const id = requireCode(countryId, "countryId").toUpperCase();
    const country = await this.repo.findCountry(id);
    if (!country) throw new MdmError("PARENT_NOT_FOUND", "Country was not found", 400, "countryId");
    return this.repo.listStates(id);
  }

  async listCities(countryId: string | null, stateCode: string | null) {
    const id = requireCode(countryId, "countryId").toUpperCase();
    const state = requireCode(stateCode, "stateCode");
    const row = await this.repo.findState(id, state);
    if (!row) throw new MdmError("PARENT_NOT_FOUND", "State was not found", 400, "stateCode");
    return this.repo.listCities(id, state);
  }

  async listPincodes(countryId: string | null, stateCode: string | null, cityCode: string | null) {
    const id = requireCode(countryId, "countryId").toUpperCase();
    const state = requireCode(stateCode, "stateCode");
    const row = await this.repo.findState(id, state);
    if (!row) throw new MdmError("PARENT_NOT_FOUND", "State was not found", 400, "stateCode");
    const city = cityCode?.trim() || null;
    if (city) {
      const found = await this.repo.findCity(id, state, city);
      if (!found) throw new MdmError("PARENT_NOT_FOUND", "City was not found", 400, "cityCode");
    }
    return this.repo.listPincodes(id, state, city);
  }

  async createCountry(body: Record<string, unknown>, actor: string) {
    const input = parseCountryBody(body);
    return this.repo.insertCountry(input, actor);
  }

  async createState(body: Record<string, unknown>, actor: string) {
    const input = parseStateBody(body);
    await this.assertCountry(input.countryId);
    return this.repo.insertState(input, actor);
  }

  async createPincode(body: Record<string, unknown>, actor: string) {
    const input = parsePincodeBody(body);
    await this.assertCity(input);
    return this.repo.insertPincode(input, actor);
  }

  private async assertCountry(countryId: string) {
    const country = await this.repo.findCountry(countryId);
    if (!country) throw new MdmError("PARENT_NOT_FOUND", "Country was not found", 400, "countryId");
  }

  private async assertCity(input: PincodeInsert) {
    const city = await this.repo.findCity(input.countryId, input.stateCode, input.cityCode);
    if (!city) throw new MdmError("PARENT_NOT_FOUND", "City was not found", 400, "cityCode");
  }
}
