-- M03 Ranking & Prioritisation — apply against POSTGRES_DB (txpoprdb).
-- QUALIFIED pool only. Weights are policy (seeded PUBLISHED). Score ledger append-only.
-- Do not Prisma migrate / db push. No UI.

create schema if not exists branch;

alter table branch.delivery_order
  add column if not exists rank_position integer,
  add column if not exists rank_override_id text;

-- ---------------------------------------------------------------------------
-- Weight set (policy)
-- ---------------------------------------------------------------------------
create table if not exists branch.ranking_weight_set (
  id                   text primary key,
  code                 text not null,
  name                 text not null,
  division_id          text references branch.division (id) on delete restrict,
  ordering_strategy    text not null default 'ADDITIVE',
  tie_break            text not null default 'RUN_OUT_ASC',
  total_weight_check   integer not null default 100,
  notes                text,
  status               text not null default 'PUBLISHED',
  version_no           integer not null default 1,
  valid_from           date not null default current_date,
  valid_to             date,
  reason               text not null default 'New record',
  change_note          text,
  created_at           timestamptz not null default now(),
  created_by           text,
  updated_at           timestamptz not null default now(),
  updated_by           text,
  deleted_at           timestamptz,
  constraint ranking_ws_strategy_chk check (ordering_strategy in ('ADDITIVE', 'BAND_THEN_SCORE')),
  constraint ranking_ws_tie_chk check (tie_break in ('RUN_OUT_ASC', 'DUE_DATE_ASC', 'ORDER_NO_ASC')),
  constraint ranking_ws_total_chk check (total_weight_check = 100),
  constraint ranking_ws_status_chk check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
);

create unique index if not exists ranking_ws_default_udx
  on branch.ranking_weight_set (status)
  where division_id is null and status = 'PUBLISHED' and deleted_at is null;

create unique index if not exists ranking_ws_code_pub_udx
  on branch.ranking_weight_set (upper(code))
  where status = 'PUBLISHED' and deleted_at is null and division_id is null;

create table if not exists branch.ranking_weight_component (
  id              text primary key default (gen_random_uuid())::text,
  weight_set_id   text not null references branch.ranking_weight_set (id) on delete restrict,
  component_code  text not null,
  weight_max      integer not null,
  sequence        integer not null,
  caption         text not null,
  decay_per_day   numeric(6, 3),
  value_divisor   numeric(14, 2),
  size_divisor    numeric(14, 4),
  size_uom_code   text,
  mode_scores     jsonb,
  is_enabled      boolean not null default true,
  constraint ranking_wc_code_chk check (component_code in (
    'RUN_OUT_RISK', 'ORDER_VALUE', 'DROP_SIZE', 'CUSTOMER_CLASS', 'WINDOW_PRESSURE'
  )),
  constraint ranking_wc_weight_chk check (weight_max between 0 and 100),
  constraint ranking_wc_udx unique (weight_set_id, component_code),
  constraint ranking_wc_seq_udx unique (weight_set_id, sequence)
);

insert into branch.ranking_weight_set (
  id, code, name, ordering_strategy, tie_break, total_weight_check, notes, status, version_no, created_by, updated_by
) values (
  'RWS00001', 'WS-DEFAULT', 'Default ranking weights',
  'ADDITIVE', 'RUN_OUT_ASC', 100,
  'Prototype seed 40/25/15/12/8. The weights are the policy.',
  'PUBLISHED', 1, 'system', 'system'
) on conflict (id) do nothing;

insert into branch.ranking_weight_component (
  id, weight_set_id, component_code, weight_max, sequence, caption,
  decay_per_day, value_divisor, size_divisor, size_uom_code, mode_scores, is_enabled
)
select * from (values
  ('rwc-risk', 'RWS00001', 'RUN_OUT_RISK', 40, 1, 'the closer to dry, the higher',
    7.000::numeric, null::numeric, null::numeric, null::text, null::jsonb, true),
  ('rwc-value', 'RWS00001', 'ORDER_VALUE', 25, 2, 'revenue at stake',
    null::numeric, 60000.00::numeric, null::numeric, null::text, null::jsonb, true),
  ('rwc-size', 'RWS00001', 'DROP_SIZE', 15, 3, 'gallons per mile',
    null::numeric, null::numeric, 2.0000::numeric, 'KL', null::jsonb, true),
  ('rwc-class', 'RWS00001', 'CUSTOMER_CLASS', 12, 4, 'retail contract vs spot',
    null::numeric, null::numeric, null::numeric, null::text, null::jsonb, true),
  ('rwc-window', 'RWS00001', 'WINDOW_PRESSURE', 8, 5, 'will-call and monitor-triggered',
    null::numeric, null::numeric, null::numeric, null::text,
    '{"WILL_CALL":8,"MONITOR":6,"SCHEDULED":3,"FORECAST":3}'::jsonb, true)
) as v(id, weight_set_id, component_code, weight_max, sequence, caption,
       decay_per_day, value_divisor, size_divisor, size_uom_code, mode_scores, is_enabled)
