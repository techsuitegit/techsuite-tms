export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;

export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;

export const STANDARD_METHODS = ["Road", "Rail", "Pipeline", "Marine"] as const;

export const CREATE_FIELDS = [
  "code",
  "name",
  "legalEntityId",
  "zoneId",
  "searchTerm1",
  "searchTerm2",
  "street",
  "district",
  "postalCode",
  "city",
  "country",
  "region",
  "timeZone",
  "poBox",
  "poBoxPostalCode",
  "companyPostalCode",
  "language",
  "telephone",
  "extension",
  "mobile",
  "fax",
  "email",
  "standardMethod",
  "comments",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
  "externalId",
] as const;

export const UPDATE_FIELDS = [...CREATE_FIELDS, "versionNo"] as const;

export type DivisionInput = {
  code: string;
  name: string;
  legalEntityId: string;
  zoneId: string;
  searchTerm1: string | null;
  searchTerm2: string | null;
  street: string | null;
  district: string | null;
  postalCode: string;
  city: string;
  country: string;
  region: string | null;
  timeZone: string;
  poBox: string | null;
  poBoxPostalCode: string | null;
  companyPostalCode: string | null;
  language: string | null;
  telephone: string | null;
  extension: string | null;
  mobile: string | null;
  fax: string | null;
  email: string | null;
  standardMethod: (typeof STANDARD_METHODS)[number] | null;
  comments: string | null;
  validFrom: string;
  validTo: string | null;
  reason: (typeof CHANGE_REASONS)[number];
  changeNote: string | null;
  externalId: string | null;
  versionNo?: number;
};
