import { EncryptionService } from "@/app/api-services/utilities/encryption.service";
import { readBearerClaims } from "@/app/api-services/utilities/bearer-token-verifier";
import { ConfigurationError, UnauthorizedError, ValidationError } from "@/app/api-services/exceptions";

import type { CnnDbCredentials } from "./cnn-types";

export function isDemoTenantDb() {
  return (process.env.DEMO_TENANT_DB ?? "true").trim().toLowerCase() === "true";
}

export function demoCnnCredentials(): CnnDbCredentials {
  return {
    db_server: process.env.DEMO_DB_SERVER?.trim() || "localhost",
    db_port: process.env.DEMO_DB_PORT?.trim() || "5432",
    db_name: process.env.DEMO_DB_NAME?.trim() || "tms_master",
    db_defaultschema: process.env.DEMO_DB_SCHEMA?.trim() || "public",
    db_user: process.env.DEMO_DB_USER?.trim() || "postgres",
    db_password: process.env.DEMO_DB_PASSWORD ?? "root",
  };
}

export function readCnnCredentials(request: Request): CnnDbCredentials {
  if (isDemoTenantDb()) {
    return demoCnnCredentials();
  }

  const claims = readBearerClaims(request);
  const cipher = typeof claims.cnn === "string" ? claims.cnn.trim() : "";
  if (!cipher) {
    throw new UnauthorizedError("Access token does not contain cnn");
  }

  const password = process.env.AES_LEGACY_PASSWORD ?? "";
  if (!password.trim()) {
    throw new ConfigurationError("AES_LEGACY_PASSWORD is not configured in .env");
  }

  const plain = new EncryptionService(password).encryptionDecryption("D", cipher);
  if (plain == null) {
    throw new ValidationError("Unable to decrypt cnn");
  }

  return parseCnnCredentials(plain);
}

export function buildCnnConnectionString(credentials: CnnDbCredentials): string {
  const user = encodeURIComponent(credentials.db_user);
  const password = encodeURIComponent(credentials.db_password);
  const host = credentials.db_server;
  const port = credentials.db_port || "5432";
  const db = encodeURIComponent(credentials.db_name);
  const schema = encodeURIComponent(credentials.db_defaultschema || "public");
  return `postgresql://${user}:${password}@${host}:${port}/${db}?schema=${schema}`;
}

function parseCnnCredentials(plain: string): CnnDbCredentials {
  let parsed: unknown = plain;
  try {
    parsed = JSON.parse(plain);
  } catch {
    throw new ValidationError("cnn is not valid database credential JSON");
  }

  const root = asRecord(parsed);
  const data = asRecord(root?.data) ?? root;
  const credentials: CnnDbCredentials = {
    db_server: readField(data, ["db_server", "dbServer", "host"]),
    db_port: readField(data, ["db_port", "dbPort", "port"]) || "5432",
    db_name: readField(data, ["db_name", "dbName", "database"]),
    db_defaultschema: readField(data, ["db_defaultschema", "dbDefaultSchema", "schema"]) || "public",
    db_user: readField(data, ["db_user", "dbUser", "username", "user"]),
    db_password: readField(data, ["db_password", "dbPassword", "password"]),
  };

  if (!credentials.db_server || !credentials.db_name || !credentials.db_user) {
    throw new ValidationError("cnn is missing database host, name, or user");
  }

  return credentials;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readField(record: Record<string, unknown> | null, keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const match = Object.keys(record).find((entry) => entry.toLowerCase() === key.toLowerCase());
    const value = match ? record[match] : undefined;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}
