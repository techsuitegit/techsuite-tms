import { MdmError } from "../errors/mdm-error";
import type { RankingRepository } from "../repositories/ranking.repository";
import type { QualificationRepository } from "../repositories/qualification.repository";
import { runOutDays } from "./qualification-engine";
import type { TankReadingSnapshot } from "./qualification-types";
import { indexgenerater } from "./indexgenerater";
import {
  carryForwardPlannerOverrides,
  moveToPosition,
  orderScored,
  score,
  zeroAtDays,
} from "./ranking-scoring";
import type {
  DeliveryMode,
  RankingInput,
  RankingTrigger,
  ReorderInput,
  ScoredOrder,
  WeightSet,
} from "./ranking-types";

export class RankingService {
  constructor(
    private readonly repo: RankingRepository,
    private readonly qualRepo: QualificationRepository,
    private readonly index: indexgenerater,
  ) {}

  async queue(query: URLSearchParams) {
    const divisionId = query.get("divisionId")?.trim() || null;
    const run = await this.repo.latestCompletedRun(divisionId);
    if (!run) {
      return {
        items: [],
        total: 0,
        run: null,
        kpis: emptyKpis(),
      };
    }
    let items = await this.repo.scoresForRun(run.id as string);
    const riskBand = query.get("riskBand")?.trim();
    const mode = query.get("mode")?.trim();
    const materialId = query.get("materialId")?.trim();
    const dueBefore = query.get("dueBefore")?.trim();
    if (riskBand) items = items.filter((r) => r.riskBand === riskBand);
    if (mode) items = items.filter((r) => r.mode === mode || r.inputMode === mode);
    if (materialId) items = items.filter((r) => r.materialId === materialId);
    if (dueBefore) items = items.filter((r) => String(r.dueDate) <= dueBefore);

    const page = Math.max(1, Number(query.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.get("pageSize") ?? 50) || 50));
    const total = items.length;
    const slice = items.slice((page - 1) * pageSize, page * pageSize);

