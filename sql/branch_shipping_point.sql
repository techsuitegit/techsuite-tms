-- WBS 2.5 Shipping Point — apply manually against POSTGRES_DB (txpoprdb).
-- Do not Prisma migrate / db push.
-- Schema "branch" lives in txpoprdb, not in tms_master, and not in public.

create schema if not exists branch;

create table if not exists branch.division (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  name        text not null,
  status      text not null default 'PUBLISHED',
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint division_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED'))
);

create unique index if not exists division_code_udx
  on branch.division (upper(code))
  where deleted_at is null;

create table if not exists branch.shipping_point (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null,
  name                text not null,
  division_id         uuid not null references branch.division (id) on delete restrict,
  type                text not null,
  address             text not null,
  latitude            numeric(9, 6) not null,
  longitude           numeric(9, 6) not null,
  geofence_radius_m   integer,
  opening_hours       text,
  loading_bays        integer,
  loading_rate_lpm    numeric(12, 3),
  mid_shift_reload    boolean,
  products_stocked    text[] not null default '{}',
  lead_dispatcher     text,
  phone               text,
  hazmat_class        text,
  permit_no           text,
  permit_expiry       date,
  erp_ref             text,
  valid_from          date not null,
  valid_to            date,
  reason              text not null,
  change_note         text,
  status              text not null,
  version_no          integer not null default 1,
  external_id         text,
  created_at          timestamptz not null default now(),
  created_by          text,
  updated_at          timestamptz not null default now(),
  updated_by          text,
  deleted_at          timestamptz,
  constraint shipping_point_type_chk check (type in ('BULK_PLANT', 'TERMINAL_RACK', 'YARD', 'CYLINDER_DEPOT')),
  constraint shipping_point_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint shipping_point_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint shipping_point_latitude_chk check (latitude >= -90 and latitude <= 90),
  constraint shipping_point_longitude_chk check (longitude >= -180 and longitude <= 180),
  constraint shipping_point_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists shipping_point_code_udx
  on branch.shipping_point (upper(code))
  where deleted_at is null;

create unique index if not exists shipping_point_external_id_udx
  on branch.shipping_point (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists shipping_point_status_idx
  on branch.shipping_point (status)
  where deleted_at is null;

create index if not exists shipping_point_validity_idx
  on branch.shipping_point (valid_from, valid_to)
  where deleted_at is null;

create table if not exists branch.shipping_point_version (
  id                 uuid primary key default gen_random_uuid(),
  shipping_point_id  uuid not null references branch.shipping_point (id) on delete restrict,
  version_no         integer not null,
  snapshot           jsonb not null,
  recorded_at        timestamptz not null default now(),
  recorded_by        text,
  constraint shipping_point_version_udx unique (shipping_point_id, version_no)
);

create table if not exists branch.shipping_point_audit (
  id                 uuid primary key default gen_random_uuid(),
  shipping_point_id  uuid not null references branch.shipping_point (id) on delete restrict,
  action             text not null,
  actor              text,
  note               text,
  payload            jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists shipping_point_audit_row_idx
  on branch.shipping_point_audit (shipping_point_id, created_at);

insert into branch.division (code, name, status)
select 'DIV-SEED-01', 'Seed Division', 'PUBLISHED'
where not exists (
  select 1 from branch.division where upper(code) = 'DIV-SEED-01' and deleted_at is null
);
