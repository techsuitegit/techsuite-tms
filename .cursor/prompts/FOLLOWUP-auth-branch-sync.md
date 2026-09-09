# FOLLOW-UP PROMPT — MoteX further development (auth complete)

Paste this into a new Cursor chat after the login → authorization → dashboard flow is in place. This is a **setup / rule-book + build** prompt. Read `.cursor/rules/master-prompt.md` (Sections 22–27) first. **Do not modify `.env`.** Do not drop PostgreSQL database `pr_motex`. Do not invent `issuperuser` → `isadmin`. Do not log secrets (`SMTP_PASS`, `cnn`, `db_password`, raw JWT secrets, passwords).

---

## Context (already done — do not redo)

MoteX consumes Nexus Identity and authorizes against the client DB resolved from the JWT `cnn` claim.

- Sign-In → same-origin `POST /api/v1/auth/identity-session` → server `POST {IDENTITY_API_URL}/api/v1/jwt/login` (`producttype`, `enviroment`, `login`, `password`). Browser cannot call Nexus directly (CORS). If Identity 404s, confirm the hosted path.
- Then `POST {NEXT_PUBLIC_BASE_API_URL}/v1/jwt/authorization` with Bearer access token and body `{ "data": "Authorization" }`.
- `DatabaseConnectionResolver.databaseConnection(cnn)` is the **only** place `cnn` is decrypted.
- AES-256-CBC legacy (PBKDF2 SHA-1, UTF-16LE) uses `AES_LEGACY_PASSWORD` for both `cnn` decrypt and `branch` encrypt.
- Encrypted `branch` blob is stored in session; UI gets `code` / `branch_name` plus selected-branch `isadmin` / `permissions` from same-origin routes. AES key never goes to the browser.
- Zero active branches → `NO_ACTIVE_BRANCH`, discard session, stay on Login.
- One branch → auto-select. Two or more → picker (`code` / `branch_name` only) via `POST /api/v1/jwt/select-branch`.
- Forgot password UI exists; **do not** wire `JWT_PASSWORD_RESET_SECRET` or SMTP until specified.
- Motospear logo PNGs, tagline, theme chrome, dashboard dummy data: keep.
- Prisma models exist for `branch` / `branchuser` (`isadmin`, `permissions`, `status`). **No migrate has been run** against live DBs. `branchcontrol` is queried only if the table exists.

---

## Your job — inspect, plan, then wait for CONFIRM IMPLEMENTATION unless this prompt already confirms a slice

Work these items in order. Surface BACKEND CHANGES REQUIRED (Bible 17.2/17.3) instead of silently adding columns or env vars.

### 1. Client-DB schema for Authorization (BACKEND CHANGES)

Authorization expects, in the **resolved client database** default schema (`db_defaultschema`):

- `branch` — fields matching the Section 26 sync payload
- `branchuser` — `(branchcode, userid)` plus **`status`**, **`isadmin`**, **`permissions` (JSONB)**
- `branchcontrol` — nested per branch; **columns are still unknown** (not in Nexus Prisma)

Confirm with the project owner:

- Exact `branchcontrol` columns and join key (assume `branchcode` until confirmed).
- Whether Motex client DBs already have these tables (possibly still Nexus-shaped: `issuperuser` / `ishead`, no `status` / `isadmin` / `permissions`).
- Whether to `prisma migrate` those tables into each client DB (never drop `pr_motex`; never migrate without CONFIRM BACKEND CHANGES).

Until that lands, Authorization will fail with `SCHEMA_MISMATCH` / missing table if the client DB is empty.

### 2. Branch Sync service (deferred from Section 26)

Implement **only after** an explicit mapping decision:

```text
Nexus nested branchuser:  { branchcode, userid, issuperuser, ishead }
Motex local branchuser:   { branchcode, userid, status, isadmin, permissions }
```

Do **not** map `issuperuser → isadmin` unless the owner confirms it.

Proposed path (reuse, don't invent a second layout):

- `app/api-services/classes/branch/branch-sync.service.ts`
- Thin route **or** backend-only job — not a page. Prefer a secured API the app can call after login once mapping is confirmed, e.g. `POST {NEXT_PUBLIC_BASE_API_URL}/v1/branch/sync` that calls Nexus `POST {IDENTITY_API_URL}/v1/branch/sync` with Bearer + `{ client_code, environment, producttype }`, then upserts into the **cnn-resolved** client DB (`branch` on `code`, `branchuser` on `(branchcode, userid)`).

Also confirm `status` default on upserted `branchuser` rows (e.g. `'Active'`) and what `permissions` JSON should be when Nexus does not send it.

### 3. JWT refresh consume (not in Sections 24–25)

Access token is currently also persisted in `sessionStorage` so a tab refresh still works. Preferred Section 14 behavior: access token in memory, refresh token in `sessionStorage`, bootstrap calls Nexus `POST {IDENTITY_API_URL}/v1/jwt/refresh`. Add a thin BFF (not a competing `/v1/jwt/login`) and re-run Authorization if claims/`cnn` can change. Verify refresh tokens with `JWT_REFRESH_SECRET` only when this app must inspect them; Identity still issues them.

### 4. Session / chrome follow-through

- Show selected branch `code` / `branch_name` in the sidebar or header.
- Keep top-bar extras as visual no-ops until those modules exist.
- Idle timeout / multi-tab rules when Bible Sections 1–21 are pasted into `.cursor/rules/master-prompt.md`.
- Do not store decrypted `cnn` or `db_password` in Zustand / `sessionStorage`.

### 5. Password reset & mail

Out of scope until specified. Keep Forgot password UI. Never log `SMTP_PASS`.

### 6. Project Bible Sections 1–21

When the owner provides them, prepend them to `.cursor/rules/master-prompt.md`. Sections 22–27 already in that file stay authoritative for auth/branch.

---

## Constraints (unchanged)

- Do not add/rename/remove/change `.env` keys or values. New variables need Section 17.3 approval.
- Do not create a MoteX `/v1/jwt/login` that competes with Identity.
- Do not implement login inside MoteX. Consume Nexus only.
- `jsonwebtoken` is **verify-only** (and refresh-verify when item 3 is built). Never `jwt.sign` access tokens in MoteX.
- Reuse `EncryptionService` + `DatabaseConnectionResolver`. No second AES implementation.
- Read Next.js 16 docs under `node_modules/next/dist/docs/` before new routes.
- After UI work, verify in the browser: failed Identity stays on Login with `error.message`; zero branches stays on Login; one branch → dashboard; two branches → picker then dashboard.

When the plan is ready, stop and wait for **CONFIRM IMPLEMENTATION** (and **CONFIRM BACKEND CHANGES** if schema/migrate is required).
