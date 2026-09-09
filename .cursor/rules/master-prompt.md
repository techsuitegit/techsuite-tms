# MoteX — Project Bible (this repository)

Sections **1–21** of the Motospear Project Bible are **not yet in this repo**. Until they are supplied, this file holds the project-specific addendum only. Where this addendum gives a concrete detail, **it is authoritative for this project.**

---

# MoteX — Authentication, Authorization & Branch Resolution Spec
### Addendum to the Project Bible — Sections 22–27

This document **instantiates Section 0** of the Project Bible for this project and **adds project-specific implementation detail** that Sections 1–21 of the Bible don't yet contain. Sections 1–21 (architecture, folder structure, coding standards, security, session/multi-tab rules, approval gates, multi-agent workflow) apply in full and are not repeated here. Where this addendum gives a concrete detail that the generic Section 6 reference pattern only sketched, **this addendum is authoritative for this project.**

---

## 22. PROJECT IDENTIFICATION (Section 0 filled in)

```text
PROJECT_NAME:        MoteX
PROJECT_TYPE:        Enterprise Project Management System (multi-client, multi-branch)
STACK_FRONTEND:      Next.js (App Router) + TypeScript
STACK_BACKEND:       Next.js Route Handlers + Prisma ORM
STACK_DATABASE:      PostgreSQL — one physical database per client, multiple schemas per branch inside it
STACK_AUTH:          External Identity provider ("Nexus", at IDENTITY_API_URL) issues JWTs;
                     this application never authenticates users itself, only authorizes them.
REPO_STATUS:         existing shell (login / forgot-password / dashboard chrome; APIs reintroduced for authorization)
DEVIATIONS:          None. This addendum's Sections 22–27 take precedence over the generic
                     Section 6 pattern in the Bible wherever the two differ.
```

---

## 23. ENVIRONMENT CONFIGURATION — DO NOT MODIFY

A `.env` file already exists at the project root with the variables below. **Do not add, rename, remove, or change the value of any existing variable.** Read every value from this file through the project's typed config module (Section 4 of the Bible) — never re-declare a variable name, never hardcode a fallback value, never print or log a variable's raw value. If a task genuinely needs a new variable, raise it through the Bible's Section 17.3 approval gate before touching the file.

| Variable | Purpose in this application |
|---|---|
| `IDENTITY_API_URL` | Base URL of the external Identity ("Nexus") application. Used only to call `/v1/jwt/login` (Section 24) and `/v1/branch/sync` (Section 26). Never implement a competing login endpoint against this URL's shape. |
| `PRODUCT_TYPE` | Sent as `producttype` in calls to the Identity API. |
| `ENVIRONMENT` | Sent as `enviroment`/`environment` in calls to the Identity API. |
| `JWT_ACCESS_SECRET` | Shared secret this application uses to **verify** the signature of the Identity-issued access token presented as the Bearer token on the Authorization API (Section 25). This app does not issue access tokens with this secret. |
| `JWT_REFRESH_SECRET` | Same role as above, for verifying the Identity-issued refresh token when it is presented. |
| `JWT_PASSWORD_RESET_SECRET` | Reserved for a password-reset flow. Not part of the login/authorization flow in Sections 24–25; do not wire it into anything until that feature is specified. |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` / `JWT_PASSWORD_RESET_EXPIRES_IN` | Expiry windows this app applies wherever it is the one issuing/checking these token classes. |
| `AES_LEGACY_PASSWORD` | Symmetric key used by the single shared decryption/encryption utility described in Section 25.2 — for decrypting the `cnn` claim, and for encrypting the `branch` payload sent to the frontend (Section 25.4). |
| `NEXT_PUBLIC_BASE_API_URL` | This application's own API base. The frontend calls `POST {NEXT_PUBLIC_BASE_API_URL}/v1/jwt/authorization` here (Section 25). |
| `PORTAL_URL`, `ALLOWED_ORIGINS` | Routing/CORS config — apply per Section 12 of the Bible (explicit CORS, no wildcard in production). |
| `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_COPYRIGHT_YEAR`, `NEXT_PUBLIC_COMPANY_NAME`, `NEXT_PUBLIC_COPYRIGHT_TEXT`, `NEXT_PUBLIC_DEEFAULT_COLOR` | Branding/display only — not auth-related. |
| `MAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Outbound mail config for a future notification feature — out of scope for this addendum. Never log `SMTP_PASS` or any credential value. |

