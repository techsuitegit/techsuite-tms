/**
 * M04 reservation engine. Pure: no database, no clock of its own except the
 * instants the caller passes in.
 *
 * Terminal choice is rackable-filter then proximity. There is no fallback to
 * terminals that failed the rackable filter. V8 did that, and a truck then
 * arrived at a gate that cannot load the product.
 */

export type CommitmentOutcome = "RESERVED" | "SHORT" | "UNVERIFIED";

export type TerminalInput = {
  id: string;
  code: string;
  name: string;
  products: string[];
  isActive: boolean;
};

export type CandidateScore = {
  terminalId: string;
  terminalCode: string;
  terminalName: string;
  racksProduct: boolean;
  roadKm: number | null;
  homeBias: number;
  score: number | null;
  rejectedBecause: string | null;
};

export type Derivation =
  | { outcome: "NO_RACKABLE_TERMINAL"; candidates: CandidateScore[] }
  | { outcome: "DERIVED"; terminalId: string; terminalCode: string; candidates: CandidateScore[] };

export type AvailabilityAssessment = {
  outcome: CommitmentOutcome;
  reasonCode: "ENG_DERIVED_NEAREST" | "ENG_DERIVED_HOME" | "ENG_NO_DECLARATION" | "ENG_SHORT_DECLARED";
  reasonText: string;
  remaining: number | null;
};

export type SweepDecision = "NONE" | "SKIP_DISPATCHED" | "WARN" | "HOLD" | "EXPIRE";

export function round3(value: number): number {
  const scale = 10 ** 3;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

/** Convert through UOM factors. Factors come from the UOM row, not from here. */
export function convertByFactor(qty: number, fromFactorToBase: number, toFactorToBase: number): number {
  if (!(fromFactorToBase > 0) || !(toFactorToBase > 0)) {
    throw new Error("UOM factor must be positive");
  }
  return round3(qty * (fromFactorToBase / toFactorToBase));
}

export function racksProduct(products: string[], materialCode: string): boolean {
  const code = materialCode.trim().toUpperCase();
  return products.some((item) => item.trim().toUpperCase() === code);
}

/**
 * Straight-line kilometres times a road circuity factor. The map adapter
 * replaces this; derivation tests inject their own distances.
 */
export function haversineKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  circuity = 1.25,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return round3(6371 * c * circuity);
}

export function reservationGate(
  routeStatus: string,
  planKind: string,
): "OK" | "SCENARIO_PLAN" | "ROUTE_NOT_CONFIRMED" {
  if (planKind === "SCENARIO") return "SCENARIO_PLAN";
  if (routeStatus !== "CONFIRMED") return "ROUTE_NOT_CONFIRMED";
  return "OK";
}

export function deriveTerminal(args: {
  materialCode: string;
  terminals: TerminalInput[];
  distanceKm: (terminalId: string) => number;
  homeTerminalId: string | null;
  homeBiasKm: number;
}): Derivation {
  const candidates: CandidateScore[] = args.terminals.map((terminal) => {
    const racks = terminal.isActive && racksProduct(terminal.products, args.materialCode);
    if (!racks) {
      const because = terminal.isActive
        ? `does not rack ${args.materialCode}`
        : "not an active terminal";
      return {
        terminalId: terminal.id,
        terminalCode: terminal.code,
        terminalName: terminal.name,
        racksProduct: false,
        roadKm: null,
        homeBias: 0,
        score: null,
        rejectedBecause: because,
      };
    }
    const roadKm = args.distanceKm(terminal.id);
    const homeBias = terminal.id === args.homeTerminalId ? args.homeBiasKm : 0;
    return {
      terminalId: terminal.id,
      terminalCode: terminal.code,
      terminalName: terminal.name,
      racksProduct: true,
      roadKm,
      homeBias,
      score: round3(roadKm - homeBias),
      rejectedBecause: null,
    };
  });

  const ranked = candidates
    .filter((row) => row.racksProduct && row.score != null)
    .sort((a, b) => a.score! - b.score! || a.terminalCode.localeCompare(b.terminalCode));

  if (!ranked.length) return { outcome: "NO_RACKABLE_TERMINAL", candidates };

  const winner = ranked[0]!;
  const homeWon = winner.homeBias > 0 && ranked.some((row) => row.terminalId !== winner.terminalId && (row.roadKm ?? 0) < (winner.roadKm ?? 0));
  return {
    outcome: "DERIVED",
    terminalId: winner.terminalId,
    terminalCode: winner.terminalCode,
    candidates: candidates.map((row) =>
      row.terminalId === winner.terminalId && homeWon
        ? { ...row, rejectedBecause: null }
        : row,
    ),
  };
}

