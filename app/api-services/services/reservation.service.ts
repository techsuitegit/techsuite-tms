import type { PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { ReservationRepository } from "../repositories/reservation.repository";
import {
  assessAvailability,
  computeExpiresAt,
  convertByFactor,
  decideSweep,
  deriveTerminal,
  derivedReasonCode,
  expiryRecipients,
  haversineKm,
  pesoLapsed,
  racksProduct,
  reservationGate,
  round3,
  terminalCloseAt,
} from "./reservation-engine";
import type { PositionRow, ReserveTripInput, TerminalRow, UomRow } from "./reservation-types";

type ReservationRow = {
  id: string;
  reservationNo: string;
  orderId: string;
  orderNo: string;
  customerName: string | null;
  customerCode: string;
  routeId: string;
  routeStopId: string | null;
  tripNo: number;
  planId: string;
  planKind: string;
  tripId: string | null;
  routeStatus: string;
  plannedDeparture: string | Date | null;
  confirmedBy: string | null;
  terminalId: string;
  terminalCode: string;
  terminalName: string;
  terminalProducts: string[];
  openingHours: string | null;
  terminalPesoValidTo: string | null;
  leadDispatcher: string | null;
  derivedTerminalId: string;
  derivedTerminalCode: string;
  derivedTerminalName: string;
  terminalSource: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  reserveDate: string;
  reservedQty: number;
  reservedQtyUom: string;
  reservedQtyUomId: string;
  requestedQty: number;
  qualifiedQty: number | null;
  commitmentOutcome: string;
  status: string;
  reasonCode: string | null;
  reasonText: string | null;
  expiresAt: Date;
  expiryWarnedAt: Date | null;
  expiryExtendedCount: number;
  releasedAt: Date | null;
  releasedBy: string | null;
  consumedAt: Date | null;
  overrideId: string | null;
  overrideBy: string | null;
  policyId: string;
  policyVersionNo: number;
  warningLeadHours: number;
  maxExpiryExtensions: number;
  releaseAtTerminalClose: boolean;
  declaredQty: number | null;
  committedQty: number | null;
  availableQty: number | null;
  versionNo: number;
};

const LIVE = new Set(["ACTIVE", "EXPIRING", "PENDING_COUNTERSIGN"]);

export class ReservationService {
  constructor(private readonly repo: ReservationRepository) {}

  async reserveForTrip(actor: string, idempotencyKey: string, input: ReserveTripInput) {
    requireKey(idempotencyKey);
    const gate = reservationGate(input.routeStatus, input.planKind);
    if (gate === "SCENARIO_PLAN") {
      throw new MdmError("SCENARIO_PLAN", "A scenario plan reserves nothing", 409);
    }
    if (gate === "ROUTE_NOT_CONFIRMED") {
      throw new MdmError("ROUTE_NOT_CONFIRMED", "Stock is reserved only when the trip is confirmed", 409);
    }
    const policy = await this.requirePolicy(input.reserveDate, input.divisionId ?? null);
    const terminals = await this.repo.listTerminals();
    const homeTerminalId =
      input.homeTerminalId ?? (input.vehicleId ? await this.repo.vehicleHome(input.vehicleId) : null);
    const departure = new Date(input.plannedDeparture);
    if (Number.isNaN(departure.getTime())) {
      throw new MdmError("VALIDATION", "plannedDeparture must be a timestamp", 400, "plannedDeparture");
    }

    return this.repo.withTransaction(async (client) => {
      await this.repo.upsertTripLink(client, {
        tripId: input.tripId,
        routeId: input.routeId,
        routeStatus: "CONFIRMED",
        planId: input.planId,
        planKind: "LIVE",
        tripNo: input.tripNo,
        plannedDeparture: departure.toISOString(),
        reserveDate: input.reserveDate,
        vehicleId: input.vehicleId ?? null,
        homeTerminalId,
        confirmedBy: actor,
      });

      const reservations = [];
      const outcomes: Array<{ orderId: string; code: string; message: string }> = [];
      for (const line of input.orders) {
        const order = await this.repo.getOrder(client, line.orderId);
        if (!order) throw new MdmError("NOT_FOUND", "Order was not found", 404, "orderId");
        if (order.isPacked) {
          outcomes.push({ orderId: order.id, code: "SKIPPED_PACKED", message: "Packed orders are not rack reservations" });
          continue;
        }
        if (order.qualOutcome !== "QUALIFIED") {
          outcomes.push({ orderId: order.id, code: "SKIPPED_NOT_QUALIFIED", message: "Order is not qualified" });
          continue;
        }
        if (order.qualifiedQty == null || !(order.qualifiedQty > 0) || !order.qualifiedQtyUomId) {
          outcomes.push({ orderId: order.id, code: "SKIPPED_NO_QUALIFIED_QTY", message: "Qualified quantity is missing" });
          continue;
        }
        const key = `${idempotencyKey}:${order.id}`;
        const existingId =
          (await this.repo.findByIdempotency(client, key)) ??
          (await this.repo.findLive(client, order.id, input.routeId));
        if (existingId) {
          const existing = await this.mustGet(client, existingId);
          reservations.push(this.toDto(existing, new Date()));
          outcomes.push({ orderId: order.id, code: existing.commitmentOutcome, message: "Reservation already exists" });
          continue;
        }

        const activeTerminals = terminals.map((terminal) => ({
          id: terminal.id,
          code: terminal.code,
          name: terminal.name,
          products: terminal.products ?? [],
          isActive: terminal.status === "PUBLISHED",
        }));
        const derivation = deriveTerminal({
          materialCode: order.materialCode,
          terminals: activeTerminals,
          distanceKm: (terminalId) => {
            const terminal = terminals.find((row) => row.id === terminalId);
            if (!terminal || line.shipToLatitude == null || line.shipToLongitude == null) return 0;
            if (terminal.latitude == null || terminal.longitude == null) return 0;
            return haversineKm(terminal.latitude, terminal.longitude, line.shipToLatitude, line.shipToLongitude);
          },
          homeTerminalId,
          homeBiasKm: policy.homeTerminalBiasKm,
        });
        const qtyUom = await this.requireUom(order.qualifiedQtyUomId);
        if (derivation.outcome === "NO_RACKABLE_TERMINAL") {
          await this.repo.insertEvent(client, {
            reservationId: null,
            seq: 1,
            eventType: "NO_RACKABLE",
            actorKind: "ENGINE",
            actorUserId: actor,
            reasonCode: null,
            reasonText: `No terminal racks ${order.materialCode}. Reservation was not created.`,
            candidates: derivation.candidates,
            qualifiedQty: order.qualifiedQty,
            vehicleId: input.vehicleId ?? null,
            uomId: qtyUom.id,
            policyId: policy.id,
            idempotencyKey: key,
          });
          outcomes.push({
            orderId: order.id,
            code: "NO_RACKABLE_TERMINAL",
            message: `No terminal racks ${order.materialCode}`,
          });
          continue;
        }

        const terminal = terminals.find((row) => row.id === derivation.terminalId);
        if (!terminal) throw new MdmError("NOT_FOUND", "Derived terminal was not found", 404);
        const reasonCode = derivedReasonCode({
          terminalId: derivation.terminalId,
          homeTerminalId,
          candidates: derivation.candidates,
        });
        const position = await this.repo.lockPosition(client, terminal.id, order.materialId, input.reserveDate, qtyUom.id);
        const positionUom = await this.requireUom(position.uomId);
        const wanted = this.convert(order.qualifiedQty, qtyUom, positionUom);
        const assessment = assessAvailability({
          declaredQty: position.declaredQty,
          committedQty: position.committedQty,
          consumedQty: position.consumedQty,
          wantedQty: wanted,
          terminalName: terminal.name,
          materialCode: order.materialCode,
          reserveDate: input.reserveDate,
          homeBiasApplied: reasonCode === "ENG_DERIVED_HOME",
        });
        if (assessment.outcome === "UNVERIFIED" && !policy.unverifiedIsReservable) {
          outcomes.push({
            orderId: order.id,
            code: "UNVERIFIED_NOT_RESERVABLE",
            message: "Policy does not allow a reservation without a declaration",
          });
          continue;
        }
        const expiresAt = computeExpiresAt(
          departure,
          policy.expiryGraceHours,
          terminalCloseAt(input.reserveDate, terminal.openingHours),
        );
        const id = await this.repo.insertReservation(client, {
          orderId: order.id,
          routeId: input.routeId,
          routeStopId: line.routeStopId ?? null,
          tripNo: input.tripNo,
          planId: input.planId,
          terminalId: terminal.id,
          derivedTerminalId: terminal.id,
          materialId: order.materialId,
          reserveDate: input.reserveDate,
          reservedQty: order.qualifiedQty,
          reservedQtyUomId: qtyUom.id,
          commitmentOutcome: assessment.outcome,
          status: "ACTIVE",
          reasonCode: assessment.reasonCode,
          reasonText: assessment.reasonText,
          expiresAt,
          policyId: policy.id,
          idempotencyKey: key,
        });
        await this.repo.insertEvent(client, {
          reservationId: id,
          seq: 1,
          eventType: "RESERVED",
          actorKind: "ENGINE",
          actorUserId: actor,
          reasonCode: assessment.reasonCode,
          reasonText: assessment.reasonText,
          candidates: derivation.candidates,
          declaredQty: position.declaredQty,
          committedQty: position.committedQty,
          qualifiedQty: order.qualifiedQty,
          vehicleId: input.vehicleId ?? null,
          uomId: positionUom.id,
          policyId: policy.id,
          idempotencyKey: key,
        });
        await this.repo.insertAudit(client, {
          reservationId: id,
          action: "RESERVATION_CREATED",
          actor,
          note: assessment.reasonText,
          payload: { outcome: assessment.outcome, terminalId: terminal.id },
        });
        await this.repo.updatePosition(client, {
          ...position,
          committedQty: round3(position.committedQty + wanted),
          reservationCount: position.reservationCount + 1,
        });
        reservations.push(this.toDto(await this.mustGet(client, id), new Date()));
        outcomes.push({ orderId: order.id, code: assessment.outcome, message: assessment.reasonText });
      }

      const httpStatus =
        reservations.length === 0 && outcomes.some((row) => row.code === "NO_RACKABLE_TERMINAL") ? 422 : 200;
      return { httpStatus, reservations, outcomes };
    });
  }

  async list(query: URLSearchParams) {
    const page = Math.max(1, Math.floor(Number(query.get("page") ?? 1) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.get("pageSize") ?? 50) || 50)));
    const status = query.getAll("status").map((value) => value.trim()).filter(Boolean);
    const listed = await this.repo.listReservations({
      q: query.get("q"),
      status,
      outcome: query.get("outcome"),
      terminalId: query.get("terminalId"),
      materialId: query.get("materialId"),
      reserveDate: query.get("reserveDate"),
      reserveDateFrom: query.get("reserveDateFrom"),
      reserveDateTo: query.get("reserveDateTo"),
      routeId: query.get("routeId"),
      orderId: query.get("orderId"),
      divisionId: query.get("divisionId"),
      expiringBefore: query.get("expiringBefore"),
      tripId: query.get("tripId"),
      page,
      pageSize,
    });
    const now = new Date();
    return {
      items: listed.rows.map((row) => this.toDto(row as ReservationRow, now)),
      total: listed.total,
      page,
      pageSize,
      counts: listed.counts,
    };
  }

  async get(id: string) {
    const row = await this.repo.getById(id);
    if (!row) throw new MdmError("NOT_FOUND", "Reservation was not found", 404);
    return this.toDto(row as ReservationRow, new Date());
  }

  async events(id: string) {
    await this.get(id);
    const rows = await this.repo.listEvents(id);
    const terminals = await this.repo.listTerminals();
    const byId = new Map(terminals.map((terminal) => [terminal.id, terminal]));
    return {
      events: rows.map((row) => {
        const record = row as Record<string, unknown>;
        const from = byId.get(String(record.fromTerminalId ?? ""));
        const to = byId.get(String(record.toTerminalId ?? ""));
        return {
          id: record.id,
          reservationId: record.reservationId,
          seq: record.seq,
          eventType: record.eventType,
          actorKind: record.actorKind,
          actorUser: record.actorUserId,
          reasonCode: record.reasonCode,
          reasonText: record.reasonText,
          fromTerminal: from ? { id: from.id, name: from.name, racksProduct: null } : null,
          toTerminal: to ? { id: to.id, name: to.name, racksProduct: null } : null,
          qtyBefore: record.qtyBefore,
          qtyAfter: record.qtyAfter,
          inputs: {
            candidates: record.inputCandidates ?? [],
            declaredQty: record.inputDeclaredQty,
            committedQty: record.inputCommittedQty,
            qualifiedQty: record.inputQualifiedQty,
            vehicleId: record.inputVehicleId,
            uom: record.uomCode,
          },
          candidates: record.inputCandidates ?? [],
          policyId: record.policyId,
          policyVersionNo: record.policyVersionNo,
          override: record.overrideId ? { id: record.overrideId } : null,
          notifiedParties: record.notifiedParties ?? null,
          occurredAt: record.occurredAt,
          receivedAt: record.receivedAt,
        };
      }),
    };
  }

  async amendQuantity(
    id: string,
    actor: string,
    idempotencyKey: string,
    body: { reservedQty: number; reservedQtyUom: string; reason: string; versionNo: number },
  ) {
    requireKey(idempotencyKey);
    if (body.reason.trim().length < 8) throw new MdmError("GROUNDS_TOO_SHORT", "Reason must be at least 8 characters", 400, "reason");
    return this.repo.withTransaction(async (client) => {
      const current = await this.mustGet(client, id);
      this.assertVersion(current, body.versionNo);
      this.assertLive(current);
      const order = await this.repo.getOrder(client, current.orderId);
      if (!order?.qualifiedQty || !order.qualifiedQtyUomId) {
        throw new MdmError("QTY_NOT_QUALIFIED_QTY", "The order has no qualified quantity", 400);
      }
      const reservationUom = await this.requireUom(current.reservedQtyUomId);
      const statedUom = await this.requireUom(body.reservedQtyUom);
      const qualifiedUom = await this.requireUom(order.qualifiedQtyUomId);
      const stated = this.convert(body.reservedQty, statedUom, reservationUom);
      const qualified = this.convert(order.qualifiedQty, qualifiedUom, reservationUom);
      if (stated !== qualified) {
        throw new MdmError("QTY_NOT_QUALIFIED_QTY", "Reserved quantity must equal the qualified quantity", 400, "reservedQty");
      }
      const position = await this.repo.lockPosition(
        client,
        current.terminalId,
        current.materialId,
        current.reserveDate,
        reservationUom.id,
      );
      const positionUom = await this.requireUom(position.uomId);
      const before = this.convert(current.reservedQty, reservationUom, positionUom);
      const after = this.convert(qualified, reservationUom, positionUom);
      const next = this.reassess(
        current,
        { ...position, committedQty: round3(Math.max(0, position.committedQty - before)) },
        after,
        positionUom,
      );
      await this.repo.updateReservation(client, id, current.versionNo, [
        "reserved_qty = ?",
        "commitment_outcome = ?",
        "reason_code = ?",
        "reason_text = ?",
      ], [qualified, next.outcome, next.reasonCode, body.reason.trim()]);
      await this.repo.updatePosition(client, {
        ...position,
        committedQty: round3(Math.max(0, position.committedQty - before + after)),
      });
      await this.repo.insertEvent(client, {
        reservationId: id,
        seq: await this.repo.nextEventSeq(client, id),
        eventType: "QTY_AMENDED",
        actorKind: "PLANNER",
        actorUserId: actor,
        reasonCode: null,
        reasonText: body.reason.trim(),
        qtyBefore: current.reservedQty,
        qtyAfter: qualified,
        qualifiedQty: qualified,
        uomId: reservationUom.id,
        policyId: current.policyId,
        idempotencyKey,
      });
      await this.repo.insertAudit(client, {
        reservationId: id,
        action: "RESERVATION_QTY_AMENDED",
        actor,
        note: body.reason.trim(),
      });
      return this.toDto(await this.mustGet(client, id), new Date());
    });
  }

  async reassign(
    id: string,
    actor: string,
    idempotencyKey: string,
    body: { toTerminalId: string; reasonCode: string; grounds: string; reference: string; versionNo: number },
    canApprove: boolean,
  ) {
    requireKey(idempotencyKey);
    this.assertGrounds(body.grounds, body.reference);
    const reason = await this.requireReason(body.reasonCode, "REASSIGN");
    const target = await this.repo.resolveShippingPoint(body.toTerminalId);
    if (!target || target.status !== "PUBLISHED") {
      throw new MdmError("NOT_FOUND", "Terminal was not found", 404, "toTerminalId");
    }
    return this.repo.withTransaction(async (client) => {
      const current = await this.mustGet(client, id);
      this.assertVersion(current, body.versionNo);
      if (!LIVE.has(current.status) || current.status === "PENDING_COUNTERSIGN") {
        throw new MdmError("NOT_ACTIVE", "Only an active reservation can be reassigned", 409);
      }
      if (!racksProduct(target.products ?? [], current.materialCode)) {
        throw new MdmError("TERMINAL_DOES_NOT_RACK", `${target.name} does not rack ${current.materialCode}`, 400, "toTerminalId");
      }
      if (target.id === current.terminalId) {
        throw new MdmError("VALIDATION", "The reservation is already at that terminal", 400, "toTerminalId");
      }
      const overrideId = await this.repo.allocateOverrideId(client);
      const seq = await this.repo.nextEventSeq(client, id);
      if (!canApprove) {
        await this.repo.updateReservation(client, id, current.versionNo, [
          "status = ?",
          "override_id = ?",
          "override_by = ?",
          "reason_code = ?",
          "reason_text = ?",
        ], ["PENDING_COUNTERSIGN", overrideId, actor, reason.code, body.grounds.trim()]);
        await this.repo.insertEvent(client, {
          reservationId: id,
          seq,
          eventType: "REASSIGNED",
          actorKind: "PLANNER",
          actorUserId: actor,
          reasonCode: reason.code,
          reasonText: body.grounds.trim(),
          fromTerminalId: current.terminalId,
          toTerminalId: target.id,
          qualifiedQty: current.qualifiedQty ?? current.reservedQty,
          uomId: current.reservedQtyUomId,
          policyId: current.policyId,
          overrideId,
          idempotencyKey,
        });
        await this.repo.insertAudit(client, {
          reservationId: id,
          action: "RESERVATION_REASSIGN_PENDING",
          actor,
          note: "Recorded, awaiting counter-signature. The terminal has not changed.",
        });
        return {
          httpStatus: 202,
          reservation: this.toDto(await this.mustGet(client, id), new Date()),
          message: "Recorded, awaiting counter-signature. The terminal has not changed.",
        };
      }
      await this.applyTerminalMove(client, current, target, actor, overrideId, body.grounds.trim(), reason.code, idempotencyKey);
      return { httpStatus: 200, reservation: this.toDto(await this.mustGet(client, id), new Date()) };
    });
  }

  async countersign(id: string, actor: string, idempotencyKey: string, versionNo: number, canApprove: boolean) {
    requireKey(idempotencyKey);
    if (!canApprove) throw new MdmError("PERMISSION", "override.approve is required to counter-sign", 403);
    return this.repo.withTransaction(async (client) => {
      const current = await this.mustGet(client, id);
      this.assertVersion(current, versionNo);
      if (current.status !== "PENDING_COUNTERSIGN") {
        throw new MdmError("NOT_ACTIVE", "This reservation is not awaiting counter-signature", 409);
      }
      const pending = await this.repo.latestReassignEvent(client, id);
      if (!pending) throw new MdmError("NOT_FOUND", "The pending reassignment was not found", 404);
      if (pending.actorUserId && pending.actorUserId === actor) {
        throw new MdmError("PERMISSION", "Maker and checker must be different people", 403);
      }
      const target = await this.repo.resolveShippingPoint(pending.toTerminalId);
      if (!target) throw new MdmError("NOT_FOUND", "Terminal was not found", 404);
      await this.applyTerminalMove(
        client,
        current,
        target,
        actor,
        pending.overrideId ?? current.overrideId ?? "",
        pending.reasonText,
        pending.reasonCode ?? "RSN_SUPERVISOR_INSTRUCTION",
        idempotencyKey,
      );
      return this.toDto(await this.mustGet(client, id), new Date());
    });
  }

  async release(
    id: string,
    actor: string,
    idempotencyKey: string,
    body: { reasonCode: string; grounds: string; reference: string; versionNo: number },
  ) {
    requireKey(idempotencyKey);
    this.assertGrounds(body.grounds, body.reference);
    const reason = await this.requireReason(body.reasonCode, "RELEASE");
    return this.mutate(id, body.versionNo, async (client, current) => {
      if (current.status === "RELEASED") throw new MdmError("ALREADY_RELEASED", "Reservation is already released", 409);
      this.assertLive(current);
      await this.dropCommitment(client, current);
      await this.repo.updateReservation(client, id, current.versionNo, [
        "status = ?",
        "reason_code = ?",
        "reason_text = ?",
        "released_at = ?",
        "released_by = ?",
      ], ["RELEASED", reason.code, body.grounds.trim(), new Date().toISOString(), actor]);
      await this.repo.insertEvent(client, {
        reservationId: id,
        seq: await this.repo.nextEventSeq(client, id),
        eventType: "RELEASED",
        actorKind: "PLANNER",
        actorUserId: actor,
        reasonCode: reason.code,
        reasonText: body.grounds.trim(),
        qualifiedQty: current.qualifiedQty ?? current.reservedQty,
        uomId: current.reservedQtyUomId,
        policyId: current.policyId,
        idempotencyKey,
      });
      await this.repo.insertAudit(client, {
        reservationId: id,
        action: "RESERVATION_RELEASED",
        actor,
        note: body.grounds.trim(),
        payload: { reasonCode: reason.code },
      });
    });
  }

  async releaseTrip(
    tripId: string,
    actor: string,
    idempotencyKey: string,
    body: { reasonCode: string; grounds: string; reference: string },
  ) {
    requireKey(idempotencyKey);
    const link = await this.repo.getTripLink(tripId);
    if (!link) throw new MdmError("NOT_FOUND", "Trip was not found", 404);
    const listed = await this.repo.listReservations({
      tripId,
      status: ["ACTIVE", "EXPIRING", "PENDING_COUNTERSIGN"],
      page: 1,
      pageSize: 100,
    });
    const released = [];
    for (const row of listed.rows as ReservationRow[]) {
      released.push(
        await this.release(row.id, actor, `${idempotencyKey}:${row.id}`, {
          reasonCode: body.reasonCode,
          grounds: body.grounds,
          reference: body.reference,
          versionNo: row.versionNo,
        }),
      );
    }
    if (body.reasonCode === "REL_TRIP_CANCELLED") await this.repo.setRouteStatus(tripId, "CANCELLED");
    return { reservations: released };
  }

  async acceptShort(
    id: string,
    actor: string,
    idempotencyKey: string,
    body: { reasonCode: string; grounds: string; reference: string; versionNo: number },
  ) {
    requireKey(idempotencyKey);
    this.assertGrounds(body.grounds, body.reference);
    const reason = await this.requireReason(body.reasonCode, "SHORT");
    return this.mutate(id, body.versionNo, async (client, current) => {
      if (current.commitmentOutcome !== "SHORT") throw new MdmError("NOT_SHORT", "Reservation is not short", 409);
      const policy = await this.repo.getPolicyById(current.policyId);
      if (policy && !policy.allowShortCommitment) {
        throw new MdmError("PERMISSION", "Policy does not allow a short commitment to be accepted", 403);
      }
      const overrideId = await this.repo.allocateOverrideId(client);
      await this.repo.updateReservation(client, id, current.versionNo, [
        "reason_code = ?",
        "reason_text = ?",
        "override_id = ?",
        "override_by = ?",
      ], [reason.code, body.grounds.trim(), overrideId, actor]);
      await this.repo.insertEvent(client, {
        reservationId: id,
        seq: await this.repo.nextEventSeq(client, id),
        eventType: "SHORT_ACCEPTED",
        actorKind: "PLANNER",
        actorUserId: actor,
        reasonCode: reason.code,
        reasonText: body.grounds.trim(),
        qualifiedQty: current.qualifiedQty ?? current.reservedQty,
        uomId: current.reservedQtyUomId,
        policyId: current.policyId,
        overrideId,
        idempotencyKey,
      });
      await this.repo.insertAudit(client, {
        reservationId: id,
        action: "RESERVATION_SHORT_ACCEPTED",
        actor,
        note: body.grounds.trim(),
      });
    });
  }

  async extendExpiry(
    id: string,
    actor: string,
    idempotencyKey: string,
    body: { newExpiresAt: string; reasonCode: string; grounds: string; reference: string; versionNo: number },
  ) {
    requireKey(idempotencyKey);
    this.assertGrounds(body.grounds, body.reference);
    const reason = await this.requireReason(body.reasonCode, "EXTEND");
    const nextExpiry = new Date(body.newExpiresAt);
    if (Number.isNaN(nextExpiry.getTime())) {
      throw new MdmError("VALIDATION", "newExpiresAt must be a timestamp", 400, "newExpiresAt");
    }
    return this.mutate(id, body.versionNo, async (client, current) => {
      this.assertLive(current);
      if (current.expiryExtendedCount >= current.maxExpiryExtensions) {
        throw new MdmError("EXTENSION_CAP_REACHED", "The extension cap on this policy has been reached", 400);
      }
      if (nextExpiry.getTime() <= new Date(current.expiresAt).getTime()) {
        throw new MdmError("VALIDATION", "The new expiry must be later than the current one", 400, "newExpiresAt");
      }
      const overrideId = await this.repo.allocateOverrideId(client);
      await this.repo.updateReservation(client, id, current.versionNo, [
        "expires_at = ?",
        "expiry_extended_count = ?",
        "status = ?",
        "reason_code = ?",
        "reason_text = ?",
        "override_id = ?",
        "override_by = ?",
      ], [
        nextExpiry.toISOString(),
        current.expiryExtendedCount + 1,
        "ACTIVE",
        reason.code,
        body.grounds.trim(),
        overrideId,
        actor,
      ]);
      await this.repo.insertEvent(client, {
        reservationId: id,
        seq: await this.repo.nextEventSeq(client, id),
        eventType: "EXPIRY_EXTENDED",
        actorKind: "PLANNER",
        actorUserId: actor,
        reasonCode: reason.code,
        reasonText: body.grounds.trim(),
        qualifiedQty: current.qualifiedQty ?? current.reservedQty,
        uomId: current.reservedQtyUomId,
        policyId: current.policyId,
        overrideId,
        idempotencyKey,
      });
      await this.repo.insertAudit(client, {
        reservationId: id,
        action: "RESERVATION_EXPIRY_EXTENDED",
        actor,
        note: body.grounds.trim(),
      });
    });
  }

  async consume(
    id: string,
    actor: string,
    idempotencyKey: string,
    body: { loadId: string; consumedQty: number; consumedQtyUom: string },
  ) {
    requireKey(idempotencyKey);
    if (!body.loadId.trim()) throw new MdmError("VALIDATION", "loadId is required", 400, "loadId");
    if (!(body.consumedQty >= 0)) throw new MdmError("VALIDATION", "consumedQty must be zero or more", 400, "consumedQty");
    return this.mutate(id, null, async (client, current) => {
      if (current.status !== "ACTIVE" && current.status !== "EXPIRING") {
        throw new MdmError("NOT_ACTIVE", "Only an active reservation can be consumed", 409);
      }
      const reservationUom = await this.requireUom(current.reservedQtyUomId);
      const consumedUom = await this.requireUom(body.consumedQtyUom);
      const position = await this.repo.lockPosition(client, current.terminalId, current.materialId, current.reserveDate, reservationUom.id);
      const positionUom = await this.requireUom(position.uomId);
      const reserved = this.convert(current.reservedQty, reservationUom, positionUom);
      const consumed = this.convert(body.consumedQty, consumedUom, positionUom);
      await this.repo.updatePosition(client, {
        ...position,
        committedQty: round3(Math.max(0, position.committedQty - reserved)),
        consumedQty: round3(position.consumedQty + consumed),
        reservationCount: Math.max(0, position.reservationCount - 1),
      });
      await this.repo.updateReservation(client, id, current.versionNo, [
        "status = ?",
        "consumed_at = ?",
        "reason_text = ?",
      ], ["CONSUMED", new Date().toISOString(), `Load ${body.loadId.trim()} posted`]);
      await this.repo.insertEvent(client, {
        reservationId: id,
        seq: await this.repo.nextEventSeq(client, id),
        eventType: "CONSUMED",
        actorKind: "OPERATOR",
        actorUserId: actor,
        reasonCode: null,
        reasonText: `Load ${body.loadId.trim()} consumed ${body.consumedQty} ${consumedUom.code}`,
        qtyBefore: current.reservedQty,
        qtyAfter: body.consumedQty,
        qualifiedQty: current.qualifiedQty ?? current.reservedQty,
        uomId: consumedUom.id,
        policyId: current.policyId,
        idempotencyKey,
      });
      await this.repo.insertAudit(client, {
        reservationId: id,
        action: "RESERVATION_CONSUMED",
        actor,
        note: body.loadId.trim(),
        payload: { consumedQty: body.consumedQty, reservedQty: current.reservedQty },
      });
    });
  }

  async declare(
    actor: string,
    idempotencyKey: string,
    body: {
      terminalId: string;
      materialId: string;
      availabilityDate: string;
      declaredQty: number;
      declaredQtyUom: string;
      note?: string | null;
    },
  ) {
    requireKey(idempotencyKey);
    if (body.declaredQty < 0) throw new MdmError("VALIDATION", "declaredQty cannot be negative", 400, "declaredQty");
    const terminal = await this.repo.resolveShippingPoint(body.terminalId);
    if (!terminal) throw new MdmError("NOT_FOUND", "Terminal was not found", 404, "terminalId");
    const material = await this.repo.resolveMaterial(body.materialId);
    if (!material) throw new MdmError("NOT_FOUND", "Material was not found", 404, "materialId");
    if (!racksProduct(terminal.products ?? [], material.code)) {
      throw new MdmError("MATERIAL_NOT_RACKED", `${terminal.name} does not rack ${material.code}`, 400, "materialId");
    }
    const uom = await this.requireUom(body.declaredQtyUom);
    const existing = await this.repo.findDeclarationByKey(idempotencyKey);
    if (existing) {
      const position = await this.repo.listPositions({
        terminalId: terminal.id,
        materialId: material.id,
        dateFrom: body.availabilityDate,
        dateTo: body.availabilityDate,
      });
      return { declarationId: existing, position: position[0] ?? null, replayed: true };
    }
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.currentDeclaration(client, terminal.id, material.id, body.availabilityDate);
      if (current) await this.repo.supersedeDeclaration(client, current.id);
      const id = await this.repo.insertDeclaration(client, {
        terminalId: terminal.id,
        materialId: material.id,
        availabilityDate: body.availabilityDate,
        declaredQty: body.declaredQty,
        uomId: uom.id,
        revisionNo: (current?.revisionNo ?? 0) + 1,
        supersedesId: current?.id ?? null,
        note: body.note ?? null,
        declaredBy: actor,
        idempotencyKey,
      });
      const position = await this.repo.lockPosition(client, terminal.id, material.id, body.availabilityDate, uom.id);
      const positionUom = await this.requireUom(position.uomId);
      const sameUom = position.uomId === uom.id;
      const committedQty = sameUom ? position.committedQty : this.convert(position.committedQty, positionUom, uom);
      const consumedQty = sameUom ? position.consumedQty : this.convert(position.consumedQty, positionUom, uom);
      const declaredQty = round3(body.declaredQty);
      await this.repo.updatePosition(client, {
        ...position,
        declaredQty,
        committedQty,
        consumedQty,
        uomId: uom.id,
      });
      return {
        declarationId: id,
        replayed: false,
        position: {
          terminalId: terminal.id,
          terminalCode: terminal.code,
          materialId: material.id,
          materialCode: material.code,
          availabilityDate: body.availabilityDate,
          declaredQty,
          committedQty,
          consumedQty,
          availableQty: round3(declaredQty - committedQty - consumedQty),
          uomCode: uom.code,
          reservationCount: position.reservationCount,
        },
      };
    });
  }

  async positions(query: URLSearchParams) {
    return {
      items: await this.repo.listPositions({
        terminalId: query.get("terminalId"),
        materialId: query.get("materialId"),
        dateFrom: query.get("dateFrom"),
        dateTo: query.get("dateTo"),
      }),
    };
  }

  async declarationHistory(query: URLSearchParams) {
    return {
      items: await this.repo.listDeclarations({
        terminalId: query.get("terminalId"),
        materialId: query.get("materialId"),
        dateFrom: query.get("dateFrom"),
        dateTo: query.get("dateTo"),
      }),
    };
  }

  async policy(query: URLSearchParams) {
    const asOf = query.get("asOf");
    if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      throw new MdmError("ASOF_INVALID", "asOf must be YYYY-MM-DD", 400, "asOf");
    }
    const row = await this.requirePolicy(asOf, query.get("divisionId"));
    return { ...row, resolvedVersionId: row.id };
  }

  async reasonCodes(query: URLSearchParams) {
    return { items: await this.repo.listReasonCodes(query.get("appliesTo")) };
  }

  async exportCsv(query: URLSearchParams) {
    const listed = await this.list(query);
    const header = [
      "reservationNo",
      "orderNo",
      "terminalCode",
      "derivedTerminalCode",
      "materialCode",
      "reserveDate",
      "reservedQty",
      "uom",
      "outcome",
      "status",
      "expiresAt",
    ];
    const lines = [header.join(",")];
    for (const row of listed.items) {
      lines.push(
        [
          row.reservationNo,
          row.orderNo,
          row.terminalCode,
          row.derivedTerminalCode,
          row.materialCode,
          row.reserveDate,
          row.reservedQty,
          row.reservedQtyUom,
          row.commitmentOutcome,
          row.status,
          row.expiresAt,
        ].join(","),
      );
    }
    return lines.join("\n");
  }

  async setRouteStatus(tripId: string, routeStatus: string) {
    if (!["CONFIRMED", "DISPATCHED", "CANCELLED"].includes(routeStatus)) {
      throw new MdmError("VALIDATION", "routeStatus must be CONFIRMED, DISPATCHED, or CANCELLED", 400, "routeStatus");
    }
    const row = await this.repo.setRouteStatus(tripId, routeStatus);
    if (!row) throw new MdmError("NOT_FOUND", "Trip was not found", 404);
    return row;
  }

  async sweep(now = new Date()) {
    return this.repo.withTransaction(async (client) => {
      const locked = await this.repo.trySweepLock(client);
      if (!locked) return { skipped: true, warned: 0, expired: 0 };
      const due = await this.repo.loadForSweep(client, now);
      let warned = 0;
      let expired = 0;
      for (const row of due) {
        const decision = decideSweep({
          now,
          expiresAt: new Date(row.expiresAt),
          routeStatus: row.routeStatus,
          releaseAtTerminalClose: row.releaseAtTerminalClose,
          terminalClose: terminalCloseAt(row.reserveDate, row.openingHours),
          expiryWarnedAt: row.expiryWarnedAt ? new Date(row.expiryWarnedAt) : null,
          warningLeadHours: row.warningLeadHours,
        });
        if (decision === "WARN") {
          const parties = expiryRecipients({
            planner: row.confirmedBy,
            terminalCode: row.terminalCode,
            dispatcher: row.leadDispatcher,
          });
          const current = await this.mustGet(client, row.id);
          await this.repo.updateReservation(client, row.id, current.versionNo, [
            "status = ?",
            "expiry_warned_at = ?",
          ], ["EXPIRING", now.toISOString()]);
          await this.repo.insertEvent(client, {
            reservationId: row.id,
            seq: await this.repo.nextEventSeq(client, row.id),
            eventType: "EXPIRY_WARNED",
            actorKind: "SYSTEM",
            actorUserId: null,
            reasonCode: null,
            reasonText: "Reservation window is inside the warning lead",
            qualifiedQty: current.qualifiedQty ?? current.reservedQty,
            uomId: current.reservedQtyUomId,
            policyId: current.policyId,
            notifiedParties: parties,
          });
          warned += 1;
        } else if (decision === "EXPIRE") {
          const current = await this.mustGet(client, row.id);
          await this.dropCommitment(client, current);
          await this.repo.updateReservation(client, row.id, current.versionNo, [
            "status = ?",
            "released_at = ?",
            "reason_text = ?",
          ], ["EXPIRED", now.toISOString(), "Reservation expired after the terminal operating day closed"]);
          const parties = expiryRecipients({
            planner: row.confirmedBy,
            terminalCode: row.terminalCode,
            dispatcher: null,
          }).filter((party) => party.role !== "DISPATCHER");
          await this.repo.insertEvent(client, {
            reservationId: row.id,
            seq: await this.repo.nextEventSeq(client, row.id),
            eventType: "EXPIRED",
            actorKind: "SYSTEM",
            actorUserId: null,
            reasonCode: null,
            reasonText: "Reservation expired after the terminal operating day closed",
            qualifiedQty: current.qualifiedQty ?? current.reservedQty,
            uomId: current.reservedQtyUomId,
            policyId: current.policyId,
            notifiedParties: parties,
          });
          await this.repo.insertAudit(client, {
            reservationId: row.id,
            action: "RESERVATION_EXPIRED",
            actor: "SYSTEM",
            note: "Sweep release after terminal close",
          });
          expired += 1;
        }
      }
      return { skipped: false, warned, expired, considered: due.length };
    });
  }

  async rebuild() {
    return this.repo.withTransaction(async (client) => {
      const declarations = await this.repo.currentDeclarations();
      const reservations = await this.repo.liveReservationsForPosition(client);
      const consumed = new Map((await this.repo.consumedEvents(client)).map((row) => [row.reservationId, row]));
      const uoms = new Map<string, UomRow>();
      const loadUom = async (id: string) => {
        const cached = uoms.get(id);
        if (cached) return cached;
        const row = await this.requireUom(id);
        uoms.set(row.id, row);
        return row;
      };
      type Bucket = {
        terminalId: string;
        materialId: string;
        availabilityDate: string;
        declaredQty: number | null;
        committedQty: number;
        consumedQty: number;
        uomId: string;
        reservationCount: number;
      };
      const buckets = new Map<string, Bucket>();
      const keyOf = (terminalId: string, materialId: string, date: string) => `${terminalId}|${materialId}|${date}`;
      for (const declaration of declarations) {
        buckets.set(keyOf(declaration.terminalId, declaration.materialId, declaration.availabilityDate), {
          terminalId: declaration.terminalId,
          materialId: declaration.materialId,
          availabilityDate: declaration.availabilityDate,
          declaredQty: declaration.declaredQty,
          committedQty: 0,
          consumedQty: 0,
          uomId: declaration.uomId,
          reservationCount: 0,
        });
      }
      for (const reservation of reservations) {
        const key = keyOf(reservation.terminalId, reservation.materialId, reservation.reserveDate);
        let bucket = buckets.get(key);
        const sourceUom = await loadUom(reservation.uomId);
        if (!bucket) {
          bucket = {
            terminalId: reservation.terminalId,
            materialId: reservation.materialId,
            availabilityDate: reservation.reserveDate,
            declaredQty: null,
            committedQty: 0,
            consumedQty: 0,
            uomId: sourceUom.id,
            reservationCount: 0,
          };
          buckets.set(key, bucket);
        }
        const targetUom = await loadUom(bucket.uomId);
        const qty = this.convert(reservation.reservedQty, sourceUom, targetUom);
        if (reservation.status === "CONSUMED") {
          const posted = consumed.get(reservation.id);
          const postedQty = posted ? this.convert(posted.qtyAfter, await loadUom(posted.uomId), targetUom) : qty;
          bucket.consumedQty = round3(bucket.consumedQty + postedQty);
        } else {
          bucket.committedQty = round3(bucket.committedQty + qty);
          bucket.reservationCount += 1;
        }
      }
      const rows = [...buckets.values()];
      await this.repo.replacePositions(client, rows);
      return { rows: rows.length };
    });
  }

  private async applyTerminalMove(
    client: PoolClient,
    current: ReservationRow,
    target: TerminalRow,
    actor: string,
    overrideId: string,
    grounds: string,
    reasonCode: string,
    idempotencyKey: string,
  ) {
    const reservationUom = await this.requireUom(current.reservedQtyUomId);
    const locks = [current.terminalId, target.id].sort((a, b) => a.localeCompare(b));
    const positions = new Map<string, PositionRow>();
    for (const terminalId of locks) {
      positions.set(
        terminalId,
        await this.repo.lockPosition(client, terminalId, current.materialId, current.reserveDate, reservationUom.id),
      );
    }
    const from = positions.get(current.terminalId)!;
    const to = positions.get(target.id)!;
    const fromUom = await this.requireUom(from.uomId);
    const toUom = await this.requireUom(to.uomId);
    const leave = this.convert(current.reservedQty, reservationUom, fromUom);
    const arrive = this.convert(current.reservedQty, reservationUom, toUom);
    await this.repo.updatePosition(client, {
      ...from,
      committedQty: round3(Math.max(0, from.committedQty - leave)),
      reservationCount: Math.max(0, from.reservationCount - 1),
    });
    const arrival: PositionRow = {
      ...to,
      committedQty: round3(to.committedQty + arrive),
      reservationCount: to.reservationCount + 1,
    };
    await this.repo.updatePosition(client, arrival);
    const assessment = this.reassess(current, { ...to, committedQty: to.committedQty }, arrive, toUom);
    const linkDeparture = current.plannedDeparture ? new Date(current.plannedDeparture) : new Date();
    const expiresAt = computeExpiresAt(
      linkDeparture,
      (await this.repo.getPolicyById(current.policyId))?.expiryGraceHours ?? 4,
      terminalCloseAt(current.reserveDate, target.openingHours),
    );
    await this.repo.updateReservation(client, current.id, current.versionNo, [
      "terminal_id = ?",
      "terminal_source = ?",
      "status = ?",
      "override_id = ?",
      "override_by = ?",
      "reason_code = ?",
      "reason_text = ?",
      "commitment_outcome = ?",
      "expires_at = ?",
    ], [
      target.id,
      "REASSIGNED",
      "ACTIVE",
      overrideId,
      current.overrideBy ?? actor,
      reasonCode,
      grounds,
      assessment.outcome,
      expiresAt.toISOString(),
    ]);
    await this.repo.insertEvent(client, {
      reservationId: current.id,
      seq: await this.repo.nextEventSeq(client, current.id),
      eventType: "REASSIGNED",
      actorKind: "PLANNER",
      actorUserId: actor,
      reasonCode,
      reasonText: grounds,
      fromTerminalId: current.terminalId,
      toTerminalId: target.id,
      declaredQty: to.declaredQty,
      committedQty: to.committedQty,
      qualifiedQty: current.qualifiedQty ?? current.reservedQty,
      uomId: toUom.id,
      policyId: current.policyId,
      overrideId,
      idempotencyKey,
    });
    await this.repo.insertAudit(client, {
      reservationId: current.id,
      action: "RESERVATION_REASSIGNED",
      actor,
      note: grounds,
      payload: { from: current.terminalId, to: target.id },
    });
  }

  private reassess(current: ReservationRow, position: PositionRow, wantedInPositionUom: number, _uom: UomRow) {
    return assessAvailability({
      declaredQty: position.declaredQty,
      committedQty: position.committedQty,
      consumedQty: position.consumedQty,
      wantedQty: wantedInPositionUom,
      terminalName: current.terminalName,
      materialCode: current.materialCode,
      reserveDate: current.reserveDate,
      homeBiasApplied: false,
    });
  }

  private async dropCommitment(client: PoolClient, current: ReservationRow) {
    const reservationUom = await this.requireUom(current.reservedQtyUomId);
    const position = await this.repo.lockPosition(client, current.terminalId, current.materialId, current.reserveDate, reservationUom.id);
    const positionUom = await this.requireUom(position.uomId);
    const qty = this.convert(current.reservedQty, reservationUom, positionUom);
    await this.repo.updatePosition(client, {
      ...position,
      committedQty: round3(Math.max(0, position.committedQty - qty)),
      reservationCount: Math.max(0, position.reservationCount - 1),
    });
  }

  private async mutate(
    id: string,
    versionNo: number | null,
    fn: (client: PoolClient, current: ReservationRow) => Promise<void>,
  ) {
    return this.repo.withTransaction(async (client) => {
      const current = await this.mustGet(client, id);
      if (versionNo != null) this.assertVersion(current, versionNo);
      await fn(client, current);
      return this.toDto(await this.mustGet(client, id), new Date());
    });
  }

  private async mustGet(client: PoolClient, id: string) {
    const row = await this.repo.getReservation(client, id);
    if (!row) throw new MdmError("NOT_FOUND", "Reservation was not found", 404);
    return row as ReservationRow;
  }

  private toDto(row: ReservationRow, now: Date) {
    const expiresAt = new Date(row.expiresAt);
    const hours = (expiresAt.getTime() - now.getTime()) / 3_600_000;
    const decision = decideSweep({
      now,
      expiresAt,
      routeStatus: row.routeStatus,
      releaseAtTerminalClose: row.releaseAtTerminalClose,
      terminalClose: terminalCloseAt(row.reserveDate, row.openingHours),
      expiryWarnedAt: row.expiryWarnedAt ? new Date(row.expiryWarnedAt) : null,
      warningLeadHours: row.warningLeadHours,
    });
    const racksNow = racksProduct(row.terminalProducts ?? [], row.materialCode);
    return {
      id: row.id,
      reservationNo: row.reservationNo,
      orderId: row.orderId,
      orderNo: row.orderNo,
      customerName: row.customerName,
      customerCode: row.customerCode,
      routeId: row.routeId,
      routeName: row.routeId,
      tripId: row.tripId,
      tripNo: row.tripNo,
      planId: row.planId,
      planKind: row.planKind,
      routeStatus: row.routeStatus,
      terminalId: row.terminalId,
      terminalCode: row.terminalCode,
      terminalName: row.terminalName,
      derivedTerminalId: row.derivedTerminalId,
      derivedTerminalCode: row.derivedTerminalCode,
      derivedTerminalName: row.derivedTerminalName,
      terminalSource: row.terminalSource,
      materialId: row.materialId,
      materialCode: row.materialCode,
      materialName: row.materialName,
      reserveDate: row.reserveDate,
      reservedQty: row.reservedQty,
      reservedQtyUom: row.reservedQtyUom,
      requestedQty: row.requestedQty,
      qualifiedQty: row.qualifiedQty,
      commitmentOutcome: row.commitmentOutcome,
      status: row.status,
      reasonCode: row.reasonCode,
      reasonText: row.reasonText,
      expiresAt: expiresAt.toISOString(),
      expiresInHours: Math.round(hours * 100) / 100,
      isExpiringSoon: hours > 0 && hours <= row.warningLeadHours,
      canExpireNow: decision === "EXPIRE",
      expiryExtendedCount: row.expiryExtendedCount,
      maxExtensions: row.maxExpiryExtensions,
      declaredQty: row.declaredQty,
      committedQty: row.committedQty,
      availableQty: row.availableQty,
      terminalRacksProduct: racksNow,
      terminalPesoValidToDate: row.terminalPesoValidTo,
      pesoWarning: pesoLapsed(row.terminalPesoValidTo, row.reserveDate),
      overrideId: row.overrideId,
      overrideStatus: row.status === "PENDING_COUNTERSIGN" ? "PENDING_COUNTERSIGN" : row.overrideId ? "ACTIVE" : null,
      versionNo: row.versionNo,
    };
  }

  private convert(qty: number, from: UomRow, to: UomRow) {
    if (from.id === to.id) return round3(qty);
    if (!from.dimension || from.dimension !== to.dimension) {
      throw new MdmError("UOM_CONVERSION", `Cannot convert ${from.code} to ${to.code}`, 400);
    }
    return convertByFactor(qty, from.factorToBase, to.factorToBase);
  }

  private async requireUom(idOrCode: string) {
    const uom = await this.repo.getUom(idOrCode);
    if (!uom) throw new MdmError("NOT_FOUND", "UOM was not found", 404, "uom");
    return uom;
  }

  private async requirePolicy(asOf: string | null, divisionId: string | null) {
    const policy = await this.repo.getPolicy(asOf, divisionId);
    if (!policy) throw new MdmError("NOT_FOUND", "No reservation policy is in force", 404);
    return policy;
  }

  private async requireReason(code: string, appliesTo: string) {
    const reason = await this.repo.getReasonCode(code);
    if (!reason || !reason.isActive || reason.appliesTo !== appliesTo) {
      throw new MdmError("REASON_CODE_NOT_APPLICABLE", "Reason code does not apply to this action", 400, "reasonCode");
    }
    return reason;
  }

  private assertGrounds(grounds: string, reference: string) {
    if (grounds.trim().length < 8) throw new MdmError("GROUNDS_TOO_SHORT", "Grounds must be at least 8 characters", 400, "grounds");
    if (reference.trim().length < 3) throw new MdmError("REFERENCE_REQUIRED", "Reference must be at least 3 characters", 400, "reference");
  }

  private assertVersion(row: ReservationRow, versionNo: number) {
    if (row.versionNo !== versionNo) {
      throw new MdmError("STALE_VERSION", "The reservation was updated by someone else", 409, "versionNo");
    }
  }

  private assertLive(row: ReservationRow) {
    if (!LIVE.has(row.status)) throw new MdmError("NOT_ACTIVE", "Reservation is not active", 409);
  }
}

function requireKey(key: string) {
  if (!key.trim()) throw new MdmError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required", 400);
}
