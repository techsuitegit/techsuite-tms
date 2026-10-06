-- Store Fee ids as text so a generated index such as FEE00001 can be the primary key.
-- Existing UUID values are kept as text. Child foreign keys are converted with them.

do $$
declare
  rec record;
  id_type text;
begin
  select c.udt_name into id_type
  from information_schema.columns c
  where c.table_schema = 'branch' and c.table_name = 'fee' and c.column_name = 'id';

  if id_type = 'uuid' then
    for rec in
      select n.nspname as schema_name, cls.relname as table_name, a.attname as column_name, con.conname
      from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
      join pg_namespace n on n.oid = cls.relnamespace
      join pg_attribute a on a.attrelid = cls.oid and a.attnum = any (con.conkey)
      where con.contype = 'f' and con.confrelid = 'branch.fee'::regclass
    loop
      execute format('alter table %I.%I drop constraint %I', rec.schema_name, rec.table_name, rec.conname);
      execute format(
        'alter table %I.%I alter column %I type text using %I::text',
        rec.schema_name, rec.table_name, rec.column_name, rec.column_name
      );
    end loop;

    alter table branch.fee alter column id drop default;
    alter table branch.fee alter column id type text using id::text;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fee_version_fee_fk') then
    alter table branch.fee_version
      add constraint fee_version_fee_fk
      foreign key (fee_id) references branch.fee (id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fee_audit_fee_fk') then
    alter table branch.fee_audit
      add constraint fee_audit_fee_fk
      foreign key (fee_id) references branch.fee (id) on delete restrict;
  end if;
end $$;
