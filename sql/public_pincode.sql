-- Shared pincode master — apply against POSTGRES_DB (txpoprdb).
-- Schema public. Apply after public_geo.sql + city seed. Do not Prisma migrate.

CREATE TABLE IF NOT EXISTS public.pincode (
    countryid varchar(5) NOT NULL,
    statecode varchar(5) NOT NULL,
    citycode varchar(15) NOT NULL,
    pincode varchar(20) NOT NULL,
    lastupdateby varchar(700) NULL,
    lastupdatedate timestamp NULL,
    CONSTRAINT pk_pincode PRIMARY KEY (countryid, statecode, citycode, pincode)
);

ALTER TABLE public.pincode DROP CONSTRAINT IF EXISTS pincode_city_fk;
ALTER TABLE public.pincode
    ADD CONSTRAINT pincode_city_fk
    FOREIGN KEY (countryid, statecode, citycode)
    REFERENCES public.city (countryid, statecode, citycode);

CREATE INDEX IF NOT EXISTS pincode_geo_idx
    ON public.pincode (countryid, statecode, citycode);
