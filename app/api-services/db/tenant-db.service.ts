import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import { DatabaseConnectionError } from "@/app/api-services/exceptions";

import { buildCnnConnectionString, isDemoTenantDb, readCnnCredentials } from "./cnn-connection.service";
import type { CnnDbCredentials } from "./cnn-types";

type CachedTenant = {
  pool: Pool;
  prisma: PrismaClient;
};

const tenants = new Map<string, CachedTenant>();

export async function withTenantPrisma<T>(
  request: Request,
  run: (prisma: PrismaClient) => Promise<T>,
): Promise<T> {
  const prisma = getTenantPrisma(request);
  return run(prisma);
}

export function getTenantPrisma(request: Request): PrismaClient {
  return getTenant(readCnnCredentials(request)).prisma;
}

export function getTenantPool(request: Request): Pool {
  return getTenant(readCnnCredentials(request)).pool;
}

export async function pingTenantDatabase(request: Request) {
  const credentials = readCnnCredentials(request);
  const { pool } = getTenant(credentials);

  try {
    const result = await pool.query<{
      database: string;
      db_user: string;
      schema: string;
    }>("select current_database() as database, current_user as db_user, current_schema() as schema");
    const row = result.rows[0];
    return {
      connected: true,
      source: isDemoTenantDb() ? "demo" : "cnn",
      host: credentials.db_server,
      port: credentials.db_port,
      database: row?.database ?? credentials.db_name,
      schema: row?.schema ?? credentials.db_defaultschema,
      user: row?.db_user ?? credentials.db_user,
    };
  } catch {
    throw new DatabaseConnectionError();
  }
}

function getTenant(credentials: CnnDbCredentials): CachedTenant {
  const key = tenantKey(credentials);
  const existing = tenants.get(key);
  if (existing) return existing;

  const pool = new Pool({
    connectionString: buildCnnConnectionString(credentials),
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  const adapter = new PrismaPg(pool, { schema: credentials.db_defaultschema || "public" });
  const prisma = new PrismaClient({ adapter });
  const tenant = { pool, prisma };
  tenants.set(key, tenant);
  return tenant;
}

function tenantKey(credentials: CnnDbCredentials) {
  return [
    credentials.db_server,
    credentials.db_port,
    credentials.db_name,
    credentials.db_user,
    credentials.db_defaultschema,
    credentials.db_password,
  ].join("|");
}
