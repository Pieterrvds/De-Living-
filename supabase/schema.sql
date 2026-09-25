-- ═══════════════════════════════════════════════════════════════════════
--  La Vie en Rose – database voor accounts en reservaties (Supabase)
--
--  Uitvoeren: Supabase → SQL Editor → New query → plak dit hele bestand → Run.
--  Je mag het opnieuw uitvoeren: bestaande gegevens blijven behouden.
--
--  Alle boekingsregels worden hier op de server gecontroleerd, zodat niemand
--  ze via de browser kan omzeilen. Het rooster en de regels staan in de tabel
--  'instellingen'; die wordt bijgewerkt vanuit assets/boeken.js via de
--  beheerpagina (knop 'Rooster naar database sturen').
-- ═══════════════════════════════════════════════════════════════════════

-- ── TABELLEN ────────────────────────────────────────────────────────────
create table if not exists public.instellingen (
  id         int primary key default 1 check (id = 1),
  config     jsonb not null,
  bijgewerkt timestamptz not null default now()
);

create table if not exists public.beheerders (
  email text primary key
);

create table if not exists public.profielen (
  id          uuid primary key references auth.users(id) on delete cascade,
  naam        text not null default '',
  email       text not null default '',
  type        text not null default 'lid',
  goedgekeurd boolean not null default false,   -- professionals: door de beheerder goedgekeurd?
  aangemaakt  timestamptz not null default now()
);

create table if not exists public.boekingen (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profielen(id) on delete cascade,
  les        text not null,                      -- yoga, kine, pt, … of 'zaal'
  start      timestamptz not null,
  eind       timestamptz not null,
  voor_wie   text not null default '',
  opmerking  text not null default '',
  bedrag     numeric(8,2) not null default 0,
  status     text not null default 'wacht-op-betaling'
             check (status in ('wacht-op-betaling','bevestigd','betaald')),
  aangemaakt timestamptz not null default now()
);
create index if not exists boekingen_start_idx on public.boekingen(start);
create index if not exists boekingen_user_idx  on public.boekingen(user_id);

-- ── HULPFUNCTIES ───────────────────────────────────────────────────────
-- 'HH:MM' → minuten
create or replace function public.hm(t text) returns int
language sql immutable as $$
  select split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int
$$;

create or replace function public.cfg() returns jsonb
language sql stable security definer set search_path = public as $$
  select config from instellingen where id = 1
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from beheerders where email = lower(coalesce(auth.jwt()->>'email', '')))
$$;

-- Telt een reservatie nog mee? (onbetaalde reservaties vervallen na de betaaltermijn)
create or replace function public.telt(b public.boekingen) returns boolean
language sql stable security definer set search_path = public as $$
  select b.status <> 'wacht-op-betaling'
      or b.aangemaakt > now() - make_interval(mins => coalesce((cfg()->'regels'->>'betaaltermijnMin')::int, 5))
$$;

-- ── NIEUW ACCOUNT → PROFIEL ────────────────────────────────────────────
create or replace function public.nieuw_profiel() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t text := coalesce(new.raw_user_meta_data->>'type', 'lid');
begin
  if not coalesce(cfg()->'types' ? t, false) then t := 'lid'; end if;
  insert into profielen (id, naam, email, type, goedgekeurd)
  values (new.id,
          left(coalesce(new.raw_user_meta_data->>'naam', ''), 100),
          lower(new.email),
          t,
          -- gewone leden hoeven niet goedgekeurd te worden
          not coalesce((cfg()->'types'->t->>'pro')::boolean, false))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists bij_nieuw_account on auth.users;
create trigger bij_nieuw_account after insert on auth.users
  for each row execute function public.nieuw_profiel();

-- ── CONTROLE BIJ EEN NIEUWE RESERVATIE ─────────────────────────────────
create or replace function public.controleer_boeking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c      jsonb := cfg();
  r      jsonb := c->'regels';
  p      profielen;
  les    jsonb;
  x      jsonb;
  lokaal timestamp;
  dow    int;
  van    int;
  duur   int;
  tot    int;
  s      int;
  e      int;
  aantal int;
  uren   numeric;
  wk     timestamptz;
