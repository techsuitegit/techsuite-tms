import { Pool } from "pg";

function env(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function postgresConfig(database: string) {
  return {
    host: env("POSTGRES_HOST", "localhost"),
    port: Number(env("POSTGRES_PORT", "5432")),
    database,
    user: env("POSTGRES_USER", "postgres"),
    password: process.env.POSTGRES_PASSWORD ?? "root",
    max: 10,
    idleTimeoutMillis: 30_000,
  };
}

export function appDatabaseName() {
  return env("POSTGRES_DB", "txpoprdb");
}

export function createAppPool() {
  return new Pool(postgresConfig(appDatabaseName()));
}

export function createAdminPool() {
  return new Pool(postgresConfig("postgres"));
}
