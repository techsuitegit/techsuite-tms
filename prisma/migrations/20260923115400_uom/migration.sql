-- WBS 2.6 UOM-only. Do not generate a full-schema migrate from prisma/schema.prisma.
-- Apply with: npx prisma migrate deploy   OR   npm run api:sql

create schema if not exists branch;

create table if not exists branch.uom (
  id              uuid primary key default gen_random_uuid(),
  code            text not null,
  name            text not null,
  is_base         boolean not null default false,
  factor_to_base  numeric(18, 8) not null,
  decimal_places  integer not null,
  rounding        text not null,
  dimension       text,
  valid_from      date not null,
  valid_to        date,
  reason          text not null,
  change_note     text,
  status          text not null,
  version_no      integer not null default 1,
  external_id     text,
  created_at      timestamptz not null default now(),
  created_by      text,
  updated_at      timestamptz not null default now(),
  updated_by      text,
  deleted_at      timestamptz,
  constraint uom_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint uom_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint uom_rounding_chk check (rounding in ('HALF_UP', 'DOWN', 'COMMERCIAL')),
  constraint uom_dimension_chk check (dimension is null or dimension in ('VOLUME', 'MASS', 'COUNT', 'TIME')),
  constraint uom_factor_chk check (factor_to_base > 0),
  constraint uom_decimals_chk check (decimal_places >= 0),
  constraint uom_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists uom_code_udx
  on branch.uom (upper(code))
  where deleted_at is null;

create unique index if not exists uom_external_id_udx
  on branch.uom (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists uom_status_idx
  on branch.uom (status)
  where deleted_at is null;

create index if not exists uom_validity_idx
  on branch.uom (valid_from, valid_to)
  where deleted_at is null;

create table if not exists branch.uom_version (
  id          uuid primary key default gen_random_uuid(),
  uom_id      uuid not null references branch.uom (id) on delete restrict,
  version_no  integer not null,
  snapshot    jsonb not null,
  recorded_at timestamptz not null default now(),
  recorded_by text,
  constraint uom_version_udx unique (uom_id, version_no)
);

create table if not exists branch.uom_audit (
  id         uuid primary key default gen_random_uuid(),
  uom_id     uuid not null references branch.uom (id) on delete restrict,
  action     text not null,
  actor      text,
  note       text,
  payload    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists uom_audit_row_idx
  on branch.uom_audit (uom_id, created_at);