begin
  if c is null then raise exception 'De instellingen ontbreken in de database.'; end if;
  -- één reservatie tegelijk verwerken, zodat er nooit dubbel geboekt wordt
  perform pg_advisory_xact_lock(hashtext('boekingen'));

  select * into p from profielen where id = new.user_id;
  if p.id is null then raise exception 'Profiel niet gevonden.'; end if;
  if new.user_id is distinct from auth.uid() then raise exception 'Je kan enkel voor jezelf reserveren.'; end if;

  -- vervallen onbetaalde reservaties opruimen
  delete from boekingen
   where status = 'wacht-op-betaling'
     and aangemaakt <= now() - make_interval(mins => (r->>'betaaltermijnMin')::int);

  new.status     := 'wacht-op-betaling';
  new.aangemaakt := now();
  new.opmerking  := left(coalesce(new.opmerking, ''), 500);
  new.voor_wie   := left(coalesce(new.voor_wie, ''), 100);

  lokaal := new.start at time zone 'Europe/Brussels';
  dow    := extract(dow from lokaal)::int;
  van    := extract(hour from lokaal)::int * 60 + extract(minute from lokaal)::int;

  if new.les = 'zaal' then
    duur := round(extract(epoch from (new.eind - new.start)) / 60)::int;
  else
    les := c->'lessen'->new.les;
    if les is null then raise exception 'Onbekende les.'; end if;
    duur := (les->>'duur')::int;
  end if;
  tot      := van + duur;
  new.eind := new.start + make_interval(mins => duur);

  -- boeken kan tot X minuten voor de start
  if new.start < now() + make_interval(mins => (r->>'boekenTotMinVooraf')::int) then
    raise exception 'Boeken kan tot % minuten voor de start.', r->>'boekenTotMinVooraf';
  end if;

  -- openingsuren en gesloten periodes
  x := c->'openingsuren'->(dow::text);
  if x is null or van < hm(x->>0) or tot > hm(x->>1) then raise exception 'Op dit uur zijn we gesloten.'; end if;
  for x in select * from jsonb_array_elements(coalesce(c->'gesloten'->(dow::text), '[]'::jsonb)) loop
    if hm(x->>0) < tot and hm(x->>1) > van then raise exception 'Op dit uur zijn we gesloten.'; end if;
  end loop;

  if new.les = 'zaal' then
    -- zaalhuur: enkel goedgekeurde professionals met zaalrecht
    if not coalesce((c->'types'->p.type->>'zaal')::boolean, false) or not p.goedgekeurd then
      raise exception 'Zaalhuur kan enkel door goedgekeurde professionals.';
    end if;
    if not (r->'zaalDuren') @> to_jsonb(duur) then raise exception 'Deze duur kan niet.'; end if;
    if extract(minute from lokaal) <> 0 or extract(second from lokaal) <> 0 then
      raise exception 'Zaalhuur start op een heel uur.';
    end if;
    for x in select * from jsonb_array_elements(coalesce(c->'rooster'->(dow::text), '[]'::jsonb)) loop
      s := hm(x->>0);
      e := s + (c->'lessen'->(x->>1)->>'duur')::int;
      if s < tot and e > van then raise exception 'De zaal is dan niet vrij: er is een les.'; end if;
    end loop;
    if exists (select 1 from boekingen b
                where b.les = 'zaal' and b.start < new.eind and b.eind > new.start and telt(b)) then
      raise exception 'De zaal is dan al gehuurd.';
    end if;
    new.bedrag := round((c->'zaal'->>'prijs')::numeric * duur / 60, 2);
  else
    -- les: moet in het rooster staan en mag niet volzet zijn
    if not exists (select 1 from jsonb_array_elements(coalesce(c->'rooster'->(dow::text), '[]'::jsonb)) y
                    where y->>0 = to_char(lokaal, 'HH24:MI') and y->>1 = new.les) then
      raise exception 'Deze les staat niet in het rooster.';
    end if;
    if exists (select 1 from boekingen b
                where b.les = new.les and b.start = new.start and b.user_id = new.user_id and telt(b)) then
      raise exception 'Je hebt dit uur al gereserveerd.';
    end if;
    select count(*) into aantal from boekingen b where b.les = new.les and b.start = new.start and telt(b);
    if aantal >= (les->>'max')::int then raise exception 'Deze les is volzet.'; end if;
    new.bedrag := (les->>'prijs')::numeric;
  end if;

  -- 'voor een klant' enkel voor goedgekeurde professionals, bij 1-op-1 en zaalhuur
  if new.voor_wie <> '' and (
       not coalesce((c->'types'->p.type->>'pro')::boolean, false) or not p.goedgekeurd
       or (new.les <> 'zaal' and (les->>'max')::int > 1)) then
    new.voor_wie := '';
  end if;

  -- maximaal X uur per persoon per week (maandag–zondag)
  wk := date_trunc('week', lokaal) at time zone 'Europe/Brussels';
  select coalesce(sum(extract(epoch from (b.eind - b.start)) / 3600), 0) into uren
    from boekingen b
   where b.user_id = new.user_id and b.start >= wk and b.start < wk + interval '7 days' and telt(b);
  if uren + duur / 60.0 > (r->>'maxUrenPerWeek')::numeric + 0.001 then
    raise exception 'Je weeklimiet van % uur is bereikt.', r->>'maxUrenPerWeek';
  end if;
  return new;
