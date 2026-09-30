-- WBS 2.13 Vehicle / Truck — apply against POSTGRES_DB (txpoprdb).
-- Do not Prisma migrate / db push.
-- SAFETY approval. cost_centre_id is a UUID with no FK until WBS 2.4 exists.
-- No restriction-profile table. No sap-upsert.

create schema if not exists branch;

create table if not exists branch.vehicle (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null,
  plate              text not null,
  vin                text,
  make               text,
  model              text,
  model_year         integer,
  vehicle_class      text not null,
  shipping_point_id  uuid not null references branch.shipping_point (id) on delete restrict,
  division_id        uuid not null references branch.division (id) on delete restrict,
  cost_centre_id     uuid not null,
  capacity           numeric(18, 3) not null,
  capacity_uom_id    uuid not null references branch.uom (id) on delete restrict,
  gvw_kg             numeric(18, 3),
  tare_kg            numeric(18, 3),
  height_m           numeric(18, 3),
  length_m           numeric(18, 3),
  hazmat_class       text,
  axle_config        text,
  ptl_min_pct        numeric(5, 2),
  gps_device_id      text,
  insurance_expiry   date,
  fitness_expiry     date,
  permit_expiry      date,
  valid_from         date not null,
  valid_to           date,
  reason             text not null,
  change_note        text,
  status             text not null,
  version_no         integer not null default 1,
  external_id        text,
  created_at         timestamptz not null default now(),
  created_by         text,
  updated_at         timestamptz not null default now(),
  updated_by         text,
  deleted_at         timestamptz,
  constraint vehicle_class_chk check (vehicle_class in (
    'BOBTAIL_LPG', 'BOBTAIL_REFINED', 'TRANSPORT_TRACTOR', 'TANK_TRAILER', 'CYLINDER_TRUCK'
  )),
  constraint vehicle_hazmat_chk check (hazmat_class is null or hazmat_class in (
    'CLASS_2_1', 'CLASS_3', 'COMBINED', 'NON_HAZMAT'
  )),
  constraint vehicle_axle_chk check (axle_config is null or axle_config in (
    'AXLE_2_RIGID', 'AXLE_3_RIGID', 'TRACTOR_TRI'
  )),
  constraint vehicle_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint vehicle_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint vehicle_capacity_chk check (capacity > 0),
  constraint vehicle_ptl_chk check (ptl_min_pct is null or (ptl_min_pct >= 0 and ptl_min_pct <= 100)),
  constraint vehicle_year_chk check (model_year is null or (model_year >= 1900 and model_year <= 2100)),
  constraint vehicle_measure_chk check (
    (gvw_kg is null or gvw_kg > 0)
    and (tare_kg is null or tare_kg > 0)
    and (height_m is null or height_m > 0)
    and (length_m is null or length_m > 0)
  ),
  constraint vehicle_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists vehicle_code_udx
  on branch.vehicle (upper(code))
  where deleted_at is null;

create unique index if not exists vehicle_plate_udx
  on branch.vehicle (upper(plate))
  where deleted_at is null;

create unique index if not exists vehicle_external_id_udx
  on branch.vehicle (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists vehicle_status_idx
  on branch.vehicle (status)
  where deleted_at is null;

create index if not exists vehicle_validity_idx
  on branch.vehicle (valid_from, valid_to)
  where deleted_at is null;

create index if not exists vehicle_shipping_point_idx
  on branch.vehicle (shipping_point_id)
  where deleted_at is null;

create table if not exists branch.vehicle_compartment (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references branch.vehicle (id) on delete restrict,
  seq         integer not null,
  material_id uuid references branch.material (id) on delete restrict,
  volume      numeric(18, 3),
  constraint vehicle_compartment_seq_udx unique (vehicle_id, seq),
  constraint vehicle_compartment_seq_chk check (seq > 0),
  constraint vehicle_compartment_volume_chk check (volume is null or volume > 0)
);

create index if not exists vehicle_compartment_material_idx
  on branch.vehicle_compartment (material_id);

create table if not exists branch.vehicle_version (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references branch.vehicle (id) on delete restrict,
  version_no  integer not null,
  snapshot    jsonb not null,
  recorded_at timestamptz not null default now(),
  recorded_by text,
  constraint vehicle_version_udx unique (vehicle_id, version_no)
);

create table if not exists branch.vehicle_audit (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references branch.vehicle (id) on delete restrict,
  action      text not null,
  actor       text,
  note        text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists vehicle_audit_row_idx
  on branch.vehicle_audit (vehicle_id, created_at);
