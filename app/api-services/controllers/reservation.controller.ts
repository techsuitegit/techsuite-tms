import type { ServerResponse } from "node:http";

import type { JwtPayload } from "jsonwebtoken";

import { MdmError } from "../errors/mdm-error";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import type { ReserveTripInput } from "../services/reservation-types";
import type { ReservationService } from "../services/reservation.service";
import { readJsonBody, sendJson, sendText } from "../../../server/http/io";

export class ReservationController {
  constructor(private readonly service: ReservationService) {}

  async reserve(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const result = await this.service.reserveForTrip(req.actor, idempotencyKey(req), parseReserve(requireId(params.id), body));
    sendJson(res, result.httpStatus, { reservations: result.reservations, outcomes: result.outcomes });
  }

  async list(req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    void req;
    sendJson(res, 200, await this.service.list(url.searchParams));
  }

  async get(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.service.get(requireId(params.id)));
  }

  async events(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.service.events(requireId(params.id)));
  }

  async amendQuantity(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    sendJson(
      res,
      200,
      await this.service.amendQuantity(requireId(params.id), req.actor, idempotencyKey(req), {
        reservedQty: numberField(body.reservedQty, "reservedQty"),
        reservedQtyUom: textField(body.reservedQtyUom, "reservedQtyUom"),
        reason: textField(body.reason, "reason"),
        versionNo: intField(body.versionNo, "versionNo"),
      }),
    );
  }

  async reassign(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const result = await this.service.reassign(
      requireId(params.id),
      req.actor,
      idempotencyKey(req),
      {
        toTerminalId: textField(body.toTerminalId, "toTerminalId"),
        reasonCode: textField(body.reasonCode, "reasonCode"),
        grounds: textField(body.grounds, "grounds"),
        reference: textField(body.reference, "reference"),
        versionNo: intField(body.versionNo, "versionNo"),
      },
      approver(req.claims),
    );
    sendJson(res, result.httpStatus, result.message ? { ...result.reservation, message: result.message } : result.reservation);
  }

  async countersign(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    sendJson(
      res,
      200,
      await this.service.countersign(
        requireId(params.id),
        req.actor,
        idempotencyKey(req),
        intField(body.versionNo, "versionNo"),
        approver(req.claims),
      ),
    );
  }

  async release(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    sendJson(res, 200, await this.service.release(requireId(params.id), req.actor, idempotencyKey(req), parseRelease(body)));
  }

  async releaseTrip(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    sendJson(res, 200, await this.service.releaseTrip(requireId(params.id), req.actor, idempotencyKey(req), {
      reasonCode: textField(body.reasonCode, "reasonCode"),
      grounds: textField(body.grounds, "grounds"),
      reference: textField(body.reference, "reference"),
    }));
  }

  async acceptShort(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    sendJson(res, 200, await this.service.acceptShort(requireId(params.id), req.actor, idempotencyKey(req), parseRelease(body)));
  }

  async extendExpiry(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    sendJson(res, 200, await this.service.extendExpiry(requireId(params.id), req.actor, idempotencyKey(req), {
      ...parseRelease(body),
      newExpiresAt: textField(body.newExpiresAt, "newExpiresAt"),
    }));
  }

  async consume(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    sendJson(res, 200, await this.service.consume(requireId(params.id), req.actor, idempotencyKey(req), {
      loadId: textField(body.loadId, "loadId"),
      consumedQty: numberField(body.consumedQty, "consumedQty"),
      consumedQtyUom: textField(body.consumedQtyUom, "consumedQtyUom"),
    }));
  }

  async positions(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.service.positions(url.searchParams));
  }

  async declare(req: AuthedRequest, res: ServerResponse) {
    const body = await readJsonBody(req);
    if ("revisionNo" in body) {
      throw new MdmError("VALIDATION", "revisionNo is assigned by the server", 400, "revisionNo");
    }
    sendJson(res, 200, await this.service.declare(req.actor, idempotencyKey(req), {
      terminalId: textField(body.terminalId, "terminalId"),
      materialId: textField(body.materialId, "materialId"),
      availabilityDate: dateField(body.availabilityDate, "availabilityDate"),
      declaredQty: numberField(body.declaredQty, "declaredQty"),
      declaredQtyUom: textField(body.declaredQtyUom, "declaredQtyUom"),
      note: typeof body.note === "string" ? body.note : null,
    }));
  }

  async declarations(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.service.declarationHistory(url.searchParams));
  }

  async policy(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.service.policy(url.searchParams));
  }

  async reasonCodes(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.service.reasonCodes(url.searchParams));
  }

  async exportCsv(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendText(res, 200, await this.service.exportCsv(url.searchParams), "text/csv; charset=utf-8");
  }

  async routeStatus(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    sendJson(res, 200, await this.service.setRouteStatus(requireId(params.id), textField(body.routeStatus, "routeStatus")));
  }

  async sweep(_req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 200, await this.service.sweep());
  }

  async rebuild(_req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 200, await this.service.rebuild());
  }
}

