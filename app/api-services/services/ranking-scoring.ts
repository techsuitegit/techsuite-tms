import type {
  ClassSource,
  RankingInput,
  ScoreBreakdown,
  ScoredOrder,
  WeightComponent,
  WeightSet,
} from "./ranking-types";
import type { RiskBand } from "./qualification-types";

const BAND_RANK: Record<RiskBand, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Round once at the end of each displayed component / total (prototype: toFixed(1)). */
export function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function componentOf(ws: WeightSet, code: WeightComponent["componentCode"]): WeightComponent {
  const c = ws.components.find((x) => x.componentCode === code);
  if (!c) {
    return {
      componentCode: code,
      weightMax: 0,
      sequence: 99,
      caption: code,
      decayPerDay: null,
      valueDivisor: null,
      sizeDivisor: null,
      sizeUomCode: null,
      modeScores: null,
      isEnabled: false,
    };
  }
  return c;
}

/**
 * I-001 open: prefix test on segment display text until class catalogue contributions are set.
 * Ratios are fractions of weightMax so a weight change scales the fallback.
 */
export function segmentFallback(segment: string | null | undefined, weightMax: number): number {
  const s = (segment ?? "").trim();
  if (s.toLowerCase().startsWith("retail")) return weightMax;
  if (s.toLowerCase().startsWith("port")) return (weightMax * 10) / 12;
  return (weightMax * 6) / 12;
}

/**
 * Pragmatic UOM normalise until MaterialUomConversion (D-11) exists.
 * L → KL /1000; same code passthrough; packed lines keep count as NOS.
 */
export function normaliseQty(
  qty: number,
  fromCode: string,
  toCode: string | null,
  isPacked: boolean,
): { qty: number; uomCode: string } {
  if (isPacked) return { qty, uomCode: "NOS" };
  const from = (fromCode || "").toUpperCase();
  const to = (toCode || from || "KL").toUpperCase();
  if (from === to) return { qty, uomCode: to };
  if ((from === "L" || from === "LTR" || from === "LITRE") && to === "KL") {
    return { qty: qty / 1000, uomCode: to };
  }
  if (from === "KL" && (to === "L" || to === "LTR" || to === "LITRE")) {
    return { qty: qty * 1000, uomCode: to };
  }
  // Unknown conversion: treat as already in target unit (documented limitation).
  return { qty, uomCode: to };
}

export function score(
  input: RankingInput,
  ws: WeightSet,
  classCatalogue: Map<string, { scoreContribution: number | null }>,
): ScoreBreakdown {
  const c1 = componentOf(ws, "RUN_OUT_RISK");
  const riskRaw =
    c1.isEnabled && c1.decayPerDay != null
      ? Math.max(0, c1.weightMax - input.runOutDays * c1.decayPerDay)
      : 0;

  const c2 = componentOf(ws, "ORDER_VALUE");
  const valueRaw =
    c2.isEnabled && c2.valueDivisor != null && c2.valueDivisor > 0
      ? Math.min(c2.weightMax, input.orderValue / c2.valueDivisor)
      : 0;

  const c3 = componentOf(ws, "DROP_SIZE");
  const norm = normaliseQty(input.qualifiedQty, input.qtyUomCode, c3.sizeUomCode, input.isPacked);
  const sizeRaw =
    c3.isEnabled && c3.sizeDivisor != null && c3.sizeDivisor > 0
      ? Math.min(c3.weightMax, norm.qty / c3.sizeDivisor)
      : 0;

  const c4 = componentOf(ws, "CUSTOMER_CLASS");
  let classRaw = 0;
  let classSource: ClassSource = "DEFAULT";
  if (c4.isEnabled) {
    const row = input.customerClass ? classCatalogue.get(input.customerClass) : undefined;
    if (row && row.scoreContribution != null) {
      classRaw = row.scoreContribution;
      classSource = "CLASS";
    } else {
      classRaw = segmentFallback(input.customerSegment, c4.weightMax);
      classSource = "SEGMENT_FALLBACK";
    }
  }

  const c5 = componentOf(ws, "WINDOW_PRESSURE");
  const modeScores = c5.modeScores ?? {};
  const windowRaw = c5.isEnabled ? (modeScores[input.mode] ?? modeScores.DEFAULT ?? 0) : 0;

  const risk = riskRaw;
  const value = valueRaw;
  const size = sizeRaw;
  const cls = classRaw;
  const win = windowRaw;
  const total = risk + value + size + cls + win;

  return {
    risk: r1(risk),
    value: r1(value),
    size: r1(size),
    class: r1(cls),
    window: r1(win),
    total: r1(total),
    classSource,
    normalisedQty: norm.qty,
    normalisedQtyUomCode: norm.uomCode,
  };
}

