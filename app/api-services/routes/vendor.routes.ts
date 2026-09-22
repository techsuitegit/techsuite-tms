import type { VendorController } from "../controllers/vendor.controller";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import { exact, one, type Route } from "../../../server/http/router";

export class VendorRoutes {
  constructor(private readonly controller: VendorController) {}

  register(): Route[] {
    return [
      {
        method: "GET",
        match: exact("/api/v1/mdm/lookups/vendors"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.lookups(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "POST",
        match: exact("/api/v1/mdm/vendors/sap-upsert"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res) => {
          await this.controller.sapUpsert(req as AuthedRequest, res);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/mdm/vendors"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.list(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "POST",
        match: exact("/api/v1/mdm/vendors"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res) => {
          this.controller.forbiddenWrite(req as AuthedRequest, res);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/mdm/vendors/:id/versions"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.versions(req as AuthedRequest, res, params);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/mdm/vendors/:id/audit"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.auditLog(req as AuthedRequest, res, params);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/mdm/vendors/:id"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.getById(req as AuthedRequest, res, params);
        },
      },
      {
        method: "PATCH",
        match: one("/api/v1/mdm/vendors/:id"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res) => {
          this.controller.forbiddenWrite(req as AuthedRequest, res);
        },
      },
    ];
  }
}