end $$;

drop trigger if exists controleer_nieuwe_boeking on public.boekingen;
create trigger controleer_nieuwe_boeking before insert on public.boekingen
  for each row execute function public.controleer_boeking();

-- ── CONTROLE BIJ EEN WIJZIGING ─────────────────────────────────────────
-- Enkel de status kan veranderen:
--  • lid: 'wacht-op-betaling' → 'bevestigd' (betalen aan de bar), zolang niet vervallen
--  • beheerder: elke status
create or replace function public.controleer_wijziging() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  nieuw text := new.status;
begin
  new := old;
  new.status := nieuw;
  if is_admin() then return new; end if;
  if old.user_id is distinct from auth.uid() then raise exception 'Niet toegestaan.'; end if;
  if not (old.status = 'wacht-op-betaling' and nieuw = 'bevestigd') then raise exception 'Niet toegestaan.'; end if;
  if not telt(old) then raise exception 'Je reservatie is vervallen.'; end if;
  return new;
end $$;

drop trigger if exists controleer_gewijzigde_boeking on public.boekingen;
create trigger controleer_gewijzigde_boeking before update on public.boekingen
  for each row execute function public.controleer_wijziging();

-- Profielen: de beheerder kan enkel type en goedkeuring wijzigen
create or replace function public.controleer_profiel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Niet toegestaan.'; end if;
  if not coalesce(cfg()->'types' ? new.type, false) then raise exception 'Onbekend type.'; end if;
  new.id := old.id; new.email := old.email; new.aangemaakt := old.aangemaakt;
  return new;
end $$;

drop trigger if exists controleer_gewijzigd_profiel on public.profielen;
create trigger controleer_gewijzigd_profiel before update on public.profielen
  for each row execute function public.controleer_profiel();

-- ── BEVEILIGING (Row Level Security) ───────────────────────────────────
alter table public.instellingen enable row level security;
alter table public.beheerders   enable row level security;
alter table public.profielen    enable row level security;
alter table public.boekingen    enable row level security;

drop policy if exists "instellingen lezen" on public.instellingen;
create policy "instellingen lezen" on public.instellingen for select using (true);

drop policy if exists "beheerders lezen" on public.beheerders;
create policy "beheerders lezen" on public.beheerders for select using (is_admin());

drop policy if exists "eigen profiel of beheerder" on public.profielen;
create policy "eigen profiel of beheerder" on public.profielen for select
  using (id = auth.uid() or is_admin());
drop policy if exists "beheerder wijzigt profielen" on public.profielen;
create policy "beheerder wijzigt profielen" on public.profielen for update
  using (is_admin()) with check (is_admin());

drop policy if exists "eigen reservaties of beheerder" on public.boekingen;
create policy "eigen reservaties of beheerder" on public.boekingen for select
  using (user_id = auth.uid() or is_admin());
