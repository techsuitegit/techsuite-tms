-- Store the remaining master ids as text so generated indexes can be primary keys.
-- Existing UUID values are kept as text. Version and audit row ids stay UUIDs.
-- Haulier zone_ids becomes text[] so it can store Zone index ids.

do $$
declare
  tbl text;
  id_type text;
  rec record;
begin
  foreach tbl in array array[
    'zone',
    'shipping_point',
    'vendor',
    'uom',
    'terminal',
    'storage_tank',
    'vehicle',
    'vehicle_compartment',
    'ptl_threshold',
    'telemetry_device'
  ]
  loop
    select c.udt_name into id_type
    from information_schema.columns c
    where c.table_schema = 'branch' and c.table_name = tbl and c.column_name = 'id';

    if id_type = 'uuid' then
      for rec in
        execute format(
          $q$
            select n.nspname as schema_name, cls.relname as table_name, a.attname as column_name, con.conname
            from pg_constraint con
            join pg_class cls on cls.oid = con.conrelid
            join pg_namespace n on n.oid = cls.relnamespace
            join pg_attribute a on a.attrelid = cls.oid and a.attnum = any (con.conkey)
            where con.contype = 'f' and con.confrelid = %L::regclass
          $q$,
          'branch.' || tbl
        )
      loop
        execute format('alter table %I.%I drop constraint %I', rec.schema_name, rec.table_name, rec.conname);
        execute format(
          'alter table %I.%I alter column %I type text using %I::text',
          rec.schema_name, rec.table_name, rec.column_name, rec.column_name
        );
      end loop;

      execute format('alter table branch.%I alter column id drop default', tbl);
      execute format('alter table branch.%I alter column id type text using id::text', tbl);
    end if;
  end loop;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'branch' and table_name = 'haulier' and column_name = 'zone_ids' and udt_name = '_uuid'
  ) then
    alter table branch.haulier alter column zone_ids type text[] using zone_ids::text[];
  end if;
end $$;

create or replace function public._tms_add_text_fk(
  con_name text,
  child_table text,
  child_column text,
  parent_table text
) returns void
language plpgsql
as $$
declare
  orphan boolean;
begin
  if to_regclass('branch.' || child_table) is null then
    return;
  end if;
  if exists (select 1 from pg_constraint where conname = con_name) then
    return;
  end if;
  execute format(
    'select exists (select 1 from branch.%I c where c.%I is not null and not exists (select 1 from branch.%I p where p.id = c.%I))',
    child_table, child_column, parent_table, child_column
  ) into orphan;
  if orphan then
    return;
  end if;
  execute format(
    'alter table branch.%I add constraint %I foreign key (%I) references branch.%I (id) on delete restrict',
    child_table, con_name, child_column, parent_table
  );
end $$;

select public._tms_add_text_fk('zone_version_zone_fk', 'zone_version', 'zone_id', 'zone');
select public._tms_add_text_fk('zone_audit_zone_fk', 'zone_audit', 'zone_id', 'zone');
select public._tms_add_text_fk('division_zone_fk', 'division', 'zone_id', 'zone');

select public._tms_add_text_fk('shipping_point_version_shipping_point_fk', 'shipping_point_version', 'shipping_point_id', 'shipping_point');
select public._tms_add_text_fk('shipping_point_audit_shipping_point_fk', 'shipping_point_audit', 'shipping_point_id', 'shipping_point');
select public._tms_add_text_fk('cost_centre_shipping_point_fk', 'cost_centre', 'shipping_point_id', 'shipping_point');
select public._tms_add_text_fk('vehicle_shipping_point_fk', 'vehicle', 'shipping_point_id', 'shipping_point');
select public._tms_add_text_fk('cylinder_shipping_point_fk', 'cylinder', 'shipping_point_id', 'shipping_point');
select public._tms_add_text_fk('storage_tank_shipping_point_fk', 'storage_tank', 'shipping_point_id', 'shipping_point');
select public._tms_add_text_fk('storage_tank_dispatcher_point_fk', 'storage_tank', 'dispatcher_point_id', 'shipping_point');
select public._tms_add_text_fk('terminal_shipping_point_fk', 'terminal', 'shipping_point_id', 'shipping_point');

select public._tms_add_text_fk('vendor_version_vendor_fk', 'vendor_version', 'vendor_id', 'vendor');
select public._tms_add_text_fk('vendor_audit_vendor_fk', 'vendor_audit', 'vendor_id', 'vendor');
select public._tms_add_text_fk('terminal_vendor_fk', 'terminal', 'vendor_id', 'vendor');
select public._tms_add_text_fk('storage_tank_vendor_fk', 'storage_tank', 'vendor_id', 'vendor');
select public._tms_add_text_fk('telemetry_device_vendor_fk', 'telemetry_device', 'vendor_id', 'vendor');

select public._tms_add_text_fk('uom_version_uom_fk', 'uom_version', 'uom_id', 'uom');
select public._tms_add_text_fk('uom_audit_uom_fk', 'uom_audit', 'uom_id', 'uom');
select public._tms_add_text_fk('material_base_uom_fk', 'material', 'base_uom_id', 'uom');
select public._tms_add_text_fk('material_alt_uom_fk', 'material', 'alt_uom_id', 'uom');
select public._tms_add_text_fk('material_weight_uom_fk', 'material', 'weight_uom_id', 'uom');
select public._tms_add_text_fk('material_volume_uom_fk', 'material', 'volume_uom_id', 'uom');
select public._tms_add_text_fk('vehicle_capacity_uom_fk', 'vehicle', 'capacity_uom_id', 'uom');
select public._tms_add_text_fk('storage_tank_capacity_uom_fk', 'storage_tank', 'capacity_uom_id', 'uom');

select public._tms_add_text_fk('terminal_version_terminal_fk', 'terminal_version', 'terminal_id', 'terminal');
select public._tms_add_text_fk('terminal_audit_terminal_fk', 'terminal_audit', 'terminal_id', 'terminal');

select public._tms_add_text_fk('storage_tank_version_storage_tank_fk', 'storage_tank_version', 'storage_tank_id', 'storage_tank');
select public._tms_add_text_fk('storage_tank_audit_storage_tank_fk', 'storage_tank_audit', 'storage_tank_id', 'storage_tank');
select public._tms_add_text_fk('telemetry_device_storage_tank_fk', 'telemetry_device', 'storage_tank_id', 'storage_tank');

select public._tms_add_text_fk('vehicle_compartment_vehicle_fk', 'vehicle_compartment', 'vehicle_id', 'vehicle');
select public._tms_add_text_fk('vehicle_version_vehicle_fk', 'vehicle_version', 'vehicle_id', 'vehicle');
select public._tms_add_text_fk('vehicle_audit_vehicle_fk', 'vehicle_audit', 'vehicle_id', 'vehicle');

select public._tms_add_text_fk('ptl_threshold_version_ptl_fk', 'ptl_threshold_version', 'ptl_threshold_id', 'ptl_threshold');
select public._tms_add_text_fk('ptl_threshold_audit_ptl_fk', 'ptl_threshold_audit', 'ptl_threshold_id', 'ptl_threshold');

select public._tms_add_text_fk('telemetry_device_version_device_fk', 'telemetry_device_version', 'telemetry_device_id', 'telemetry_device');
select public._tms_add_text_fk('telemetry_device_audit_device_fk', 'telemetry_device_audit', 'telemetry_device_id', 'telemetry_device');

drop function public._tms_add_text_fk(text, text, text, text);
