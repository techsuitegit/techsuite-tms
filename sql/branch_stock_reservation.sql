-- M04 Stock Reservation — apply against POSTGRES_DB (txpoprdb) after M03.
-- Transactional. No UI. Do not Prisma migrate / db push.
--
-- Owns: stock_reservation, stock_reservation_event (append-only),
-- terminal_stock_declaration (append-only revisions; is_current is the one
-- column a correction may flip), terminal_stock_position (projection),
-- reservation_reason_code, reservation_policy (governed).
-- Plus reservation_trip_link: M05 route / delivery_plan tables are not in this
-- repo, so confirmation context is stored here until those FKs can be added.
-- No tenant_id / RLS: this database has no tenant column (WBS 1.1 not applied).
-- Rackability is a service rule, not a foreign key (DB-04). A terminal product
-- list is governed master data; a constraint here would reject history when
-- that list is amended.

create schema if not exists branch;

-- KL is the declaration unit in the M04 samples. Factor lives on the UOM row.
insert into branch.uom (
  id, code, name, is_base, factor_to_base, decimal_places, rounding, dimension,
  valid_from, reason, status, version_no, external_id, created_by, updated_by
)
select 'UOMKL', 'KL', 'Kilolitre', false, 1000, 3, 'HALF_UP', 'VOLUME', current_date, 'New record', 'PUBLISHED', 1, 'KL', 'm04', 'm04'
where not exists (select 1 from branch.uom where upper(code) = 'KL' and deleted_at is null);

-- ---------------------------------------------------------------------------
-- Reason catalogue (no MasterBase). Fourteen seed codes.
-- ---------------------------------------------------------------------------
create table if not exists branch.reservation_reason_code (
  code        text primary key,
  label       text not null,
  applies_to  text not null,
  is_active   boolean not null default true,
  constraint reservation_reason_applies_chk check (applies_to in ('ENGINE', 'REASSIGN', 'RELEASE', 'SHORT', 'EXTEND'))
);

insert into branch.reservation_reason_code (code, label, applies_to) values
  ('ENG_DERIVED_NEAREST', 'Nearest terminal racking the product', 'ENGINE'),
  ('ENG_DERIVED_HOME', 'Vehicle home terminal, within the proximity band', 'ENGINE'),
  ('ENG_NO_DECLARATION', 'No availability declared for this terminal, product and date', 'ENGINE'),
  ('ENG_SHORT_DECLARED', 'Declared availability does not cover the reservation', 'ENGINE'),
  ('RSN_TERMINAL_OUTAGE', 'Terminal outage or bay queue', 'REASSIGN'),
  ('RSN_PRODUCT_UNAVAILABLE', 'Product not available at the derived terminal', 'REASSIGN'),
  ('RSN_LOADING_WINDOW', 'Loading window at the derived terminal does not fit the trip', 'REASSIGN'),
  ('RSN_SUPERVISOR_INSTRUCTION', 'Supervisor instruction', 'REASSIGN'),
  ('REL_TRIP_CANCELLED', 'Trip cancelled', 'RELEASE'),
  ('REL_ORDER_UNQUALIFIED', 'Order no longer qualified', 'RELEASE'),
  ('REL_STOP_UNASSIGNED', 'Stop removed from the confirmed trip', 'RELEASE'),
  ('REL_PLAN_DISCARDED', 'Confirmed plan discarded and rebuilt', 'RELEASE'),
  ('SHT_ACCEPTED_PARTIAL', 'Shortfall accepted, partial load agreed', 'SHORT'),
  ('EXT_LOADING_DELAYED', 'Loading delayed, window extended', 'EXTEND')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Policy (governed). Illustrative figures are placeholders.