---

## 24. AUTHENTICATION — CONSUMED, NEVER BUILT

**Do not create an authentication/login API in this application.** Authentication is entirely owned by the external Identity application. This app only *consumes* it.

**Full successful flow:**
```text
Sign-In click → Authentication (external) → Authorization (this app) → Save session in browser → Dashboard
```

### 24.1 Call on Sign-In click
```text
Method:  POST
URL:     {IDENTITY_API_URL}/v1/jwt/login
Body:    {
           "producttype": "{env.PRODUCT_TYPE}",
           "enviroment":  "{env.ENVIRONMENT}",
           "login":       "<value from the login form>",
           "password":    "<value from the login form>"
         }
```

`IDENTITY_API_URL` is server-only. The browser cannot call Identity directly (Nexus CORS does not allow `http://localhost:3011`). Sign-In therefore posts same-origin to `POST /api/v1/auth/identity-session`, which **forwards** to Identity `{IDENTITY_API_URL}/api/v1/jwt/login` with `{ producttype, enviroment, login, password }`. That forwarder does not verify passwords or issue tokens, and it is not shaped as `/v1/jwt/login` on this app.

After Identity succeeds, the frontend calls this application's Authorization API (Section 25).

### 24.2 Success response (authoritative shape)
```json
{
  "data": {
    "token": "<JWT access token>",
    "refresh_token": "<JWT refresh token>",
    "issue": "2026-08-26T01:56:03.000Z",
    "expiry": "2026-08-26T02:26:03.000Z"
  }
}
```
The user's profile fields (`id`, `name`, `user_type`, `shortname`, `login_access`, `client_code`, `company_name`, `product_code`, `environment`, `cnn`, `iat`, `exp`, `iss`) are **not** repeated at the top level of this response — they live only as claims inside the decoded `token`. Never assume top-level profile fields exist on this response; always decode the JWT for that data.

### 24.3 Failure response
```json
{ "error": { "code": "UNAUTHORIZED", "message": "...", "details": {} } }
```
On failure: surface `error.message` to the user, and **store nothing** — no token, no refresh token, no session write of any kind.

### 24.4 On success
1. Hold `token` and `refresh_token` per the Bible's Section 14 storage rules (short-lived access token in memory where practical; refresh token in the safest compatible storage given this is a browser-only-accessible token pair from an external issuer — do not silently invent an `HttpOnly` cookie flow that the Identity API doesn't support).
2. Immediately call the Authorization API (Section 25) — do not route to the dashboard yet.
3. Only after Authorization succeeds with at least one active branch (Section 25.4) does the user proceed to the dashboard, per Section 24 opening flow diagram.

---

## 25. AUTHORIZATION — BUILT IN THIS APP

**This API must be created in this application** and called by the frontend immediately after a successful Authentication response.

```text
Method:  POST
URL:     {NEXT_PUBLIC_BASE_API_URL}/v1/jwt/authorization
Auth:    Authorization: Bearer <token>   (the Identity-issued access token from Section 24)
Body:    { "data": "Authorization" }
```

