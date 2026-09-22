import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { appDatabaseName, createAdminPool, createAppPool } from "./db/pool";

async function ensureDatabase(name: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error("POSTGRES_DB is not a safe database name");
  }
  const admin = createAdminPool();
  try {
    const existing = await admin.query("select 1 from pg_database where datname = $1", [name]);
    if ((existing.rowCount ?? 0) === 0) {
      await admin.query(`create database ${name}`);
      process.stdout.write(`Created database ${name}\n`);
    }
  } finally {
    await admin.end();
  }
}

async function main() {
  const database = appDatabaseName();
  await ensureDatabase(database);

  const files = ["branch_shipping_point.sql", "branch_vendor.sql"];
  const pool = createAppPool();
  try {
    for (const name of files) {
      const sql = await readFile(path.join(process.cwd(), "sql", name), "utf8");
      await pool.query(sql);
      process.stdout.write(`Applied sql/${name} to ${database}.branch\n`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
