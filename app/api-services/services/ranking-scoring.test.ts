import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  carryForwardPlannerOverrides,
  normaliseQty,
  orderScored,
  score,
  segmentFallback,
} from "./ranking-scoring";
import type { RankingInput, ScoredOrder, WeightSet } from "./ranking-types";

const seedWs = (strategy: WeightSet["orderingStrategy"] = "ADDITIVE"): WeightSet => ({
  id: "RWS00001",
  code: "WS-DEFAULT",
  name: "Default",
  divisionId: null,
  orderingStrategy: strategy,
  tieBreak: "RUN_OUT_ASC",
  totalWeightCheck: 100,
  notes: null,
  status: "PUBLISHED",
  versionNo: 1,
  components: [
    {
      componentCode: "RUN_OUT_RISK",
      weightMax: 40,
      sequence: 1,
      caption: "risk",
      decayPerDay: 7,
      valueDivisor: null,
      sizeDivisor: null,
      sizeUomCode: null,
      modeScores: null,
      isEnabled: true,
    },
    {
      componentCode: "ORDER_VALUE",
      weightMax: 25,
      sequence: 2,
      caption: "value",
      decayPerDay: null,
      valueDivisor: 60000,
      sizeDivisor: null,
      sizeUomCode: null,
      modeScores: null,
      isEnabled: true,
    },
    {
      componentCode: "DROP_SIZE",
      weightMax: 15,
      sequence: 3,
      caption: "size",
      decayPerDay: null,
      valueDivisor: null,
      sizeDivisor: 2,
      sizeUomCode: "KL",
      modeScores: null,
      isEnabled: true,
    },
    {
      componentCode: "CUSTOMER_CLASS",
      weightMax: 12,
      sequence: 4,
      caption: "class",
      decayPerDay: null,
      valueDivisor: null,
      sizeDivisor: null,
      sizeUomCode: null,
      modeScores: null,
      isEnabled: true,
    },
    {
      componentCode: "WINDOW_PRESSURE",
      weightMax: 8,
      sequence: 5,
      caption: "window",
      decayPerDay: null,
      valueDivisor: null,
      sizeDivisor: null,
      sizeUomCode: null,
      modeScores: { WILL_CALL: 8, MONITOR: 6, SCHEDULED: 3, FORECAST: 3 },
      isEnabled: true,
    },
  ],
});

function baseInput(partial: Partial<RankingInput> = {}): RankingInput {
  return {
    orderId: "o1",
    orderNo: "ORD-1",
    dueDate: "2026-11-10",
    mode: "SCHEDULED",
    isPacked: false,
    runOutDays: 0,
    riskBand: "critical",
    orderValue: 0,
    qualifiedQty: 4000,
    qtyUomId: "UOM-L",
    qtyUomCode: "L",
    customerClass: null,
    customerSegment: "Other",
    ...partial,
  };
}

