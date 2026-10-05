-- WBS 2.4 Cost Centre — apply against POSTGRES_DB (txpoprdb).
-- Schema "branch". FINANCIAL approval for annual_budget and default_gl. Other fields AUTO.
-- No UI. No GL posting. division_id is mandatory. shipping_point_id is optional.
-- Vehicle FK is added only when every vehicle.cost_centre_id already exists.

create table if not exists branch.cost_centre (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null,
  name               text not null,
  division_id        uuid not null references branch.division (id) on delete restrict,
  shipping_point_id  uuid references branch.shipping_point (id) on delete restrict,
  type               text not null,
  budget_owner       text,
  default_gl         text,
  annual_budget      numeric(14, 2),
  active             boolean not null default true,
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
  constraint cost_centre_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint cost_centre_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint cost_centre_type_chk check (type in ('DELIVERY', 'FLEET', 'DEPOT', 'SALES', 'ADMIN', 'SERVICE')),
  constraint cost_centre_valid_range_chk check (valid_to is null or valid_to >= valid_from),
  constraint cost_centre_budget_chk check (annual_budget is null or annual_budget >= 0)
);

create unique index if not exists cost_centre_code_udx
  on branch.cost_centre (upper(code))
  where deleted_at is null;

create unique index if not exists cost_centre_external_id_udx
  on branch.cost_centre (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists cost_centre_status_idx
  on branch.cost_centre (status)
  where deleted_at is null;

create index if not exists cost_centre_validity_idx
  on branch.cost_centre (valid_from, valid_to)
  where deleted_at is null;

create index if not exists cost_centre_division_idx
  on branch.cost_centre (division_id);

create table if not exists branch.cost_centre_version (
  id              uuid primary key default gen_random_uuid(),
  cost_centre_id  uuid not null references branch.cost_centre (id) on delete restrict,
  version_no      integer not null,
  snapshot        jsonb not null,
  recorded_at     timestamptz not null default now(),
  recorded_by     text,
  constraint cost_centre_version_udx unique (cost_centre_id, version_no)
);

create table if not exists branch.cost_centre_audit (
  id              uuid primary key default gen_random_uuid(),
  cost_centre_id  uuid not null references branch.cost_centre (id) on delete restrict,
  action          text not null,
  actor           text,
  note            text,
  payload         jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists cost_centre_audit_row_idx
  on branch.cost_centre_audit (cost_centre_id, created_at);

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'vehicle_cost_centre_fk') then
    return;
  end if;
  if exists (
    select 1
    from branch.vehicle v
    where not exists (select 1 from branch.cost_centre c where c.id = v.cost_centre_id)
  ) then
    return;
  end if;
  alter table branch.vehicle
    add constraint vehicle_cost_centre_fk
    foreign key (cost_centre_id) references branch.cost_centre (id) on delete restrict;
end $$;
