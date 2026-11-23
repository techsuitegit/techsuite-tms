import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import { allocateGindexId, BRANCH_INDEX } from "../services/allocate-gindex";
import type { OrderRow, PolicyRow, PositionRow, TerminalRow, UomRow } from "../services/reservation-types";

type Db = Pool | PoolClient;

const POLICY_SELECT = `
  id, code, name,
  expiry_grace_hours as "expiryGraceHours",
  warning_lead_hours as "warningLeadHours",
  sweep_cadence_minutes as "sweepCadenceMinutes",
  release_at_terminal_close as "releaseAtTerminalClose",
  max_expiry_extensions as "maxExpiryExtensions",
  allow_short_commitment as "allowShortCommitment",
  unverified_is_reservable as "unverifiedIsReservable",
  home_terminal_bias_km::float8 as "homeTerminalBiasKm",
  proximity_tie_break as "proximityTieBreak",
  division_id as "divisionId",
  version_no as "versionNo",
  valid_from::text as "validFrom",
  valid_to::text as "validTo"
`;

export class ReservationRepository {
  constructor(private readonly pool: Pool) {}

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async trySweepLock(client: PoolClient) {
    const result = await client.query<{ locked: boolean }>(
      `select pg_try_advisory_xact_lock(hashtext('m04_reservation_sweep')) as locked`,
    );
    return Boolean(result.rows[0]?.locked);
  }

  async getPolicy(asOf: string | null, divisionId: string | null): Promise<PolicyRow | null> {
    const values: unknown[] = [];
    const where = ["status = 'PUBLISHED'", "is_current = true", "is_active = true"];
    if (asOf) {
      values.push(asOf);
      where.push(`valid_from <= $${values.length}::date`);
      where.push(`(valid_to is null or valid_to >= $${values.length}::date)`);
    } else {
      where.push(`valid_from <= current_date`);
      where.push(`(valid_to is null or valid_to >= current_date)`);
    }
    let orderBy = "case when division_id is null then 0 else 1 end, version_no desc";
    if (divisionId) {
      values.push(divisionId);
      where.push(`(division_id = $${values.length} or division_id is null)`);
      orderBy = `case when division_id = $${values.length} then 0 else 1 end, version_no desc`;
    } else {
      where.push(`division_id is null`);
    }
    const result = await this.pool.query<PolicyRow>(
      `select ${POLICY_SELECT} from branch.reservation_policy where ${where.join(" and ")} order by ${orderBy} limit 1`,
      values,
    );
    return result.rows[0] ?? null;
  }

