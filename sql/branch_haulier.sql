-- WBS 2.17 Haulier — apply against POSTGRES_DB (txpoprdb).
-- Do not Prisma migrate / db push.
-- FINANCIAL approval. Not a Vendor. No sap-upsert. zone_ids stores Zone ids; an array has no FK.

create schema if not exists branch;

create table if not exists branch.haulier (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null,
  name                 text not null,
  registration         text,
  dispatch_contact     text,
  dispatch_phone       text,
  email                text,
  vehicle_types        text[] not null,
  units_available      integer,
  zone_ids             uuid[],
  hazmat_certified     boolean not null,
  rate_basis           text not null,
  rate                 numeric(14, 2) not null,
  min_charge           numeric(14, 2),
  demurrage            numeric(14, 2),
  fuel_surcharge       numeric(14, 2),
  surcharge_unit       text not null default 'PCT',
  contract_start       date not null,
  contract_end         date not null,
  insurance_expiry     date,
  payment_terms_text   text,
  rating               numeric(3, 2),
  on_time_pct          numeric(5, 2),
  accuracy_pct         numeric(5, 2),
  trips_ytd            integer,
  volume_ytd           numeric(14, 2),
  notes                text,
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
  constraint haulier_vehicle_types_chk check (
    cardinality(vehicle_types) >= 1
    and vehicle_types <@ array['BOBTAIL_LPG', 'BOBTAIL_REFINED', 'TRANSPORT_TRACTOR', 'TANK_TRAILER', 'CYLINDER_TRUCK']::text[]
  ),
  constraint haulier_units_chk check (units_available is null or units_available >= 0),
  constraint haulier_rate_basis_chk check (rate_basis in ('PER_TRIP', 'PER_KM', 'PER_TONNE', 'PER_HOUR', 'PER_LITRE')),
  constraint haulier_rate_chk check (rate > 0),
  constraint haulier_money_chk check (
    (min_charge is null or min_charge >= 0)
    and (demurrage is null or demurrage >= 0)
    and (fuel_surcharge is null or fuel_surcharge >= 0)
    and (volume_ytd is null or volume_ytd >= 0)
  ),
  constraint haulier_surcharge_unit_chk check (surcharge_unit in ('PCT', 'AMT')),
  constraint haulier_contract_chk check (contract_end >= contract_start),
  constraint haulier_rating_chk check (rating is null or (rating >= 1 and rating <= 5)),
  constraint haulier_pct_chk check (
    (on_time_pct is null or (on_time_pct >= 0 and on_time_pct <= 100))
    and (accuracy_pct is null or (accuracy_pct >= 0 and accuracy_pct <= 100))
  ),
  constraint haulier_trips_chk check (trips_ytd is null or trips_ytd >= 0),
  constraint haulier_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint haulier_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint haulier_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists haulier_code_udx
  on branch.haulier (upper(code))
  where deleted_at is null;

create unique index if not exists haulier_external_id_udx
  on branch.haulier (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists haulier_status_idx
  on branch.haulier (status)
  where deleted_at is null;

create index if not exists haulier_validity_idx
  on branch.haulier (valid_from, valid_to)
  where deleted_at is null;

create index if not exists haulier_contract_end_idx
  on branch.haulier (contract_end)
  where deleted_at is null;

create table if not exists branch.haulier_version (
  id           uuid primary key default gen_random_uuid(),
  haulier_id   uuid not null references branch.haulier (id) on delete restrict,
  version_no   integer not null,
  snapshot     jsonb not null,
  recorded_at  timestamptz not null default now(),
  recorded_by  text,
  constraint haulier_version_udx unique (haulier_id, version_no)
);

create table if not exists branch.haulier_audit (
  id           uuid primary key default gen_random_uuid(),
  haulier_id   uuid not null references branch.haulier (id) on delete restrict,
  action       text not null,
  actor        text,
  note         text,
  payload      jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists haulier_audit_row_idx
  on branch.haulier_audit (haulier_id, created_at);
