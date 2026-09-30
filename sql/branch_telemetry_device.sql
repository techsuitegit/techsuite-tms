-- WBS 2.16 Telemetry Device — apply against POSTGRES_DB (txpoprdb).
-- Do not Prisma migrate / db push.
-- AUTO approval. Hardware register only. No readings table.

create schema if not exists branch;

create table if not exists branch.telemetry_device (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  vendor_id        uuid not null references branch.vendor (id) on delete restrict,
  model            text,
  imei             text,
  pairing_state    text not null,
  storage_tank_id  uuid references branch.storage_tank (id) on delete restrict,
  cadence          text,
  health           text not null,
  battery_pct      integer,
  signal           text,
  valid_from       date not null,
  valid_to         date,
  reason           text not null,
  change_note      text,
  status           text not null,
  version_no       integer not null default 1,
  external_id      text,
  created_at       timestamptz not null default now(),
  created_by       text,
  updated_at       timestamptz not null default now(),
  updated_by       text,
  deleted_at       timestamptz,
  constraint telemetry_device_pairing_chk check (pairing_state in ('PAIRED_REPORTING', 'PAIRED_NO_SIGNAL', 'UNPAIRED_STOCK')),
  constraint telemetry_device_pair_tank_chk check (
    (pairing_state = 'UNPAIRED_STOCK' and storage_tank_id is null)
    or (pairing_state in ('PAIRED_REPORTING', 'PAIRED_NO_SIGNAL') and storage_tank_id is not null)
  ),
  constraint telemetry_device_cadence_chk check (cadence is null or cadence in ('M15', 'H1', 'H4', 'D1')),
  constraint telemetry_device_health_chk check (health in ('HEALTHY', 'BATTERY_LOW', 'NO_SIGNAL', 'FAULTY')),
  constraint telemetry_device_battery_chk check (battery_pct is null or (battery_pct >= 0 and battery_pct <= 100)),
  constraint telemetry_device_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint telemetry_device_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint telemetry_device_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists telemetry_device_code_udx
  on branch.telemetry_device (upper(code))
  where deleted_at is null;

create unique index if not exists telemetry_device_imei_udx
  on branch.telemetry_device (upper(imei))
  where imei is not null and deleted_at is null;

create unique index if not exists telemetry_device_external_id_udx
  on branch.telemetry_device (external_id)
  where external_id is not null and deleted_at is null;

create unique index if not exists telemetry_device_paired_tank_udx
  on branch.telemetry_device (storage_tank_id)
  where storage_tank_id is not null
    and pairing_state like 'PAIRED%'
    and deleted_at is null;

create index if not exists telemetry_device_status_idx
  on branch.telemetry_device (status)
  where deleted_at is null;

create index if not exists telemetry_device_validity_idx
  on branch.telemetry_device (valid_from, valid_to)
  where deleted_at is null;

create index if not exists telemetry_device_vendor_idx
  on branch.telemetry_device (vendor_id)
  where deleted_at is null;

create table if not exists branch.telemetry_device_version (
  id                   uuid primary key default gen_random_uuid(),
  telemetry_device_id  uuid not null references branch.telemetry_device (id) on delete restrict,
  version_no           integer not null,
  snapshot             jsonb not null,
  recorded_at          timestamptz not null default now(),
  recorded_by          text,
  constraint telemetry_device_version_udx unique (telemetry_device_id, version_no)
);

create table if not exists branch.telemetry_device_audit (
  id                   uuid primary key default gen_random_uuid(),
  telemetry_device_id  uuid not null references branch.telemetry_device (id) on delete restrict,
  action               text not null,
  actor                text,
  note                 text,
  payload              jsonb,
  created_at           timestamptz not null default now()
);

create index if not exists telemetry_device_audit_row_idx
  on branch.telemetry_device_audit (telemetry_device_id, created_at);
