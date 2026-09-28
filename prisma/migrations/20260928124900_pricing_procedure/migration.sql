-- WBS 2.12 Pricing Procedure only. Apply after the branch schema and material exist.

create schema if not exists branch;

create table if not exists branch.pricing_procedure (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  name             text not null,
  access_sequence  text not null,
  active           boolean not null,
  valid_from       date not null,
  valid_to         date,
  reason           text not null,
  change_note      text,
  status           text not null,
  version_no       integer not null default 1,
  external_id      text,
  created_at       timestamptz not null default now(),
  created_by       text,
  updated_at       timestamptz not null default now(),
  updated_by       text,
  deleted_at       timestamptz,
  constraint pricing_procedure_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint pricing_procedure_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint pricing_procedure_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists pricing_procedure_code_udx
  on branch.pricing_procedure (upper(code))
  where deleted_at is null;

create unique index if not exists pricing_procedure_external_id_udx
  on branch.pricing_procedure (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists pricing_procedure_status_idx
  on branch.pricing_procedure (status)
  where deleted_at is null;

create index if not exists pricing_procedure_validity_idx
  on branch.pricing_procedure (valid_from, valid_to)
  where deleted_at is null;

create table if not exists branch.pricing_rule (
  id             uuid primary key default gen_random_uuid(),
  procedure_id   uuid not null references branch.pricing_procedure (id) on delete restrict,
  code           text not null,
  priority       integer not null,
  join_op        text not null,
  amount         numeric(14, 2) not null,
  constraint pricing_rule_join_chk check (join_op in ('AND', 'OR')),
  constraint pricing_rule_amount_chk check (amount > 0),
  constraint pricing_rule_code_udx unique (procedure_id, code)
);

create index if not exists pricing_rule_priority_idx
  on branch.pricing_rule (procedure_id, priority, code);

create table if not exists branch.pricing_rule_condition (
  id        uuid primary key default gen_random_uuid(),
  rule_id   uuid not null references branch.pricing_rule (id) on delete restrict,
  variable  text not null,
  operator  text not null,
  value     text,
  constraint pricing_condition_variable_chk check (
    variable in ('CUSTOMER_CLASS', 'CUSTOMER_NAME', 'KILOMETRES', 'TRUCK_TYPE', 'VOLUME', 'MATERIAL')
  ),
  constraint pricing_condition_operator_chk check (operator in ('EQ', 'NE', 'GT', 'LT', 'NULL')),
  constraint pricing_condition_null_value_chk check (
    (operator = 'NULL' and value is null) or (operator <> 'NULL' and value is not null)
  ),
  constraint pricing_condition_compare_chk check (
    operator not in ('GT', 'LT') or variable in ('KILOMETRES', 'VOLUME')
  )
);

create table if not exists branch.pricing_procedure_version (
  id            uuid primary key default gen_random_uuid(),
  procedure_id  uuid not null references branch.pricing_procedure (id) on delete restrict,
  version_no    integer not null,
  snapshot      jsonb not null,
  recorded_at   timestamptz not null default now(),
  recorded_by   text,
  constraint pricing_procedure_version_udx unique (procedure_id, version_no)
);

create table if not exists branch.pricing_procedure_audit (
  id            uuid primary key default gen_random_uuid(),
  procedure_id  uuid not null references branch.pricing_procedure (id) on delete restrict,
  action        text not null,
  actor         text,
  note          text,
  payload       jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists pricing_procedure_audit_row_idx
  on branch.pricing_procedure_audit (procedure_id, created_at);
