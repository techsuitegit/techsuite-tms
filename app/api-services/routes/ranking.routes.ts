import type { RankingController } from "../controllers/ranking.controller";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import { exact, one, type Route } from "../../../server/http/router";

export class RankingRoutes {
  constructor(private readonly controller: RankingController) {}

  register(): Route[] {
    return [
      {
        method: "GET",
        match: exact("/api/v1/ops/ranking/queue"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.queue(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "POST",
        match: exact("/api/v1/ops/ranking/runs"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res) => {
          await this.controller.run(req as AuthedRequest, res);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/ops/ranking/runs"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.listRuns(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/ops/ranking/runs/:id"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.getRun(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/ops/ranking/runs/:id/reorder"),
        auth: true,
        permission: "mdm.master.write",
        handle: async (req, res, params) => {
          await this.controller.reorder(req as AuthedRequest, res, params);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/ops/ranking/orders/:id/scores"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.orderScores(req as AuthedRequest, res, params);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/ops/ranking/pool"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.pool(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/ops/ranking/weight-sets"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params, url) => {
          await this.controller.weightSets(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/ops/ranking/weight-sets/:id"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.weightSet(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/ops/ranking/weight-sets/:id/simulate"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res, params) => {
          await this.controller.simulate(req as AuthedRequest, res, params);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/ops/ranking/customer-classes"),
        auth: true,
        permission: "mdm.master.read",
        handle: async (req, res) => {
          await this.controller.customerClasses(req as AuthedRequest, res);
        },
      },
    ];
  }
}
