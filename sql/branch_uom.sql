-- WBS 2.6 UOM — apply against POSTGRES_DB (txpoprdb).
-- Schema "branch". AUTO publish. Seed L / KG / M3 / GAL / EA.
-- Same SQL is in prisma/migrations for prisma migrate deploy.

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

insert into branch.uom (
  code, name, is_base, factor_to_base, decimal_places, rounding, dimension,
  valid_from, reason, status, version_no, external_id, created_by, updated_by
)
select 'L', 'Litre', true, 1, 3, 'HALF_UP', 'VOLUME', current_date, 'New record', 'PUBLISHED', 1, 'L', 'sap-stub', 'sap-stub'
where not exists (select 1 from branch.uom where upper(code) = 'L' and deleted_at is null);

insert into branch.uom (
  code, name, is_base, factor_to_base, decimal_places, rounding, dimension,
  valid_from, reason, status, version_no, external_id, created_by, updated_by
)
select 'KG', 'Kilogram', true, 1, 3, 'HALF_UP', 'MASS', current_date, 'New record', 'PUBLISHED', 1, 'KG', 'sap-stub', 'sap-stub'
where not exists (select 1 from branch.uom where upper(code) = 'KG' and deleted_at is null);

insert into branch.uom (
  code, name, is_base, factor_to_base, decimal_places, rounding, dimension,
  valid_from, reason, status, version_no, external_id, created_by, updated_by
)
select 'M3', 'Cubic metre', true, 1, 4, 'HALF_UP', 'VOLUME', current_date, 'New record', 'PUBLISHED', 1, 'M3', 'sap-stub', 'sap-stub'
where not exists (select 1 from branch.uom where upper(code) = 'M3' and deleted_at is null);

insert into branch.uom (
  code, name, is_base, factor_to_base, decimal_places, rounding, dimension,
  valid_from, reason, status, version_no, external_id, created_by, updated_by
)
select 'GAL', 'Gallon', false, 3.78541178, 3, 'HALF_UP', 'VOLUME', current_date, 'New record', 'PUBLISHED', 1, 'GAL', 'sap-stub', 'sap-stub'
where not exists (select 1 from branch.uom where upper(code) = 'GAL' and deleted_at is null);

insert into branch.uom (
  code, name, is_base, factor_to_base, decimal_places, rounding, dimension,
  valid_from, reason, status, version_no, external_id, created_by, updated_by
)
select 'EA', 'Each', true, 1, 0, 'HALF_UP', 'COUNT', current_date, 'New record', 'PUBLISHED', 1, 'EA', 'sap-stub', 'sap-stub'
where not exists (select 1 from branch.uom where upper(code) = 'EA' and deleted_at is null);
