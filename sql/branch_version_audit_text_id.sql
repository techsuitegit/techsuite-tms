-- Store version and audit row ids as text. Existing UUID values are kept as text.
-- Inserts still omit id; PostgreSQL fills gen_random_uuid()::text.
-- pricing_rule_condition and legal_entity_id are converted by branch_no_uuid_remaining.sql.

do $$
declare
  tbl text;
  id_type text;
  rec record;
begin
  foreach tbl in array array[
    'division_version',
    'division_audit',
    'shipping_point_version',
    'shipping_point_audit',
    'vendor_version',
    'vendor_audit',
    'terminal_version',
    'terminal_audit',
    'uom_version',
    'uom_audit',
    'material_version',
    'material_audit',
    'storage_tank_version',
    'storage_tank_audit',
    'fee_version',
    'fee_audit',
    'pricing_procedure_version',
    'pricing_procedure_audit',
    'cost_centre_version',
    'cost_centre_audit',
    'vehicle_version',
    'vehicle_audit',
    'ptl_threshold_version',
    'ptl_threshold_audit',
    'cylinder_version',
    'cylinder_audit',
    'telemetry_device_version',
    'telemetry_device_audit',
    'zone_version',
    'zone_audit',
    'haulier_version',
    'haulier_audit'
  ]
  loop
    if to_regclass('branch.' || tbl) is null then
      continue;
    end if;

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

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'branch' and table_name = tbl and column_name = 'id' and udt_name = 'text'
    ) then
      execute format('alter table branch.%I alter column id set default (gen_random_uuid())::text', tbl);
    end if;
  end loop;
end $$;