  async getPolicyById(id: string): Promise<PolicyRow | null> {
    const result = await this.pool.query<PolicyRow>(
      `select ${POLICY_SELECT} from branch.reservation_policy where id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async listReasonCodes(appliesTo: string | null) {
    const values: unknown[] = [];
    const where = ["is_active = true"];
    if (appliesTo) {
      values.push(appliesTo);
      where.push(`applies_to = $${values.length}`);
    }
    const result = await this.pool.query(
      `select code, label, applies_to as "appliesTo", is_active as "isActive"
       from branch.reservation_reason_code
       where ${where.join(" and ")}
       order by applies_to, code`,
      values,
    );
    return result.rows;
  }

  async getReasonCode(code: string) {
    const result = await this.pool.query<{ code: string; label: string; appliesTo: string; isActive: boolean }>(
      `select code, label, applies_to as "appliesTo", is_active as "isActive"
       from branch.reservation_reason_code where code = $1`,
      [code],
    );
    return result.rows[0] ?? null;
  }

  async listTerminals(): Promise<TerminalRow[]> {
    const result = await this.pool.query<TerminalRow>(
      `select id, code, name, products_stocked as products, status,
              opening_hours as "openingHours", permit_expiry::text as "permitExpiry",
              latitude::float8 as latitude, longitude::float8 as longitude,
              lead_dispatcher as "leadDispatcher"
       from branch.shipping_point
       where deleted_at is null
       order by code`,
    );
    return result.rows;
  }

  async resolveShippingPoint(idOrCode: string) {
    const result = await this.pool.query<TerminalRow>(
      `select id, code, name, products_stocked as products, status,
              opening_hours as "openingHours", permit_expiry::text as "permitExpiry",
              latitude::float8 as latitude, longitude::float8 as longitude,
              lead_dispatcher as "leadDispatcher"
       from branch.shipping_point
       where deleted_at is null and (id = $1 or upper(code) = upper($1))
       limit 1`,
      [idOrCode],
    );
    return result.rows[0] ?? null;
  }

  async resolveMaterial(idOrCode: string) {
    const result = await this.pool.query<{ id: string; code: string; name: string }>(
      `select id, code, name from branch.material
       where deleted_at is null and (id = $1 or upper(code) = upper($1))
       limit 1`,
      [idOrCode],
    );
    return result.rows[0] ?? null;
  }

  async getUom(idOrCode: string): Promise<UomRow | null> {
    const result = await this.pool.query<UomRow>(
      `select id, code, factor_to_base::float8 as "factorToBase", dimension
       from branch.uom
       where deleted_at is null and status = 'PUBLISHED' and (id = $1 or upper(code) = upper($1))
       limit 1`,
      [idOrCode],
    );
    return result.rows[0] ?? null;
  }

  async getOrder(db: Db, id: string): Promise<OrderRow | null> {
    const result = await db.query<OrderRow>(
      `select o.id, o.order_no as "orderNo", o.customer_name as "customerName", o.customer_code as "customerCode",
              o.material_id as "materialId", m.code as "materialCode", o.is_packed as "isPacked",
              o.division_id as "divisionId",
              o.requested_qty::float8 as "requestedQty",
              o.qualified_qty::float8 as "qualifiedQty",
              o.qualified_qty_uom_id as "qualifiedQtyUomId",
              o.qual_outcome as "qualOutcome",
              o.version_no as "versionNo"
       from branch.delivery_order o
       join branch.material m on m.id = o.material_id
       where o.id = $1 and o.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async vehicleHome(vehicleId: string): Promise<string | null> {
    const result = await this.pool.query<{ shippingPointId: string }>(
      `select shipping_point_id as "shippingPointId" from branch.vehicle
       where id = $1 and deleted_at is null`,
      [vehicleId],
    );
    return result.rows[0]?.shippingPointId ?? null;
  }

  async upsertTripLink(
    client: PoolClient,
    row: {
      tripId: string;
      routeId: string;
      routeStatus: string;
      planId: string;
      planKind: string;
      tripNo: number;
      plannedDeparture: string;
      reserveDate: string;
      vehicleId: string | null;
      homeTerminalId: string | null;
      confirmedBy: string;
    },
  ) {
    await client.query(
      `insert into branch.reservation_trip_link (
         trip_id, route_id, route_status, plan_id, plan_kind, trip_no,
         planned_departure, reserve_date, vehicle_id, home_terminal_id, confirmed_by
       ) values ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::date,$9,$10,$11)
       on conflict (trip_id) do update set
         route_id = excluded.route_id,
         route_status = excluded.route_status,
         plan_id = excluded.plan_id,
         plan_kind = excluded.plan_kind,
         trip_no = excluded.trip_no,
         planned_departure = excluded.planned_departure,
         reserve_date = excluded.reserve_date,
         vehicle_id = excluded.vehicle_id,
         home_terminal_id = excluded.home_terminal_id,
         confirmed_by = excluded.confirmed_by,
         updated_at = now()`,
      [
        row.tripId,
        row.routeId,
        row.routeStatus,
        row.planId,
        row.planKind,
        row.tripNo,
        row.plannedDeparture,
        row.reserveDate,
        row.vehicleId,
        row.homeTerminalId,
        row.confirmedBy,
      ],
    );
  }

  async getTripLink(tripId: string) {
    const result = await this.pool.query<{
      tripId: string;
      routeId: string;
      routeStatus: string;
      planId: string;
      planKind: string;
      tripNo: number;
      plannedDeparture: string;
      reserveDate: string;
      vehicleId: string | null;
      homeTerminalId: string | null;
      confirmedBy: string | null;
    }>(
      `select trip_id as "tripId", route_id as "routeId", route_status as "routeStatus",
              plan_id as "planId", plan_kind as "planKind", trip_no as "tripNo",
              planned_departure::text as "plannedDeparture", reserve_date::text as "reserveDate",
              vehicle_id as "vehicleId", home_terminal_id as "homeTerminalId", confirmed_by as "confirmedBy"
       from branch.reservation_trip_link where trip_id = $1`,
      [tripId],
    );
    return result.rows[0] ?? null;
  }

  async setRouteStatus(tripId: string, routeStatus: string) {
    const result = await this.pool.query(
      `update branch.reservation_trip_link
       set route_status = $2, updated_at = now()
       where trip_id = $1
       returning trip_id as "tripId", route_status as "routeStatus"`,
      [tripId, routeStatus],
    );
    return result.rows[0] ?? null;
  }

  async findByIdempotency(db: Db, key: string) {
    const result = await db.query<{ id: string }>(
      `select id from branch.stock_reservation where idempotency_key = $1`,
      [key],
    );
    return result.rows[0]?.id ?? null;
  }

  async findLive(db: Db, orderId: string, routeId: string) {
    const result = await db.query<{ id: string }>(
      `select id from branch.stock_reservation
       where order_id = $1 and route_id = $2
         and status in ('ACTIVE', 'EXPIRING', 'PENDING_COUNTERSIGN')`,
      [orderId, routeId],
    );
    return result.rows[0]?.id ?? null;
  }

  async nextEventSeq(client: PoolClient, reservationId: string) {
    const result = await client.query<{ seq: number }>(
      `select coalesce(max(seq), 0) + 1 as seq from branch.stock_reservation_event where reservation_id = $1`,
      [reservationId],
    );
    return result.rows[0]?.seq ?? 1;
  }

  async insertReservation(
    client: PoolClient,
    row: {
      orderId: string;
      routeId: string;
      routeStopId: string | null;
      tripNo: number;
      planId: string;
      terminalId: string;
      derivedTerminalId: string;
      materialId: string;
      reserveDate: string;
      reservedQty: number;
      reservedQtyUomId: string;
      commitmentOutcome: string;
      status: string;
      reasonCode: string | null;
      reasonText: string;
      expiresAt: Date;
      policyId: string;
      idempotencyKey: string;
    },
  ) {
    const id = await allocateGindexId(client, BRANCH_INDEX.RESERVATION);
    await client.query(
      `insert into branch.stock_reservation (
         id, reservation_no, order_id, route_id, route_stop_id, trip_no, plan_id, plan_kind,
         terminal_id, derived_terminal_id, terminal_source, material_id, reserve_date,
         reserved_qty, reserved_qty_uom_id, commitment_outcome, status, reason_code, reason_text,
         expires_at, policy_id, idempotency_key
       ) values (
         $1,$1,$2,$3,$4,$5,$6,'LIVE',$7,$8,'DERIVED',$9,$10::date,$11,$12,$13,$14,$15,$16,$17,$18,$19
       )`,
      [
        id,
        row.orderId,
        row.routeId,
        row.routeStopId,
        row.tripNo,
        row.planId,
        row.terminalId,
        row.derivedTerminalId,
        row.materialId,
        row.reserveDate,
        row.reservedQty,
        row.reservedQtyUomId,
        row.commitmentOutcome,
        row.status,
        row.reasonCode,
        row.reasonText,
        row.expiresAt.toISOString(),
        row.policyId,
        row.idempotencyKey,
      ],
    );
    return id;
  }

  async insertEvent(
    client: PoolClient,
    row: {
      reservationId: string | null;
      seq: number;
      eventType: string;
      actorKind: string;
      actorUserId: string | null;
      reasonCode: string | null;
      reasonText: string;
      fromTerminalId?: string | null;
      toTerminalId?: string | null;
      qtyBefore?: number | null;
      qtyAfter?: number | null;
      candidates?: unknown;
      declaredQty?: number | null;
      committedQty?: number | null;
      qualifiedQty: number;
      vehicleId?: string | null;
      uomId: string;
      policyId: string;
      overrideId?: string | null;
      idempotencyKey?: string | null;
      notifiedParties?: unknown;
    },
  ) {
    const id = await allocateGindexId(client, BRANCH_INDEX.RESERVATION_EVENT);
    await client.query(
      `insert into branch.stock_reservation_event (
         id, reservation_id, seq, event_type, actor_kind, actor_user_id, reason_code, reason_text,
         from_terminal_id, to_terminal_id, qty_before, qty_after, input_candidates,
         input_declared_qty, input_committed_qty, input_qualified_qty, input_vehicle_id,
         uom_id, policy_id, override_id, idempotency_key, notified_parties, occurred_at
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb, now()
       )`,
      [
        id,
        row.reservationId,
        row.seq,
        row.eventType,
        row.actorKind,
        row.actorUserId,
        row.reasonCode,
        row.reasonText,
        row.fromTerminalId ?? null,
        row.toTerminalId ?? null,
        row.qtyBefore ?? null,
        row.qtyAfter ?? null,
        row.candidates == null ? null : JSON.stringify(row.candidates),
        row.declaredQty ?? null,
        row.committedQty ?? null,
        row.qualifiedQty,
        row.vehicleId ?? null,
        row.uomId,
        row.policyId,
        row.overrideId ?? null,
        row.idempotencyKey ?? null,
        row.notifiedParties == null ? null : JSON.stringify(row.notifiedParties),
      ],
    );
    return id;
  }

  async insertAudit(
    client: PoolClient,
    row: { reservationId: string | null; action: string; actor: string; note: string; payload?: unknown },
  ) {
    const id = await allocateGindexId(client, BRANCH_INDEX.AUDIT);
    await client.query(
      `insert into branch.stock_reservation_audit (id, reservation_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5,$6::jsonb)`,
      [id, row.reservationId, row.action, row.actor, row.note, row.payload == null ? null : JSON.stringify(row.payload)],
    );
  }

  async lockPosition(client: PoolClient, terminalId: string, materialId: string, availabilityDate: string, uomId: string) {
    await client.query(
      `insert into branch.terminal_stock_position (
         terminal_id, material_id, availability_date, declared_qty, committed_qty, consumed_qty, uom_id, reservation_count
       ) values ($1,$2,$3::date,null,0,0,$4,0)
       on conflict (terminal_id, material_id, availability_date) do nothing`,
      [terminalId, materialId, availabilityDate, uomId],
    );
    const result = await client.query<PositionRow>(
      `select terminal_id as "terminalId", material_id as "materialId", availability_date::text as "availabilityDate",
              declared_qty::float8 as "declaredQty", committed_qty::float8 as "committedQty",
              consumed_qty::float8 as "consumedQty", available_qty::float8 as "availableQty",
              uom_id as "uomId", reservation_count as "reservationCount"
       from branch.terminal_stock_position
       where terminal_id = $1 and material_id = $2 and availability_date = $3::date
       for update`,
      [terminalId, materialId, availabilityDate],
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("INTERNAL", "Stock position could not be locked", 500);
    return row;
  }

  async updatePosition(
    client: PoolClient,
    row: {
      terminalId: string;
      materialId: string;
      availabilityDate: string;
      declaredQty: number | null;
      committedQty: number;
      consumedQty: number;
      uomId: string;
      reservationCount: number;
    },
  ) {
    await client.query(
      `update branch.terminal_stock_position set
         declared_qty = $4,
         committed_qty = $5,
         consumed_qty = $6,
         uom_id = $7,
         reservation_count = $8
       where terminal_id = $1 and material_id = $2 and availability_date = $3::date`,
      [
        row.terminalId,
        row.materialId,
        row.availabilityDate,
        row.declaredQty,
        row.committedQty,
        row.consumedQty,
        row.uomId,
        row.reservationCount,
      ],
    );
  }

  async getById(id: string) {
    return this.getReservation(this.pool, id);
  }

  async getReservation(db: Db, id: string) {
    const result = await db.query(
      `select ${RESERVATION_SELECT}
       from branch.stock_reservation r
       join branch.delivery_order o on o.id = r.order_id
       join branch.material m on m.id = r.material_id
       join branch.shipping_point sp on sp.id = r.terminal_id
       join branch.shipping_point derived on derived.id = r.derived_terminal_id
       join branch.uom u on u.id = r.reserved_qty_uom_id
       join branch.reservation_policy p on p.id = r.policy_id
       left join branch.terminal_stock_position pos
         on pos.terminal_id = r.terminal_id and pos.material_id = r.material_id and pos.availability_date = r.reserve_date
       left join branch.reservation_trip_link link
         on link.route_id = r.route_id and link.trip_no = r.trip_no
       where r.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async listReservations(filters: ReservationFilters) {
    const values: unknown[] = [];
    const where: string[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      where.push(sql.replace("?", `$${values.length}`));
    };
    if (filters.q) {
      values.push(`%${filters.q}%`);
      where.push(`(r.reservation_no ilike $${values.length} or o.order_no ilike $${values.length} or o.customer_name ilike $${values.length})`);
    }
    if (filters.status?.length) add(`r.status = any(?::text[])`, filters.status);
    if (filters.outcome) add(`r.commitment_outcome = ?`, filters.outcome);
    if (filters.terminalId) add(`r.terminal_id = ?`, filters.terminalId);
    if (filters.materialId) add(`r.material_id = ?`, filters.materialId);
    if (filters.reserveDate) add(`r.reserve_date = ?::date`, filters.reserveDate);
    if (filters.reserveDateFrom) add(`r.reserve_date >= ?::date`, filters.reserveDateFrom);
    if (filters.reserveDateTo) add(`r.reserve_date <= ?::date`, filters.reserveDateTo);
    if (filters.routeId) add(`r.route_id = ?`, filters.routeId);
    if (filters.orderId) add(`r.order_id = ?`, filters.orderId);
    if (filters.divisionId) add(`o.division_id = ?`, filters.divisionId);
    if (filters.expiringBefore) add(`r.expires_at <= ?::timestamptz`, filters.expiringBefore);
    if (filters.tripId) add(`link.trip_id = ?`, filters.tripId);
    const whereSql = where.length ? `where ${where.join(" and ")}` : "";
    const count = await this.pool.query<{ total: number; status: string }>(
      `select count(*)::int as total, r.status
       from branch.stock_reservation r
       join branch.delivery_order o on o.id = r.order_id
       left join branch.reservation_trip_link link on link.route_id = r.route_id and link.trip_no = r.trip_no
       ${whereSql}
       group by r.status`,
      values,
    );
    const total = count.rows.reduce((sum, row) => sum + row.total, 0);
    const counts: Record<string, number> = {};
    for (const row of count.rows) counts[row.status] = row.total;
    const page = filters.page;
    const pageSize = filters.pageSize;
    const listed = await this.pool.query(
      `select ${RESERVATION_SELECT}
       from branch.stock_reservation r
       join branch.delivery_order o on o.id = r.order_id
       join branch.material m on m.id = r.material_id
       join branch.shipping_point sp on sp.id = r.terminal_id
       join branch.shipping_point derived on derived.id = r.derived_terminal_id
       join branch.uom u on u.id = r.reserved_qty_uom_id
       join branch.reservation_policy p on p.id = r.policy_id
       left join branch.terminal_stock_position pos
         on pos.terminal_id = r.terminal_id and pos.material_id = r.material_id and pos.availability_date = r.reserve_date
       left join branch.reservation_trip_link link
         on link.route_id = r.route_id and link.trip_no = r.trip_no
       ${whereSql}
       order by r.reserve_date, r.reservation_no
       limit ${pageSize} offset ${(page - 1) * pageSize}`,
      values,
    );
    return { rows: listed.rows, total, counts };
  }

  async listEvents(reservationId: string) {
    const result = await this.pool.query(
      `select e.id, e.reservation_id as "reservationId", e.seq, e.event_type as "eventType",
              e.actor_kind as "actorKind", e.actor_user_id as "actorUserId",
              e.reason_code as "reasonCode", e.reason_text as "reasonText",
              e.from_terminal_id as "fromTerminalId", e.to_terminal_id as "toTerminalId",
              e.qty_before::float8 as "qtyBefore", e.qty_after::float8 as "qtyAfter",
              e.input_candidates as "inputCandidates",
              e.input_declared_qty::float8 as "inputDeclaredQty",
              e.input_committed_qty::float8 as "inputCommittedQty",
              e.input_qualified_qty::float8 as "inputQualifiedQty",
              e.input_vehicle_id as "inputVehicleId",
              e.uom_id as "uomId", u.code as "uomCode",
              e.policy_id as "policyId", p.version_no as "policyVersionNo",
              e.override_id as "overrideId",
              e.occurred_at as "occurredAt", e.received_at as "receivedAt",
              e.notified_parties as "notifiedParties"
       from branch.stock_reservation_event e
       join branch.uom u on u.id = e.uom_id
       join branch.reservation_policy p on p.id = e.policy_id
       where e.reservation_id = $1
       order by e.seq desc`,
      [reservationId],
    );
    return result.rows;
  }

  async latestReassignEvent(client: PoolClient, reservationId: string) {
    const result = await client.query<{
      toTerminalId: string;
      fromTerminalId: string;
      actorUserId: string | null;
      overrideId: string | null;
      reasonCode: string | null;
      reasonText: string;
    }>(
      `select to_terminal_id as "toTerminalId", from_terminal_id as "fromTerminalId",
              actor_user_id as "actorUserId", override_id as "overrideId",
              reason_code as "reasonCode", reason_text as "reasonText"
       from branch.stock_reservation_event
       where reservation_id = $1 and event_type = 'REASSIGNED'
       order by seq desc limit 1`,
      [reservationId],
    );
    return result.rows[0] ?? null;
  }

  async updateReservation(client: PoolClient, id: string, versionNo: number, sets: string[], values: unknown[]) {
    const params = [id, versionNo, ...values];
    const assignments = sets.map((sql, index) => sql.replace("?", `$${index + 3}`));
    assignments.push(`version_no = version_no + 1`);
    const result = await client.query(
      `update branch.stock_reservation set ${assignments.join(", ")}
       where id = $1 and version_no = $2
       returning id`,
      params,
    );
    if ((result.rowCount ?? 0) === 0) {
      const exists = await client.query(`select version_no from branch.stock_reservation where id = $1`, [id]);
      if (!exists.rows[0]) throw new MdmError("NOT_FOUND", "Reservation was not found", 404);
      throw new MdmError("STALE_VERSION", "The reservation was updated by someone else", 409, "versionNo");
    }
  }

  async listPositions(filters: { terminalId?: string | null; materialId?: string | null; dateFrom?: string | null; dateTo?: string | null }) {
    const values: unknown[] = [];
    const where: string[] = [];
    if (filters.terminalId) {
      values.push(filters.terminalId);
      where.push(`pos.terminal_id = $${values.length}`);
    }
    if (filters.materialId) {
      values.push(filters.materialId);
      where.push(`pos.material_id = $${values.length}`);
    }
    if (filters.dateFrom) {
      values.push(filters.dateFrom);
      where.push(`pos.availability_date >= $${values.length}::date`);
    }
    if (filters.dateTo) {
      values.push(filters.dateTo);
      where.push(`pos.availability_date <= $${values.length}::date`);
    }
    const result = await this.pool.query(
      `select pos.terminal_id as "terminalId", sp.code as "terminalCode", sp.name as "terminalName",
              pos.material_id as "materialId", m.code as "materialCode",
              pos.availability_date::text as "availabilityDate",
              pos.declared_qty::float8 as "declaredQty",
              pos.committed_qty::float8 as "committedQty",
              pos.consumed_qty::float8 as "consumedQty",
              pos.available_qty::float8 as "availableQty",
              u.code as "uomCode",
              pos.reservation_count as "reservationCount",
              pos.rebuilt_at as "rebuiltAt"
       from branch.terminal_stock_position pos
       join branch.shipping_point sp on sp.id = pos.terminal_id
       join branch.material m on m.id = pos.material_id
       join branch.uom u on u.id = pos.uom_id
       ${where.length ? `where ${where.join(" and ")}` : ""}
       order by pos.availability_date, sp.code, m.code`,
      values,
    );
    return result.rows;
  }

  async findDeclarationByKey(key: string) {
    const result = await this.pool.query<{ id: string }>(
      `select id from branch.terminal_stock_declaration where idempotency_key = $1`,
      [key],
    );
    return result.rows[0]?.id ?? null;
  }

  async currentDeclaration(client: PoolClient, terminalId: string, materialId: string, availabilityDate: string) {
    const result = await client.query<{ id: string; revisionNo: number; declaredQty: number; uomId: string }>(
      `select id, revision_no as "revisionNo", declared_qty::float8 as "declaredQty", declared_qty_uom_id as "uomId"
       from branch.terminal_stock_declaration
       where terminal_id = $1 and material_id = $2 and availability_date = $3::date and is_current
       for update`,
      [terminalId, materialId, availabilityDate],
    );
    return result.rows[0] ?? null;
  }

  async supersedeDeclaration(client: PoolClient, id: string) {
    const result = await client.query(
      `update branch.terminal_stock_declaration set is_current = false where id = $1 and is_current = true`,
      [id],
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new MdmError("CONFLICT", "The current declaration could not be superseded", 409);
    }
  }

  async insertDeclaration(
    client: PoolClient,
    row: {
      terminalId: string;
      materialId: string;
      availabilityDate: string;
      declaredQty: number;
      uomId: string;
      revisionNo: number;
      supersedesId: string | null;
      note: string | null;
      declaredBy: string;
      idempotencyKey: string;
    },
  ) {
    const id = await allocateGindexId(client, BRANCH_INDEX.STOCK_DECLARATION);
    await client.query(
      `insert into branch.terminal_stock_declaration (
         id, terminal_id, material_id, availability_date, declared_qty, declared_qty_uom_id,
         revision_no, supersedes_id, is_current, source, note, declared_by, idempotency_key
       ) values ($1,$2,$3,$4::date,$5,$6,$7,$8,true,'OPERATOR',$9,$10,$11)`,
      [
        id,
        row.terminalId,
        row.materialId,
        row.availabilityDate,
        row.declaredQty,
        row.uomId,
        row.revisionNo,
        row.supersedesId,
        row.note,
        row.declaredBy,
        row.idempotencyKey,
      ],
    );
    return id;
  }

  async listDeclarations(filters: { terminalId?: string | null; materialId?: string | null; dateFrom?: string | null; dateTo?: string | null }) {
    const values: unknown[] = [];
    const where: string[] = [];
    if (filters.terminalId) {
      values.push(filters.terminalId);
      where.push(`d.terminal_id = $${values.length}`);
    }
    if (filters.materialId) {
      values.push(filters.materialId);
      where.push(`d.material_id = $${values.length}`);
    }
    if (filters.dateFrom) {
      values.push(filters.dateFrom);
      where.push(`d.availability_date >= $${values.length}::date`);
    }
    if (filters.dateTo) {
      values.push(filters.dateTo);
      where.push(`d.availability_date <= $${values.length}::date`);
    }
    const result = await this.pool.query(
      `select d.id, d.revision_no as "revisionNo", d.is_current as "isCurrent",
              sp.code as "terminalCode", m.code as "materialCode",
              d.availability_date::text as "availabilityDate",
              d.declared_qty::float8 as "declaredQty", u.code as "uomCode",
              d.note, d.declared_by as "declaredBy", d.declared_at as "declaredAt", d.source
       from branch.terminal_stock_declaration d
       join branch.shipping_point sp on sp.id = d.terminal_id
       join branch.material m on m.id = d.material_id
       join branch.uom u on u.id = d.declared_qty_uom_id
       ${where.length ? `where ${where.join(" and ")}` : ""}
       order by d.availability_date desc, d.revision_no desc`,
      values,
    );
    return result.rows;
  }

  async loadForSweep(client: PoolClient, now: Date) {
    const result = await client.query(
      `select r.id, r.expires_at as "expiresAt", r.expiry_warned_at as "expiryWarnedAt",
              r.status, r.reserve_date::text as "reserveDate", r.terminal_id as "terminalId",
              r.version_no as "versionNo",
              sp.code as "terminalCode", sp.opening_hours as "openingHours", sp.lead_dispatcher as "leadDispatcher",
              coalesce(link.route_status, 'CONFIRMED') as "routeStatus",
              link.confirmed_by as "confirmedBy",
              p.warning_lead_hours as "warningLeadHours",
              p.release_at_terminal_close as "releaseAtTerminalClose",
              p.id as "policyId"
       from branch.stock_reservation r
       join branch.reservation_policy p on p.id = r.policy_id
       join branch.shipping_point sp on sp.id = r.terminal_id
       left join branch.reservation_trip_link link on link.route_id = r.route_id and link.trip_no = r.trip_no
       where r.status in ('ACTIVE', 'EXPIRING')
         and r.expires_at <= $1::timestamptz + make_interval(hours => p.warning_lead_hours)`,
      [now.toISOString()],
    );
    return result.rows as Array<{
      id: string;
      expiresAt: Date;
      expiryWarnedAt: Date | null;
      status: string;
      reserveDate: string;
      terminalId: string;
      versionNo: number;
      terminalCode: string;
      openingHours: string | null;
      leadDispatcher: string | null;
      routeStatus: string;
      confirmedBy: string | null;
      warningLeadHours: number;
      releaseAtTerminalClose: boolean;
      policyId: string;
    }>;
  }

  async consumedEvents(client: PoolClient) {
    const result = await client.query<{ reservationId: string; qtyAfter: number; uomId: string }>(
      `select reservation_id as "reservationId", qty_after::float8 as "qtyAfter", uom_id as "uomId"
       from branch.stock_reservation_event
       where event_type = 'CONSUMED' and qty_after is not null`,
    );
    return result.rows;
  }

  async liveReservationsForPosition(client: PoolClient) {
    const result = await client.query<{
      id: string;
      terminalId: string;
      materialId: string;
      reserveDate: string;
      reservedQty: number;
      uomId: string;
      status: string;
    }>(
      `select id, terminal_id as "terminalId", material_id as "materialId", reserve_date::text as "reserveDate",
              reserved_qty::float8 as "reservedQty", reserved_qty_uom_id as "uomId", status
       from branch.stock_reservation
       where status in ('ACTIVE', 'EXPIRING', 'PENDING_COUNTERSIGN', 'CONSUMED')`,
    );
    return result.rows;
  }

  async currentDeclarations() {
    const result = await this.pool.query<{
      terminalId: string;
      materialId: string;
      availabilityDate: string;
      declaredQty: number;
      uomId: string;
    }>(
      `select terminal_id as "terminalId", material_id as "materialId", availability_date::text as "availabilityDate",
              declared_qty::float8 as "declaredQty", declared_qty_uom_id as "uomId"
       from branch.terminal_stock_declaration
       where is_current`,
    );
    return result.rows;
  }

  async replacePositions(
    client: PoolClient,
    rows: Array<{
      terminalId: string;
      materialId: string;
      availabilityDate: string;
      declaredQty: number | null;
      committedQty: number;
      consumedQty: number;
      uomId: string;
      reservationCount: number;
    }>,
  ) {
    await client.query(`delete from branch.terminal_stock_position`);
    for (const row of rows) {
      await client.query(
        `insert into branch.terminal_stock_position (
           terminal_id, material_id, availability_date, declared_qty, committed_qty, consumed_qty,
           uom_id, reservation_count, rebuilt_at
         ) values ($1,$2,$3::date,$4,$5,$6,$7,$8, now())`,
        [
          row.terminalId,
          row.materialId,
          row.availabilityDate,
          row.declaredQty,
          row.committedQty,
          row.consumedQty,
          row.uomId,
          row.reservationCount,
        ],
      );
    }
  }

  async allocateOverrideId(client: PoolClient) {
    return allocateGindexId(client, BRANCH_INDEX.RESERVATION_OVERRIDE);
  }
}

export type ReservationFilters = {
  q?: string | null;
  status?: string[];
  outcome?: string | null;
  terminalId?: string | null;
  materialId?: string | null;
  reserveDate?: string | null;
  reserveDateFrom?: string | null;
  reserveDateTo?: string | null;
  routeId?: string | null;
  orderId?: string | null;
  divisionId?: string | null;
  expiringBefore?: string | null;
  tripId?: string | null;
  page: number;
  pageSize: number;
};

const RESERVATION_SELECT = `
  r.id, r.reservation_no as "reservationNo", r.order_id as "orderId", o.order_no as "orderNo",
  o.customer_name as "customerName", o.customer_code as "customerCode",
  r.route_id as "routeId", r.route_stop_id as "routeStopId", r.trip_no as "tripNo",
  r.plan_id as "planId", r.plan_kind as "planKind",
  link.trip_id as "tripId", coalesce(link.route_status, 'CONFIRMED') as "routeStatus",
  link.planned_departure as "plannedDeparture", link.confirmed_by as "confirmedBy",
  r.terminal_id as "terminalId", sp.code as "terminalCode", sp.name as "terminalName",
  sp.products_stocked as "terminalProducts", sp.opening_hours as "openingHours",
  sp.permit_expiry::text as "terminalPesoValidTo", sp.lead_dispatcher as "leadDispatcher",
  r.derived_terminal_id as "derivedTerminalId", derived.code as "derivedTerminalCode", derived.name as "derivedTerminalName",
  r.terminal_source as "terminalSource",
  r.material_id as "materialId", m.code as "materialCode", m.name as "materialName",
  r.reserve_date::text as "reserveDate",
  r.reserved_qty::float8 as "reservedQty", u.code as "reservedQtyUom", r.reserved_qty_uom_id as "reservedQtyUomId",
  o.requested_qty::float8 as "requestedQty", o.qualified_qty::float8 as "qualifiedQty",
  r.commitment_outcome as "commitmentOutcome", r.status,
  r.reason_code as "reasonCode", r.reason_text as "reasonText",
  r.expires_at as "expiresAt", r.expiry_warned_at as "expiryWarnedAt",
  r.expiry_extended_count as "expiryExtendedCount",
  r.released_at as "releasedAt", r.released_by as "releasedBy", r.consumed_at as "consumedAt",
  r.override_id as "overrideId", r.override_by as "overrideBy",
  r.policy_id as "policyId", p.version_no as "policyVersionNo",
  p.warning_lead_hours as "warningLeadHours", p.max_expiry_extensions as "maxExpiryExtensions",
  p.release_at_terminal_close as "releaseAtTerminalClose",
  pos.declared_qty::float8 as "declaredQty", pos.committed_qty::float8 as "committedQty",
  pos.available_qty::float8 as "availableQty",
  r.version_no as "versionNo"
`;
