-- WBS 2.10 Storage Tank — apply against POSTGRES_DB (txpoprdb) after material, shipping point, vendor, uom.
-- Schema "branch". SAFETY approval. legal_entity_id is a UUID with no FK until WBS 2.1 exists.

create schema if not exists branch;

create table if not exists branch.storage_tank (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null,
  name                 text not null,
  ownership            text not null,
  material_id          uuid not null references branch.material (id) on delete restrict,
  legal_entity_id      uuid,
  shipping_point_id    uuid references branch.shipping_point (id) on delete restrict,
  customer_code        text,
  vendor_id            uuid references branch.vendor (id) on delete restrict,
  dispatcher_point_id  uuid references branch.shipping_point (id) on delete restrict,
  capacity_l           numeric(18, 3) not null,
  safe_fill_l          numeric(18, 3) not null,
  safety_stock_l       numeric(18, 3),
  reorder_l            numeric(18, 3),
  capacity_uom_id      uuid references branch.uom (id) on delete restrict,
  gauge_type           text,
  gauge_device_ref     text,
  last_calibration     date,
  inspection_due       date,
  certificate          text,
  valid_from           date not null,
  valid_to             date,
  reason               text not null,
  change_note          text,
  status               text not null,
  version_no           integer not null default 1,
  external_id          text,
  created_at           timestamptz not null default now(),
  created_by           text,
  updated_at           timestamptz not null default now(),
  updated_by           text,
  deleted_at           timestamptz,
  constraint storage_tank_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint storage_tank_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint storage_tank_ownership_chk check (ownership in ('OWN', 'CUSTOMER', 'SUPPLIER')),
  constraint storage_tank_fill_chk check (safe_fill_l <= capacity_l and capacity_l > 0 and safe_fill_l > 0),
  constraint storage_tank_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists storage_tank_code_udx
  on branch.storage_tank (upper(code))
  where deleted_at is null;

create unique index if not exists storage_tank_external_id_udx
  on branch.storage_tank (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists storage_tank_status_idx
  on branch.storage_tank (status)
  where deleted_at is null;

create index if not exists storage_tank_validity_idx
  on branch.storage_tank (valid_from, valid_to)
  where deleted_at is null;

create table if not exists branch.storage_tank_version (
  id              uuid primary key default gen_random_uuid(),
  storage_tank_id uuid not null references branch.storage_tank (id) on delete restrict,
  version_no      integer not null,
  snapshot        jsonb not null,
  recorded_at     timestamptz not null default now(),
  recorded_by     text,
  constraint storage_tank_version_udx unique (storage_tank_id, version_no)
);

create table if not exists branch.storage_tank_audit (
  id              uuid primary key default gen_random_uuid(),
  storage_tank_id uuid not null references branch.storage_tank (id) on delete restrict,
  action          text not null,
  actor           text,
  note            text,
  payload         jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists storage_tank_audit_row_idx
  on branch.storage_tank_audit (storage_tank_id, created_at);
