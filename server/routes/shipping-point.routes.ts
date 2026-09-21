import type { ShippingPointController } from "../controllers/shipping-point.controller";
import { exact, one, type Route } from "../http/router";
import type { AuthedRequest } from "../middleware/jwt.middleware";

export function createShippingPointRoutes(controller: ShippingPointController): Route[] {
  return [
    {
      method: "GET",
      match: exact("/api/v1/mdm/lookups/shipping-points"),
      auth: true,
      permission: "mdm.master.read",
      handle: async (req, res) => {
        await controller.lookups(req as AuthedRequest, res);
      },
    },
    {
      method: "GET",
      match: exact("/api/v1/mdm/shipping-points/export"),
      auth: true,
      permission: "mdm.master.read",
      handle: async (req, res) => {
        await controller.exportCsv(req as AuthedRequest, res);
      },
    },
    {
      method: "POST",
      match: exact("/api/v1/mdm/shipping-points/import"),
      auth: true,
      permission: "mdm.master.write",
      handle: async (req, res) => {
        await controller.importRows(req as AuthedRequest, res);
      },
    },
    {
      method: "GET",
      match: exact("/api/v1/mdm/shipping-points"),
      auth: true,
      permission: "mdm.master.read",
      handle: async (req, res, params, url) => {
        await controller.list(req as AuthedRequest, res, params, url);
      },
    },
    {
      method: "POST",
      match: exact("/api/v1/mdm/shipping-points"),
      auth: true,
      permission: "mdm.master.write",
      handle: async (req, res) => {
        await controller.create(req as AuthedRequest, res);
      },
    },
    {
      method: "GET",
      match: one("/api/v1/mdm/shipping-points/:id/versions"),
      auth: true,
      permission: "mdm.master.read",
      handle: async (req, res, params) => {
        await controller.versions(req as AuthedRequest, res, params);
      },
    },
    {
      method: "GET",
      match: one("/api/v1/mdm/shipping-points/:id/audit"),
      auth: true,
      permission: "mdm.master.read",
      handle: async (req, res, params) => {
        await controller.auditLog(req as AuthedRequest, res, params);
      },
    },
    {
      method: "POST",
      match: one("/api/v1/mdm/shipping-points/:id/submit"),
      auth: true,
      permission: "mdm.master.write",
      handle: async (req, res, params) => {
        await controller.submit(req as AuthedRequest, res, params);
      },
    },
    {
      method: "POST",
      match: one("/api/v1/mdm/shipping-points/:id/approve"),
      auth: true,
      permission: "mdm.master.approve",
      handle: async (req, res, params) => {
        await controller.approve(req as AuthedRequest, res, params);
      },
    },
    {
      method: "POST",
      match: one("/api/v1/mdm/shipping-points/:id/reject"),
      auth: true,
      permission: "mdm.master.approve",
      handle: async (req, res, params) => {
        await controller.reject(req as AuthedRequest, res, params);
      },
    },
    {
      method: "GET",
      match: one("/api/v1/mdm/shipping-points/:id"),
      auth: true,
      permission: "mdm.master.read",
      handle: async (req, res, params) => {
        await controller.getById(req as AuthedRequest, res, params);
      },
    },
    {
      method: "PATCH",
      match: one("/api/v1/mdm/shipping-points/:id"),
      auth: true,
      permission: "mdm.master.write",
      handle: async (req, res, params) => {
        await controller.update(req as AuthedRequest, res, params);
      },
    },
  ];
}
