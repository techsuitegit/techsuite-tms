-- Shared index number generator. Schema public. No UI.
-- fy_seq issues financeperiod ids 1000, 1010, 1020 ... 9999.
-- BindexTrn.fyid is read from public.branchcontrol.currentfyid at generation time.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'idx_numberingtype'
  ) then
    create type public.idx_numberingtype as enum ('Automatic');
  end if;
end $$;

create sequence if not exists public.fy_seq
  start with 1000
  increment by 10
  minvalue 1000
  maxvalue 9999;

create table if not exists public.financeperiod (
  id         bigint primary key default nextval('public.fy_seq'),
  name       varchar(250) not null unique,
  startdate  timestamptz,
  enddate    timestamptz
);

create table if not exists public.gindexmst (
  code          varchar(20),
  name          varchar(100) not null unique,
  numbersystem  public.idx_numberingtype not null default 'Automatic',
  description   varchar(300) null,
  noprefix      varchar(10) null,
  nosuffix      varchar(10) null,
  nolength      integer,
  lastno        integer,
  padding       boolean,
  constraint pk_gindexmst primary key (code)
);

create table if not exists public.bindexmst (
  code          varchar(20),
  branch        varchar(20),
  name          varchar(100) not null unique,
  numbersystem  public.idx_numberingtype not null default 'Automatic',
  description   varchar(300) null,
  noprefix      varchar(10) null,
  nosuffix      varchar(10) null,
  nolength      integer,
  lastno        integer,
  padding       boolean,
  constraint pk_bindexmst primary key (code, branch)
);

create table if not exists public.bindextrn (
  code          varchar(20),
  branch        varchar(20),
  fyid          bigint references public.financeperiod (id),
  name          varchar(100) not null unique,
  numbersystem  public.idx_numberingtype not null default 'Automatic',
  description   varchar(300) null,
  noprefix      varchar(10) null,
  nosuffix      varchar(10) null,
  nolength      integer,
  lastno        integer,
  padding       boolean,
  constraint pk_bindextrn primary key (code, branch, fyid)
);

-- Trial series for Material creates that omit code. First number is MAT00001.
insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('MAT', 'Material', 'MAT', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('DIV', 'Division', 'DIV', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('CCT', 'Cost Centre', 'CCT', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('CYL', 'Cylinder', 'CYL', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('FEE', 'Fee', 'FEE', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('HAU', 'Haulier', 'HAU', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('PRC', 'Pricing Procedure', 'PRC', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('PRL', 'Pricing Rule', 'PRL', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('ZON', 'Zone', 'ZON', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('SHP', 'Shipping Point', 'SHP', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('VND', 'Vendor', 'VND', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('UOM', 'UOM', 'UOM', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('TRM', 'Terminal', 'TRM', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('TNK', 'Storage Tank', 'TNK', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('VEH', 'Vehicle', 'VEH', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('CMP', 'Vehicle Compartment', 'CMP', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('PTL', 'PTL Threshold', 'PTL', 5, 0, true)
on conflict (code) do nothing;

insert into public.gindexmst (code, name, noprefix, nolength, lastno, padding)
values ('TLM', 'Telemetry Device', 'TLM', 5, 0, true)
on conflict (code) do nothing;
