-- WBS 2.20 DG Restriction Zone — apply against POSTGRES_DB (txpoprdb).
-- Do not Prisma migrate / db push.
-- SAFETY approval (entity-level). TMS-owned. No UI.
-- Geometry stored as GeoJSON jsonb (Polygon, WGS-84 lon/lat). API contract is GeoJSON.
-- PostGIS geography is preferred when the extension is installed; this environment
-- uses jsonb so apply-sql works without PostGIS. No check/evaluate — Module 07.
-- Seeded zones are ILLUSTRATIVE DRAFT only.

create schema if not exists branch;

create table if not exists branch.dg_restriction_kind (
  code               text primary key,
  name               text not null,
  required_params    text[] not null default '{}',
  param_types        jsonb not null default '{}'::jsonb,
  vehicle_attribute  text,
  is_time_scoped     boolean not null,
  comparator_status  text not null,
  constraint dg_restriction_kind_comparator_chk
    check (comparator_status in ('IMPLEMENTED', 'NOT_IMPLEMENTED'))
);

insert into branch.dg_restriction_kind
  (code, name, required_params, param_types, vehicle_attribute, is_time_scoped, comparator_status)
values
  ('TIME', 'Time window', '{}', '{}'::jsonb, null, true, 'IMPLEMENTED'),
  ('PROHIBIT', 'Prohibit DG classes', '{}', '{}'::jsonb, null, false, 'IMPLEMENTED'),
  ('WEIGHT', 'Gross weight limit', array['maxKg'], '{"maxKg":"integer"}'::jsonb, 'gvw_kg', false, 'IMPLEMENTED'),
  ('HEIGHT', 'Height limit', array['maxM'], '{"maxM":"number"}'::jsonb, 'height_m', false, 'NOT_IMPLEMENTED'),
  ('TUNNEL', 'Tunnel category', array['tunnelCategory'], '{"tunnelCategory":"string"}'::jsonb, 'tunnel_category', false, 'IMPLEMENTED')
on conflict (code) do update set
  name = excluded.name,
  required_params = excluded.required_params,
  param_types = excluded.param_types,
  vehicle_attribute = excluded.vehicle_attribute,
  is_time_scoped = excluded.is_time_scoped,
  comparator_status = excluded.comparator_status;

