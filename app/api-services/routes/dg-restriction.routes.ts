import type { DgRestrictionController } from "../controllers/dg-restriction.controller";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import { exact, one, type Route } from "../../../server/http/router";

export class DgRestrictionRoutes {
  constructor(private readonly controller: DgRestrictionController) {}

  register(): Route[] {
    return [
      {
        method: "GET",
        match: exact("/api/v1/mdm/lookups/dg-restriction-zones"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.lookups(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/mdm/dg-restriction-zones/feed"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.feed(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/mdm/dg-restriction-zones/export"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res) => {
          await this.controller.exportGeoJson(req as AuthedRequest, res);
        },
      },
      {
        method: "POST",
        match: exact("/api/v1/mdm/dg-restriction-zones/import"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res) => {
          await this.controller.importRows(req as AuthedRequest, res);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/mdm/dg-restriction-zones"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.list(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "POST",
        match: exact("/api/v1/mdm/dg-restriction-zones"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res) => {
          await this.controller.create(req as AuthedRequest, res);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/mdm/dg-restriction-zones/:id/versions"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.versions(req as AuthedRequest, res, params);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/mdm/dg-restriction-zones/:id/audit"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.auditLog(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/mdm/dg-restriction-zones/:id/submit"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res, params) => {
          await this.controller.submit(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/mdm/dg-restriction-zones/:id/approve"),
        auth: true,
        permission: "mdm.master.approve",
        handle: async (req, res, params) => {
          await this.controller.approve(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/mdm/dg-restriction-zones/:id/reject"),
        auth: true,
        permission: "mdm.master.approve",
        handle: async (req, res, params) => {
          await this.controller.reject(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/mdm/dg-restriction-zones/:id/archive"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res, params) => {
          await this.controller.archive(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/mdm/dg-restriction-zones/:id/remove"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res, params) => {
          await this.controller.remove(req as AuthedRequest, res, params);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/mdm/dg-restriction-zones/:id"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.getById(req as AuthedRequest, res, params);
        },
      },
      {
        method: "PATCH",
        match: one("/api/v1/mdm/dg-restriction-zones/:id"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res, params) => {
          await this.controller.update(req as AuthedRequest, res, params);
        },
      },
    ];
  }
}
