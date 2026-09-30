-- WBS 2.14 PTL Load Threshold — apply against POSTGRES_DB (txpoprdb).
-- Do not Prisma migrate / db push.
-- AUTO approval. One PUBLISHED row per vehicle_class. ALLOW_SILENT is not a stored action.

create schema if not exists branch;

create table if not exists branch.ptl_threshold (
  id             uuid primary key default gen_random_uuid(),
  code           text not null,
  vehicle_class  text not null,
  min_load_pct   numeric(5, 2) not null,
  below_action   text not null,
  urgent_exempt  boolean not null,
  override_role  text not null,
  valid_from     date not null,
  valid_to       date,
  reason         text not null,
  change_note    text,
  status         text not null,
  version_no     integer not null default 1,
  external_id    text,
  created_at     timestamptz not null default now(),
  created_by     text,
  updated_at     timestamptz not null default now(),
  updated_by     text,
  deleted_at     timestamptz,
  constraint ptl_threshold_class_chk check (vehicle_class in (
    'BOBTAIL_LPG', 'BOBTAIL_REFINED', 'TRANSPORT_TRACTOR', 'TANK_TRAILER', 'CYLINDER_TRUCK'
  )),
  constraint ptl_threshold_pct_chk check (min_load_pct >= 1 and min_load_pct <= 100),
  constraint ptl_threshold_action_chk check (below_action in ('WARN_REASON', 'BLOCK_UNLESS_URGENT', 'BLOCK')),
  constraint ptl_threshold_role_chk check (override_role in ('PLANNER', 'KEY_USER', 'OPS_MANAGER')),
  constraint ptl_threshold_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint ptl_threshold_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint ptl_threshold_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists ptl_threshold_code_udx
  on branch.ptl_threshold (upper(code))
  where deleted_at is null;

create unique index if not exists ptl_threshold_external_id_udx
  on branch.ptl_threshold (external_id)
  where external_id is not null and deleted_at is null;

create unique index if not exists ptl_threshold_published_class_udx
  on branch.ptl_threshold (vehicle_class)
  where status = 'PUBLISHED' and deleted_at is null;

create index if not exists ptl_threshold_status_idx
  on branch.ptl_threshold (status)
  where deleted_at is null;

create index if not exists ptl_threshold_validity_idx
  on branch.ptl_threshold (valid_from, valid_to)
  where deleted_at is null;

create table if not exists branch.ptl_threshold_version (
  id               uuid primary key default gen_random_uuid(),
  ptl_threshold_id uuid not null references branch.ptl_threshold (id) on delete restrict,
  version_no       integer not null,
  snapshot         jsonb not null,
  recorded_at      timestamptz not null default now(),
  recorded_by      text,
  constraint ptl_threshold_version_udx unique (ptl_threshold_id, version_no)
);

create table if not exists branch.ptl_threshold_audit (
  id               uuid primary key default gen_random_uuid(),
  ptl_threshold_id uuid not null references branch.ptl_threshold (id) on delete restrict,
  action           text not null,
  actor            text,
  note             text,
  payload          jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists ptl_threshold_audit_row_idx
  on branch.ptl_threshold_audit (ptl_threshold_id, created_at);
