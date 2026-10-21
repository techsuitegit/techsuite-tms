-- WBS 2.19 Driver — apply against POSTGRES_DB (txpoprdb).
-- Do not Prisma migrate / db push.
-- SAFETY approval (licence / DG fields). TMS-owned. No UI.
-- Also adds vehicle.default_driver_id (planning default only).

create schema if not exists branch;

create table if not exists branch.driver (
  id                      text primary key,
  code                    text not null,
  name                    text not null,
  phone                   text not null,
  dl_number               text not null,
  dl_valid_to             date not null,
  dl_class                text,
  first_licensed_on       date,
  haz_endorsed            boolean not null,
  haz_endorsement_ref     text,
  haz_endorsement_to       date,
  home_shipping_point_id  text not null references branch.shipping_point (id) on delete restrict,
  hos_ruleset_code        text,
  is_active               boolean not null default true,
  valid_from              date not null,
  valid_to                date,
  reason                  text not null,
  change_note             text,
  status                  text not null,
  version_no              integer not null default 1,
  external_id             text,
  created_at              timestamptz not null default now(),
  created_by              text,
  updated_at              timestamptz not null default now(),
  updated_by              text,
  deleted_at              timestamptz,
  constraint driver_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint driver_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint driver_phone_shape_chk check (phone ~ '^\+?[0-9]{8,15}$'),
  constraint driver_first_licensed_before_valid_to_chk
    check (first_licensed_on is null or first_licensed_on <= dl_valid_to),
  constraint driver_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists driver_code_udx
  on branch.driver (upper(code))
  where deleted_at is null;

create unique index if not exists driver_dl_number_udx
  on branch.driver (upper(dl_number))
  where deleted_at is null;

create unique index if not exists driver_external_id_udx
  on branch.driver (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists driver_status_idx
  on branch.driver (status)
  where deleted_at is null;

create index if not exists driver_validity_idx
  on branch.driver (valid_from, valid_to)
  where deleted_at is null;

create index if not exists driver_home_shipping_point_status_idx
  on branch.driver (home_shipping_point_id, status)
  where deleted_at is null;

create index if not exists driver_dl_valid_to_idx
  on branch.driver (dl_valid_to)
  where deleted_at is null;

create index if not exists driver_haz_endorsement_to_idx
  on branch.driver (haz_endorsement_to)
  where deleted_at is null and haz_endorsement_to is not null;

create index if not exists driver_haz_endorsed_idx
  on branch.driver (haz_endorsed)
  where deleted_at is null;

create table if not exists branch.driver_version (
  id          text primary key default (gen_random_uuid())::text,
  driver_id   text not null references branch.driver (id) on delete restrict,
  version_no  integer not null,
  snapshot    jsonb not null,
  recorded_at timestamptz not null default now(),
  recorded_by text,
  constraint driver_version_udx unique (driver_id, version_no)
);

create table if not exists branch.driver_audit (
  id         text primary key default (gen_random_uuid())::text,
  driver_id  text not null references branch.driver (id) on delete restrict,
  action     text not null,
  actor      text,
  note       text,
  payload    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists driver_audit_row_idx
  on branch.driver_audit (driver_id, created_at);

-- Planning default on vehicle (convenience only; trip owns the real assignment).
alter table branch.vehicle add column if not exists default_driver_id text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'branch' and table_name = 'vehicle' and column_name = 'default_driver_id'
  ) and not exists (select 1 from pg_constraint where conname = 'vehicle_default_driver_fk') then
    if not exists (
      select 1 from branch.vehicle v
      where v.default_driver_id is not null
        and not exists (select 1 from branch.driver d where d.id = v.default_driver_id)
    ) then
      alter table branch.vehicle
        add constraint vehicle_default_driver_fk
        foreign key (default_driver_id) references branch.driver (id) on delete restrict;
    end if;
  end if;
end $$;

create index if not exists vehicle_default_driver_status_idx
  on branch.vehicle (default_driver_id, status)
  where default_driver_id is not null and deleted_at is null;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('DRV', 'Driver', 'DRV', 5, 0, true)
on conflict (code) do nothing;
