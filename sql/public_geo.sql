-- Shared geography master — apply against POSTGRES_DB (txpoprdb).
-- Schema public (not branch). Do not Prisma migrate / db push.

CREATE TABLE IF NOT EXISTS public.country (
    id varchar(5) NOT NULL,
    name varchar(100) NULL,
    shortname varchar(100) NULL,
    telephonecode varchar(200) NULL,
    seqno integer NULL,
    lastupdateby varchar(700) NULL,
    lastupdatedate timestamp NULL,
    CONSTRAINT pk_country PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.state (
    countryid varchar(5) NOT NULL,
    statecode varchar(5) NOT NULL,
    statename varchar(150) NOT NULL,
    stateshortname varchar(10) NULL,
    lastupdateby varchar(700) NULL,
    lastupdatedate timestamp NULL,
    CONSTRAINT pk_state PRIMARY KEY (countryid, statecode)
);

CREATE TABLE IF NOT EXISTS public.city (
    countryid varchar(5) NOT NULL,
    statecode varchar(5) NOT NULL,
    citycode varchar(15) NOT NULL,
    cityname varchar(150) NOT NULL,
    cityshortname varchar(150) NULL,
    lastupdateby varchar(700) NULL,
    lastupdatedate timestamp NULL,
    CONSTRAINT pk_city PRIMARY KEY (countryid, statecode, citycode)
);
