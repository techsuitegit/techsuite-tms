import { MdmError } from "../errors/mdm-error";
import { isMaterialId } from "./material-validation";
import {
  CHANGE_REASONS,
  CONDITION_FIELDS,
  CONDITION_OPERATORS,
  CONDITION_VARIABLES,
  CREATE_FIELDS,
  EVALUATE_FIELDS,
  JOIN_OPS,
  MASTER_STATUSES,
  NUMERIC_VARIABLES,
  RULE_FIELDS,
  UPDATE_FIELDS,
  type EvaluateFacts,
  type PricingConditionInput,
  type PricingProcedureInput,
  type PricingRuleInput,
} from "./pricing-procedure-types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z0-9._\-/]{1,40}$/;
const PROCEDURE_ID_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Z0-9][A-Z0-9._\-/]{0,39})$/i;

export function isPricingProcedureId(value: string) {
  return PROCEDURE_ID_RE.test(value);
}

export function parseCreateBody(body: Record<string, unknown>): PricingProcedureInput {
  rejectUnknown(body, CREATE_FIELDS);
  return parseFields(body, false);
}

export function parseUpdateBody(body: Record<string, unknown>): PricingProcedureInput {
  rejectUnknown(body, UPDATE_FIELDS);
  const parsed = parseFields(body);
  if (typeof body.versionNo !== "number" || !Number.isInteger(body.versionNo) || body.versionNo < 1) {
    throw new MdmError("VALIDATION", "versionNo is required", 400, "versionNo");
  }
  parsed.versionNo = body.versionNo;
  return parsed;
}

export function parseEvaluateBody(body: Record<string, unknown>): EvaluateFacts {
  rejectUnknown(body, EVALUATE_FIELDS);
  return {
    customerClass: optionalString(body, "customerClass"),
    customerName: optionalString(body, "customerName"),
    km: optionalNumber(body, "km"),
    truckType: optionalString(body, "truckType"),
    volume: optionalNumber(body, "volume"),
    materialId: optionalString(body, "materialId"),
  };
}

export function parseStatusFilter(value: string | null) {
  if (!value) return null;
  if (!MASTER_STATUSES.includes(value as (typeof MASTER_STATUSES)[number])) {
    throw new MdmError("VALIDATION", "Invalid status filter", 400, "status");
  }
  return value;
}

export function materialIdsIn(input: PricingProcedureInput) {
  return input.rules.flatMap((rule) =>
    rule.conditions.filter((condition) => condition.variable === "MATERIAL" && condition.value).map((condition) => condition.value as string),
  );
}

function parseFields(body: Record<string, unknown>, requireCode = true): PricingProcedureInput {
  const code = readCode(body, requireCode, "code");
  const validFrom = requiredDate(body, "validFrom");
  const validTo = optionalDate(body, "validTo");
  if (validTo && validTo < validFrom) {
    throw new MdmError("VALIDATION", "validTo must be on or after validFrom", 400, "validTo");
  }
  if (typeof body.active !== "boolean") {
    throw new MdmError("VALIDATION", "active is required", 400, "active");
  }
  return {
    code,
    name: requiredString(body, "name"),
    accessSequence: requiredString(body, "accessSequence"),
    active: body.active,
    rules: parseRules(body.rules, requireCode),
    validFrom,
    validTo,
    reason: requiredEnum(body, "reason", CHANGE_REASONS),
    changeNote: optionalString(body, "changeNote"),
    externalId: optionalString(body, "externalId"),
  };
}

function parseRules(value: unknown, requireCode: boolean): PricingRuleInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new MdmError("VALIDATION", "rules must contain at least one rule", 400, "rules");
  }
  const seen = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new MdmError("VALIDATION", "rules must be objects", 400, "rules");
    }
    const rule = item as Record<string, unknown>;
    rejectUnknown(rule, RULE_FIELDS, `rules[${index}]`);
    const code = readCode(rule, requireCode, `rules[${index}].code`);
    if (code && seen.has(code)) {
      throw new MdmError("VALIDATION", "rule code must be unique in the procedure", 400, `rules[${index}].code`);
    }
    if (code) seen.add(code);
    if (typeof rule.priority !== "number" || !Number.isInteger(rule.priority)) {
      throw new MdmError("VALIDATION", "priority must be an integer", 400, `rules[${index}].priority`);
    }
    return {
      code,
      priority: rule.priority,
      join: requiredEnum(rule, "join", JOIN_OPS, `rules[${index}].join`),
      amount: requiredAmount(rule, `rules[${index}].amount`),
      conditions: parseConditions(rule.conditions, index),
    };
  });
}

