-- Store Cost Centre ids as text so a generated index such as CCT00001 can be the primary key.
-- Existing UUID values are kept as text. Child foreign keys are converted with them.

do $$
declare
  rec record;
  id_type text;
begin
  select c.udt_name into id_type
  from information_schema.columns c
  where c.table_schema = 'branch' and c.table_name = 'cost_centre' and c.column_name = 'id';

  if id_type = 'uuid' then
    for rec in
      select n.nspname as schema_name, cls.relname as table_name, a.attname as column_name, con.conname
      from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
      join pg_namespace n on n.oid = cls.relnamespace
      join pg_attribute a on a.attrelid = cls.oid and a.attnum = any (con.conkey)
      where con.contype = 'f' and con.confrelid = 'branch.cost_centre'::regclass
    loop
      execute format('alter table %I.%I drop constraint %I', rec.schema_name, rec.table_name, rec.conname);
      execute format(
        'alter table %I.%I alter column %I type text using %I::text',
        rec.schema_name, rec.table_name, rec.column_name, rec.column_name
      );
    end loop;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'branch' and table_name = 'vehicle' and column_name = 'cost_centre_id' and udt_name = 'uuid'
    ) then
      alter table branch.vehicle alter column cost_centre_id type text using cost_centre_id::text;
    end if;

    alter table branch.cost_centre alter column id drop default;
    alter table branch.cost_centre alter column id type text using id::text;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cost_centre_version_cost_centre_fk') then
    alter table branch.cost_centre_version
      add constraint cost_centre_version_cost_centre_fk
      foreign key (cost_centre_id) references branch.cost_centre (id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cost_centre_audit_cost_centre_fk') then
    alter table branch.cost_centre_audit
      add constraint cost_centre_audit_cost_centre_fk
      foreign key (cost_centre_id) references branch.cost_centre (id) on delete restrict;
  end if;
  if to_regclass('branch.vehicle') is not null
     and not exists (select 1 from pg_constraint where conname = 'vehicle_cost_centre_fk')
     and not exists (
       select 1 from branch.vehicle v
       where not exists (select 1 from branch.cost_centre c where c.id = v.cost_centre_id)
     ) then
    alter table branch.vehicle
      add constraint vehicle_cost_centre_fk
      foreign key (cost_centre_id) references branch.cost_centre (id) on delete restrict;
  end if;
end $$;
