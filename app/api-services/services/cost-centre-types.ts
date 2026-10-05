export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;

export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;

export const COST_CENTRE_TYPES = ["DELIVERY", "FLEET", "DEPOT", "SALES", "ADMIN", "SERVICE"] as const;

export const CREATE_FIELDS = [
  "code",
  "name",
  "divisionId",
  "shippingPointId",
  "type",
  "budgetOwner",
  "defaultGl",
  "annualBudget",
  "active",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
  "externalId",
] as const;

export const UPDATE_FIELDS = [...CREATE_FIELDS, "versionNo"] as const;

export type CostCentreInput = {
  code: string;
  name: string;
  divisionId: string;
  shippingPointId: string | null;
  type: (typeof COST_CENTRE_TYPES)[number];
  budgetOwner: string | null;
  defaultGl: string | null;
  annualBudget: number | null;
  active: boolean;
  validFrom: string;
  validTo: string | null;
  reason: (typeof CHANGE_REASONS)[number];
  changeNote: string | null;
  externalId: string | null;
  versionNo?: number;
};
