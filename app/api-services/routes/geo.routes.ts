import type { GeoController } from "../controllers/geo.controller";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import { exact, type Route } from "../../../server/http/router";

export class GeoRoutes {
  constructor(private readonly controller: GeoController) {}

  register(): Route[] {
    return [
      {
        method: "GET",
        match: exact("/api/v1/mdm/lookups/countries"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res) => {
          await this.controller.countries(req as AuthedRequest, res);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/mdm/lookups/states"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.states(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/mdm/lookups/cities"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.cities(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/mdm/lookups/pincodes"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.pincodes(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "POST",
        match: exact("/api/v1/mdm/countries"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res) => {
          await this.controller.createCountry(req as AuthedRequest, res);
        },
      },
      {
        method: "POST",
        match: exact("/api/v1/mdm/states"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res) => {
          await this.controller.createState(req as AuthedRequest, res);
        },
      },
      {
        method: "POST",
        match: exact("/api/v1/mdm/pincodes"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res) => {
          await this.controller.createPincode(req as AuthedRequest, res);
        },
      },
    ];
  }
}