create table if not exists branch.dg_restriction_zone (
  id                 text primary key,
  code               text not null,
  name               text not null,
  kind_code          text not null references branch.dg_restriction_kind (code) on delete restrict,
  dg_classes         text[] not null default '{}',
  geom               jsonb not null,
  bbox_min_lon       double precision not null,
  bbox_min_lat       double precision not null,
  bbox_max_lon       double precision not null,
  bbox_max_lat       double precision not null,
  geom_source        text not null,
  window_from_min    integer not null,
  window_to_min      integer not null,
  params             jsonb not null default '{}'::jsonb,
  source_kind        text not null,
  source_ref         text not null,
  source_authority   text,
  source_dated       date,
  source_url         text,
  review_due         date not null,
  notes              text,
  is_current         boolean not null default true,
  is_active          boolean not null default true,
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
  constraint dg_zone_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint dg_zone_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint dg_zone_geom_source_chk check (geom_source in (
    'SURVEYED', 'DIGITISED_FROM_NOTIFICATION', 'VENDOR_SUPPLIED', 'SKETCHED'
  )),
  constraint dg_zone_source_kind_chk check (source_kind in (
    'STATUTE', 'RULE', 'NOTIFICATION', 'STRUCTURAL_CERTIFICATE', 'CLIENT_ADVICE', 'ILLUSTRATIVE'
  )),
  constraint dg_zone_window_chk check (
    window_from_min between 0 and 1440 and window_to_min between 0 and 1440
  ),
  constraint dg_zone_params_object_chk check (jsonb_typeof(params) = 'object'),
  constraint dg_zone_geom_object_chk check (jsonb_typeof(geom) = 'object' and geom->>'type' = 'Polygon'),
  constraint dg_zone_source_ref_len_chk check (length(btrim(source_ref)) >= 8),
  constraint dg_zone_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists uq_dg_zone_code_current
  on branch.dg_restriction_zone (upper(code))
  where is_current and deleted_at is null;

create unique index if not exists dg_zone_external_id_udx
  on branch.dg_restriction_zone (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists ix_dg_zone_feed
  on branch.dg_restriction_zone (status, is_active, valid_from, valid_to)
  where is_current and deleted_at is null;

create index if not exists ix_dg_zone_kind_code
  on branch.dg_restriction_zone (kind_code);

create index if not exists ix_dg_zone_dg_classes
  on branch.dg_restriction_zone using gin (dg_classes);

create index if not exists ix_dg_zone_review_due
  on branch.dg_restriction_zone (review_due)
  where is_current and deleted_at is null;

create index if not exists ix_dg_zone_is_current
  on branch.dg_restriction_zone (is_current)
  where is_current and deleted_at is null;

create index if not exists ix_dg_zone_bbox
  on branch.dg_restriction_zone (bbox_min_lon, bbox_min_lat, bbox_max_lon, bbox_max_lat)
  where is_current and deleted_at is null;

create table if not exists branch.dg_restriction_zone_version (
  id                       text primary key default (gen_random_uuid())::text,
  dg_restriction_zone_id   text not null references branch.dg_restriction_zone (id) on delete restrict,
  version_no               integer not null,
  snapshot                 jsonb not null,
  recorded_at              timestamptz not null default now(),
  recorded_by              text,
  constraint dg_restriction_zone_version_udx unique (dg_restriction_zone_id, version_no)
);

create table if not exists branch.dg_restriction_zone_audit (
  id                       text primary key default (gen_random_uuid())::text,
  dg_restriction_zone_id   text not null references branch.dg_restriction_zone (id) on delete restrict,
  action                   text not null,
  actor                    text,
  note                     text,
  payload                  jsonb,
  created_at               timestamptz not null default now()
);

create index if not exists dg_zone_audit_row_idx
  on branch.dg_restriction_zone_audit (dg_restriction_zone_id, created_at);

insert into branch.dg_restriction_zone (
  id, code, name, kind_code, dg_classes, geom,
  bbox_min_lon, bbox_min_lat, bbox_max_lon, bbox_max_lat, geom_source,
  window_from_min, window_to_min, params,
  source_kind, source_ref, review_due, notes,
  is_current, is_active, valid_from, reason, status, version_no, created_by, updated_by
)
select
  'DGZ-SEED-ADY', 'Z-ADY', 'Adyar bridge — 25 t gross weight limit', 'WEIGHT', '{}',
  '{"type":"Polygon","coordinates":[[[80.2550,13.0065],[80.2605,13.0065],[80.2605,13.0020],[80.2550,13.0020],[80.2550,13.0065]]]}'::jsonb,
  80.2550, 13.0020, 80.2605, 13.0065, 'SKETCHED',
  0, 1440, '{"maxKg":25000}'::jsonb,
  'ILLUSTRATIVE', 'Illustrative structural limit — replace via form 07', '2026-12-31',
  'Seed — not a researched restriction',
  true, true, '2026-04-01', 'New record', 'DRAFT', 1, 'seed', 'seed'
where not exists (select 1 from branch.dg_restriction_zone where upper(code) = 'Z-ADY' and deleted_at is null);

insert into branch.dg_restriction_zone (
  id, code, name, kind_code, dg_classes, geom,
  bbox_min_lon, bbox_min_lat, bbox_max_lon, bbox_max_lat, geom_source,
  window_from_min, window_to_min, params,
  source_kind, source_ref, review_due, notes,
  is_current, is_active, valid_from, reason, status, version_no, created_by, updated_by
)
select
  'DGZ-SEED-KAT', 'Z-KAT', 'Koyambedu market — peak hour DG time ban', 'TIME', array['Class 3'],
  '{"type":"Polygon","coordinates":[[[80.1980,13.0700],[80.2050,13.0700],[80.2050,13.0650],[80.1980,13.0650],[80.1980,13.0700]]]}'::jsonb,
  80.1980, 13.0650, 80.2050, 13.0700, 'SKETCHED',
  450, 600, '{}'::jsonb,
  'ILLUSTRATIVE', 'Illustrative — congested market area notification', '2026-12-31',
  'Seed — not a researched restriction',
  true, true, '2026-04-01', 'New record', 'DRAFT', 1, 'seed', 'seed'
where not exists (select 1 from branch.dg_restriction_zone where upper(code) = 'Z-KAT' and deleted_at is null);

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('DGZ', 'DG Restriction Zone', 'DGZ', 5, 0, true)
on conflict (code) do nothing;
