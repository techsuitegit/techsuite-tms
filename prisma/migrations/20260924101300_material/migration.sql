-- WBS 2.9 Material-only. Apply after UOM. Do not generate a full-schema migrate.

create schema if not exists branch;

create table if not exists branch.material (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null,
  name                 text not null,
  industry_desc        text,
  basic_material       text,
  material_group       text,
  item_category_group  text,
  auth_group           text,
  cross_plant          boolean,
  long_text            text,
  dg_profile           text,
  dg_pack_status       text,
  packaging_code       text,
  env_relevant         boolean,
  in_bulk_liquid       boolean,
  highly_viscous       boolean,
  un_number            text,
  base_uom_id          uuid not null references branch.uom (id) on delete restrict,
  alt_uom_id           uuid references branch.uom (id) on delete restrict,
  alt_factor           numeric(18, 8),
  gross_weight         numeric(18, 6),
  weight_uom_id        uuid references branch.uom (id) on delete restrict,
  net_weight           numeric(18, 6),
  volume               numeric(18, 6),
  volume_uom_id        uuid references branch.uom (id) on delete restrict,
  dimensions           text,
  ean                  text,
  ean_category         text,
  valid_from           date not null,
  valid_to             date,
  reason               text not null,
  change_note          text,
  status               text not null,
  version_no           integer not null default 1,
  external_id          text,
  created_at           timestamptz not null default now(),
  created_by           text,
  updated_at           timestamptz not null default now(),
  updated_by           text,
  deleted_at           timestamptz,
  constraint material_status_chk check (status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  constraint material_reason_chk check (reason in ('Correction', 'New record', 'Regulatory update', 'Commercial change')),
  constraint material_group_chk check (
    material_group is null or material_group in ('FUEL-MS', 'FUEL-HSD', 'FUEL-LPG', 'CYL', 'LUBE')
  ),
  constraint material_item_cat_chk check (
    item_category_group is null or item_category_group in ('NORM', 'HAZMAT', 'PACK')
  ),
  constraint material_dg_chk check (
    dg_profile is null or dg_profile in ('Class 2.1', 'Class 3', '—')
  ),
  constraint material_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists material_code_udx
  on branch.material (upper(code))
  where deleted_at is null;

create unique index if not exists material_external_id_udx
  on branch.material (external_id)
  where external_id is not null and deleted_at is null;

create index if not exists material_status_idx
  on branch.material (status)
  where deleted_at is null;

create index if not exists material_validity_idx
  on branch.material (valid_from, valid_to)
  where deleted_at is null;

create table if not exists branch.material_version (
  id          uuid primary key default gen_random_uuid(),
  material_id uuid not null references branch.material (id) on delete restrict,
  version_no  integer not null,
  snapshot    jsonb not null,
  recorded_at timestamptz not null default now(),
  recorded_by text,
  constraint material_version_udx unique (material_id, version_no)
);

create table if not exists branch.material_audit (
  id          uuid primary key default gen_random_uuid(),
  material_id uuid not null references branch.material (id) on delete restrict,
  action      text not null,
  actor       text,
  note        text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists material_audit_row_idx
  on branch.material_audit (material_id, created_at);
