-- WBS 2.15 Cylinder — apply against POSTGRES_DB (txpoprdb).
-- Do not Prisma migrate / db push.
-- SAFETY approval. Not a storage tank. No sap-upsert.

create schema if not exists branch;

create table if not exists branch.cylinder (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null,
  serial                text not null,
  rfid                  text,
  size                  text not null,
  material_id           uuid not null references branch.material (id) on delete restrict,
  tare_kg               numeric(18, 3) not null,
  fill_capacity         numeric(18, 3) not null,
  valve_type            text,
  requalification_due   date not null,
  custody_state         text not null,
  location_text         text,
  shipping_point_id     uuid references branch.shipping_point (id) on delete restrict,
  valid_from            date not null,
  valid_to              date,
  reason                text not null,
  change_note           text,
  status                text not null,
  version_no            integer not null default 1,
  external_id           text,
  created_at            timestamptz not null default now(),
  created_by            text,
  updated_at            timestamptz not null default now(),
  updated_by            text,
  deleted_at            timestamptz,
  constraint cylinder_size_chk check (size in ('LB20_KG9', 'LB30_KG14', 'LB40_KG18', 'LB100_KG45')),
  constraint cylinder_valve_chk check (valve_type is null or valve_type in ('OPD', 'POL', 'ACME')),
  constraint cylinder_custody_chk check (custody_state in ('PLANT', 'TRUCK', 'CUSTOMER', 'IN_TRANSIT', 'MAINTENANCE')),
  constraint cylinder_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint cylinder_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint cylinder_weight_chk check (tare_kg > 0 and fill_capacity > 0),
  constraint cylinder_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists cylinder_code_udx
  on branch.cylinder (upper(code))
  where deleted_at is null;

create unique index if not exists cylinder_serial_udx
  on branch.cylinder (upper(serial))
  where deleted_at is null;

create unique index if not exists cylinder_rfid_udx
  on branch.cylinder (upper(rfid))
  where rfid is not null and deleted_at is null;

create unique index if not exists cylinder_external_id_udx
  on branch.cylinder (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists cylinder_status_idx
  on branch.cylinder (status)
  where deleted_at is null;

create index if not exists cylinder_validity_idx
  on branch.cylinder (valid_from, valid_to)
  where deleted_at is null;

create index if not exists cylinder_material_idx
  on branch.cylinder (material_id)
  where deleted_at is null;

create table if not exists branch.cylinder_version (
  id           uuid primary key default gen_random_uuid(),
  cylinder_id  uuid not null references branch.cylinder (id) on delete restrict,
  version_no   integer not null,
  snapshot     jsonb not null,
  recorded_at  timestamptz not null default now(),
  recorded_by  text,
  constraint cylinder_version_udx unique (cylinder_id, version_no)
);

create table if not exists branch.cylinder_audit (
  id           uuid primary key default gen_random_uuid(),
  cylinder_id  uuid not null references branch.cylinder (id) on delete restrict,
  action       text not null,
  actor        text,
  note         text,
  payload      jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists cylinder_audit_row_idx
  on branch.cylinder_audit (cylinder_id, created_at);
