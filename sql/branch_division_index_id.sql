-- Store Division ids as text so a generated index such as DIV00001 can be the primary key.
-- Existing UUID values are kept as text. Child foreign keys are converted with them.

do $$
declare
  rec record;
  division_id_type text;
begin
  select c.udt_name into division_id_type
  from information_schema.columns c
  where c.table_schema = 'branch' and c.table_name = 'division' and c.column_name = 'id';

  if division_id_type = 'uuid' then
    for rec in
      select n.nspname as schema_name, cls.relname as table_name, a.attname as column_name, con.conname
      from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
      join pg_namespace n on n.oid = cls.relnamespace
      join pg_attribute a on a.attrelid = cls.oid and a.attnum = any (con.conkey)
      where con.contype = 'f' and con.confrelid = 'branch.division'::regclass
    loop
      execute format('alter table %I.%I drop constraint %I', rec.schema_name, rec.table_name, rec.conname);
      execute format(
        'alter table %I.%I alter column %I type text using %I::text',
        rec.schema_name, rec.table_name, rec.column_name, rec.column_name
      );
    end loop;

    alter table branch.division alter column id drop default;
    alter table branch.division alter column id type text using id::text;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'division_version_division_fk') then
    alter table branch.division_version
      add constraint division_version_division_fk
      foreign key (division_id) references branch.division (id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'division_audit_division_fk') then
    alter table branch.division_audit
      add constraint division_audit_division_fk
      foreign key (division_id) references branch.division (id) on delete restrict;
  end if;
  if to_regclass('branch.shipping_point') is not null
     and not exists (select 1 from pg_constraint where conname = 'shipping_point_division_fk') then
    alter table branch.shipping_point
      add constraint shipping_point_division_fk
      foreign key (division_id) references branch.division (id) on delete restrict;
  end if;
  if to_regclass('branch.vehicle') is not null
     and not exists (select 1 from pg_constraint where conname = 'vehicle_division_fk') then
    alter table branch.vehicle
      add constraint vehicle_division_fk
      foreign key (division_id) references branch.division (id) on delete restrict;
  end if;
  if to_regclass('branch.cost_centre') is not null
     and not exists (select 1 from pg_constraint where conname = 'cost_centre_division_fk') then
    alter table branch.cost_centre
      add constraint cost_centre_division_fk
      foreign key (division_id) references branch.division (id) on delete restrict;
  end if;
end $$;
