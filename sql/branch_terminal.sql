-- WBS 2.8 Terminal — apply against POSTGRES_DB (txpoprdb).
-- Do not Prisma migrate / db push.
-- Requires branch.shipping_point and branch.vendor.

create schema if not exists branch;

create table if not exists branch.terminal (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null,
  name                 text not null,
  ownership            text not null,
  shipping_point_id    uuid not null references branch.shipping_point (id) on delete restrict,
  vendor_id            uuid references branch.vendor (id) on delete restrict,
  is_parent            boolean not null default false,
  address              text not null,
  latitude             numeric(9, 6),
  longitude            numeric(9, 6),
  products_available   text[] not null default '{}',
  rack_price_ref       text,
  freight_to_sp        numeric(12, 3),
  hazmat_class         text,
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
  constraint terminal_ownership_chk check (ownership in ('OWN', 'THIRD_PARTY')),
  constraint terminal_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint terminal_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint terminal_latitude_chk check (latitude is null or (latitude >= -90 and latitude <= 90)),
  constraint terminal_longitude_chk check (longitude is null or (longitude >= -180 and longitude <= 180)),
  constraint terminal_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists terminal_code_udx
  on branch.terminal (upper(code))
  where deleted_at is null;

create unique index if not exists terminal_external_id_udx
  on branch.terminal (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists terminal_status_idx
  on branch.terminal (status)
  where deleted_at is null;

create index if not exists terminal_validity_idx
  on branch.terminal (valid_from, valid_to)
  where deleted_at is null;

create index if not exists terminal_shipping_point_idx
  on branch.terminal (shipping_point_id)
  where deleted_at is null;

create table if not exists branch.terminal_version (
  id          uuid primary key default gen_random_uuid(),
  terminal_id uuid not null references branch.terminal (id) on delete restrict,
  version_no  integer not null,
  snapshot    jsonb not null,
  recorded_at timestamptz not null default now(),
  recorded_by text,
  constraint terminal_version_udx unique (terminal_id, version_no)
);

create table if not exists branch.terminal_audit (
  id          uuid primary key default gen_random_uuid(),
  terminal_id uuid not null references branch.terminal (id) on delete restrict,
  action      text not null,
  actor       text,
  note        text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists terminal_audit_row_idx
  on branch.terminal_audit (terminal_id, created_at);

alter table branch.terminal add column if not exists country_id varchar(5);
alter table branch.terminal add column if not exists state_code varchar(5);
alter table branch.terminal add column if not exists city_code varchar(15);
alter table branch.terminal add column if not exists pincode text;

alter table branch.terminal drop constraint if exists terminal_country_fk;
alter table branch.terminal add constraint terminal_country_fk
  foreign key (country_id) references public.country (id) on delete restrict;

alter table branch.terminal drop constraint if exists terminal_state_fk;
alter table branch.terminal add constraint terminal_state_fk
  foreign key (country_id, state_code) references public.state (countryid, statecode) on delete restrict;

alter table branch.terminal drop constraint if exists terminal_city_fk;
alter table branch.terminal add constraint terminal_city_fk
  foreign key (country_id, state_code, city_code) references public.city (countryid, statecode, citycode) on delete restrict;

create index if not exists terminal_geo_idx
  on branch.terminal (country_id, state_code, city_code)
  where deleted_at is null;
