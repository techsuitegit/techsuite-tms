# tms-web

Web-based SAP workflow approval for Purchase Requisitions, Purchase Orders, Quotations, and Service entries.

**Stack:** Next.js 16 (App Router), React 19, Prisma 7, PostgreSQL.

## Local start

1. Keep `.env` pointed at the PostgreSQL database you will create (`txpoprdb` by default).
2. Apply the table DDL yourself. Do not run Prisma migrate or `db push`.
3. Install and generate Prisma client:

   ```bash
   npm ci
   npx prisma generate
   ```

4. Run the app:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

Sign In currently opens the dashboard without login checks. Real authentication will be added later.
