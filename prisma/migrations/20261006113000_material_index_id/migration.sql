-- Store Material ids as text so a generated index such as MAT00001 can be the primary key.
-- Existing UUID values are kept as text. Child foreign keys are converted with them.

do $$
declare
  rec record;
  material_id_type text;
begin
  select c.udt_name into material_id_type
  from information_schema.columns c
  where c.table_schema = 'branch' and c.table_name = 'material' and c.column_name = 'id';

  if material_id_type = 'uuid' then
    for rec in
      select n.nspname as schema_name, cls.relname as table_name, a.attname as column_name, con.conname
      from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
      join pg_namespace n on n.oid = cls.relnamespace
      join pg_attribute a on a.attrelid = cls.oid and a.attnum = any (con.conkey)
      where con.contype = 'f' and con.confrelid = 'branch.material'::regclass
    loop
      execute format('alter table %I.%I drop constraint %I', rec.schema_name, rec.table_name, rec.conname);
      execute format(
        'alter table %I.%I alter column %I type text using %I::text',
        rec.schema_name, rec.table_name, rec.column_name, rec.column_name
      );
    end loop;

    alter table branch.material alter column id drop default;
    alter table branch.material alter column id type text using id::text;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'material_version_material_fk') then
    alter table branch.material_version
      add constraint material_version_material_fk
      foreign key (material_id) references branch.material (id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'material_audit_material_fk') then
    alter table branch.material_audit
      add constraint material_audit_material_fk
      foreign key (material_id) references branch.material (id) on delete restrict;
  end if;
  if to_regclass('branch.storage_tank') is not null
     and not exists (select 1 from pg_constraint where conname = 'storage_tank_material_fk') then
    alter table branch.storage_tank
      add constraint storage_tank_material_fk
      foreign key (material_id) references branch.material (id) on delete restrict;
  end if;
  if to_regclass('branch.cylinder') is not null
     and not exists (select 1 from pg_constraint where conname = 'cylinder_material_fk') then
    alter table branch.cylinder
      add constraint cylinder_material_fk
      foreign key (material_id) references branch.material (id) on delete restrict;
  end if;
  if to_regclass('branch.vehicle_compartment') is not null
     and not exists (select 1 from pg_constraint where conname = 'vehicle_compartment_material_fk') then
    alter table branch.vehicle_compartment
      add constraint vehicle_compartment_material_fk
      foreign key (material_id) references branch.material (id) on delete restrict;
  end if;
end $$;
