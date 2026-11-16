/**
 * Smoke M03 ranking against a live DB + API stack is optional.
 * This script exercises the pure scorer + ADDITIVE vs BAND_THEN_SCORE without HTTP.
 */
import assert from "node:assert/strict";
import { orderScored, score } from "@/app/api-services/services/ranking-scoring";
import type { RankingInput, ScoredOrder, WeightSet } from "@/app/api-services/services/ranking-types";

const ws = (strategy: WeightSet["orderingStrategy"]): WeightSet => ({
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

function scored(partial: Partial<RankingInput>, strategy: WeightSet["orderingStrategy"]): ScoredOrder {
  const input: RankingInput = {
    orderId: "x",
    orderNo: "X",
    dueDate: "2026-11-10",
    mode: "FORECAST",
    isPacked: false,
    runOutDays: 0,
    riskBand: "critical",
    orderValue: 0,
    qualifiedQty: 4000,
    qtyUomId: "u",
    qtyUomCode: "L",
    customerClass: null,
    customerSegment: "Other",
    ...partial,
  };
  const set = ws(strategy);
  return {
    input,
    breakdown: score(input, set, new Map()),
    rankPosition: 0,
    rankSource: "ENGINE",
    overrideId: null,
    grounds: null,
    reference: null,
  };
}

const critical = scored(
  { orderId: "crit", orderNo: "C", runOutDays: 0, riskBand: "critical", orderValue: 0, mode: "FORECAST" },
  "ADDITIVE",
);
const comfort = scored(
  {
    orderId: "comf",
    orderNo: "A",
    runOutDays: 10,
    riskBand: "low",
    orderValue: 1_500_000,
    qualifiedQty: 60000,
    customerSegment: "Retail outlet",
    mode: "WILL_CALL",
  },
  "ADDITIVE",
);

const additive = orderScored([critical, comfort], ws("ADDITIVE"));
assert.equal(additive[0]!.input.orderId, "comf", "ADDITIVE: high-value comfort wins");

const banded = orderScored(
  [
    scored({ orderId: "crit", orderNo: "C", runOutDays: 0, riskBand: "critical", orderValue: 0 }, "BAND_THEN_SCORE"),
    scored(
      {
        orderId: "comf",
        orderNo: "A",
        runOutDays: 10,
        riskBand: "low",
        orderValue: 1_500_000,
        qualifiedQty: 60000,
        customerSegment: "Retail outlet",
        mode: "WILL_CALL",
      },
      "BAND_THEN_SCORE",
    ),
  ],
  ws("BAND_THEN_SCORE"),
);
assert.equal(banded[0]!.input.orderId, "crit", "BAND_THEN_SCORE: critical wins");

process.stdout.write(
  `smoke-ranking ok — ADDITIVE leader=${additive[0]!.input.orderId} (${additive[0]!.breakdown.total}) ` +
    `BAND leader=${banded[0]!.input.orderId} (${banded[0]!.breakdown.total})\n`,
);
