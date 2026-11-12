import { MdmError } from "../errors/mdm-error";
import type { QualificationRepository } from "../repositories/qualification.repository";
import { evaluate, isInScope, runOutDays } from "./qualification-engine";
import type { GateResult, ManualDecisionInput } from "./qualification-types";
import { indexgenerater } from "./indexgenerater";

export class QualificationService {
  constructor(
    private readonly repo: QualificationRepository,
    private readonly index: indexgenerater,
  ) {}

  async listOrders(query: URLSearchParams) {
    const page = Math.max(1, Number(query.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.get("pageSize") ?? 20) || 20));
    const outcomes = query.getAll("outcome").filter(Boolean);
    const result = await this.repo.listQueue({
      q: query.get("q")?.trim() ?? "",
      outcomes,
      mode: query.get("mode")?.trim() || null,
      page,
      pageSize,
    });
    return { items: result.rows, total: result.total, page, counts: result.counts };
  }

  async getOrder(id: string) {
    const row = await this.repo.findOrder(id);
    if (!row) throw new MdmError("NOT_FOUND", "Order was not found", 404);
    const policy = await this.repo.currentPolicy();
    let snapshot = null;
    if (row.storageTankId) {
      const map = await this.repo.snapshotsForTanks([row.storageTankId as string]);
      snapshot = map.get(row.storageTankId as string) ?? null;
    }
    const drawRates = await this.repo.drawRateMap();
    const materialCode = String(row.materialCode ?? "").toUpperCase();
    const rate = drawRates.get(materialCode) ?? drawRates.get("__DEFAULT__") ?? 0.12;
    const runOut = runOutDays(snapshot, rate);
    const age = snapshot?.readingAgeHours ?? null;
    const isStale = age !== null && age > policy.stalenessThresholdHours;
    const canEvaluate =
      Boolean(row.isPacked) ||
      (snapshot != null && snapshot.readingSource !== "NONE" && !isStale);
    return {
      ...row,
      readingSource: snapshot?.readingSource ?? null,
      readingAgeHours: age,
      isStale,
      canEvaluate,
      runOutDays: runOut.runOutDays,
      riskBand: runOut.riskBand,
      tankSnapshot: snapshot,
      policy: { id: policy.id, stalenessThresholdHours: policy.stalenessThresholdHours },
    };
  }

  async listDecisions(orderId: string) {
    await this.getOrder(orderId);
    const decisions = await this.repo.listDecisions(orderId);
    return {
      decisions: decisions.map((d) => ({
        id: d.id,
        orderId: d.orderId,
        runId: d.runId,
        decisionSource: d.decisionSource,
        outcome: d.outcome,
        gateReached: d.gateReached,
        failedGate: d.failedGate,
        reasonCode: d.reasonCode,
        reasonText: d.reasonText,
        inputs: {
          usableCapacity: d.inputUsableCapacity,
          targetFillPct: d.inputTargetFillPct,
          levelPct: d.inputLevelPct,
          deadStock: d.inputDeadStock,
          readingSource: d.inputReadingSource,
          readingAgeHours: d.inputReadingAgeHours,
          requestedQty: d.inputRequestedQty,
          uom: d.uomId,
        },
        computed: {
          ullage: d.computedUllage,
          runOutDays: d.computedRunOutDays,
          riskBand: d.computedRiskBand,
        },
        stalenessThresholdHours: d.stalenessThresholdHours,
        policyId: d.policyId,
        qualifiedQty: d.qualifiedQty,
        decidedAt: d.decidedAt,
        decidedBy: d.decidedBy,
        override: d.overrideId
          ? { id: d.overrideId, grounds: d.grounds, reference: d.reference }
          : null,
      })),
    };
  }

  async evaluateOne(orderId: string, actor: string) {
    const policy = await this.repo.currentPolicy();
    return this.repo.withTransaction(async (client) => {
      const order = await this.repo.lockOrder(client, orderId);
      if (!isInScope({ qualOutcome: String(order.qualOutcome), qualMode: order.qualMode as string | null })) {
        throw new MdmError("ALREADY_DECIDED", "Order is out of engine scope (manual or already decided)", 409);
      }
      const runId = await this.repo.createRun(client, "API", actor, policy.id, { orderId });
      const applied = await this.evaluateAndApply(client, order, policy, runId, actor);
      await this.repo.closeRun(client, runId, {
        scanned: 1,
        skipped: 0,
        qualified: applied.result.outcome === "QUALIFIED" ? 1 : 0,
        flagged: applied.result.outcome === "FLAGGED" ? 1 : 0,
        cannotEvaluate: applied.result.outcome === "CANNOT_EVALUATE" ? 1 : 0,
        auditEvents: applied.auditWritten ? 1 : 0,
        errors: 0,
        status: "COMPLETED",
      });
      return applied.decision;
    });
  }

  async runEngine(actor: string, scope: { dueBefore?: string | null; divisionId?: string | null } = {}) {
    const policy = await this.repo.currentPolicy();
    const existing = await this.repo.listRuns(1, 5);
    if (existing.rows.some((r) => r.status === "RUNNING")) {
      throw new MdmError("RUN_IN_PROGRESS", "A qualification run is already in progress", 409);
    }

    const { ids, skippedCount } = await this.repo.scopeOrderIds(scope.dueBefore ?? null, scope.divisionId ?? null);
    const started = await this.repo.withTransaction(async (client) => {
      const locked = await this.repo.tryRunLock(client);
      if (!locked) throw new MdmError("RUN_IN_PROGRESS", "A qualification run is already in progress", 409);
      try {
        return await this.repo.createRun(client, "ON_DEMAND", actor, policy.id, scope);
      } finally {
        await this.repo.releaseRunLock(client);
      }
    });

    const counters = {
      scanned: 0,
      skipped: skippedCount,
      qualified: 0,
      flagged: 0,
      cannotEvaluate: 0,
      auditEvents: 0,
      errors: 0,
    };
    const drawRates = await this.repo.drawRateMap();

    for (const orderId of ids) {
      try {
        await this.repo.withTransaction(async (client) => {
          const order = await this.repo.lockOrder(client, orderId);
          if (!isInScope({ qualOutcome: String(order.qualOutcome), qualMode: order.qualMode as string | null })) {
            counters.skipped += 1;
            return;
          }
          counters.scanned += 1;
          const applied = await this.evaluateAndApply(client, order, policy, started, "engine", drawRates);
          if (applied.result.outcome === "QUALIFIED") counters.qualified += 1;
          if (applied.result.outcome === "FLAGGED") counters.flagged += 1;
          if (applied.result.outcome === "CANNOT_EVALUATE") counters.cannotEvaluate += 1;
          if (applied.auditWritten) counters.auditEvents += 1;
        });
      } catch {
        counters.errors += 1;
      }
    }

    await this.repo.withTransaction(async (client) => {
      await this.repo.closeRun(client, started, { ...counters, status: "COMPLETED" });
    });

    return {
      runId: started,
      scanned: counters.scanned,
      skipped: counters.skipped,
      qualified: counters.qualified,
      flagged: counters.flagged,
      cannotEvaluate: counters.cannotEvaluate,
      auditEventsWritten: counters.auditEvents,
      errors: counters.errors,
    };
  }

  async manualDecision(orderId: string, input: ManualDecisionInput, actor: string) {
    if (input.grounds.trim().length < 8) {
      throw new MdmError("GROUNDS_TOO_SHORT", "grounds must be at least 8 characters", 400, "grounds");
    }
    if (input.reference.trim().length < 3) {
      throw new MdmError("REFERENCE_REQUIRED", "reference must be at least 3 characters", 400, "reference");
    }
    const code = await this.repo.findReasonCode(input.reasonCode);
    if (!code || !code.isActive) {
      throw new MdmError("VALIDATION", "reasonCode was not found", 400, "reasonCode");
    }
    if (input.outcome === "QUALIFIED" && code.appliesTo !== "PLANNER_QUALIFY") {
      throw new MdmError("REASON_CODE_NOT_APPLICABLE", "reasonCode does not apply to qualify", 400, "reasonCode");
    }
    if (input.outcome === "REJECTED" && code.appliesTo !== "PLANNER_REJECT") {
      throw new MdmError("REASON_CODE_NOT_APPLICABLE", "reasonCode does not apply to reject", 400, "reasonCode");
    }
    if (input.outcome === "REJECTED" && input.qualifiedQty != null) {
      throw new MdmError("QTY_ON_REJECTION", "qualifiedQty must be null when rejecting", 400, "qualifiedQty");
    }
    if (input.outcome === "QUALIFIED" && (input.qualifiedQty == null || !(input.qualifiedQty > 0))) {
      throw new MdmError("VALIDATION", "qualifiedQty is required when qualifying", 400, "qualifiedQty");
    }

    const policy = await this.repo.currentPolicy();
    const overrideId = await this.nextOverrideId();

    return this.repo.withTransaction(async (client) => {
      const order = await this.repo.lockOrder(client, orderId);
      if (Number(order.versionNo) !== input.versionNo) {
        throw new MdmError("STALE_VERSION", "record changed by another user", 409);
      }
      if (String(order.qualOutcome) === "REJECTED") {
        throw new MdmError("ALREADY_DECIDED", "Rejected orders cannot be re-decided here", 409);
      }

      const result = {
        outcome: input.outcome,
        gateReached: 3,
        failedGate: input.outcome === "REJECTED" ? 3 : null,
        reasonCode: input.reasonCode,
        reasonText: input.grounds.trim(),
        ullage: null as number | null,
        qualifiedQty: input.outcome === "QUALIFIED" ? input.qualifiedQty : null,
        inputs: {
          usableCapacity: null,
          targetFillPct: null,
          levelPct: null,
          deadStock: null,
          readingSource: null,
          readingAgeHours: null,
          requestedQty: Number(order.requestedQty),
        },
      };

      const decision = await this.repo.insertDecision(client, {
        orderId,
        runId: null,
        source: "PLANNER",
        result,
        runOutDays: null,
        riskBand: null,
        uomId: String(order.requestedQtyUomId),
        policyId: policy.id,
        stalenessHours: policy.stalenessThresholdHours,
        actor,
        overrideId,
        grounds: input.grounds.trim(),
        reference: input.reference.trim(),
        auditEventWritten: true,
      });

      await this.repo.applyOutcome(client, orderId, {
        outcome: input.outcome,
        mode: "MANUAL",
        reasonCode: input.reasonCode,
        reasonText: input.grounds.trim(),
        qualifiedQty: result.qualifiedQty,
        qualifiedQtyUomId: result.qualifiedQty != null ? String(order.requestedQtyUomId) : null,
        ullage: null,
        ullageUomId: null,
        decisionId: decision.id,
        runId: null,
        overrideId,
        actor,
      });

      await this.repo.auditOrder(
        client,
        orderId,
        input.outcome === "QUALIFIED" ? "MANUAL_QUALIFY" : "MANUAL_REJECT",
        actor,
        input.grounds.trim(),
        { overrideId, reference: input.reference.trim(), reasonCode: input.reasonCode },
      );

      return {
        id: decision.id,
        orderId,
        outcome: input.outcome,
        qualMode: "MANUAL",
        overrideId,
        decidedAt: decision.decidedAt,
        qualifiedQty: result.qualifiedQty,
      };
    });
  }

  async amendQuantity(
    orderId: string,
    body: { qualifiedQty: number; reason: string; versionNo: number },
    actor: string,
  ) {
    if (!(body.qualifiedQty > 0)) {
      throw new MdmError("VALIDATION", "qualifiedQty must be > 0", 400, "qualifiedQty");
    }
    if (!body.reason.trim()) throw new MdmError("VALIDATION", "reason is required", 400, "reason");

    return this.repo.withTransaction(async (client) => {
      const order = await this.repo.lockOrder(client, orderId);
      if (Number(order.versionNo) !== body.versionNo) {
        throw new MdmError("STALE_VERSION", "record changed by another user", 409);
      }
      if (String(order.qualOutcome) !== "QUALIFIED") {
        throw new MdmError("CONFLICT", "Only QUALIFIED orders can amend quantity here", 409);
      }
      const before = order.qualifiedQty ?? order.requestedQty;
      await client.query(
        `update branch.delivery_order set
           qualified_qty=$2, version_no=version_no+1, updated_at=now(), updated_by=$3
         where id=$1`,
        [orderId, body.qualifiedQty, actor],
      );
      await this.repo.auditOrder(client, orderId, "ORDER_QTY_AMENDED", actor, body.reason.trim(), {
        before,
        after: body.qualifiedQty,
      });
      return this.repo.findOrder(orderId);
    });
  }

  async pool(query: URLSearchParams) {
    const items = await this.repo.qualifiedPool(query.get("divisionId"), query.get("dueBefore"));
    return { asOf: new Date().toISOString(), items, total: items.length };
  }

  async policy() {
    return this.repo.currentPolicy();
  }

  async reasonCodes(appliesTo: string | null) {
    return { items: await this.repo.listReasonCodes(appliesTo) };
  }

  async listRuns(query: URLSearchParams) {
    const page = Math.max(1, Number(query.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.get("pageSize") ?? 20) || 20));
    const result = await this.repo.listRuns(page, pageSize);
    return { items: result.rows, total: result.total, page };
  }

  async getRun(id: string) {
    const run = await this.repo.findRun(id);
    if (!run) throw new MdmError("NOT_FOUND", "Run was not found", 404);
    return { run, decisions: await this.repo.decisionsForRun(id) };
  }

  async upsertReading(
    tankId: string,
    body: Record<string, unknown>,
    actor: string,
  ) {
    const tank = await this.repo.tankSafeFillAndUom(tankId);
    if (!tank) throw new MdmError("NOT_FOUND", "Storage tank was not found", 404);
    const usableCapacity =
      typeof body.usableCapacity === "number" ? body.usableCapacity : Number(tank.safeFillL);
    const targetFillPct = Number(body.targetFillPct);
    const levelPct = Number(body.levelPct);
    const deadStock = body.deadStock == null ? 0 : Number(body.deadStock);
    const readingSource = String(body.readingSource ?? "MANUAL");
    if (!["TEL", "MANUAL", "NONE"].includes(readingSource)) {
      throw new MdmError("VALIDATION", "readingSource is invalid", 400, "readingSource");
    }
    if (!(targetFillPct >= 0 && targetFillPct <= 1) || !(levelPct >= 0 && levelPct <= 1)) {
      throw new MdmError("VALIDATION", "targetFillPct and levelPct must be fractions 0..1", 400);
    }
    const uomId = typeof body.uomId === "string" ? body.uomId : String(tank.capacityUomId ?? "");
    if (!uomId) throw new MdmError("VALIDATION", "uomId is required", 400, "uomId");
    await this.repo.upsertTankReading(
      tankId,
      {
        usableCapacity,
        targetFillPct,
        levelPct,
        deadStock,
        readingSource,
        levelAsOf: typeof body.levelAsOf === "string" ? body.levelAsOf : null,
        uomId,
      },
      actor,
    );
    const map = await this.repo.snapshotsForTanks([tankId]);
    return map.get(tankId);
  }

  private async evaluateAndApply(
    client: import("pg").PoolClient,
    order: Record<string, unknown>,
    policy: Awaited<ReturnType<QualificationRepository["currentPolicy"]>>,
    runId: string,
    actor: string,
    drawRates?: Map<string, number>,
  ) {
    const rates = drawRates ?? (await this.repo.drawRateMap());
    const tankId = order.storageTankId as string | null;
    const snapshots = tankId ? await this.repo.snapshotsForTanks([tankId]) : new Map();
    const snapshot = tankId ? snapshots.get(tankId) ?? null : null;

    // Same UOM assumed for smoke/dev (D-11 conversion deferred when MaterialUomConversion not available)
    const requestedInTankUom = Number(order.requestedQty);
    const evaluable = {
      id: String(order.id),
      isPacked: Boolean(order.isPacked),
      requestedQty: Number(order.requestedQty),
      requestedQtyUomId: String(order.requestedQtyUomId),
      storageTankId: tankId,
      qualOutcome: String(order.qualOutcome),
      qualMode: (order.qualMode as string | null) ?? null,
    };
    const result = evaluate(evaluable, snapshot, policy, requestedInTankUom);

    const fullOrder = await this.repo.findOrder(String(order.id));
    const materialCode = String(fullOrder?.materialCode ?? "").toUpperCase();
    const rate = rates.get(materialCode) ?? rates.get("__DEFAULT__") ?? 0.12;
    const runOut = runOutDays(snapshot, rate);

    const auditWritten = await this.shouldWriteAudit(String(order.id), result, String(order.qualOutcome));

    const decision = await this.repo.insertDecision(client, {
      orderId: String(order.id),
      runId,
      source: "ENGINE",
      result,
      runOutDays: runOut.runOutDays,
      riskBand: runOut.riskBand,
      uomId: snapshot?.uomId ?? String(order.requestedQtyUomId),
      policyId: policy.id,
      stalenessHours: policy.stalenessThresholdHours,
      actor: null,
      overrideId: null,
      grounds: null,
      reference: null,
      auditEventWritten: auditWritten,
    });

    const mode = result.outcome === "QUALIFIED" ? "AUTO" : null;
    await this.repo.applyOutcome(client, String(order.id), {
      outcome: result.outcome,
      mode,
      reasonCode: result.reasonCode,
      reasonText: result.reasonText,
      qualifiedQty: result.qualifiedQty,
      qualifiedQtyUomId: result.qualifiedQty != null ? String(order.requestedQtyUomId) : null,
      ullage: result.ullage,
      ullageUomId: result.ullage != null ? snapshot?.uomId ?? String(order.requestedQtyUomId) : null,
      decisionId: decision.id,
      runId,
      overrideId: null,
      actor: null,
    });

    if (auditWritten) {
      await this.repo.auditOrder(client, String(order.id), result.outcome, actor === "engine" ? null : actor, result.reasonText, {
        decisionId: decision.id,
        runId,
        reasonCode: result.reasonCode,
      });
    }

    return {
      result,
      auditWritten,
      decision: {
        id: decision.id,
        orderId: String(order.id),
        runId,
        outcome: result.outcome,
        gateReached: result.gateReached,
        failedGate: result.failedGate,
        reasonCode: result.reasonCode,
        reasonText: result.reasonText,
        ullage: result.ullage,
        qualifiedQty: result.qualifiedQty,
        runOutDays: runOut.runOutDays,
        riskBand: runOut.riskBand,
        decidedAt: decision.decidedAt,
      },
    };
  }

  private async shouldWriteAudit(orderId: string, result: GateResult, previousOutcome: string) {
    if (result.outcome === "QUALIFIED") return true;
    if (result.outcome === "FLAGGED") {
      const prev = await this.repo.lastFlaggedDecision(orderId);
      const newlyFlagged = previousOutcome !== "FLAGGED";
      if (!prev || newlyFlagged) return true;
      return prev.reasonText !== result.reasonText;
    }
    if (result.outcome === "CANNOT_EVALUATE") {
      const prev = await this.repo.lastCannotEvaluateDecision(orderId);
      const newly = previousOutcome !== "CANNOT_EVALUATE";
      if (!prev || newly) return true;
      return prev.reasonText !== result.reasonText;
    }
    return false;
  }

  private async nextOverrideId() {
    const id = await this.index.getGindexMst("QOVR");
    await this.index.updateGindexMst("QOVR");
    return id;
  }
}
