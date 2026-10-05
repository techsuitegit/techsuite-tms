-- WBS 2.3 Division — extend the stub created by sql/branch_shipping_point.sql.
-- Schema "branch". AUTO approval. No UI. Do not create a second division table.
-- legal_entity_id is a UUID with no FK until WBS 2.1 exists.
-- zone_id references branch.zone. Existing rows are backfilled when a zone exists.

alter table branch.division add column if not exists legal_entity_id uuid;
alter table branch.division add column if not exists zone_id uuid;
alter table branch.division add column if not exists search_term_1 text;
alter table branch.division add column if not exists search_term_2 text;
alter table branch.division add column if not exists street text;
alter table branch.division add column if not exists district text;
alter table branch.division add column if not exists postal_code text;
alter table branch.division add column if not exists city text;
alter table branch.division add column if not exists country text;
alter table branch.division add column if not exists region text;
alter table branch.division add column if not exists time_zone text;
alter table branch.division add column if not exists po_box text;
alter table branch.division add column if not exists po_box_postal_code text;
alter table branch.division add column if not exists company_postal_code text;
alter table branch.division add column if not exists language text;
alter table branch.division add column if not exists telephone text;
alter table branch.division add column if not exists extension text;
alter table branch.division add column if not exists mobile text;
alter table branch.division add column if not exists fax text;
alter table branch.division add column if not exists email text;
alter table branch.division add column if not exists standard_method text;
alter table branch.division add column if not exists comments text;
alter table branch.division add column if not exists valid_from date;
alter table branch.division add column if not exists valid_to date;
alter table branch.division add column if not exists reason text;
alter table branch.division add column if not exists change_note text;
alter table branch.division add column if not exists version_no integer default 1;
alter table branch.division add column if not exists external_id text;
alter table branch.division add column if not exists created_by text;
alter table branch.division add column if not exists updated_by text;

-- Placeholder company id for rows created before Legal Entity exists (DIV-SEED-01).
-- Replace it with a real legal_entity.id before WBS 2.1 adds the foreign key.
update branch.division
set legal_entity_id = '00000000-0000-4000-8000-000000000001'
where legal_entity_id is null;

update branch.division d
set zone_id = z.id
from (
  select id
  from branch.zone
  where deleted_at is null
  order by case when status = 'PUBLISHED' then 0 else 1 end, code
  limit 1
) z
where d.zone_id is null;

update branch.division
set
  postal_code = coalesce(postal_code, '000000'),
  city = coalesce(city, 'Unassigned'),
  country = coalesce(country, 'IN'),
  time_zone = coalesce(time_zone, 'Asia/Kolkata'),
  valid_from = coalesce(valid_from, current_date),
  reason = coalesce(reason, 'New record'),
  version_no = coalesce(version_no, 1)
where postal_code is null
   or city is null
   or country is null
   or time_zone is null
   or valid_from is null
   or reason is null
   or version_no is null;

alter table branch.division alter column legal_entity_id set not null;
alter table branch.division alter column postal_code set not null;
alter table branch.division alter column city set not null;
alter table branch.division alter column country set not null;
alter table branch.division alter column time_zone set not null;
alter table branch.division alter column valid_from set not null;
alter table branch.division alter column reason set not null;
alter table branch.division alter column version_no set not null;

do $$
begin
  if not exists (select 1 from branch.division where zone_id is null) then
    alter table branch.division alter column zone_id set not null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'division_reason_chk') then
    alter table branch.division
      add constraint division_reason_chk
      check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'division_method_chk') then
    alter table branch.division
      add constraint division_method_chk
      check (standard_method is null or standard_method in ('Road', 'Rail', 'Pipeline', 'Marine'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'division_valid_range_chk') then
    alter table branch.division
      add constraint division_valid_range_chk
      check (valid_to is null or valid_to >= valid_from);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'division_zone_fk')
     and not exists (select 1 from branch.division where zone_id is null) then
    alter table branch.division
      add constraint division_zone_fk
      foreign key (zone_id) references branch.zone (id) on delete restrict;
  end if;
end $$;

create unique index if not exists division_external_id_udx
  on branch.division (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists division_status_idx
  on branch.division (status)
  where deleted_at is null;

create index if not exists division_validity_idx
  on branch.division (valid_from, valid_to)
  where deleted_at is null;

create index if not exists division_zone_idx
  on branch.division (zone_id);

create table if not exists branch.division_version (
  id           uuid primary key default gen_random_uuid(),
  division_id  uuid not null references branch.division (id) on delete restrict,
  version_no   integer not null,
  snapshot     jsonb not null,
  recorded_at  timestamptz not null default now(),
  recorded_by  text,
  constraint division_version_udx unique (division_id, version_no)
);

create table if not exists branch.division_audit (
  id           uuid primary key default gen_random_uuid(),
  division_id  uuid not null references branch.division (id) on delete restrict,
  action       text not null,
  actor        text,
  note         text,
  payload      jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists division_audit_row_idx
  on branch.division_audit (division_id, created_at);
