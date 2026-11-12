-- Order Intake (pre-M02) — apply against POSTGRES_DB (txpoprdb).
-- Transactional. Not a governed master (no DRAFT/PENDING/PUBLISHED MDM machine).
-- Orders arrive from ERP/CSV; M02 will qualify them later.
-- Do not Prisma migrate / db push. No UI.

create schema if not exists branch;

create table if not exists branch.delivery_order (
  id                      text primary key,
  order_no                text not null,
  external_id             text,
  customer_code           text not null,
  customer_name           text,
  material_id             text not null references branch.material (id) on delete restrict,
  storage_tank_id         text references branch.storage_tank (id) on delete restrict,
  shipping_point_id       text references branch.shipping_point (id) on delete restrict,
  division_id             text references branch.division (id) on delete restrict,
  is_packed               boolean not null default false,
  mode                    text not null,
  due_date                date not null,
  requested_qty           numeric(14, 3) not null,
  requested_qty_uom_id    text not null references branch.uom (id) on delete restrict,
  qualified_qty           numeric(14, 3),
  qualified_qty_uom_id    text references branch.uom (id) on delete restrict,
  computed_ullage         numeric(14, 3),
  computed_ullage_uom_id  text references branch.uom (id) on delete restrict,
  order_value             numeric(18, 2) not null default 0,
  status                  text not null default 'OPEN',
  qual_outcome            text not null default 'PENDING',
  qual_mode               text,
  qual_reason_code        text,
  qual_reason_text        text,
  qual_decided_at         timestamptz,
  qual_decided_by         text,
  notes                   text,
  version_no              integer not null default 1,
  created_at              timestamptz not null default now(),
  created_by              text,
  updated_at              timestamptz not null default now(),
  updated_by              text,
  deleted_at              timestamptz,
  constraint delivery_order_mode_chk check (mode in ('FORECAST', 'MONITOR', 'SCHEDULED', 'WILL_CALL')),
  constraint delivery_order_status_chk check (status in ('OPEN', 'CANCELLED', 'CLOSED')),
  constraint delivery_order_qual_outcome_chk check (qual_outcome in (
    'PENDING', 'QUALIFIED', 'FLAGGED', 'CANNOT_EVALUATE', 'REJECTED'
  )),
  constraint delivery_order_qual_mode_chk check (qual_mode is null or qual_mode in ('AUTO', 'MANUAL')),
  constraint delivery_order_qty_positive_chk check (requested_qty > 0),
  constraint delivery_order_value_nonneg_chk check (order_value >= 0),
  constraint delivery_order_packed_tank_chk check (
    (is_packed = true and storage_tank_id is null)
    or (is_packed = false)
  )
);

create unique index if not exists delivery_order_order_no_udx
  on branch.delivery_order (upper(order_no))
  where deleted_at is null;

create unique index if not exists delivery_order_external_id_udx
  on branch.delivery_order (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists delivery_order_status_due_idx
  on branch.delivery_order (status, due_date)
  where deleted_at is null;

create index if not exists delivery_order_qual_outcome_idx
  on branch.delivery_order (qual_outcome, due_date)
  where deleted_at is null;

create index if not exists delivery_order_material_idx
  on branch.delivery_order (material_id)
  where deleted_at is null;

create index if not exists delivery_order_tank_idx
  on branch.delivery_order (storage_tank_id)
  where storage_tank_id is not null and deleted_at is null;

-- Gate-0 style scope index for future M02 engine
create index if not exists ix_delivery_order_m02_scope
  on branch.delivery_order (due_date)
  where qual_outcome in ('PENDING', 'FLAGGED', 'CANNOT_EVALUATE')
    and (qual_mode is null or qual_mode <> 'MANUAL')
    and deleted_at is null
    and status = 'OPEN';

create table if not exists branch.delivery_order_version (
  id                 text primary key default (gen_random_uuid())::text,
  delivery_order_id  text not null references branch.delivery_order (id) on delete restrict,
  version_no         integer not null,
  snapshot           jsonb not null,
  recorded_at        timestamptz not null default now(),
  recorded_by        text,
  constraint delivery_order_version_udx unique (delivery_order_id, version_no)
);

create table if not exists branch.delivery_order_audit (
  id                 text primary key default (gen_random_uuid())::text,
  delivery_order_id  text not null references branch.delivery_order (id) on delete restrict,
  action             text not null,
  actor              text,
  note               text,
  payload            jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists delivery_order_audit_row_idx
  on branch.delivery_order_audit (delivery_order_id, created_at);

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('ORD', 'Delivery Order', 'ORD', 5, 0, true)
on conflict (code) do nothing;
