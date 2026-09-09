import "dotenv/config";
import { defineConfig } from "prisma/config";

const user = encodeURIComponent(process.env.POSTGRES_USER ?? "postgres");
const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? "postgres");
const host = process.env.POSTGRES_HOST ?? "localhost";
const port = process.env.POSTGRES_PORT ?? "5432";
const db = process.env.POSTGRES_DB ?? "txpoprdb";
const schema = process.env.POSTGRES_SCHEMA ?? "public";

const databaseUrl =
  process.env.DATABASE_URL ?? `postgresql://${user}:${password}@${host}:${port}/${db}?schema=${schema}`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
  },
});
