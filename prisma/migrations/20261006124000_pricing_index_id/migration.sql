-- Store Pricing Procedure ids as text (PRC00001) and Pricing Rule ids as text (PRL00001).
-- Existing UUID values are kept as text. Condition row ids stay UUIDs.

do $$
declare
  rec record;
  id_type text;
begin
  select c.udt_name into id_type
  from information_schema.columns c
  where c.table_schema = 'branch' and c.table_name = 'pricing_procedure' and c.column_name = 'id';

  if id_type = 'uuid' then
    for rec in
      select n.nspname as schema_name, cls.relname as table_name, a.attname as column_name, con.conname
      from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
      join pg_namespace n on n.oid = cls.relnamespace
      join pg_attribute a on a.attrelid = cls.oid and a.attnum = any (con.conkey)
      where con.contype = 'f' and con.confrelid = 'branch.pricing_procedure'::regclass
    loop
      execute format('alter table %I.%I drop constraint %I', rec.schema_name, rec.table_name, rec.conname);
      execute format(
        'alter table %I.%I alter column %I type text using %I::text',
        rec.schema_name, rec.table_name, rec.column_name, rec.column_name
      );
    end loop;

    alter table branch.pricing_procedure alter column id drop default;
    alter table branch.pricing_procedure alter column id type text using id::text;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'pricing_rule_procedure_fk') then
    alter table branch.pricing_rule
      add constraint pricing_rule_procedure_fk
      foreign key (procedure_id) references branch.pricing_procedure (id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pricing_procedure_version_procedure_fk') then
    alter table branch.pricing_procedure_version
      add constraint pricing_procedure_version_procedure_fk
      foreign key (procedure_id) references branch.pricing_procedure (id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pricing_procedure_audit_procedure_fk') then
    alter table branch.pricing_procedure_audit
      add constraint pricing_procedure_audit_procedure_fk
      foreign key (procedure_id) references branch.pricing_procedure (id) on delete restrict;
  end if;

  select c.udt_name into id_type
  from information_schema.columns c
  where c.table_schema = 'branch' and c.table_name = 'pricing_rule' and c.column_name = 'id';

  if id_type = 'uuid' then
    for rec in
      select n.nspname as schema_name, cls.relname as table_name, a.attname as column_name, con.conname
      from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
      join pg_namespace n on n.oid = cls.relnamespace
      join pg_attribute a on a.attrelid = cls.oid and a.attnum = any (con.conkey)
      where con.contype = 'f' and con.confrelid = 'branch.pricing_rule'::regclass
    loop
      execute format('alter table %I.%I drop constraint %I', rec.schema_name, rec.table_name, rec.conname);
      execute format(
        'alter table %I.%I alter column %I type text using %I::text',
        rec.schema_name, rec.table_name, rec.column_name, rec.column_name
      );
    end loop;

    alter table branch.pricing_rule alter column id drop default;
    alter table branch.pricing_rule alter column id type text using id::text;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'pricing_rule_condition_rule_fk') then
    alter table branch.pricing_rule_condition
      add constraint pricing_rule_condition_rule_fk
      foreign key (rule_id) references branch.pricing_rule (id) on delete restrict;
  end if;
end $$;