where exists (select 1 from branch.ranking_weight_set where id = 'RWS00001')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Customer class catalogue (I-001 placeholders)
-- ---------------------------------------------------------------------------
create table if not exists branch.customer_class (
  code                 text primary key,
  label                text not null,
  score_contribution   integer,
  urgency_outranks_class boolean,
  definition_source    text not null default 'PLACEHOLDER',
  notes                text,
  status               text not null default 'PUBLISHED',
  version_no           integer not null default 1,
  is_active            boolean not null default true,
  valid_from           date not null default current_date,
  valid_to             date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  constraint customer_class_source_chk check (definition_source in ('PLACEHOLDER', 'CLIENT_SUPPLIED')),
  constraint customer_class_score_chk check (score_contribution is null or score_contribution between 0 and 100),
  constraint customer_class_status_chk check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
);

insert into branch.customer_class (code, label, score_contribution, definition_source, notes)
values
  ('A1', 'Class A1 — definition pending', null, 'PLACEHOLDER', 'I-001 open'),
  ('A2', 'Class A2 — definition pending', null, 'PLACEHOLDER', 'I-001 open'),
  ('A3', 'Class A3 — definition pending', null, 'PLACEHOLDER', 'I-001 open'),
  ('A4', 'Class A4 — definition pending', null, 'PLACEHOLDER', 'I-001 open')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Ranking run
-- ---------------------------------------------------------------------------
create table if not exists branch.ranking_run (
  id                         text primary key default (gen_random_uuid())::text,
  trigger                    text not null,
  triggered_by               text,
  qualification_run_id       text,
  weight_set_id              text not null references branch.ranking_weight_set (id) on delete restrict,
  weight_set_version_no      integer not null,
  ordering_strategy          text not null,
  division_id                text,
  pool_size                  integer not null default 0,
  excluded_flagged           integer not null default 0,
  excluded_cannot_evaluate   integer not null default 0,
  excluded_other             integer not null default 0,
  total_demand               numeric(18, 3) not null default 0,
  total_demand_uom_code      text,
  fleet_capacity_indicator   numeric(18, 3),
  fallback_class_used        integer not null default 0,
  supersedes_run_id          text,
  started_at                 timestamptz not null default now(),
  finished_at                timestamptz,
  status                     text not null default 'RUNNING',
  scope_json                 jsonb,
  constraint ranking_run_trigger_chk check (trigger in (
    'ON_DEMAND', 'AFTER_QUALIFICATION', 'SCHEDULE', 'API'
  )),
  constraint ranking_run_status_chk check (status in ('RUNNING', 'COMPLETED', 'FAILED')),
  constraint ranking_run_strategy_chk check (ordering_strategy in ('ADDITIVE', 'BAND_THEN_SCORE'))
);

create index if not exists ranking_run_started_idx
  on branch.ranking_run (started_at desc);

-- ---------------------------------------------------------------------------
-- Score ledger (append-only)
-- ---------------------------------------------------------------------------
create table if not exists branch.order_rank_score (
  id                       text primary key default (gen_random_uuid())::text,
  run_id                   text not null references branch.ranking_run (id) on delete restrict,
  order_id                 text not null references branch.delivery_order (id) on delete restrict,
  rank_position            integer not null,
  total_score              numeric(5, 1) not null,
  risk_score               numeric(5, 1) not null,
  value_score              numeric(5, 1) not null,
  size_score               numeric(5, 1) not null,
  class_score              numeric(5, 1) not null,
  window_score             numeric(5, 1) not null,
  input_run_out_days       numeric(5, 1) not null,
  input_risk_band          text not null,
  input_order_value        numeric(18, 2) not null,
  input_qualified_qty      numeric(14, 3) not null,
  input_qty_uom_id         text not null,
  input_normalised_qty     numeric(14, 3) not null,
  input_customer_class     text,
  input_customer_segment   text,
  class_source             text not null,
  input_mode               text not null,
  weight_set_id            text not null,
  weight_set_version_no    integer not null,
  ordering_strategy        text not null,
  is_packed                boolean not null,
  rank_source              text not null default 'ENGINE',
  override_id              text,
  grounds                  text,
  reference                text,
  scored_at                timestamptz not null default now(),
  constraint ors_band_chk check (input_risk_band in ('critical', 'high', 'medium', 'low')),
  constraint ors_class_source_chk check (class_source in ('CLASS', 'SEGMENT_FALLBACK', 'DEFAULT')),
  constraint ors_rank_source_chk check (rank_source in ('ENGINE', 'PLANNER')),
  constraint ors_mode_chk check (input_mode in ('FORECAST', 'MONITOR', 'SCHEDULED', 'WILL_CALL')),
  constraint ors_run_order_udx unique (run_id, order_id),
  constraint ors_run_rank_udx unique (run_id, rank_position)
);

create index if not exists ors_order_scored_idx
  on branch.order_rank_score (order_id, scored_at desc);

do $$
begin
  if not exists (select 1 from pg_rules where rulename = 'ors_no_update') then
    create rule ors_no_update as on update to branch.order_rank_score do instead nothing;
  end if;
  if not exists (select 1 from pg_rules where rulename = 'ors_no_delete') then
    create rule ors_no_delete as on delete to branch.order_rank_score do instead nothing;
  end if;
end $$;

create index if not exists ix_delivery_order_rank_pool
  on branch.delivery_order (division_id, due_date)
  where qual_outcome = 'QUALIFIED' and deleted_at is null and status = 'OPEN';

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values
  ('RWS', 'Ranking Weight Set', 'RWS', 5, 1, true),
  ('ROVR', 'Ranking Override', 'ROVR', 5, 0, true)
on conflict (code) do nothing;
