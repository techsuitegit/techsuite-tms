-- M02 Order Qualification — apply against POSTGRES_DB (txpoprdb).
-- Engine + decision ledger + run + policy + reason codes + draw rates.
-- Tank reading snapshot is a boundary stub until WBS 2.16 / M08 owns readings.
-- Do not Prisma migrate / db push. No UI.

create schema if not exists branch;

-- Extra convenience FKs on delivery_order (intake already has core qual columns)
alter table branch.delivery_order
  add column if not exists qual_decision_id text,
  add column if not exists qual_last_run_id text,
  add column if not exists override_id text;

-- ---------------------------------------------------------------------------
-- Tank reading snapshot (stub for gate 1–3). One current row per tank.
-- ---------------------------------------------------------------------------
create table if not exists branch.tank_reading_snapshot (
  storage_tank_id     text primary key references branch.storage_tank (id) on delete restrict,
  usable_capacity     numeric(14, 3) not null,
  target_fill_pct     numeric(5, 4) not null,
  level_pct           numeric(5, 4) not null,
  dead_stock          numeric(14, 3) not null default 0,
  reading_source      text not null,
  level_as_of         timestamptz,
  uom_id              text not null references branch.uom (id) on delete restrict,
  updated_at          timestamptz not null default now(),
  updated_by          text,
  constraint tank_reading_source_chk check (reading_source in ('TEL', 'MANUAL', 'NONE')),
  constraint tank_reading_target_pct_chk check (target_fill_pct >= 0 and target_fill_pct <= 1),
  constraint tank_reading_level_pct_chk check (level_pct >= 0 and level_pct <= 1),
  constraint tank_reading_usable_positive_chk check (usable_capacity > 0),
  constraint tank_reading_dead_nonneg_chk check (dead_stock >= 0)
);

-- ---------------------------------------------------------------------------
-- Policy (current row = status PUBLISHED; simplified vs full MasterBase)
-- ---------------------------------------------------------------------------
create table if not exists branch.qualification_policy (
  id                          text primary key,
  code                        text not null,
  name                        text not null,
  staleness_threshold_hours   integer not null default 24,
  ullage_formula              text not null default 'USABLE_X_TARGET_MINUS_LEVEL',
  min_evaluable_ullage        numeric(14, 3),
  override_review_days        integer not null default 30,
  status                      text not null default 'PUBLISHED',
  version_no                  integer not null default 1,
  valid_from                  date not null default current_date,
  valid_to                    date,
  created_at                  timestamptz not null default now(),
  created_by                  text,
  updated_at                  timestamptz not null default now(),
  updated_by                  text,
  deleted_at                  timestamptz,
  constraint qualification_policy_stale_chk check (staleness_threshold_hours between 1 and 168),
  constraint qualification_policy_formula_chk check (ullage_formula in ('USABLE_X_TARGET_MINUS_LEVEL')),
  constraint qualification_policy_status_chk check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
);

create unique index if not exists qualification_policy_code_current_udx
  on branch.qualification_policy (upper(code))
  where deleted_at is null and status = 'PUBLISHED';

insert into branch.qualification_policy (
  id, code, name, staleness_threshold_hours, ullage_formula, status, version_no, created_by, updated_by
) values (
  'QPOL00001', 'DEFAULT', 'Default qualification policy', 24, 'USABLE_X_TARGET_MINUS_LEVEL',
  'PUBLISHED', 1, 'system', 'system'
) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Reason code catalogue
-- ---------------------------------------------------------------------------
create table if not exists branch.qualification_reason_code (
  code             text primary key,
  label            text not null,
  applies_to       text not null,
  typical_outcome  text not null,
  is_active        boolean not null default true,
  constraint qualification_reason_applies_chk check (applies_to in (
    'ENGINE', 'PLANNER_QUALIFY', 'PLANNER_REJECT'
  )),
  constraint qualification_reason_outcome_chk check (typical_outcome in (
    'QUALIFIED', 'FLAGGED', 'CANNOT_EVALUATE', 'REJECTED'
  ))
);