function parseReserve(tripId: string, body: Record<string, unknown>): ReserveTripInput {
  const ordersRaw = body.orders;
  if (!Array.isArray(ordersRaw) || ordersRaw.length === 0) {
    throw new MdmError("VALIDATION", "orders must list the confirmed trip's orders", 400, "orders");
  }
  const tripNo = intField(body.tripNo, "tripNo");
  if (tripNo !== 1 && tripNo !== 2) throw new MdmError("VALIDATION", "tripNo must be 1 or 2", 400, "tripNo");
  return {
    tripId,
    routeId: textField(body.routeId, "routeId"),
    routeStatus: textField(body.routeStatus, "routeStatus").toUpperCase(),
    planId: textField(body.planId, "planId"),
    planKind: textField(body.planKind, "planKind").toUpperCase(),
    tripNo,
    plannedDeparture: textField(body.plannedDeparture, "plannedDeparture"),
    reserveDate: dateField(body.reserveDate, "reserveDate"),
    vehicleId: optionalText(body.vehicleId),
    homeTerminalId: optionalText(body.homeTerminalId),
    divisionId: optionalText(body.divisionId),
    orders: ordersRaw.map((line, index) => {
      if (!line || typeof line !== "object" || Array.isArray(line)) {
        throw new MdmError("VALIDATION", "Each order line must be an object", 400, "orders");
      }
      const row = line as Record<string, unknown>;
      return {
        orderId: textField(row.orderId, `orders[${index}].orderId`),
        routeStopId: optionalText(row.routeStopId),
        shipToLatitude: optionalNumber(row.shipToLatitude),
        shipToLongitude: optionalNumber(row.shipToLongitude),
      };
    }),
  };
}

function parseRelease(body: Record<string, unknown>) {
  return {
    reasonCode: textField(body.reasonCode, "reasonCode"),
    grounds: textField(body.grounds, "grounds"),
    reference: textField(body.reference, "reference"),
    versionNo: intField(body.versionNo, "versionNo"),
  };
}

function requireId(id: string | undefined) {
  if (!id || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new MdmError("NOT_FOUND", "Resource was not found", 404);
  return id;
}

function textField(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new MdmError("VALIDATION", `${field} is required`, 400, field);
  return value.trim();
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(value: unknown, field: string) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new MdmError("VALIDATION", `${field} must be a number`, 400, field);
  return parsed;
}

function optionalNumber(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function intField(value: unknown, field: string) {
  const parsed = numberField(value, field);
  if (!Number.isInteger(parsed)) throw new MdmError("VALIDATION", `${field} must be an integer`, 400, field);
  return parsed;
}

function dateField(value: unknown, field: string) {
  const text = textField(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new MdmError("VALIDATION", `${field} must be YYYY-MM-DD`, 400, field);
  return text;
}

function idempotencyKey(req: AuthedRequest) {
  const raw = req.headers["idempotency-key"];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
}

function approver(claims: JwtPayload) {
  const raw = claims.permissions ?? claims.permission ?? claims.roles ?? claims.role;
  const listed = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
  if (listed.length === 0) return true;
  return listed.includes("override.approve") || listed.includes("mdm.master.approve") || listed.includes("*");
}