export function orderScored(scored: ScoredOrder[], ws: WeightSet): ScoredOrder[] {
  const copy = [...scored];
  copy.sort((a, b) => compareScored(a, b, ws));
  return copy.map((row, i) => ({ ...row, rankPosition: i + 1 }));
}

function compareScored(a: ScoredOrder, b: ScoredOrder, ws: WeightSet): number {
  if (ws.orderingStrategy === "BAND_THEN_SCORE") {
    const band = BAND_RANK[a.input.riskBand] - BAND_RANK[b.input.riskBand];
    if (band !== 0) return band;
  }
  const total = b.breakdown.total - a.breakdown.total;
  if (total !== 0) return total;
  return tieBreak(a, b, ws.tieBreak);
}

function tieBreak(a: ScoredOrder, b: ScoredOrder, tie: WeightSet["tieBreak"]): number {
  if (tie === "DUE_DATE_ASC") {
    const d = a.input.dueDate.localeCompare(b.input.dueDate);
    if (d !== 0) return d;
  } else if (tie === "ORDER_NO_ASC") {
    return a.input.orderNo.localeCompare(b.input.orderNo);
  } else {
    // RUN_OUT_ASC default — drier tank wins
    const days = a.input.runOutDays - b.input.runOutDays;
    if (days !== 0) return days;
  }
  return a.input.orderNo.localeCompare(b.input.orderNo);
}

/**
 * Pin planner-overridden orders at their prior rank_position; fill engine sequence around them.
 */
export function carryForwardPlannerOverrides(
  ranked: ScoredOrder[],
  pinned: Map<string, { position: number; overrideId: string }>,
): ScoredOrder[] {
  if (!pinned.size) return ranked.map((r, i) => ({ ...r, rankPosition: i + 1, rankSource: "ENGINE" as const }));

  const n = ranked.length;
  const slots: (ScoredOrder | null)[] = Array.from({ length: n }, () => null);
  const remaining: ScoredOrder[] = [];

  for (const row of ranked) {
    const pin = pinned.get(row.input.orderId);
    if (pin && pin.position >= 1 && pin.position <= n) {
      const idx = pin.position - 1;
      if (slots[idx] == null) {
        slots[idx] = {
          ...row,
          rankPosition: pin.position,
          rankSource: "PLANNER",
          overrideId: pin.overrideId,
        };
        continue;
      }
    }
    remaining.push({ ...row, rankSource: "ENGINE", overrideId: null });
  }

  let ri = 0;
  for (let i = 0; i < n; i++) {
    if (slots[i] == null) {
      const next = remaining[ri++];
      if (next) slots[i] = { ...next, rankPosition: i + 1 };
    }
  }

  return slots.filter((x): x is ScoredOrder => x != null).map((row, i) => ({
    ...row,
    rankPosition: i + 1,
  }));
}

export function zeroAtDays(weightMax: number, decayPerDay: number | null): number | null {
  if (decayPerDay == null || decayPerDay <= 0) return null;
  return r1(weightMax / decayPerDay);
}

export function moveToPosition(items: ScoredOrder[], orderId: string, toPosition: number): ScoredOrder[] {
  const from = items.findIndex((x) => x.input.orderId === orderId);
  if (from < 0) throw new Error("ORDER_NOT_IN_RUN");
  const target = Math.max(1, Math.min(toPosition, items.length));
  const copy = [...items];
  const [moved] = copy.splice(from, 1);
  copy.splice(target - 1, 0, moved!);
  return copy.map((row, i) => ({
    ...row,
    rankPosition: i + 1,
    rankSource: row.input.orderId === orderId ? "PLANNER" : row.rankSource,
  }));
}