insert into branch.qualification_reason_code (code, label, applies_to, typical_outcome) values
  ('ENG_NO_SOURCE', 'No tank reading source configured — manual dip required', 'ENGINE', 'CANNOT_EVALUATE'),
  ('ENG_READING_STALE', 'Last reading beyond the staleness threshold — refresh required', 'ENGINE', 'CANNOT_EVALUATE'),
  ('ENG_OVER_ULLAGE', 'Requested quantity exceeds available ullage', 'ENGINE', 'FLAGGED'),
  ('ENG_FITS_ULLAGE', 'Requested quantity fits available ullage', 'ENGINE', 'QUALIFIED'),
  ('PLN_DRAWN_BEFORE_ARRIVAL', 'Customer confirmed the tank will be drawn before arrival', 'PLANNER_QUALIFY', 'QUALIFIED'),
  ('PLN_SPLIT_AGREED', 'Split delivery agreed with the customer', 'PLANNER_QUALIFY', 'QUALIFIED'),
  ('PLN_MANUAL_DIP_LOWER', 'Manual dip taken, level lower than telemetry', 'PLANNER_QUALIFY', 'QUALIFIED'),
  ('PLN_CONTRACT_MINIMUM', 'Contractual minimum drop applies', 'PLANNER_QUALIFY', 'QUALIFIED'),
  ('PLN_INSUFFICIENT_REORDER', 'Insufficient ullage, customer to re-order', 'PLANNER_REJECT', 'REJECTED'),
  ('PLN_SITE_INACCESSIBLE', 'Site not accessible on the due date', 'PLANNER_REJECT', 'REJECTED')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Product draw rates (ILLUSTRATIVE seeds)
-- ---------------------------------------------------------------------------
create table if not exists branch.product_draw_rate (
  id                 text primary key,
  material_id        text references branch.material (id) on delete restrict,
  material_code      text,
  draw_rate_per_day  numeric(6, 4) not null,
  basis              text not null default 'FLAT_FRACTION',
  source             text not null default 'ILLUSTRATIVE',
  status             text not null default 'PUBLISHED',
  version_no         integer not null default 1,
  valid_from         date not null default current_date,
  valid_to           date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint product_draw_rate_chk check (draw_rate_per_day > 0 and draw_rate_per_day <= 1),
  constraint product_draw_rate_basis_chk check (basis in ('FLAT_FRACTION')),
  constraint product_draw_rate_source_chk check (source in ('ILLUSTRATIVE', 'CLIENT_SUPPLIED', 'MEASURED')),
  constraint product_draw_rate_status_chk check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
);

create unique index if not exists product_draw_rate_default_udx
  on branch.product_draw_rate (status)
  where material_id is null and material_code is null and status = 'PUBLISHED' and deleted_at is null;

create unique index if not exists product_draw_rate_code_udx
  on branch.product_draw_rate (upper(material_code))
  where material_code is not null and status = 'PUBLISHED' and deleted_at is null;

insert into branch.product_draw_rate (id, material_id, material_code, draw_rate_per_day, source, status)
values
  ('PDR00001', null, 'MS', 0.1300, 'ILLUSTRATIVE', 'PUBLISHED'),
  ('PDR00002', null, 'XP', 0.0900, 'ILLUSTRATIVE', 'PUBLISHED'),
  ('PDR00003', null, 'HSD', 0.1600, 'ILLUSTRATIVE', 'PUBLISHED'),
  ('PDR00004', null, 'LPGB', 0.1100, 'ILLUSTRATIVE', 'PUBLISHED'),
  ('PDR00005', null, null, 0.1200, 'ILLUSTRATIVE', 'PUBLISHED')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Qualification run header
-- ---------------------------------------------------------------------------
create table if not exists branch.qualification_run (
  id                     text primary key default (gen_random_uuid())::text,
  trigger                text not null,
  triggered_by           text,
  policy_id              text not null references branch.qualification_policy (id) on delete restrict,
  started_at             timestamptz not null default now(),
  finished_at            timestamptz,
  scanned_count          integer not null default 0,
  skipped_count          integer not null default 0,
  qualified_count        integer not null default 0,
  flagged_count          integer not null default 0,
  cannot_evaluate_count  integer not null default 0,
  audit_events_written   integer not null default 0,
  error_count            integer not null default 0,
  status                 text not null default 'RUNNING',
  scope_json             jsonb,
  constraint qualification_run_trigger_chk check (trigger in (
    'SCHEDULE', 'ON_DEMAND', 'TELEMETRY_BATCH', 'API'
  )),
  constraint qualification_run_status_chk check (status in ('RUNNING', 'COMPLETED', 'FAILED'))
);

