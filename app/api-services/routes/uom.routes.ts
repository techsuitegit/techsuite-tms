import type { UomController } from "../controllers/uom.controller";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import { exact, one, type Route } from "../../../server/http/router";

export class UomRoutes {
  constructor(private readonly controller: UomController) {}

  register(): Route[] {
    return [
      {
        method: "GET",
        match: exact("/api/v1/mdm/lookups/uom"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res) => {
          await this.controller.lookups(req as AuthedRequest, res);
        },
      },
      {
        method: "POST",
        match: exact("/api/v1/mdm/uom/sap-upsert"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res) => {
          await this.controller.sapUpsert(req as AuthedRequest, res);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/mdm/uom"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.list(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "POST",
        match: exact("/api/v1/mdm/uom"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res) => {
          await this.controller.create(req as AuthedRequest, res);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/mdm/uom/:id/versions"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.versions(req as AuthedRequest, res, params);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/mdm/uom/:id/audit"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.auditLog(req as AuthedRequest, res, params);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/mdm/uom/:id"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.getById(req as AuthedRequest, res, params);
        },
      },
      {
        method: "PATCH",
        match: one("/api/v1/mdm/uom/:id"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res, params) => {
          await this.controller.update(req as AuthedRequest, res, params);
        },
      },
    ];
  }
}
