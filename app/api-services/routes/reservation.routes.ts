import type { ReservationController } from "../controllers/reservation.controller";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import { exact, one, type Route } from "../../../server/http/router";

export class ReservationRoutes {
  constructor(private readonly controller: ReservationController) {}

  register(): Route[] {
    const read = "mdm.master.read" as const;
    const write = "mdm.master.write" as const;
    return [
      {
        method: "POST",
        match: trip("/reservations"),
        auth: true,
        permission: write,
        handle: async (req, res, params) => {
          await this.controller.reserve(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: trip("/reservations/release"),
        auth: true,
        permission: write,
        handle: async (req, res, params) => {
          await this.controller.releaseTrip(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/ops/trips/:id/route-status"),
        auth: true,
        permission: write,
        handle: async (req, res, params) => {
          await this.controller.routeStatus(req as AuthedRequest, res, params);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/ops/reservations"),
        auth: true,
        permission: read,
        handle: async (req, res, params, url) => {
          await this.controller.list(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/ops/reservations/policy"),
        auth: true,
        permission: read,
        handle: async (req, res, params, url) => {
          await this.controller.policy(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/ops/reservations/reason-codes"),
        auth: true,
        permission: read,
        handle: async (req, res, params, url) => {
          await this.controller.reasonCodes(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/ops/reservations/export"),
        auth: true,
        permission: read,
        handle: async (req, res, params, url) => {
          await this.controller.exportCsv(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "POST",
        match: exact("/api/v1/ops/reservations/sweep"),
        auth: true,
        permission: write,
        handle: async (req, res) => {
          await this.controller.sweep(req as AuthedRequest, res);
        },
      },
      {
        method: "POST",
        match: exact("/api/v1/ops/terminal-stock/rebuild"),
        auth: true,
        permission: write,
        handle: async (req, res) => {
          await this.controller.rebuild(req as AuthedRequest, res);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/ops/terminal-stock"),
        auth: true,
        permission: read,
        handle: async (req, res, params, url) => {
          await this.controller.positions(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "PUT",
        match: exact("/api/v1/ops/terminal-stock/declarations"),
        auth: true,
        permission: write,
        handle: async (req, res) => {
          await this.controller.declare(req as AuthedRequest, res);
        },
      },
      {
        method: "GET",
        match: exact("/api/v1/ops/terminal-stock/declarations"),
        auth: true,
        permission: read,
        handle: async (req, res, params, url) => {
          await this.controller.declarations(req as AuthedRequest, res, params, url);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/ops/reservations/:id"),
        auth: true,
        permission: read,
        handle: async (req, res, params) => {
          await this.controller.get(req as AuthedRequest, res, params);
        },
      },
      {
        method: "GET",
        match: one("/api/v1/ops/reservations/:id/events"),
        auth: true,
        permission: read,
        handle: async (req, res, params) => {
          await this.controller.events(req as AuthedRequest, res, params);
        },
      },
      {
        method: "PATCH",
        match: one("/api/v1/ops/reservations/:id/quantity"),
        auth: true,
        permission: write,
        handle: async (req, res, params) => {
          await this.controller.amendQuantity(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/ops/reservations/:id/reassign-terminal"),
        auth: true,
        permission: write,
        handle: async (req, res, params) => {
          await this.controller.reassign(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/ops/reservations/:id/countersign"),
        auth: true,
        permission: write,
        handle: async (req, res, params) => {
          await this.controller.countersign(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/ops/reservations/:id/release"),
        auth: true,
        permission: write,
        handle: async (req, res, params) => {
          await this.controller.release(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/ops/reservations/:id/accept-short"),
        auth: true,
        permission: write,
        handle: async (req, res, params) => {
          await this.controller.acceptShort(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/ops/reservations/:id/extend-expiry"),
        auth: true,
        permission: write,
        handle: async (req, res, params) => {
          await this.controller.extendExpiry(req as AuthedRequest, res, params);
        },
      },
      {
        method: "POST",
        match: one("/api/v1/ops/reservations/:id/consume"),
        auth: true,
        permission: write,
        handle: async (req, res, params) => {
          await this.controller.consume(req as AuthedRequest, res, params);
        },
      },
    ];
  }
}

function trip(suffix: string) {
  const prefix = "/api/v1/ops/trips/";
  return (incoming: string) => {
    if (!incoming.startsWith(prefix) || !incoming.endsWith(suffix)) return null;
    const id = incoming.slice(prefix.length, incoming.length - suffix.length);
    if (!id || id.includes("/")) return null;
    return { id };
  };
}