describe("ranking-scoring", () => {
  it("risk clamps at zero beyond zero_at_days", () => {
    const ws = seedWs();
    const b = score(baseInput({ runOutDays: 99, riskBand: "low" }), ws, new Map());
    assert.equal(b.risk, 0);
  });

  it("value saturates at weightMax", () => {
    const ws = seedWs();
    const b = score(baseInput({ orderValue: 2_000_000, runOutDays: 99, riskBand: "low" }), ws, new Map());
    assert.equal(b.value, 25);
  });

  it("normalises L to KL for drop size", () => {
    assert.deepEqual(normaliseQty(20000, "L", "KL", false), { qty: 20, uomCode: "KL" });
    const ws = seedWs();
    const b = score(
      baseInput({ qualifiedQty: 20000, qtyUomCode: "L", runOutDays: 99, riskBand: "low", orderValue: 0 }),
      ws,
      new Map(),
    );
    assert.equal(b.size, 10);
    assert.equal(b.normalisedQty, 20);
  });

  it("segment fallback Retail = full class weight", () => {
    assert.equal(segmentFallback("Retail outlet", 12), 12);
    assert.equal(segmentFallback("Port terminal", 12), 10);
    assert.equal(segmentFallback("Dealer", 12), 6);
    const ws = seedWs();
    const b = score(baseInput({ customerSegment: "Retail outlet", runOutDays: 99, riskBand: "low" }), ws, new Map());
    assert.equal(b.class, 12);
    assert.equal(b.classSource, "SEGMENT_FALLBACK");
  });

  it("CLASS source when catalogue contribution is set", () => {
    const ws = seedWs();
    const catalogue = new Map([["A2", { scoreContribution: 9 }]]);
    const b = score(
      baseInput({ customerClass: "A2", customerSegment: "Retail outlet", runOutDays: 99, riskBand: "low" }),
      ws,
      catalogue,
    );
    assert.equal(b.class, 9);
    assert.equal(b.classSource, "CLASS");
  });

  it("ADDITIVE lets comfortable high-value beat critical low-value", () => {
    const ws = seedWs("ADDITIVE");
    const critical: ScoredOrder = {
      input: baseInput({
        orderId: "crit",
        orderNo: "C",
        runOutDays: 0,
        riskBand: "critical",
        orderValue: 0,
        qualifiedQty: 4000,
        customerSegment: "X",
        mode: "FORECAST",
      }),
      breakdown: score(
        baseInput({
          orderId: "crit",
          orderNo: "C",
          runOutDays: 0,
          riskBand: "critical",
          orderValue: 0,
          qualifiedQty: 4000,
          customerSegment: "X",
          mode: "FORECAST",
        }),
        ws,
        new Map(),
      ),
      rankPosition: 0,
      rankSource: "ENGINE",
      overrideId: null,
      grounds: null,
      reference: null,
    };
    // critical ≈ 40 + 0 + min(15,2) + 6 + 3 = 51
    const comfort: ScoredOrder = {
      input: baseInput({
        orderId: "comf",
        orderNo: "A",
        runOutDays: 10,
        riskBand: "low",
        orderValue: 1_500_000,
        qualifiedQty: 60000,
        qtyUomCode: "L",
        customerSegment: "Retail outlet",
        mode: "WILL_CALL",
      }),
      breakdown: score(
        baseInput({
          orderId: "comf",
          orderNo: "A",
          runOutDays: 10,
          riskBand: "low",
          orderValue: 1_500_000,
          qualifiedQty: 60000,
          qtyUomCode: "L",
          customerSegment: "Retail outlet",
          mode: "WILL_CALL",
        }),
        ws,
        new Map(),
      ),
      rankPosition: 0,
      rankSource: "ENGINE",
      overrideId: null,
      grounds: null,
      reference: null,
    };
    // comfort ≈ 0 + 25 + 15 + 12 + 8 = 60
    assert.ok(comfort.breakdown.total > critical.breakdown.total);
    const ordered = orderScored([critical, comfort], ws);
    assert.equal(ordered[0]!.input.orderId, "comf");

    const banded = orderScored([critical, comfort], seedWs("BAND_THEN_SCORE"));
    assert.equal(banded[0]!.input.orderId, "crit");
  });

  it("carry-forward pins planner position", () => {
    const mk = (id: string, pos: number): ScoredOrder => ({
      input: baseInput({ orderId: id, orderNo: id }),
      breakdown: {
        risk: 0,
        value: 0,
        size: 0,
        class: 0,
        window: 0,
        total: 10 - pos,
        classSource: "DEFAULT",
        normalisedQty: 1,
        normalisedQtyUomCode: "KL",
      },
      rankPosition: pos,
      rankSource: "ENGINE",
      overrideId: null,
      grounds: null,
      reference: null,
    });
    const ranked = [mk("a", 1), mk("b", 2), mk("c", 3)];
    const pinned = new Map([["c", { position: 1, overrideId: "ROVR1" }]]);
    const out = carryForwardPlannerOverrides(ranked, pinned);
    assert.equal(out[0]!.input.orderId, "c");
    assert.equal(out[0]!.rankSource, "PLANNER");
    assert.equal(out[1]!.rankSource, "ENGINE");
  });

  it("disabled component scores zero but inputs still scoreable", () => {
    const ws = seedWs();
    ws.components = ws.components.map((c) =>
      c.componentCode === "ORDER_VALUE" ? { ...c, isEnabled: false } : c,
    );
    const b = score(baseInput({ orderValue: 1_500_000, runOutDays: 99, riskBand: "low" }), ws, new Map());
    assert.equal(b.value, 0);
  });
});
