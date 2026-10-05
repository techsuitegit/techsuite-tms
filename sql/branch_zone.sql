-- WBS 2.2 Zone — apply against POSTGRES_DB (txpoprdb).
-- Schema "branch". AUTO approval. No UI. No seed (WBS 2.18 seeds North/South/East/West).
-- Division.zone_id is owned by WBS 2.3. No lat/long. No hard DELETE.

create schema if not exists branch;

create table if not exists branch.zone (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,
  name         text not null,
  description  text,
  valid_from   date not null,
  valid_to     date,
  reason       text not null,
  change_note  text,
  status       text not null,
  version_no   integer not null default 1,
  external_id  text,
  created_at   timestamptz not null default now(),
  created_by   text,
  updated_at   timestamptz not null default now(),
  updated_by   text,
  deleted_at   timestamptz,
  constraint zone_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint zone_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint zone_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists zone_code_udx
  on branch.zone (upper(code))
  where deleted_at is null;

create unique index if not exists zone_external_id_udx
  on branch.zone (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists zone_status_idx
  on branch.zone (status)
  where deleted_at is null;

create index if not exists zone_validity_idx
  on branch.zone (valid_from, valid_to)
  where deleted_at is null;

create table if not exists branch.zone_version (
  id          uuid primary key default gen_random_uuid(),
  zone_id     uuid not null references branch.zone (id) on delete restrict,
  version_no  integer not null,
  snapshot    jsonb not null,
  recorded_at timestamptz not null default now(),
  recorded_by text,
  constraint zone_version_udx unique (zone_id, version_no)
);

create table if not exists branch.zone_audit (
  id         uuid primary key default gen_random_uuid(),
  zone_id    uuid not null references branch.zone (id) on delete restrict,
  action     text not null,
  actor      text,
  note       text,
  payload    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists zone_audit_row_idx
  on branch.zone_audit (zone_id, created_at);