-- expiry_grace_hours 4, warning_lead_hours 2, sweep 30 min, bias 3.4 km.
-- ---------------------------------------------------------------------------
create table if not exists branch.reservation_policy (
  id                          text primary key,
  code                        text not null,
  name                        text not null,
  expiry_grace_hours          integer not null,
  warning_lead_hours          integer not null,
  sweep_cadence_minutes       integer not null,
  release_at_terminal_close   boolean not null default true,
  max_expiry_extensions       integer not null,
  allow_short_commitment      boolean not null default true,
  unverified_is_reservable    boolean not null default true,
  home_terminal_bias_km       numeric(8, 3) not null,
  proximity_tie_break         text not null default 'TERMINAL_CODE',
  division_id                 text references branch.division (id) on delete restrict,
  valid_from                  date not null default current_date,
  valid_to                    date,
  version_no                  integer not null default 1,
  status                      text not null default 'PUBLISHED',
  is_current                  boolean not null default true,
  is_active                   boolean not null default true,
  reason                      text not null default 'New record',
  change_note                 text,
  created_at                  timestamptz not null default now(),
  created_by                  text,
  updated_at                  timestamptz not null default now(),
  updated_by                  text,
  constraint reservation_policy_grace_chk check (expiry_grace_hours between 0 and 48),
  constraint reservation_policy_warn_chk check (warning_lead_hours between 1 and 24),
  constraint reservation_policy_sweep_chk check (sweep_cadence_minutes between 5 and 240),
  constraint reservation_policy_ext_chk check (max_expiry_extensions between 0 and 10),
  constraint reservation_policy_bias_chk check (home_terminal_bias_km >= 0),
  constraint reservation_policy_tie_chk check (proximity_tie_break = 'TERMINAL_CODE'),
  constraint reservation_policy_status_chk check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  constraint reservation_policy_valid_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists reservation_policy_current_udx
  on branch.reservation_policy (upper(code))
  where is_current;

insert into branch.reservation_policy (
  id, code, name,
  expiry_grace_hours, warning_lead_hours, sweep_cadence_minutes,
  release_at_terminal_close, max_expiry_extensions, allow_short_commitment,
  unverified_is_reservable, home_terminal_bias_km, proximity_tie_break,
  status, version_no, is_current, is_active, reason, change_note, created_by, updated_by
) values (
  'RPOL00001', 'RSV-DEFAULT', 'Default reservation policy',
  4, 2, 30,
  true, 2, true,
  true, 3.400, 'TERMINAL_CODE',
  'PUBLISHED', 1, true, true, 'New record',
  'Placeholder figures. Grace 4h, warning lead 2h, home-terminal bias 3.4 km. Operations manager confirms.',
  'system', 'system'
) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Trip link — stand-in for M05 route status, plan kind, and departure.
-- A SCENARIO plan is rejected by the service and never inserted here.
-- ---------------------------------------------------------------------------
create table if not exists branch.reservation_trip_link (
  trip_id              text primary key,
  route_id             text not null,
  route_status         text not null,
  plan_id              text not null,
  plan_kind            text not null,
  trip_no              integer not null,
  planned_departure    timestamptz not null,
  reserve_date         date not null,
  vehicle_id           text,
  home_terminal_id     text,
  confirmed_by         text,
  updated_at           timestamptz not null default now(),
  constraint reservation_trip_status_chk check (route_status in ('DRAFT', 'CONFIRMED', 'DISPATCHED', 'CANCELLED')),
  constraint reservation_trip_kind_chk check (plan_kind = 'LIVE'),
  constraint reservation_trip_no_chk check (trip_no in (1, 2))
);

create unique index if not exists reservation_trip_route_udx
  on branch.reservation_trip_link (route_id, trip_no);

-- ---------------------------------------------------------------------------
-- Reservation. One live row per order per route.
-- ---------------------------------------------------------------------------
create table if not exists branch.stock_reservation (
  id                      text primary key,
  reservation_no          text not null,
  order_id                text not null references branch.delivery_order (id) on delete restrict,
  route_id                text not null,
  route_stop_id           text,
  trip_no                 integer not null,
  plan_id                 text not null,
  plan_kind               text not null default 'LIVE',
  terminal_id             text not null references branch.shipping_point (id) on delete restrict,
  derived_terminal_id     text not null references branch.shipping_point (id) on delete restrict,
  terminal_source         text not null,
  material_id             text not null references branch.material (id) on delete restrict,
  reserve_date            date not null,
  reserved_qty            numeric(14, 3) not null,
  reserved_qty_uom_id     text not null references branch.uom (id) on delete restrict,
  commitment_outcome      text not null,
  status                  text not null default 'ACTIVE',
  reason_code             text references branch.reservation_reason_code (code),
  reason_text             text,
  expires_at              timestamptz not null,
  expiry_warned_at        timestamptz,
  expiry_extended_count   integer not null default 0,
  released_at             timestamptz,
  released_by             text,
  consumed_at             timestamptz,
  override_id             text,
  override_by             text,
  policy_id               text not null references branch.reservation_policy (id) on delete restrict,
  idempotency_key         text,
  version_no              integer not null default 1,
  created_at              timestamptz not null default now(),
  constraint stock_reservation_qty_chk check (reserved_qty > 0),
  constraint stock_reservation_source_chk check (terminal_source in ('DERIVED', 'REASSIGNED')),
  constraint stock_reservation_outcome_chk check (commitment_outcome in ('RESERVED', 'SHORT', 'UNVERIFIED')),
  constraint stock_reservation_status_chk check (status in (
    'ACTIVE', 'EXPIRING', 'EXPIRED', 'RELEASED', 'CONSUMED', 'PENDING_COUNTERSIGN'
  )),
  constraint stock_reservation_trip_chk check (trip_no in (1, 2)),
  constraint stock_reservation_live_plan_chk check (plan_kind = 'LIVE'),
  constraint stock_reservation_reassign_override_chk check (
    terminal_source <> 'REASSIGNED' or override_id is not null
  ),
  constraint stock_reservation_ext_chk check (expiry_extended_count between 0 and 10)
);

create unique index if not exists uq_reservation_no
  on branch.stock_reservation (reservation_no);

create unique index if not exists uq_reservation_live
  on branch.stock_reservation (order_id, route_id)
  where status in ('ACTIVE', 'EXPIRING', 'PENDING_COUNTERSIGN');

create unique index if not exists uq_reservation_idempotency
  on branch.stock_reservation (idempotency_key)
  where idempotency_key is not null;

create index if not exists ix_reservation_terminal_day
  on branch.stock_reservation (terminal_id, material_id, reserve_date);

create index if not exists ix_reservation_route
  on branch.stock_reservation (route_id);

create index if not exists ix_reservation_sweep
  on branch.stock_reservation (expires_at)
  where status in ('ACTIVE', 'EXPIRING');

-- ---------------------------------------------------------------------------
-- Event ledger. Append-only by rule. reservation_id is null only when the
-- engine refused to reserve (no rackable terminal) and still had to keep
-- the candidate set.
-- ---------------------------------------------------------------------------
create table if not exists branch.stock_reservation_event (
  id                    text primary key,
  reservation_id        text references branch.stock_reservation (id) on delete restrict,
  seq                   integer not null,
  event_type            text not null,
  actor_kind            text not null,
  actor_user_id         text,
  reason_code           text references branch.reservation_reason_code (code),
  reason_text           text not null,
  from_terminal_id      text,
  to_terminal_id        text,
  qty_before            numeric(14, 3),
  qty_after             numeric(14, 3),
  input_candidates      jsonb,
  input_declared_qty    numeric(14, 3),
  input_committed_qty   numeric(14, 3),
  input_qualified_qty   numeric(14, 3) not null,
  input_vehicle_id      text,
  uom_id                text not null references branch.uom (id) on delete restrict,
  policy_id             text not null references branch.reservation_policy (id) on delete restrict,
  override_id           text,
  idempotency_key       text,
  occurred_at           timestamptz not null default now(),
  received_at           timestamptz,
  notified_parties      jsonb,
  constraint sre_type_chk check (event_type in (
    'RESERVED', 'REASSIGNED', 'QTY_AMENDED', 'SHORT_ACCEPTED', 'EXPIRY_WARNED',
    'EXPIRY_EXTENDED', 'RELEASED', 'EXPIRED', 'CONSUMED', 'NO_RACKABLE'
  )),
  constraint sre_actor_chk check (actor_kind in ('ENGINE', 'PLANNER', 'OPERATOR', 'SYSTEM')),
  constraint sre_actor_user_chk check (
    actor_kind not in ('PLANNER', 'OPERATOR') or actor_user_id is not null
  ),
  constraint sre_reason_len_chk check (char_length(reason_text) >= 8),
  constraint sre_reassigned_chk check (
    event_type <> 'REASSIGNED'
    or (from_terminal_id is not null and to_terminal_id is not null)
  ),
  constraint sre_qualified_chk check (input_qualified_qty > 0),
  constraint sre_norack_chk check (
    (event_type = 'NO_RACKABLE' and reservation_id is null)
    or (event_type <> 'NO_RACKABLE' and reservation_id is not null)
  )
);

create unique index if not exists uq_reservation_event_seq
  on branch.stock_reservation_event (reservation_id, seq);

create index if not exists ix_reservation_event_history
  on branch.stock_reservation_event (reservation_id, occurred_at desc);

create index if not exists ix_reservation_event_type
  on branch.stock_reservation_event (event_type, occurred_at desc);

do $$
begin
  if not exists (select 1 from pg_rules where rulename = 'sre_no_update') then
    create rule sre_no_update as on update to branch.stock_reservation_event do instead nothing;
  end if;
  if not exists (select 1 from pg_rules where rulename = 'sre_no_delete') then
    create rule sre_no_delete as on delete to branch.stock_reservation_event do instead nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Declaration revisions. Business columns are frozen; is_current may flip
-- so a new revision can become the only current row.
-- ---------------------------------------------------------------------------
create table if not exists branch.terminal_stock_declaration (
  id                    text primary key,
  terminal_id           text not null references branch.shipping_point (id) on delete restrict,
  material_id           text not null references branch.material (id) on delete restrict,
  availability_date     date not null,
  declared_qty          numeric(14, 3) not null,
  declared_qty_uom_id   text not null references branch.uom (id) on delete restrict,
  revision_no           integer not null,
  supersedes_id         text,
  is_current            boolean not null default true,
  source                text not null default 'OPERATOR',
  note                  text,
  declared_by           text,
  declared_at           timestamptz not null default now(),
  idempotency_key       text,
  constraint tsd_qty_chk check (declared_qty >= 0),
  constraint tsd_revision_chk check (revision_no >= 1),
  constraint tsd_source_chk check (source in ('OPERATOR', 'ERP', 'ESTIMATED')),
  constraint tsd_operator_chk check (source <> 'OPERATOR' or declared_by is not null),
  constraint tsd_revision_udx unique (terminal_id, material_id, availability_date, revision_no)
);

create unique index if not exists uq_declaration_current
  on branch.terminal_stock_declaration (terminal_id, material_id, availability_date)
  where is_current;

create unique index if not exists uq_declaration_idempotency
  on branch.terminal_stock_declaration (idempotency_key)
  where idempotency_key is not null;

create or replace function branch.terminal_stock_declaration_guard()
returns trigger
language plpgsql
as $guard$
begin
  if tg_op = 'DELETE' then
    return null;
  end if;
  if new.terminal_id is distinct from old.terminal_id
     or new.material_id is distinct from old.material_id
     or new.availability_date is distinct from old.availability_date
     or new.declared_qty is distinct from old.declared_qty
     or new.declared_qty_uom_id is distinct from old.declared_qty_uom_id
     or new.revision_no is distinct from old.revision_no
     or new.supersedes_id is distinct from old.supersedes_id
     or new.source is distinct from old.source
     or new.note is distinct from old.note
     or new.declared_by is distinct from old.declared_by
     or new.declared_at is distinct from old.declared_at
     or new.idempotency_key is distinct from old.idempotency_key
     or new.id is distinct from old.id
  then
    return null;
  end if;
  return new;
end;
$guard$;

drop trigger if exists terminal_stock_declaration_guard on branch.terminal_stock_declaration;
create trigger terminal_stock_declaration_guard
  before update or delete on branch.terminal_stock_declaration
  for each row execute function branch.terminal_stock_declaration_guard();

-- ---------------------------------------------------------------------------
-- Position projection. available_qty is null when nothing has been declared.
-- ---------------------------------------------------------------------------
create table if not exists branch.terminal_stock_position (
  terminal_id         text not null references branch.shipping_point (id) on delete restrict,
  material_id         text not null references branch.material (id) on delete restrict,
  availability_date   date not null,
  declared_qty        numeric(14, 3),
  committed_qty       numeric(14, 3) not null default 0,
  consumed_qty        numeric(14, 3) not null default 0,
  uom_id              text not null references branch.uom (id) on delete restrict,
  reservation_count   integer not null default 0,
  rebuilt_at          timestamptz,
  primary key (terminal_id, material_id, availability_date),
  constraint tsp_committed_chk check (committed_qty >= 0),
  constraint tsp_consumed_chk check (consumed_qty >= 0),
  constraint tsp_count_chk check (reservation_count >= 0)
);

alter table branch.terminal_stock_position
  add column if not exists available_qty numeric(14, 3)
  generated always as (declared_qty - committed_qty - consumed_qty) stored;

-- ---------------------------------------------------------------------------
-- Audit, separate from the event ledger.
-- ---------------------------------------------------------------------------
create table if not exists branch.stock_reservation_audit (
  id               text primary key,
  reservation_id   text,
  action           text not null,
  actor            text,
  note             text,
  payload          jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists stock_reservation_audit_row_idx
  on branch.stock_reservation_audit (reservation_id, created_at);

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values
  ('RSV', 'Stock Reservation', 'RSV', 5, 0, true),
  ('RSVE', 'Stock Reservation Event', 'RSVE', 6, 0, true),
  ('RDEC', 'Terminal Stock Declaration', 'RDEC', 5, 0, true),
  ('RSOR', 'Stock Reservation Override', 'RSOR', 5, 0, true)
on conflict (code) do nothing;