drop policy if exists "zelf reserveren" on public.boekingen;
create policy "zelf reserveren" on public.boekingen for insert
  with check (user_id = auth.uid());
drop policy if exists "status wijzigen" on public.boekingen;
create policy "status wijzigen" on public.boekingen for update
  using (user_id = auth.uid() or is_admin());
drop policy if exists "annuleren" on public.boekingen;
create policy "annuleren" on public.boekingen for delete
  using (is_admin() or (user_id = auth.uid() and (
           status = 'wacht-op-betaling'
           or start >= now() + make_interval(hours => (cfg()->'regels'->>'annulerenTotUurVooraf')::int))));

-- ── FUNCTIES VOOR DE WEBSITE ───────────────────────────────────────────
-- Bezetting van een periode: enkel aantallen, geen namen (+ of het van jou is)
create or replace function public.bezetting(van timestamptz, tot timestamptz)
returns table (les text, start timestamptz, eind timestamptz, aantal int, mijn boolean)
language sql stable security definer set search_path = public as $$
  select b.les, b.start, b.eind, count(*)::int, bool_or(b.user_id = auth.uid())
    from boekingen b
   where b.start < tot and b.eind > van and telt(b)
   group by b.les, b.start, b.eind
$$;

-- Beheerder: rooster en regels bijwerken vanuit assets/boeken.js
create or replace function public.zet_instellingen(nieuw jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Enkel voor de beheerder.'; end if;
  insert into instellingen (id, config, bijgewerkt) values (1, nieuw, now())
  on conflict (id) do update set config = excluded.config, bijgewerkt = now();
end $$;

-- Beheerder: een account volledig verwijderen (met profiel en reservaties)
create or replace function public.verwijder_gebruiker(uid uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare m text;
begin
  if not is_admin() then raise exception 'Enkel voor de beheerder.'; end if;
  select email into m from profielen where id = uid;
  delete from auth.users where id = uid;
  delete from beheerders where email = m and email <> 'pieterv-d-s@hotmail.com';
end $$;

revoke all on function public.zet_instellingen(jsonb)   from anon;
revoke all on function public.verwijder_gebruiker(uuid) from anon;
grant execute on function public.bezetting(timestamptz, timestamptz) to anon, authenticated;

-- ── STARTWAARDEN ───────────────────────────────────────────────────────
insert into public.beheerders (email) values ('pieterv-d-s@hotmail.com') on conflict do nothing;

insert into public.instellingen (id, config) values (1, '{"lessen":{"yoga":{"naam":"Yoga","duur":60,"max":16,"prijs":15},"kine":{"naam":"Kinesitherapie","duur":45,"max":1,"prijs":40},"pt":{"naam":"Personal Training","duur":60,"max":1,"prijs":50}},"rooster":{"0":[["10:00","yoga"],["11:30","kine"]],"1":[["09:00","yoga"],["18:00","pt"]],"2":[["09:00","kine"],["19:00","pt"]],"3":[["12:00","yoga"],["17:00","kine"],["19:30","yoga"]],"4":[["07:30","pt"],["16:00","kine"]],"5":[["07:00","yoga"],["12:00","pt"]],"6":[["10:00","yoga"],["11:30","pt"]]},"openingsuren":{"0":["09:00","18:00"],"1":["07:00","22:00"],"2":["07:00","22:00"],"3":["07:00","22:00"],"4":["07:00","22:00"],"5":["07:00","22:00"],"6":["09:00","18:00"]},"gesloten":{"0":[["13:00","24:00"]],"1":[["19:00","24:00"]],"4":[["19:00","24:00"]]},"regels":{"betaaltermijnMin":5,"boekenTotMinVooraf":60,"annulerenTotUurVooraf":24,"maxUrenPerWeek":10,"zaalDuren":[60,90,120]},"zaal":{"prijs":20},"types":{"lid":{"pro":false,"zaal":false},"personal-trainer":{"pro":true,"zaal":true},"kinesist":{"pro":true,"zaal":true},"dietist":{"pro":true,"zaal":false},"lesgever":{"pro":true,"zaal":true}}}'::jsonb)
on conflict (id) do nothing;
