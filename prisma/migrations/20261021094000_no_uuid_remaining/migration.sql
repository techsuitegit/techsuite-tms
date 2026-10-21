-- Convert remaining uuid-typed columns to text.
-- pricing_rule_condition.id keeps a UUID-looking default as text.
-- legal_entity_id has no Legal Entity table yet; store as text so future index ids work.

do $$
declare
  id_type text;
  col_type text;
  rec record;
begin
  if to_regclass('branch.pricing_rule_condition') is not null then
    select c.udt_name into id_type
    from information_schema.columns c
    where c.table_schema = 'branch' and c.table_name = 'pricing_rule_condition' and c.column_name = 'id';

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
          'branch.pricing_rule_condition'
        )
      loop
        execute format('alter table %I.%I drop constraint %I', rec.schema_name, rec.table_name, rec.conname);
        execute format(
          'alter table %I.%I alter column %I type text using %I::text',
          rec.schema_name, rec.table_name, rec.column_name, rec.column_name
        );
      end loop;

      alter table branch.pricing_rule_condition alter column id drop default;
      alter table branch.pricing_rule_condition alter column id type text using id::text;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'branch' and table_name = 'pricing_rule_condition' and column_name = 'id' and udt_name = 'text'
    ) then
      alter table branch.pricing_rule_condition alter column id set default (gen_random_uuid())::text;
    end if;
  end if;

  if to_regclass('branch.division') is not null then
    select c.udt_name into col_type
    from information_schema.columns c
    where c.table_schema = 'branch' and c.table_name = 'division' and c.column_name = 'legal_entity_id';

    if col_type = 'uuid' then
      alter table branch.division alter column legal_entity_id type text using legal_entity_id::text;
    end if;
  end if;

  if to_regclass('branch.storage_tank') is not null then
    select c.udt_name into col_type
    from information_schema.columns c
    where c.table_schema = 'branch' and c.table_name = 'storage_tank' and c.column_name = 'legal_entity_id';

    if col_type = 'uuid' then
      alter table branch.storage_tank alter column legal_entity_id type text using legal_entity_id::text;
    end if;
  end if;
end $$;
