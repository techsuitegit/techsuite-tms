import type { TelemetryDeviceController } from "../controllers/telemetry-device.controller";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import { exact, one, type Route } from "../../../server/http/router";

export class TelemetryDeviceRoutes {
  constructor(private readonly controller: TelemetryDeviceController) {}

  register(): Route[] {
    return [
      {
        method: "GET",
        match: exact("/api/v1/mdm/lookups/telemetry-devices"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res) => {
          await this.controller.lookups(req as AuthedRequest, res);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/mdm/telemetry-devices/export"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res) => {
          await this.controller.exportCsv(req as AuthedRequest, res);
        },
      },
      {
        method: "POST",
        match: exact("/api/v1/mdm/telemetry-devices/import"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res) => {
          await this.controller.importRows(req as AuthedRequest, res);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/mdm/telemetry-devices"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.list(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "POST",
        match: exact("/api/v1/mdm/telemetry-devices"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res) => {
          await this.controller.create(req as AuthedRequest, res);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/mdm/telemetry-devices/:id/versions"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.versions(req as AuthedRequest, res, params);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/mdm/telemetry-devices/:id/audit"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.auditLog(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/mdm/telemetry-devices/:id/submit"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res, params) => {
          await this.controller.submit(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/mdm/telemetry-devices/:id/approve"),
        auth: true,
        permission: "mdm.master.approve",
        handle: async (req, res, params) => {
          await this.controller.approve(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/mdm/telemetry-devices/:id/reject"),
        auth: true,
        permission: "mdm.master.approve",
        handle: async (req, res, params) => {
          await this.controller.reject(req as AuthedRequest, res, params);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/mdm/telemetry-devices/:id"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.getById(req as AuthedRequest, res, params);
        },
      },
      {
        method: "PATCH",
        match: one("/api/v1/mdm/telemetry-devices/:id"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res, params) => {
          await this.controller.update(req as AuthedRequest, res, params);
        },
      },
    ];
  }
}
