import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assessAvailability,
  computeExpiresAt,
  convertByFactor,
  decideSweep,
  deriveTerminal,
  derivedReasonCode,
  expiryRecipients,
  reservationGate,
  type TerminalInput,
} from "./reservation-engine";

const terminals = (): TerminalInput[] => [
  { id: "SP-MNL", code: "SP-MNL", name: "Manali", products: ["MS", "XP", "HSD"], isActive: true },
  { id: "SP-TDP", code: "SP-TDP", name: "Tondiarpet", products: ["MS", "HSD"], isActive: true },
  { id: "SP-ENR", code: "SP-ENR", name: "Ennore", products: ["HSD"], isActive: true },
  { id: "SP-KRK", code: "SP-KRK", name: "Korukkupet", products: ["LPGB"], isActive: true },
  { id: "SP-SPB", code: "SP-SPB", name: "Sriperumbudur", products: ["HSD"], isActive: true },
];

describe("reservation gate", () => {
  it("refuses a scenario and a draft", () => {
    assert.equal(reservationGate("CONFIRMED", "SCENARIO"), "SCENARIO_PLAN");
    assert.equal(reservationGate("DRAFT", "LIVE"), "ROUTE_NOT_CONFIRMED");
    assert.equal(reservationGate("CONFIRMED", "LIVE"), "OK");
  });
});

describe("deriveTerminal", () => {
  it("picks the only terminal that racks XP even when another is nearer", () => {
    const result = deriveTerminal({
      materialCode: "XP",
      terminals: terminals(),
      distanceKm: (id) => (id === "SP-TDP" ? 1 : 40),
      homeTerminalId: null,
      homeBiasKm: 3.4,
    });
    assert.equal(result.outcome, "DERIVED");
    if (result.outcome === "DERIVED") assert.equal(result.terminalId, "SP-MNL");
  });

  it("does not fall back when nothing racks the product", () => {
    const result = deriveTerminal({
      materialCode: "XP",
      terminals: terminals().map((row) => ({ ...row, products: row.products.filter((code) => code !== "XP") })),
      distanceKm: () => 1,
      homeTerminalId: null,
      homeBiasKm: 3.4,
    });
    assert.equal(result.outcome, "NO_RACKABLE_TERMINAL");
    assert.equal(result.candidates.length, 5);
    assert.ok(result.candidates.every((row) => row.rejectedBecause?.includes("does not rack XP")));
  });

  it("is deterministic and breaks ties on terminal code", () => {
    const distance = () => 10;
    const forward = deriveTerminal({
      materialCode: "HSD",
      terminals: terminals(),
      distanceKm: distance,
      homeTerminalId: null,
      homeBiasKm: 0,
    });
    const reversed = deriveTerminal({
      materialCode: "HSD",
      terminals: [...terminals()].reverse(),
      distanceKm: distance,
      homeTerminalId: null,
      homeBiasKm: 0,
    });
    assert.equal(forward.outcome, "DERIVED");
    assert.equal(reversed.outcome, "DERIVED");
    if (forward.outcome === "DERIVED" && reversed.outcome === "DERIVED") {
      assert.equal(forward.terminalId, reversed.terminalId);
      assert.equal(forward.terminalCode, "SP-ENR");
    }
  });

  it("applies the home-terminal bias from the caller, not a constant", () => {
    const distanceKm = (id: string) => (id === "SP-MNL" ? 9 : id === "SP-TDP" ? 11 : 50);
    const hsd = terminals().filter((row) => row.products.includes("HSD") || row.code === "SP-MNL" || row.code === "SP-TDP");
    const withBias = deriveTerminal({
      materialCode: "HSD",
      terminals: hsd,
      distanceKm,
      homeTerminalId: "SP-TDP",
      homeBiasKm: 3.4,
    });
    const tight = deriveTerminal({
      materialCode: "HSD",
      terminals: hsd,
      distanceKm,
      homeTerminalId: "SP-TDP",
      homeBiasKm: 1,
    });
    assert.equal(withBias.outcome, "DERIVED");
    assert.equal(tight.outcome, "DERIVED");
    if (withBias.outcome === "DERIVED") assert.equal(withBias.terminalId, "SP-TDP");
    if (tight.outcome === "DERIVED") assert.equal(tight.terminalId, "SP-MNL");
    if (withBias.outcome === "DERIVED") {
      assert.equal(derivedReasonCode({
        terminalId: withBias.terminalId,
        homeTerminalId: "SP-TDP",
        candidates: withBias.candidates,
      }), "ENG_DERIVED_HOME");
    }
  });
});

