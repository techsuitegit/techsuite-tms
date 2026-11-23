export type RouteStatus = "DRAFT" | "CONFIRMED" | "DISPATCHED" | "CANCELLED";
export type PlanKind = "LIVE" | "SCENARIO";
export type ReservationStatus =
  | "ACTIVE"
  | "EXPIRING"
  | "EXPIRED"
  | "RELEASED"
  | "CONSUMED"
  | "PENDING_COUNTERSIGN";
export type CommitmentOutcome = "RESERVED" | "SHORT" | "UNVERIFIED";
export type ReasonAppliesTo = "ENGINE" | "REASSIGN" | "RELEASE" | "SHORT" | "EXTEND";

export type ReserveOrderLine = {
  orderId: string;
  routeStopId?: string | null;
  shipToLatitude?: number | null;
  shipToLongitude?: number | null;
};

export type ReserveTripInput = {
  tripId: string;
  routeId: string;
  routeStatus: string;
  planId: string;
  planKind: string;
  tripNo: number;
  plannedDeparture: string;
  reserveDate: string;
  vehicleId?: string | null;
  homeTerminalId?: string | null;
  divisionId?: string | null;
  orders: ReserveOrderLine[];
};

export type PolicyRow = {
  id: string;
  code: string;
  name: string;
  expiryGraceHours: number;
  warningLeadHours: number;
  sweepCadenceMinutes: number;
  releaseAtTerminalClose: boolean;
  maxExpiryExtensions: number;
  allowShortCommitment: boolean;
  unverifiedIsReservable: boolean;
  homeTerminalBiasKm: number;
  proximityTieBreak: string;
  divisionId: string | null;
  versionNo: number;
  validFrom: string;
  validTo: string | null;
};

export type TerminalRow = {
  id: string;
  code: string;
  name: string;
  products: string[];
  status: string;
  openingHours: string | null;
  permitExpiry: string | null;
  latitude: number | null;
  longitude: number | null;
  leadDispatcher: string | null;
};

export type UomRow = {
  id: string;
  code: string;
  factorToBase: number;
  dimension: string | null;
};

export type OrderRow = {
  id: string;
  orderNo: string;
  customerName: string | null;
  customerCode: string;
  materialId: string;
  materialCode: string;
  isPacked: boolean;
  divisionId: string | null;
  requestedQty: number;
  qualifiedQty: number | null;
  qualifiedQtyUomId: string | null;
  qualOutcome: string;
  versionNo: number;
};

export type PositionRow = {
  terminalId: string;
  materialId: string;
  availabilityDate: string;
  declaredQty: number | null;
  committedQty: number;
  consumedQty: number;
  availableQty: number | null;
  uomId: string;
  reservationCount: number;
};
