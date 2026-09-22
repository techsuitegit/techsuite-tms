-- WBS 2.7 Vendor / Supplier (SAP sync) — apply against POSTGRES_DB (txpoprdb).
-- Do not Prisma migrate / db push.
-- Schema "branch" lives in txpoprdb, not in tms_master, and not in public.

create schema if not exists branch;

create table if not exists branch.vendor (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,
  name         text not null,
  type         text not null,
  active       boolean not null default true,
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
  constraint vendor_type_chk check (type in ('SUPPLIER', 'CARRIER', 'DEVICE')),
  constraint vendor_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint vendor_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint vendor_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists vendor_code_udx
  on branch.vendor (upper(code))
  where deleted_at is null;

create unique index if not exists vendor_external_id_udx
  on branch.vendor (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists vendor_status_idx
  on branch.vendor (status)
  where deleted_at is null;

create index if not exists vendor_validity_idx
  on branch.vendor (valid_from, valid_to)
  where deleted_at is null;

create table if not exists branch.vendor_version (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references branch.vendor (id) on delete restrict,
  version_no  integer not null,
  snapshot    jsonb not null,
  recorded_at timestamptz not null default now(),
  recorded_by text,
  constraint vendor_version_udx unique (vendor_id, version_no)
);

create table if not exists branch.vendor_audit (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references branch.vendor (id) on delete restrict,
  action     text not null,
  actor      text,
  note       text,
  payload    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vendor_audit_row_idx
  on branch.vendor_audit (vendor_id, created_at);

insert into branch.vendor (code, name, type, active, valid_from, reason, status, version_no, external_id, created_by, updated_by)
select '300012', 'HPCL', 'SUPPLIER', true, current_date, 'New record', 'PUBLISHED', 1, 'V-HPCL', 'sap-stub', 'sap-stub'
where not exists (
  select 1 from branch.vendor where upper(code) = '300012' and deleted_at is null
);

insert into branch.vendor (code, name, type, active, valid_from, reason, status, version_no, external_id, created_by, updated_by)
select '300013', 'IOCL', 'SUPPLIER', true, current_date, 'New record', 'PUBLISHED', 1, 'V-IOCL', 'sap-stub', 'sap-stub'
where not exists (
  select 1 from branch.vendor where upper(code) = '300013' and deleted_at is null
);

insert into branch.vendor (code, name, type, active, valid_from, reason, status, version_no, external_id, created_by, updated_by)
select '300014', 'BPCL', 'SUPPLIER', true, current_date, 'New record', 'PUBLISHED', 1, 'V-BPCL', 'sap-stub', 'sap-stub'
where not exists (
  select 1 from branch.vendor where upper(code) = '300014' and deleted_at is null
);

insert into branch.vendor (code, name, type, active, valid_from, reason, status, version_no, external_id, created_by, updated_by)
select 'D-OTO-01', 'Otodata', 'DEVICE', true, current_date, 'New record', 'PUBLISHED', 1, 'V-OTODATA', 'sap-stub', 'sap-stub'
where not exists (
  select 1 from branch.vendor where upper(code) = 'D-OTO-01' and deleted_at is null
);