describe("assessAvailability", () => {
  const base = {
    terminalName: "Manali",
    materialCode: "HSD",
    reserveDate: "2026-10-09",
    homeBiasApplied: false,
    consumedQty: 0,
  };

  it("covers reserved, short, and unverified", () => {
    const reserved = assessAvailability({ ...base, declaredQty: 240, committedQty: 200, wantedQty: 40 });
    const short = assessAvailability({ ...base, declaredQty: 240, committedQty: 200, wantedQty: 41 });
    const unverified = assessAvailability({ ...base, declaredQty: null, committedQty: 0, wantedQty: 40 });
    assert.equal(reserved.outcome, "RESERVED");
    assert.equal(short.outcome, "SHORT");
    assert.equal(unverified.outcome, "UNVERIFIED");
    assert.equal(unverified.remaining, null);
  });

  it("treats the exact remaining quantity as reserved", () => {
    assert.equal(
      assessAvailability({ ...base, declaredQty: 40, committedQty: 0, wantedQty: 40 }).outcome,
      "RESERVED",
    );
    assert.equal(
      assessAvailability({ ...base, declaredQty: 40, committedQty: 0, wantedQty: 40.001 }).outcome,
      "SHORT",
    );
  });
});

describe("units", () => {
  it("converts through factors and the engine source has no hardcoded thousand", () => {
    assert.equal(convertByFactor(8000, 1, 1000), 8);
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const engine = readFileSync(path.join(dir, "reservation-engine.ts"), "utf8");
    const service = readFileSync(path.join(dir, "reservation.service.ts"), "utf8");
    assert.equal(engine.includes("1000"), false);
    assert.equal(service.includes("1000"), false);
    assert.equal(engine.includes("allowed.length"), false);
    assert.equal(service.includes("allowed.length"), false);
  });
});

describe("expiry", () => {
  it("floors the window at the terminal close", () => {
    const departure = new Date("2026-10-09T05:30:00Z");
    const close = new Date("2026-10-09T22:00:00Z");
    assert.equal(computeExpiresAt(departure, 4, close).toISOString(), close.toISOString());
  });

  it("warns once, holds through the operating day, then expires", () => {
    const expiresAt = new Date("2026-10-09T14:00:00Z");
    const terminalClose = new Date("2026-10-09T22:00:00Z");
    const shared = {
      expiresAt,
      routeStatus: "CONFIRMED",
      releaseAtTerminalClose: true,
      terminalClose,
      warningLeadHours: 2,
    };
    assert.equal(decideSweep({ ...shared, now: new Date("2026-10-09T12:00:00Z"), expiryWarnedAt: null }), "WARN");
    const warned = new Date("2026-10-09T12:00:00Z");
    assert.equal(decideSweep({ ...shared, now: new Date("2026-10-09T12:30:00Z"), expiryWarnedAt: warned }), "NONE");
    assert.equal(decideSweep({ ...shared, now: new Date("2026-10-09T13:30:00Z"), expiryWarnedAt: warned }), "NONE");
    assert.equal(decideSweep({ ...shared, now: new Date("2026-10-09T14:30:00Z"), expiryWarnedAt: warned }), "HOLD");
    assert.equal(decideSweep({ ...shared, now: new Date("2026-10-09T22:00:00Z"), expiryWarnedAt: warned }), "EXPIRE");
  });

  it("never expires a dispatched trip", () => {
    const decision = decideSweep({
      now: new Date("2026-10-09T23:59:00Z"),
      expiresAt: new Date("2026-10-09T14:00:00Z"),
      routeStatus: "DISPATCHED",
      releaseAtTerminalClose: true,
      terminalClose: new Date("2026-10-09T22:00:00Z"),
      expiryWarnedAt: null,
      warningLeadHours: 2,
    });
    assert.equal(decision, "SKIP_DISPATCHED");
  });

  it("names three recipients", () => {
    const recipients = expiryRecipients({ planner: "planner.a", terminalCode: "SP-MNL", dispatcher: "duty" });
    assert.deepEqual(recipients.map((row) => row.role), ["PLANNER", "TERMINAL", "DISPATCHER"]);
  });
});
