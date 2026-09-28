-- WBS 2.11 Fee Catalogue only. Apply after the branch schema exists.

create schema if not exists branch;

create table if not exists branch.fee (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,
  name         text not null,
  fee_type     text not null,
  charge_type  text not null,
  rate         numeric(14, 2) not null,
  currency     text not null default 'INR',
  valid_from   date not null,
  valid_to     date,
  reason       text not null,
  change_note  text,
  status       text not null,
  version_no   integer not null default 1,
  external_id  text,
  created_at   timestamptz not null default now(),
  created_by   text,
  updated_at   timestamptz not null default now(),
  updated_by   text,
  deleted_at   timestamptz,
  constraint fee_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint fee_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint fee_charge_type_chk check (
    charge_type in ('FLAT_PER_DELIVERY', 'PER_VOLUME', 'PER_STOP', 'PER_HOUR', 'PER_CYLINDER')
  ),
  constraint fee_rate_chk check (rate > 0),
  constraint fee_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists fee_code_udx
  on branch.fee (upper(code))
  where deleted_at is null;

create unique index if not exists fee_external_id_udx
  on branch.fee (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists fee_status_idx
  on branch.fee (status)
  where deleted_at is null;

create index if not exists fee_validity_idx
  on branch.fee (valid_from, valid_to)
  where deleted_at is null;

create table if not exists branch.fee_version (
  id          uuid primary key default gen_random_uuid(),
  fee_id      uuid not null references branch.fee (id) on delete restrict,
  version_no  integer not null,
  snapshot    jsonb not null,
  recorded_at timestamptz not null default now(),
  recorded_by text,
  constraint fee_version_udx unique (fee_id, version_no)
);

create table if not exists branch.fee_audit (
  id         uuid primary key default gen_random_uuid(),
  fee_id     uuid not null references branch.fee (id) on delete restrict,
  action     text not null,
  actor      text,
  note       text,
  payload    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fee_audit_row_idx
  on branch.fee_audit (fee_id, created_at);