### 25.1 Server-side steps (controller stays thin per Section 7 — this is the Backend/API Agent's and Auth/Security Agent's lane, per Section 15)
1. Verify the Bearer token's signature and expiry using `JWT_ACCESS_SECRET`. Reject with a generic auth error if invalid/expired — never enumerate why beyond "unauthorized."
2. Decode the token's claims (profile + `cnn`).
3. Pass `cnn` to the shared **DatabaseConnectionResolver** (Section 25.2) to obtain this client's real DB connection info. Never decode/decrypt `cnn` anywhere except through that one shared resolver.
4. Using the resolved connection's **default schema** (e.g. `public` — this is the client's *primary/control* schema, not a branch schema yet), query `branchuser` joined to `branch` (and `branchcontrol`) for rows where `branchuser.userid = <claims.id>` and both `branchuser.status = 'Active'` and `branch.status = 'Active'`.
5. **No active branch found** → return `NO_ACTIVE_BRANCH` and do not include a `branch` array. The frontend must discard any token/refresh-token/session data already written, and keep the user on the Login page.
6. **One or more active branches found** → build the `branch` array using the `branch` table shape (Section 26 sync payload), plus `isadmin`/`permissions` from `branchuser` and the matching `branchcontrol` row nested per branch.

### 25.2 DatabaseConnectionResolver — single shared class, mandatory reuse
- Signature: `databaseConnection(cnn: string): DbConnectionInfo`
- Behavior: AES-decrypts `cnn` using `AES_LEGACY_PASSWORD`, parses the JSON payload, and returns `db_server`, `db_port`, `db_name`, `db_defaultschema`, `db_user`, `db_password`.
- Accept both `{ data: { db_server, ... } }` and the unwrapped `{ db_server, ... }` object (Nexus `encryptObject` of the inner connection).
- Location: `app/api-services/utilities/database-connection.resolver.ts` implementing `IDatabaseConnectionResolver`.
- Never log `db_password`, the raw `cnn` string, or the decrypted connection object in full.

### 25.3 Encrypting the response
The `branch` array is encrypted with the same AES utility/`AES_LEGACY_PASSWORD` before being sent to the frontend.

**Confirmed default:** the encrypted blob is stored and round-tripped; the same-origin Authorization (and select-branch) responses also return a non-sensitive subset (branch `code`/`branch_name` list, and `isadmin`/`permissions` for the *selected* branch only). The AES key never reaches the browser.

### 25.4 Session write / branch gate — exact sequence required
```text
Authentication succeeds
   → hold token + refresh_token (24.4)
   → call Authorization
        → no active branch  → discard token/refresh_token/any session data written so far
                             → stay on Login page, show message (e.g. "No active branch is linked
                               to your account. Please contact your administrator.")
        → ≥1 active branch  → store token, refresh_token, and branch data in the session
                             → proceed to Dashboard
```
If the user has access to exactly one branch, auto-select it (no picker). If more than one, surface only `code`/`branch_name` until a branch is selected — do not open the dashboard without a selected branch.

---

## 26. BRANCH SYNC — BACKEND-ONLY SERVICE

**Deferred.** See `.cursor/prompts/FOLLOWUP-auth-branch-sync.md`. Do not invent `issuperuser` → `isadmin` mapping.

```text
Method:  POST
URL:     {IDENTITY_API_URL}/v1/branch/sync
Auth:    JWT Bearer required
Body:    {
           "client_code": "<from the caller's JWT claims>",
           "environment": "{env.ENVIRONMENT}",
           "producttype": "{env.PRODUCT_TYPE}"
         }
```

**Write target:** resolve the requester's own database via `DatabaseConnectionResolver` from their `cnn` claim, then upsert into that client database's `branch` and `branchuser` tables (default/control schema).

---

## 27. OPEN ITEMS (confirmed / deferred)

1. **Frontend decryption of the `branch` payload** — CONFIRMED: encrypted blob + same-origin non-sensitive subset. No AES key in the browser.
2. **`branchuser` schema mismatch** for Branch Sync — DEFERRED. No silent mapping. Follow-up prompt.
3. **AES key reuse** — CONFIRMED: reuse `AES_LEGACY_PASSWORD` for `cnn` decrypt and `branch` encrypt. No new env var.
4. **Paths** — CONFIRMED as implemented under `app/shared/config/env.ts`, `app/api-services/utilities/`, `app/api-services/classes/auth/`, `app/api/v1/jwt/authorization/`.