    return {
      items: slice.map(mapScoreRow),
      total,
      page,
      pageSize,
      run: mapRun(run),
      kpis: {
        poolSize: run.poolSize,
        totalDemand: run.totalDemand,
        totalDemandUomCode: run.totalDemandUomCode,
        excludedFlagged: run.excludedFlagged,
        excludedCannotEvaluate: run.excludedCannotEvaluate,
        fallbackClassUsed: run.fallbackClassUsed,
        fleetCapacityIndicator: null,
      },
    };
  }

  async run(
    actor: string,
    opts: {
      trigger?: RankingTrigger;
      divisionId?: string | null;
      dueBefore?: string | null;
      orderingStrategyOverride?: "ADDITIVE" | "BAND_THEN_SCORE" | null;
    } = {},
  ) {
    const divisionId = opts.divisionId ?? null;
    const dueBefore = opts.dueBefore ?? null;
    const trigger: RankingTrigger = opts.trigger ?? "ON_DEMAND";

    const outcome = await this.repo.withTransaction(async (client) => {
      const locked = await this.repo.tryRunLock(client);
      if (!locked) throw new MdmError("RUN_IN_PROGRESS", "A ranking run is already in progress", 409);

      try {
        const ws = await this.repo.resolveWeightSet(divisionId, null);
        if (!ws) {
          throw new MdmError("NO_PUBLISHED_WEIGHT_SET", "No published ranking weight set", 409);
        }
        const effectiveWs: WeightSet = opts.orderingStrategyOverride
          ? { ...ws, orderingStrategy: opts.orderingStrategyOverride }
          : ws;

        const classes = await this.repo.classCatalogue();
        const pool = await this.repo.qualifiedPool(divisionId, dueBefore);
        const excluded = await this.repo.excludedCounts(divisionId, dueBefore);

        const tankIds = [
          ...new Set(pool.map((o) => o.storageTankId).filter((id): id is string => Boolean(id))),
        ];
        const snaps = await this.qualRepo.snapshotsForTanks(tankIds);
        const drawRates = await this.qualRepo.drawRateMap();

        const runId = await this.repo.createRun(client, {
          trigger,
          actor,
          weightSetId: effectiveWs.id,
          weightSetVersionNo: effectiveWs.versionNo,
          orderingStrategy: effectiveWs.orderingStrategy,
          divisionId,
          scope: { divisionId, dueBefore },
        });

        const unmatchedSegments = new Set<string>();
        let fallbackClassUsed = 0;

        const scored: ScoredOrder[] = pool.map((o) => {
          const input = this.buildInput(o, snaps, drawRates);
          const breakdown = score(input, effectiveWs, classes);
          if (breakdown.classSource === "SEGMENT_FALLBACK") {
            fallbackClassUsed += 1;
            const seg = (input.customerSegment ?? "").trim();
            if (seg && !seg.toLowerCase().startsWith("retail") && !seg.toLowerCase().startsWith("port")) {
              unmatchedSegments.add(seg);
            }
          }
          return {
            input,
            breakdown,
            rankPosition: 0,
            rankSource: "ENGINE" as const,
            overrideId: null,
            grounds: null,
            reference: null,
          };
        });

        let ranked = orderScored(scored, effectiveWs);

        const pinned = new Map<string, { position: number; overrideId: string }>();
        for (const o of pool) {
          if (o.rankOverrideId && o.rankPosition != null && o.rankPosition > 0) {
            pinned.set(o.id, { position: o.rankPosition, overrideId: o.rankOverrideId });
          }
        }
        ranked = carryForwardPlannerOverrides(ranked, pinned);

        // Demand KPI: sum normalised qty in dominant UOM (size component target or KL)
        const demandUom =
          effectiveWs.components.find((c) => c.componentCode === "DROP_SIZE")?.sizeUomCode ?? "KL";
        let totalDemand = 0;
        for (const row of ranked) {
          if (row.breakdown.normalisedQtyUomCode === demandUom) {
            totalDemand += row.breakdown.normalisedQty;
          } else if (!row.input.isPacked) {
            totalDemand += row.breakdown.normalisedQty;
          }
        }

        await this.repo.insertScores(client, runId, effectiveWs, ranked);
        await this.repo.applyRankPositions(client, ranked);
        await this.repo.closeRun(client, runId, {
          poolSize: ranked.length,
          excludedFlagged: excluded.flagged,
          excludedCannotEvaluate: excluded.cannotEvaluate,
          excludedOther: excluded.other,
          totalDemand,
          totalDemandUomCode: demandUom,
          fallbackClassUsed,
          status: "COMPLETED",
        });

        if (ranked.length) {
          await this.repo.writeAudit(client, ranked[0]!.input.orderId, "RANKED", actor, null, {
            runId,
            poolSize: ranked.length,
            unmatchedSegments: [...unmatchedSegments],
            fallbackClassUsed,
          });
        }

        return { runId, unmatchedSegments: [...unmatchedSegments] };
      } finally {
        await this.repo.releaseRunLock(client);
      }
    });

    const run = await this.repo.findRun(outcome.runId);
    const items = await this.repo.scoresForRun(outcome.runId);
    return {
      run: mapRun(run!),
      items: items.map(mapScoreRow),
      warnings:
        outcome.unmatchedSegments.length > 0
          ? {
              unmatchedSegments: outcome.unmatchedSegments,
              note: "I-001 class fallback used prefix test; unmatched segments scored at 6/12 of class weight",
            }
          : null,
    };
  }

  async listRuns(query: URLSearchParams) {
    const page = Math.max(1, Number(query.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.get("pageSize") ?? 20) || 20));
    const result = await this.repo.listRuns(page, pageSize);
    return { items: result.rows.map(mapRun), total: result.total, page, pageSize };
  }

  async getRun(id: string) {
    const run = await this.repo.findRun(id);
    if (!run) throw new MdmError("NOT_FOUND", "Ranking run was not found", 404);
    const items = await this.repo.scoresForRun(id);
    return { run: mapRun(run), items: items.map(mapScoreRow) };
  }

  async orderScores(orderId: string) {
    await this.repo.orderExists(orderId);
    const scores = await this.repo.scoresForOrder(orderId);
    return { scores };
  }

  async pool(query: URLSearchParams) {
    const divisionId = query.get("divisionId")?.trim() || null;
    const runIdParam = query.get("runId")?.trim() || null;
    const asOf = query.get("asOf")?.trim() || null;
    if (asOf && !/^\d{4}-\d{2}-\d{2}/.test(asOf)) {
      throw new MdmError("ASOF_INVALID", "asOf must be an ISO date", 400, "asOf");
    }

    let run = runIdParam ? await this.repo.findRun(runIdParam) : await this.repo.latestCompletedRun(divisionId);
    if (!run || run.status !== "COMPLETED") {
      return { runId: null, asOf: asOf ?? new Date().toISOString(), items: [], total: 0 };
    }
    const items = await this.repo.scoresForRun(run.id as string);
    return {
      runId: run.id,
      asOf: asOf ?? run.finishedAt ?? run.startedAt,
      items: items.map((r) => ({
        orderId: r.orderId,
        orderNo: r.orderNo,
        rankPosition: r.rankPosition,
        qualifiedQty: r.qualifiedQty,
        qtyUomId: r.qtyUomId,
        normalisedQty: r.normalisedQty,
        runOutDays: r.runOutDays,
        riskBand: r.riskBand,
        totalScore: r.totalScore,
        rankSource: r.rankSource,
        mode: r.mode,
        dueDate: r.dueDate,
        materialId: r.materialId,
        materialCode: r.materialCode,
        customerCode: r.customerCode,
      })),
      total: items.length,
    };
  }

  async reorder(runId: string, input: ReorderInput, actor: string) {
    if (!input.grounds || input.grounds.trim().length < 8) {
      throw new MdmError("GROUNDS_TOO_SHORT", "grounds must be at least 8 characters", 400, "grounds");
    }
    if (!input.reference || input.reference.trim().length < 3) {
      throw new MdmError("REFERENCE_REQUIRED", "reference must be at least 3 characters", 400, "reference");
    }
    if (!input.reasonCode?.trim()) {
      throw new MdmError("VALIDATION", "reasonCode is required", 400, "reasonCode");
    }
    if (!Number.isInteger(input.toPosition) || input.toPosition < 1) {
      throw new MdmError("VALIDATION", "toPosition must be a positive integer", 400, "toPosition");
    }

    const run = await this.repo.findRun(runId);
    if (!run) throw new MdmError("NOT_FOUND", "Ranking run was not found", 404);
    if (run.status !== "COMPLETED") throw new MdmError("VALIDATION", "Run is not completed", 400);

    const current = await this.repo.isRunCurrent(runId, (run.divisionId as string | null) ?? null);
    if (!current) throw new MdmError("RUN_NOT_CURRENT", "A newer ranking run supersedes this one", 409);

    const existing = await this.repo.scoresForRun(runId);
    if (!existing.length) throw new MdmError("VALIDATION", "Run has no scores", 400);
    if (input.toPosition > existing.length) {
      throw new MdmError("VALIDATION", `toPosition must be <= ${existing.length}`, 400, "toPosition");
    }
    const target = existing.find((r) => r.orderId === input.orderId);
    if (!target) throw new MdmError("VALIDATION", "Order is not in this run", 400, "orderId");

    const ws = await this.repo.loadWeightSetById(run.weightSetId as string);
    if (!ws) throw new MdmError("NO_PUBLISHED_WEIGHT_SET", "Weight set for run is missing", 409);

    const outcome = await this.repo.withTransaction(async (client) => {
      const overrideId = await this.index.getGindexMst("ROVR");
      await this.index.updateGindexMst("ROVR");

      const asScored: ScoredOrder[] = existing.map((r) => ({
        input: {
          orderId: r.orderId as string,
          orderNo: r.orderNo as string,
          dueDate: r.dueDate as string,
          mode: r.inputMode as DeliveryMode,
          isPacked: Boolean(r.isPacked),
          runOutDays: Number(r.runOutDays),
          riskBand: r.riskBand as RankingInput["riskBand"],
          orderValue: Number(r.orderValue),
          qualifiedQty: Number(r.qualifiedQty),
          qtyUomId: r.qtyUomId as string,
          qtyUomCode: "",
          customerClass: (r.customerClass as string | null) ?? null,
          customerSegment: (r.customerSegment as string | null) ?? null,
        },
        breakdown: {
          risk: Number(r.riskScore),
          value: Number(r.valueScore),
          size: Number(r.sizeScore),
          class: Number(r.classScore),
          window: Number(r.windowScore),
          total: Number(r.totalScore),
          classSource: r.classSource as ScoredOrder["breakdown"]["classSource"],
          normalisedQty: Number(r.normalisedQty),
          normalisedQtyUomCode: "KL",
        },
        rankPosition: Number(r.rankPosition),
        rankSource: r.rankSource as ScoredOrder["rankSource"],
        overrideId: (r.overrideId as string | null) ?? null,
        grounds: (r.grounds as string | null) ?? null,
        reference: (r.reference as string | null) ?? null,
      }));

      const fromPosition = target.rankPosition as number;
      const resequenced = moveToPosition(asScored, input.orderId, input.toPosition).map((row) => {
        if (row.input.orderId === input.orderId) {
          return {
            ...row,
            rankSource: "PLANNER" as const,
            overrideId,
            grounds: input.grounds.trim(),
            reference: input.reference.trim(),
          };
        }
        return { ...row, overrideId: row.overrideId, grounds: row.grounds, reference: row.reference };
      });

      const newRunId = await this.repo.createRun(client, {
        trigger: "API",
        actor,
        weightSetId: ws.id,
        weightSetVersionNo: ws.versionNo,
        orderingStrategy: ws.orderingStrategy,
        divisionId: (run.divisionId as string | null) ?? null,
        scope: { reorderOf: runId, orderId: input.orderId, fromPosition, toPosition: input.toPosition },
        supersedesRunId: runId,
      });

      await this.repo.insertScores(client, newRunId, ws, resequenced);
      await this.repo.applyRankPositions(client, resequenced);
      await this.repo.setOrderOverride(client, input.orderId, overrideId, actor);
      await this.repo.writeAudit(
        client,
        input.orderId,
        "RANK_REORDERED",
        actor,
        `Moved from ${fromPosition} to ${input.toPosition}`,
        {
          runId: newRunId,
          supersedesRunId: runId,
          overrideId,
          reasonCode: input.reasonCode,
          grounds: input.grounds.trim(),
          reference: input.reference.trim(),
          fromPosition,
          toPosition: input.toPosition,
        },
      );
      await this.repo.closeRun(client, newRunId, {
        poolSize: resequenced.length,
        excludedFlagged: Number(run.excludedFlagged ?? 0),
        excludedCannotEvaluate: Number(run.excludedCannotEvaluate ?? 0),
        excludedOther: Number(run.excludedOther ?? 0),
        totalDemand: Number(run.totalDemand ?? 0),
        totalDemandUomCode: (run.totalDemandUomCode as string | null) ?? null,
        fallbackClassUsed: Number(run.fallbackClassUsed ?? 0),
        status: "COMPLETED",
      });

      return { newRunId, overrideId };
    });

    const items = await this.repo.scoresForRun(outcome.newRunId);
    const newRun = await this.repo.findRun(outcome.newRunId);
    return {
      run: mapRun(newRun!),
      items: items.map(mapScoreRow),
      override: { id: outcome.overrideId, status: "ACTIVE" },
    };
  }

  async weightSets(query: URLSearchParams) {
    const status = query.get("status")?.trim() || null;
    const items = await this.repo.listWeightSets(status);
    return { items, total: items.length };
  }

  async weightSet(id: string) {
    const ws = await this.repo.loadWeightSetById(id);
    if (!ws) throw new MdmError("NOT_FOUND", "Weight set was not found", 404);
    return {
      ...ws,
      components: ws.components.map((c) => ({
        ...c,
        zeroAtDays: c.componentCode === "RUN_OUT_RISK" ? zeroAtDays(c.weightMax, c.decayPerDay) : null,
      })),
    };
  }

  async customerClasses() {
    return { items: await this.repo.listCustomerClasses() };
  }

  async simulate(weightSetId: string, opts: { divisionId?: string | null; dueBefore?: string | null } = {}) {
    const proposed = await this.repo.loadWeightSetById(weightSetId);
    if (!proposed) throw new MdmError("NOT_FOUND", "Weight set was not found", 404);
    const current = await this.repo.resolveWeightSet(opts.divisionId ?? null, null);
    if (!current) throw new MdmError("NO_PUBLISHED_WEIGHT_SET", "No published ranking weight set", 409);

    const classes = await this.repo.classCatalogue();
    const pool = await this.repo.qualifiedPool(opts.divisionId ?? null, opts.dueBefore ?? null);
    const tankIds = [
      ...new Set(pool.map((o) => o.storageTankId).filter((id): id is string => Boolean(id))),
    ];
    const snaps = await this.qualRepo.snapshotsForTanks(tankIds);
    const drawRates = await this.qualRepo.drawRateMap();

    const build = (ws: WeightSet) => {
      const scored = pool.map((o) => {
        const input = this.buildInput(o, snaps, drawRates);
        return {
          input,
          breakdown: score(input, ws, classes),
          rankPosition: 0,
          rankSource: "ENGINE" as const,
          overrideId: null,
          grounds: null,
          reference: null,
        };
      });
      return orderScored(scored, ws);
    };

    const currentRanked = build(current);
    const proposedRanked = build(proposed);
    const currentPos = new Map(currentRanked.map((r) => [r.input.orderId, r.rankPosition]));
    const moved = proposedRanked
      .map((r) => ({
        orderId: r.input.orderId,
        orderNo: r.input.orderNo,
        from: currentPos.get(r.input.orderId) ?? null,
        to: r.rankPosition,
        delta: (currentPos.get(r.input.orderId) ?? r.rankPosition) - r.rankPosition,
      }))
      .filter((m) => m.from !== m.to);

    return {
      current: currentRanked.map(simRow),
      proposed: proposedRanked.map(simRow),
      moved,
      writesNothing: true,
    };
  }

  private buildInput(
    o: {
      id: string;
      orderNo: string;
      customerCode: string;
      customerName: string | null;
      storageTankId: string | null;
      isPacked: boolean;
      mode: DeliveryMode;
      dueDate: string;
      qualifiedQty: number;
      qualifiedQtyUomId: string;
      qualifiedQtyUomCode: string;
      orderValue: number;
      materialCode?: string;
    },
    snaps: Map<string, TankReadingSnapshot>,
    drawRates: Map<string, number>,
  ): RankingInput {
    const snapshot = o.storageTankId ? snaps.get(o.storageTankId) ?? null : null;
    const materialCode = String(o.materialCode ?? "").toUpperCase();
    const rate = drawRates.get(materialCode) ?? drawRates.get("__DEFAULT__") ?? 0.12;
    // Packed / no tank: runOutDays returns 99 → risk component clamps to 0 (do not invent a local fallback).
    const runOut = runOutDays(snapshot, rate);
    const segment = (o.customerName || o.customerCode || "").trim() || null;

    return {
      orderId: o.id,
      orderNo: o.orderNo,
      dueDate: o.dueDate,
      mode: o.mode,
      isPacked: o.isPacked,
      runOutDays: runOut.runOutDays,
      riskBand: runOut.riskBand,
      orderValue: o.orderValue,
      qualifiedQty: o.qualifiedQty,
      qtyUomId: o.qualifiedQtyUomId,
      qtyUomCode: o.qualifiedQtyUomCode || "L",
      customerClass: null,
      customerSegment: segment,
    };
  }
}