create index if not exists qualification_run_started_idx
  on branch.qualification_run (started_at desc);

-- ---------------------------------------------------------------------------
-- Decision ledger (append-only by convention + revoke note in comments)
-- ---------------------------------------------------------------------------
create table if not exists branch.order_qualification_decision (
  id                          text primary key default (gen_random_uuid())::text,
  order_id                    text not null references branch.delivery_order (id) on delete restrict,
  run_id                      text references branch.qualification_run (id) on delete restrict,
  decision_source             text not null,
  outcome                     text not null,
  gate_reached                integer not null,
  failed_gate                 integer,
  reason_code                 text not null references branch.qualification_reason_code (code) on delete restrict,
  reason_text                 text not null,
  input_usable_capacity       numeric(14, 3),
  input_target_fill_pct       numeric(5, 4),
  input_level_pct             numeric(5, 4),
  input_dead_stock            numeric(14, 3),
  input_reading_source        text,
  input_reading_age_hours     numeric(6, 2),
  input_requested_qty         numeric(14, 3) not null,
  computed_ullage             numeric(14, 3),
  computed_run_out_days       numeric(5, 1),
  computed_risk_band          text,
  uom_id                      text not null references branch.uom (id) on delete restrict,
  staleness_threshold_hours   integer not null,
  policy_id                   text not null references branch.qualification_policy (id) on delete restrict,
  qualified_qty               numeric(14, 3),
  decided_at                  timestamptz not null default now(),
  decided_by                  text,
  override_id                 text,
  grounds                     text,
  reference                   text,
  idempotency_key             text,
  audit_event_written         boolean not null default false,
  constraint oqd_source_chk check (decision_source in ('ENGINE', 'PLANNER')),
  constraint oqd_outcome_chk check (outcome in ('QUALIFIED', 'FLAGGED', 'CANNOT_EVALUATE', 'REJECTED')),
  constraint oqd_gate_chk check (gate_reached between 0 and 3),
  constraint oqd_failed_gate_chk check (failed_gate is null or failed_gate between 1 and 3),
  constraint oqd_risk_chk check (computed_risk_band is null or computed_risk_band in (
    'critical', 'high', 'medium', 'low'
  )),
  constraint oqd_reason_len_chk check (char_length(trim(reason_text)) >= 8),
  constraint oqd_planner_actor_chk check (
    decision_source <> 'PLANNER' or (decided_by is not null and override_id is not null)
  ),
  constraint oqd_reading_source_chk check (
    input_reading_source is null or input_reading_source in ('TEL', 'MANUAL', 'NONE')
  )
);

create index if not exists oqd_order_decided_idx
  on branch.order_qualification_decision (order_id, decided_at desc);

create index if not exists oqd_run_idx
  on branch.order_qualification_decision (run_id)
  where run_id is not null;

create unique index if not exists oqd_idempotency_udx
  on branch.order_qualification_decision (idempotency_key)
  where idempotency_key is not null;

-- Append-only: no UPDATE/DELETE from app. audit_event_written is set at INSERT only (D-18).
do $$
begin
  if not exists (select 1 from pg_rules where rulename = 'oqd_no_update') then
    create rule oqd_no_update as on update to branch.order_qualification_decision do instead nothing;
  end if;
  if not exists (select 1 from pg_rules where rulename = 'oqd_no_delete') then
    create rule oqd_no_delete as on delete to branch.order_qualification_decision do instead nothing;
  end if;
end $$;

-- M03 feed index
create index if not exists ix_delivery_order_qualified_pool
  on branch.delivery_order (division_id, due_date)
  where qual_outcome = 'QUALIFIED' and deleted_at is null and status = 'OPEN';

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values
  ('QPOL', 'Qualification Policy', 'QPOL', 5, 1, true),
  ('PDR', 'Product Draw Rate', 'PDR', 5, 5, true),
  ('QRUN', 'Qualification Run', 'QRUN', 5, 0, true),
  ('QOVR', 'Qualification Override', 'QOVR', 5, 0, true)
on conflict (code) do nothing;
