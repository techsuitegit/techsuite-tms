import type { QualificationController } from "../controllers/qualification.controller";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import { exact, one, type Route } from "../../../server/http/router";

export class QualificationRoutes {
  constructor(private readonly controller: QualificationController) {}

  register(): Route[] {
    return [
      {
        method: "GET",
        match: exact("/api/v1/ops/qualification/orders"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.listOrders(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/ops/qualification/orders/:id/decisions"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.listDecisions(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/ops/qualification/orders/:id/evaluate"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res, params) => {
          await this.controller.evaluateOne(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/ops/qualification/orders/:id/decision"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res, params) => {
          await this.controller.manualDecision(req as AuthedRequest, res, params);
        },
      },
      {
        method: "PATCH",
        match: one("/api/v1/ops/qualification/orders/:id/quantity"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res, params) => {
          await this.controller.amendQuantity(req as AuthedRequest, res, params);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/ops/qualification/orders/:id"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.getOrder(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: exact("/api/v1/ops/qualification/runs"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res) => {
          await this.controller.run(req as AuthedRequest, res);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/ops/qualification/runs"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.listRuns(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/ops/qualification/runs/:id"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.getRun(req as AuthedRequest, res, params);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/ops/qualification/pool"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.pool(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/ops/qualification/policy"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res) => {
          await this.controller.policy(req as AuthedRequest, res);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/ops/qualification/reason-codes"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.reasonCodes(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "PUT",
        match: one("/api/v1/ops/qualification/tank-readings/:tankId"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res, params) => {
          await this.controller.upsertReading(req as AuthedRequest, res, params);
        },
      },
    ];
  }
}