export function derivedReasonCode(args: {
  terminalId: string;
  homeTerminalId: string | null;
  candidates: CandidateScore[];
}): "ENG_DERIVED_NEAREST" | "ENG_DERIVED_HOME" {
  if (!args.homeTerminalId || args.terminalId !== args.homeTerminalId) return "ENG_DERIVED_NEAREST";
  const winner = args.candidates.find((row) => row.terminalId === args.terminalId);
  const nearer = args.candidates.find(
    (row) => row.racksProduct && row.terminalId !== args.terminalId && (row.roadKm ?? 0) < (winner?.roadKm ?? 0),
  );
  return nearer ? "ENG_DERIVED_HOME" : "ENG_DERIVED_NEAREST";
}

/**
 * Inclusive boundary: wanted equal to remaining is RESERVED.
 * Null declared quantity is UNVERIFIED, not zero.
 */
export function assessAvailability(args: {
  declaredQty: number | null;
  committedQty: number;
  consumedQty: number;
  wantedQty: number;
  terminalName: string;
  materialCode: string;
  reserveDate: string;
  homeBiasApplied: boolean;
}): AvailabilityAssessment {
  if (args.declaredQty == null) {
    return {
      outcome: "UNVERIFIED",
      reasonCode: "ENG_NO_DECLARATION",
      reasonText: `No availability declared for ${args.materialCode} at ${args.terminalName} on ${args.reserveDate}. Reserved and unverified.`,
      remaining: null,
    };
  }
  const remaining = round3(args.declaredQty - args.committedQty - args.consumedQty);
  const wanted = round3(args.wantedQty);
  if (wanted <= remaining) {
    return {
      outcome: "RESERVED",
      reasonCode: args.homeBiasApplied ? "ENG_DERIVED_HOME" : "ENG_DERIVED_NEAREST",
      reasonText: `Reserved ${wanted} against ${remaining} remaining at ${args.terminalName} on ${args.reserveDate}.`,
      remaining,
    };
  }
  return {
    outcome: "SHORT",
    reasonCode: "ENG_SHORT_DECLARED",
    reasonText: `Reserved ${wanted} against only ${remaining} remaining at ${args.terminalName} on ${args.reserveDate}. Flagged for planner review.`,
    remaining,
  };
}

/** expires_at = the later of departure-plus-grace and the terminal close. */
export function computeExpiresAt(plannedDeparture: Date, graceHours: number, terminalClose: Date): Date {
  const graceEnd = new Date(plannedDeparture.getTime() + graceHours * 3_600_000);
  return graceEnd.getTime() > terminalClose.getTime() ? graceEnd : terminalClose;
}

/** Last HH:MM in an opening-hours string. Missing hours close at 23:59. */
export function parseCloseTime(openingHours: string | null | undefined): string {
  const times = openingHours?.match(/\d{1,2}:\d{2}/g);
  return times?.length ? times[times.length - 1]! : "23:59";
}

/** reserveDate is a calendar date. offsetMinutes is the terminal's zone east of UTC (IST = 330). */
export function terminalCloseAt(reserveDate: string, openingHours: string | null | undefined, offsetMinutes = 330): Date {
  const close = parseCloseTime(openingHours);
  const [hour, minute] = close.split(":").map((part) => Number(part));
  const [year, month, day] = reserveDate.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!, 0) - offsetMinutes * 60_000);
}

export function decideSweep(args: {
  now: Date;
  expiresAt: Date;
  routeStatus: string;
  releaseAtTerminalClose: boolean;
  terminalClose: Date;
  expiryWarnedAt: Date | null;
  warningLeadHours: number;
}): SweepDecision {
  if (args.routeStatus === "DISPATCHED") return "SKIP_DISPATCHED";
  const windowStart = new Date(args.expiresAt.getTime() - args.warningLeadHours * 3_600_000);
  if (args.now.getTime() < windowStart.getTime()) return "NONE";
  if (args.now.getTime() < args.expiresAt.getTime()) {
    if (args.expiryWarnedAt && args.expiryWarnedAt.getTime() >= windowStart.getTime()) return "NONE";
    return "WARN";
  }
  if (args.releaseAtTerminalClose && args.now.getTime() < args.terminalClose.getTime()) return "HOLD";
  return "EXPIRE";
}

export function expiryRecipients(args: {
  planner: string | null;
  terminalCode: string;
  dispatcher: string | null;
}): Array<{ role: "PLANNER" | "TERMINAL" | "DISPATCHER"; ref: string }> {
  return [
    { role: "PLANNER", ref: args.planner?.trim() || "planner-unknown" },
    { role: "TERMINAL", ref: args.terminalCode },
    { role: "DISPATCHER", ref: args.dispatcher?.trim() || "duty-dispatcher" },
  ];
}

export function pesoLapsed(permitExpiry: string | null | undefined, reserveDate: string): boolean {
  if (!permitExpiry) return false;
  return permitExpiry.slice(0, 10) < reserveDate;
}
