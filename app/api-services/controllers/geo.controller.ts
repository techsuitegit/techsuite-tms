import type { ServerResponse } from "node:http";

import type { AuthedRequest } from "../jwt/jwt.middleware";
import type { GeoService } from "../services/geo.service";
import { readJsonBody, sendJson } from "../../../server/http/io";

export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  async countries(_req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 200, await this.geoService.listCountries());
  }

  async states(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.geoService.listStates(url.searchParams.get("countryId")));
  }

  async cities(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(
      res,
      200,
      await this.geoService.listCities(url.searchParams.get("countryId"), url.searchParams.get("stateCode")),
    );
  }

  async pincodes(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(
      res,
      200,
      await this.geoService.listPincodes(
        url.searchParams.get("countryId"),
        url.searchParams.get("stateCode"),
        url.searchParams.get("cityCode"),
      ),
    );
  }

  async createCountry(req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 201, await this.geoService.createCountry(await readJsonBody(req), req.actor));
  }

  async createState(req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 201, await this.geoService.createState(await readJsonBody(req), req.actor));
  }

  async createPincode(req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 201, await this.geoService.createPincode(await readJsonBody(req), req.actor));
  }
}