function parseConditions(value: unknown, ruleIndex: number): PricingConditionInput[] {
  const field = `rules[${ruleIndex}].conditions`;
  if (!Array.isArray(value) || value.length === 0) {
    throw new MdmError("VALIDATION", "each rule needs at least one condition", 400, field);
  }
  return value.map((item, index) => {
    const path = `${field}[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new MdmError("VALIDATION", "conditions must be objects", 400, path);
    }
    const condition = item as Record<string, unknown>;
    rejectUnknown(condition, CONDITION_FIELDS, path);
    const variable = requiredEnum(condition, "variable", CONDITION_VARIABLES, `${path}.variable`);
    const operator = requiredEnum(condition, "operator", CONDITION_OPERATORS, `${path}.operator`);
    if ((operator === "GT" || operator === "LT") && !NUMERIC_VARIABLES.includes(variable as (typeof NUMERIC_VARIABLES)[number])) {
      throw new MdmError("VALIDATION", "GT and LT are only valid for KILOMETRES and VOLUME", 400, `${path}.operator`);
    }
    if (operator === "NULL") {
      if (condition.value != null && condition.value !== "") {
        throw new MdmError("VALIDATION", "value must be empty when operator is NULL", 400, `${path}.value`);
      }
      return { variable, operator, value: null };
    }
    const text = requiredString(condition, "value", `${path}.value`);
    if (variable === "MATERIAL" && !isMaterialId(text)) {
      throw new MdmError("VALIDATION", "MATERIAL value must be a materialId", 400, `${path}.value`);
    }
    if (NUMERIC_VARIABLES.includes(variable as (typeof NUMERIC_VARIABLES)[number]) && !Number.isFinite(Number(text))) {
      throw new MdmError("VALIDATION", "value must be numeric", 400, `${path}.value`);
    }
    return { variable, operator, value: text };
  });
}

function rejectUnknown(body: Record<string, unknown>, allowed: readonly string[], label = "") {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      throw new MdmError("VALIDATION", `Unknown field ${label ? `${label}.` : ""}${key}`, 400, label ? `${label}.${key}` : key);
    }
  }
}

function readCode(body: Record<string, unknown>, required: boolean, label: string) {
  const value = body.code;
  if (value == null || value === "") {
    if (!required) return "";
    throw new MdmError("VALIDATION", `${label} is required`, 400, label);
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new MdmError("VALIDATION", `${label} is required`, 400, label);
  }
  const code = value.trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    throw new MdmError("VALIDATION", `${label} must be 1-40 letters, digits, or . _ - /`, 400, label);
  }
  return code;
}

function requiredString(body: Record<string, unknown>, field: string, label = field) {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw new MdmError("VALIDATION", `${label} is required`, 400, label);
  return value.trim();
}

function requiredEnum<T extends string>(body: Record<string, unknown>, field: string, allowed: readonly T[], label = field): T {
  const value = requiredString(body, field, label);
  if (!allowed.includes(value as T)) throw new MdmError("VALIDATION", `${label} is invalid`, 400, label);
  return value as T;
}

function requiredDate(body: Record<string, unknown>, field: string) {
  const value = requiredString(body, field);
  if (!DATE_RE.test(value)) throw new MdmError("VALIDATION", `${field} must be YYYY-MM-DD`, 400, field);
  return value;
}

function requiredAmount(body: Record<string, unknown>, label: string) {
  const value = body.amount;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new MdmError("VALIDATION", "amount must be a number greater than 0", 400, label);
  }
  const rounded = Math.round(value * 100) / 100;
  if (Math.abs(rounded - value) > 1e-9) {
    throw new MdmError("VALIDATION", "amount must have at most 2 decimal places", 400, label);
  }
  return rounded;
}

function optionalString(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new MdmError("VALIDATION", `${field} must be text`, 400, field);
  return value.trim() || null;
}

function optionalDate(body: Record<string, unknown>, field: string) {
  const value = optionalString(body, field);
  if (!value) return null;
  if (!DATE_RE.test(value)) throw new MdmError("VALIDATION", `${field} must be YYYY-MM-DD`, 400, field);
  return value;
}

function optionalNumber(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MdmError("VALIDATION", `${field} must be a number`, 400, field);
  }
  return value;
}