function mapRun(run: Record<string, unknown>) {
  return {
    id: run.id,
    trigger: run.trigger,
    triggeredBy: run.triggeredBy,
    weightSetId: run.weightSetId,
    weightSetVersionNo: run.weightSetVersionNo,
    orderingStrategy: run.orderingStrategy,
    divisionId: run.divisionId,
    poolSize: run.poolSize,
    excludedFlagged: run.excludedFlagged,
    excludedCannotEvaluate: run.excludedCannotEvaluate,
    excludedOther: run.excludedOther,
    totalDemand: run.totalDemand,
    totalDemandUomCode: run.totalDemandUomCode,
    fallbackClassUsed: run.fallbackClassUsed,
    supersedesRunId: run.supersedesRunId,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    status: run.status,
    scopeJson: run.scopeJson,
  };
}

function mapScoreRow(r: Record<string, unknown>) {
  return {
    orderId: r.orderId,
    orderNo: r.orderNo,
    customerCode: r.customerCode,
    customerName: r.customerName,
    materialId: r.materialId,
    materialCode: r.materialCode,
    mode: r.mode ?? r.inputMode,
    dueDate: r.dueDate,
    isPacked: r.isPacked,
    rankPosition: r.rankPosition,
    totalScore: r.totalScore,
    components: {
      risk: r.riskScore,
      value: r.valueScore,
      size: r.sizeScore,
      class: r.classScore,
      window: r.windowScore,
    },
    runOutDays: r.runOutDays,
    riskBand: r.riskBand,
    orderValue: r.orderValue,
    qualifiedQty: r.qualifiedQty,
    normalisedQty: r.normalisedQty,
    customerClass: r.customerClass,
    customerSegment: r.customerSegment,
    classSource: r.classSource,
    rankSource: r.rankSource,
    overrideId: r.overrideId,
    grounds: r.grounds,
    reference: r.reference,
    scoredAt: r.scoredAt,
  };
}

function simRow(r: ScoredOrder) {
  return {
    orderId: r.input.orderId,
    orderNo: r.input.orderNo,
    rankPosition: r.rankPosition,
    totalScore: r.breakdown.total,
    riskBand: r.input.riskBand,
    components: {
      risk: r.breakdown.risk,
      value: r.breakdown.value,
      size: r.breakdown.size,
      class: r.breakdown.class,
      window: r.breakdown.window,
    },
    classSource: r.breakdown.classSource,
  };
}

function emptyKpis() {
  return {
    poolSize: 0,
    totalDemand: 0,
    totalDemandUomCode: null,
    excludedFlagged: 0,
    excludedCannotEvaluate: 0,
    fallbackClassUsed: 0,
    fleetCapacityIndicator: null,
  };
}
