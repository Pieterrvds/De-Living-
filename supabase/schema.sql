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

-- Vaste lesgevers: wie zich met dit e-mailadres aanmeldt, wordt meteen herkend
-- (juiste type, goedgekeurd) en krijgt de lessen van dat type zonder lesgever.
create table if not exists public.vaste_lesgevers (
  email text primary key,
  naam  text not null,
  type  text not null
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
  les        text not null,                      -- yoga, kine, groep, … of 'zaal'
  start      timestamptz not null,
  eind       timestamptz not null,
  voor_wie   text not null default '',
  opmerking  text not null default '',
  bedrag     numeric(8,2) not null default 0,
  status     text not null default 'wacht-op-betaling'
             check (status in ('wacht-op-betaling','bevestigd','betaald','intern')),
  aangemaakt timestamptz not null default now()
);
create index if not exists boekingen_start_idx on public.boekingen(start);
create index if not exists boekingen_user_idx  on public.boekingen(user_id);

-- Uitbreiding: door de beheerder ingeplande activiteiten in de zaal (status 'intern').
-- Veilig bij opnieuw uitvoeren op een bestaande database.
alter table public.boekingen add column if not exists activiteit text not null default '';
alter table public.boekingen drop constraint if exists boekingen_status_check;
alter table public.boekingen add constraint boekingen_status_check
  check (status in ('wacht-op-betaling','bevestigd','betaald','intern'));

-- Beurtenkaarten: een lid koopt ter plaatse een kaart (bv. 10 beurten); de lesgever bevestigt de
-- betaling op de website. Een les uit config.beurtenkaart.lessen boeken kost 1 beurt
-- (boekingen.beurt). Saldo = bevestigde beurten − reservaties met een beurt; annuleren geeft de
-- beurt dus vanzelf terug. Correcties (bv. −1 bij te laat annuleren) staan hier ook.
alter table public.boekingen add column if not exists beurt boolean not null default false;
create table if not exists public.beurten (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profielen(id) on delete cascade,
  aantal         int  not null,                                  -- +10 (kaart), +1 / −1 (correctie)
  bedrag         numeric(8,2) not null default 0,                -- ter plaatse betaald
  soort          text not null default 'kaart' check (soort in ('kaart','correctie')),
  status         text not null default 'aangevraagd' check (status in ('aangevraagd','bevestigd')),
  opmerking      text not null default '',
  aangemaakt     timestamptz not null default now(),
  bevestigd_op   timestamptz,
  bevestigd_door uuid references public.profielen(id) on delete set null
);
create index if not exists beurten_user_idx on public.beurten(user_id);

-- Café huren voor een evenement (trouwfeest, babyborrel, vergadering, …). De klant vult een
-- vragenlijst in (huren.html) en stuurt een aanvraag; de beheerder bevestigt of weigert.
-- Café (120 m²) + terras (80 m²) altijd; de grote zaal (112 m²) is optioneel (met_zaal).
-- Een aanvraag mag nooit overlappen met een les, een reservatie of een bevestigd evenement.
create table if not exists public.verhuur (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profielen(id) on delete cascade,
  start      timestamptz not null,
  eind       timestamptz not null,
  met_zaal   boolean not null default false,
  soort      text not null,                         -- Trouwfeest, Babyborrel, …
  gasten     int  not null,
  naam       text not null default '',
  telefoon   text not null default '',
  gegevens   jsonb not null default '{}'::jsonb,     -- de rest van de vragenlijst
  status     text not null default 'aangevraagd'
             check (status in ('aangevraagd','bevestigd','geweigerd','geannuleerd','ingetrokken')),
  prijs      numeric(8,2),                          -- afgesproken prijs (door de beheerder)
  antwoord   text not null default '',              -- bericht van de beheerder aan de klant
  aangemaakt timestamptz not null default now(),
  behandeld  timestamptz
);
create index if not exists verhuur_start_idx on public.verhuur(start);
create index if not exists verhuur_user_idx  on public.verhuur(user_id);

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

-- Beurten van een lid: bevestigde beurten min reservaties die met een beurt geboekt zijn
create or replace function public.beurten_saldo(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select (coalesce((select sum(aantal) from beurten where user_id = uid and status = 'bevestigd'), 0)
        - (select count(*) from boekingen where user_id = uid and beurt))::int
$$;

-- Mag de aangemelde gebruiker beurtenkaarten beheren? (beheerder, of goedgekeurde lesgever
-- van een les die met beurten geboekt wordt, bv. de yoga-instructeur)
create or replace function public.beheert_beurten() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from profielen p
     where p.id = auth.uid() and p.goedgekeurd
       and coalesce((cfg()->'types'->p.type->>'pro')::boolean, false)
       and exists (select 1 from jsonb_array_elements_text(coalesce(cfg()->'types'->p.type->'lessen', '[]'::jsonb)) l
                    where coalesce(cfg()->'beurtenkaart'->'lessen', '[]'::jsonb) ? l))
$$;

-- ── NIEUW ACCOUNT → PROFIEL ────────────────────────────────────────────
-- Lessen van het type van een vaste lesgever die nog geen lesgever hebben, aan die lesgever geven
create or replace function public.wijs_lessen_toe(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p profielen; c jsonb; r jsonb := '{}'::jsonb; d text;
begin
  select * into p from profielen where id = uid;
  select config into c from instellingen where id = 1 for update;
  if p.id is null or c is null or c->'rooster' is null then return; end if;
  for d in select jsonb_object_keys(c->'rooster') loop
    r := r || jsonb_build_object(d, coalesce((
      select jsonb_agg(case when coalesce(x->>2, '') = ''
                              and coalesce(c->'types'->p.type->'lessen', '[]'::jsonb) ? (x->>1)
                         then jsonb_build_array(x->>0, x->>1, p.id::text, p.naam)
                              || case when x->>4 is not null then jsonb_build_array(x->>4) else '[]'::jsonb end
                         else x end order by n)
        from jsonb_array_elements(c->'rooster'->d) with ordinality t(x, n)), '[]'::jsonb));
  end loop;
  update instellingen set config = jsonb_set(config, '{rooster}', r), bijgewerkt = now() where id = 1;
end $$;
revoke all on function public.wijs_lessen_toe(uuid) from public, anon, authenticated;

create or replace function public.nieuw_profiel() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t text := coalesce(new.raw_user_meta_data->>'type', 'lid');
  v vaste_lesgevers;
begin
  select * into v from vaste_lesgevers where email = lower(new.email);
  if v.email is not null then t := v.type; end if;
  if not coalesce(cfg()->'types' ? t, false) then t := 'lid'; end if;
  insert into profielen (id, naam, email, type, goedgekeurd)
  values (new.id,
          left(coalesce(v.naam, nullif(new.raw_user_meta_data->>'naam', ''), ''), 100),   -- vaste lesgever: altijd de gekende naam
          lower(new.email),
          t,
          -- gewone leden hoeven niet goedgekeurd te worden; vaste lesgevers zijn al gekend
          v.email is not null or not coalesce((cfg()->'types'->t->>'pro')::boolean, false))
  on conflict (id) do nothing;
  if v.email is not null then perform wijs_lessen_toe(new.id); end if;
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

  -- ── Door de beheerder ingeplande activiteit (geen betaling, geen weeklimiet,
  --    ook buiten de openingsuren; wel geen overlap met lessen of zaalhuur) ──
  if new.status = 'intern' then
    if not is_admin() then raise exception 'Enkel de beheerder kan activiteiten inplannen.'; end if;
    if new.les <> 'zaal' then raise exception 'Ongeldige activiteit.'; end if;
    new.activiteit := left(btrim(coalesce(new.activiteit, '')), 60);
    if new.activiteit = '' then raise exception 'Kies een activiteit.'; end if;
    duur := round(extract(epoch from (new.eind - new.start)) / 60)::int;
    if duur < 15 or duur > 480 or duur % 15 <> 0 then raise exception 'Kies een duur tussen 15 minuten en 8 uur.'; end if;
    if new.start <= now() then raise exception 'Dit tijdstip is al voorbij.'; end if;
    lokaal := new.start at time zone 'Europe/Brussels';
    dow    := extract(dow from lokaal)::int;
    van    := extract(hour from lokaal)::int * 60 + extract(minute from lokaal)::int;
    tot    := van + duur;
    if tot > 1440 then raise exception 'Een activiteit moet op dezelfde dag eindigen.'; end if;
    for x in select * from jsonb_array_elements(coalesce(c->'rooster'->(dow::text), '[]'::jsonb)) loop
      s := hm(x->>0);
      e := s + (c->'lessen'->(x->>1)->>'duur')::int;
      if s < tot and e > van then raise exception 'De zaal is dan niet vrij: er is een les.'; end if;
    end loop;
    new.eind := new.start + make_interval(mins => duur);
    if exists (select 1 from boekingen b
                where b.les = 'zaal' and b.start < new.eind and b.eind > new.start and telt(b)) then
      raise exception 'De zaal is dan al bezet.';
    end if;
    if exists (select 1 from verhuur v where v.status = 'bevestigd' and v.start < new.eind and v.eind > new.start) then
      raise exception 'Het café is dan verhuurd voor een evenement.';
    end if;
    new.bedrag     := 0;
    new.beurt      := false;
    new.aangemaakt := now();
    new.opmerking  := left(coalesce(new.opmerking, ''), 500);
    new.voor_wie   := left(coalesce(new.voor_wie, ''), 200);
    return new;
  end if;
  new.activiteit := '';
  new.beurt      := false;

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
    if coalesce((c->'zaal'->>'binnenkort')::boolean, false) then
      raise exception 'Zaalhuur kan je binnenkort online boeken.';
    end if;
    duur := round(extract(epoch from (new.eind - new.start)) / 60)::int;
  else
    les := c->'lessen'->new.les;
    if les is null then raise exception 'Onbekende les.'; end if;
    if coalesce((les->>'binnenkort')::boolean, false) then
      raise exception '% kan je binnenkort online boeken.', les->>'naam';
    end if;
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
  -- het café is verhuurd voor een (bevestigd) evenement
  if exists (select 1 from verhuur v where v.status = 'bevestigd' and v.start < new.eind and v.eind > new.start) then
    raise exception 'Op dit moment is het café verhuurd voor een evenement.';
  end if;

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
   where b.user_id = new.user_id and b.start >= wk and b.start < wk + interval '7 days' and telt(b)
     and b.status <> 'intern';   -- ingeplande activiteiten van de beheerder tellen niet mee
  if uren + duur / 60.0 > (r->>'maxUrenPerWeek')::numeric + 0.001 then
    raise exception 'Je weeklimiet van % uur is bereikt.', r->>'maxUrenPerWeek';
  end if;

  -- lessen met een beurtenkaart: kost 1 beurt en is meteen bevestigd (betaald met de kaart)
  if new.les <> 'zaal' and coalesce(c->'beurtenkaart'->'lessen', '[]'::jsonb) ? new.les then
    if beurten_saldo(new.user_id) < 1 then
      raise exception 'Je hebt geen beurten meer. Koop een beurtenkaart bij de lesgever.';
    end if;
    new.beurt  := true;
    new.status := 'betaald';
    new.bedrag := 0;
  end if;
  return new;
end $$;

drop trigger if exists controleer_nieuwe_boeking on public.boekingen;
create trigger controleer_nieuwe_boeking before insert on public.boekingen
  for each row execute function public.controleer_boeking();

-- ── CONTROLE BIJ EEN WIJZIGING ─────────────────────────────────────────
-- Enkel de status kan veranderen:
--  • lid: 'wacht-op-betaling' → 'bevestigd' (betalen aan de bar), zolang niet vervallen
--  • beheerder: elke status, en het tijdstip (een reservatie verplaatsen als een les verschuift)
create or replace function public.controleer_wijziging() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  nieuw text := new.status;
  ns    timestamptz := new.start;
  ne    timestamptz := new.eind;
begin
  new := old;
  new.status := nieuw;
  if is_admin() then
    if ns is distinct from old.start or ne is distinct from old.eind then
      if ns is null or ne is null or ne <= ns then raise exception 'Ongeldig tijdstip.'; end if;
      new.start := ns;
      new.eind  := ne;
    end if;
    return new;
  end if;
  if old.user_id is distinct from auth.uid() then raise exception 'Niet toegestaan.'; end if;
  if not (old.status = 'wacht-op-betaling' and nieuw = 'bevestigd') then raise exception 'Niet toegestaan.'; end if;
  if not telt(old) then raise exception 'Je reservatie is vervallen.'; end if;
  return new;
end $$;

drop trigger if exists controleer_gewijzigde_boeking on public.boekingen;
create trigger controleer_gewijzigde_boeking before update on public.boekingen
  for each row execute function public.controleer_wijziging();

-- Profielen: een lid kan enkel de eigen naam wijzigen; de beheerder ook type en goedkeuring
create or replace function public.controleer_profiel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    if old.id is distinct from auth.uid() then raise exception 'Niet toegestaan.'; end if;
    new.type := old.type; new.goedgekeurd := old.goedgekeurd;
  end if;
  new.naam := left(btrim(coalesce(new.naam, '')), 80);
  if new.naam = '' then raise exception 'Vul je naam in.'; end if;
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
drop policy if exists "eigen naam wijzigen" on public.profielen;
create policy "eigen naam wijzigen" on public.profielen for update
  using (id = auth.uid()) with check (id = auth.uid());

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

alter table public.vaste_lesgevers enable row level security;   -- enkel via de functies hierboven
alter table public.beurten enable row level security;
alter table public.verhuur enable row level security;           -- aanvragen en wijzigen enkel via de functies
drop policy if exists "eigen aanvragen of beheerder" on public.verhuur;
create policy "eigen aanvragen of beheerder" on public.verhuur for select
  using (user_id = auth.uid() or is_admin());
drop policy if exists "eigen beurten of beheer" on public.beurten;
create policy "eigen beurten of beheer" on public.beurten for select
  using (user_id = auth.uid() or beheert_beurten());
-- (beurten toevoegen of wijzigen kan enkel via de functies hieronder)

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

-- Aantal leden (accounts) voor de teller op de hoofdpagina: enkel een getal, geen namen
create or replace function public.aantal_leden() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from profielen
$$;

-- Beheerder: rooster en regels bijwerken vanuit assets/boeken.js
create or replace function public.zet_instellingen(nieuw jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Enkel voor de beheerder.'; end if;
  insert into instellingen (id, config, bijgewerkt) values (1, nieuw, now())
  on conflict (id) do update set config = excluded.config, bijgewerkt = now();
end $$;

-- Goedgekeurde lesgever: eigen uren in het rooster zetten (Mijn account → Mijn uren).
-- uren = [[weekdag 0–6, 'HH:MM', les, (soort, bv. 'Yin yoga')], …]. Enkel de eigen uren worden vervangen; lessen van
-- anderen blijven staan. Openingsuren, gesloten periodes en overlap worden gecontroleerd.
create or replace function public.zet_mijn_uren(uren jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  p    profielen;
  c    jsonb;
  mag  jsonb;
  r    jsonb := '{}'::jsonb;
  x    jsonb;
  y    jsonb;
  d    int;
  s    int;
  e    int;
  dag  text[] := array['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
  st   text;
begin
  select * into p from profielen where id = auth.uid();
  if p.id is null then raise exception 'Meld je eerst aan.'; end if;
  -- één wijziging tegelijk
  select config into c from instellingen where id = 1 for update;
  mag := c->'types'->p.type->'lessen';
  if not coalesce((c->'types'->p.type->>'pro')::boolean, false) or not p.goedgekeurd
     or mag is null or jsonb_typeof(mag) <> 'array' or jsonb_array_length(mag) = 0 then
    raise exception 'Enkel goedgekeurde lesgevers kunnen hun uren aanpassen.';
  end if;
  if jsonb_typeof(uren) is distinct from 'array' or jsonb_array_length(uren) > 40 then
    raise exception 'Ongeldige uren.';
  end if;
  -- rooster zonder de eigen uren
  for d in 0..6 loop
    r := r || jsonb_build_object(d::text, coalesce((
      select jsonb_agg(z order by n) from jsonb_array_elements(coalesce(c->'rooster'->(d::text), '[]'::jsonb)) with ordinality t(z, n)
       where z->>2 is distinct from p.id::text), '[]'::jsonb));
  end loop;
  -- eigen uren controleren en toevoegen
  for x in select * from jsonb_array_elements(uren) loop
    if jsonb_typeof(x) <> 'array' or coalesce(x->>0, '') !~ '^[0-6]$'
       or coalesce(x->>1, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'Ongeldig uur.';
    end if;
    d := (x->>0)::int;
    if not mag ? (x->>2) or c->'lessen'->(x->>2) is null then
      raise exception 'Je kan geen % in het rooster zetten.', coalesce(c->'lessen'->(x->>2)->>'naam', x->>2);
    end if;
    s := hm(x->>1);
    e := s + (c->'lessen'->(x->>2)->>'duur')::int;
    y := c->'openingsuren'->(d::text);
    if y is null or s < hm(y->>0) or e > hm(y->>1) then
      raise exception 'Op % om % zijn we gesloten.', dag[d + 1], x->>1;
    end if;
    for y in select * from jsonb_array_elements(coalesce(c->'gesloten'->(d::text), '[]'::jsonb)) loop
      if hm(y->>0) < e and hm(y->>1) > s then raise exception 'Op % om % zijn we gesloten.', dag[d + 1], x->>1; end if;
    end loop;
    for y in select * from jsonb_array_elements(r->(d::text)) loop
      if hm(y->>0) < e and hm(y->>0) + (c->'lessen'->(y->>1)->>'duur')::int > s then
        raise exception 'Op % om % is er al een les (% om %).', dag[d + 1], x->>1, c->'lessen'->(y->>1)->>'naam', y->>0;
      end if;
    end loop;
    st := nullif(btrim(coalesce(x->>3, '')), '');
    if st is not null and not coalesce(c->'lessen'->(x->>2)->'stijlen', '[]'::jsonb) ? st then
      raise exception 'Onbekende soort: %.', st;
    end if;
    r := jsonb_set(r, array[d::text], (r->(d::text)) || jsonb_build_array(
           case when st is null then jsonb_build_array(x->>1, x->>2, p.id::text, p.naam)
                else jsonb_build_array(x->>1, x->>2, p.id::text, p.naam, st) end));
  end loop;
  -- per dag op uur sorteren
  for d in 0..6 loop
    r := jsonb_set(r, array[d::text], coalesce((select jsonb_agg(z order by z->>0) from jsonb_array_elements(r->(d::text)) z), '[]'::jsonb));
  end loop;
  update instellingen set config = jsonb_set(config, '{rooster}', r), bijgewerkt = now() where id = 1;
end $$;

-- ── CAFÉ HUREN (EVENEMENTEN) ───────────────────────────────────────────
-- Waarom kan het café niet verhuurd worden van s tot e? (null = vrij)
-- Lessen uit het weekrooster (behalve 'binnenkort'), reservaties en bevestigde evenementen.
create or replace function public.verhuur_conflict(s timestamptz, e timestamptz, zonder uuid default null) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  c   jsonb := cfg();
  d   date;
  x   jsonb;
  les jsonb;
  ls  timestamptz;
  le  timestamptz;
  dg  text[] := array['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
begin
  for d in select g::date from generate_series(((s at time zone 'Europe/Brussels')::date - 1)::timestamp,
                                               (e at time zone 'Europe/Brussels')::date::timestamp, interval '1 day') g loop
    for x in select * from jsonb_array_elements(coalesce(c->'rooster'->(extract(dow from d)::int::text), '[]'::jsonb)) loop
      les := c->'lessen'->(x->>1);
      continue when les is null or coalesce((les->>'binnenkort')::boolean, false);
      ls := (d + make_interval(mins => hm(x->>0))) at time zone 'Europe/Brussels';
      le := ls + make_interval(mins => (les->>'duur')::int);
      if ls < e and le > s then
        return format('Dan is er een les %s (%s %s – %s). Kies een ander tijdstip.', lower(les->>'naam'),
          dg[extract(dow from d)::int + 1], to_char(ls at time zone 'Europe/Brussels', 'HH24:MI'), to_char(le at time zone 'Europe/Brussels', 'HH24:MI'));
      end if;
    end loop;
  end loop;
  if exists (select 1 from boekingen b where b.start < e and b.eind > s and telt(b)) then
    return 'Dan is er al een reservatie in onze zaal. Kies een ander tijdstip.';
  end if;
  if exists (select 1 from verhuur v where v.status = 'bevestigd' and v.id is distinct from zonder and v.start < e and v.eind > s) then
    return 'Het café is dan al verhuurd. Kies een andere datum of een ander uur.';
  end if;
  return null;
end $$;
revoke all on function public.verhuur_conflict(timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- Klant: aanvraag versturen (de vragenlijst). Geeft het nummer van de aanvraag terug.
create or replace function public.vraag_verhuur(van timestamptz, tot timestamptz, met_zaal boolean, soort text, gasten int,
                                                naam text, telefoon text, gegevens jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  v    jsonb := coalesce(cfg()->'verhuur', '{}'::jsonb);
  minu numeric := coalesce((v->>'minUren')::numeric, 2);
  mind int := coalesce((v->>'minDagenVooraf')::int, 7);
  m    int;
  fout text;
  id   uuid;
begin
  if auth.uid() is null then raise exception 'Meld je eerst aan.'; end if;
  perform pg_advisory_xact_lock(hashtext('boekingen'));
  if van is null or tot is null or tot <= van then raise exception 'Kies een begin- en einduur.'; end if;
  if extract(epoch from van)::bigint % 1800 <> 0 or extract(epoch from tot)::bigint % 1800 <> 0 then
    raise exception 'Kies een heel of half uur.';
  end if;
  m := round(extract(epoch from (tot - van)) / 60)::int;
  if m < minu * 60 then raise exception 'Je kan het café huren vanaf % uur.', minu; end if;
  if m > 24 * 60 then raise exception 'Een evenement duurt maximaal 24 uur.'; end if;
  if van < now() + make_interval(days => mind) then
    raise exception 'Vraag je evenement minstens % dagen op voorhand aan.', mind;
  end if;
  if van > now() + interval '18 months' then raise exception 'Zo ver vooruit kan je nog niet aanvragen.'; end if;
  soort := left(btrim(coalesce(soort, '')), 40);
  if soort = '' then raise exception 'Kies wat je wil vieren.'; end if;
  if gasten is null or gasten < 1 or gasten > 500 then raise exception 'Vul het aantal gasten in.'; end if;
  naam := left(btrim(coalesce(naam, '')), 100);
  if length(naam) < 2 then raise exception 'Vul je naam in.'; end if;
  telefoon := left(btrim(coalesce(telefoon, '')), 30);
  if length(regexp_replace(telefoon, '\D', '', 'g')) < 8 then raise exception 'Vul een geldig telefoonnummer in.'; end if;
  if gegevens is null or jsonb_typeof(gegevens) <> 'object' then gegevens := '{}'::jsonb; end if;
  if length(gegevens::text) > 4000 then raise exception 'Je antwoorden zijn te lang.'; end if;
  if (select count(*) from verhuur r where r.user_id = auth.uid() and r.status = 'aangevraagd') >= 3 then
    raise exception 'Je hebt al 3 aanvragen die nog wachten op een antwoord.';
  end if;
  fout := verhuur_conflict(van, tot, null);
  if fout is not null then raise exception '%', fout; end if;
  insert into verhuur (user_id, start, eind, met_zaal, soort, gasten, naam, telefoon, gegevens)
  values (auth.uid(), van, tot, coalesce(met_zaal, false), soort, gasten, naam, telefoon, gegevens)
  returning verhuur.id into id;
  return id;
end $$;

-- Klant: eigen aanvraag intrekken (zolang ze nog niet behandeld is)
create or replace function public.trek_verhuur_in(aanvraag uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update verhuur set status = 'ingetrokken', behandeld = now()
   where id = aanvraag and user_id = auth.uid() and status = 'aangevraagd';
  if not found then raise exception 'Deze aanvraag kan je niet meer intrekken. Bel of mail ons even.'; end if;
end $$;

-- Beheerder: aanvraag bevestigen, weigeren of een evenement annuleren (met prijs en bericht)
create or replace function public.zet_verhuur_status(aanvraag uuid, nieuw text, prijs numeric default null, antwoord text default '') returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare r verhuur; fout text;
begin
  if not is_admin() then raise exception 'Enkel voor de beheerder.'; end if;
  perform pg_advisory_xact_lock(hashtext('boekingen'));
  select * into r from verhuur where id = aanvraag for update;
  if r.id is null then raise exception 'Aanvraag niet gevonden.'; end if;
  if nieuw = 'bevestigd' then
    if r.status not in ('aangevraagd', 'bevestigd') then raise exception 'Deze aanvraag kan niet meer bevestigd worden.'; end if;
    if r.start <= now() then raise exception 'Dit evenement is al voorbij.'; end if;
    fout := verhuur_conflict(r.start, r.eind, r.id);
    if fout is not null then raise exception '%', fout; end if;
  elsif nieuw = 'geweigerd' then
    if r.status <> 'aangevraagd' then raise exception 'Enkel een nieuwe aanvraag kan je weigeren.'; end if;
  elsif nieuw = 'geannuleerd' then
    if r.status not in ('aangevraagd', 'bevestigd') then raise exception 'Deze aanvraag is al afgesloten.'; end if;
  else
    raise exception 'Ongeldige status.';
  end if;
  if prijs is not null and (prijs < 0 or prijs > 100000) then raise exception 'Ongeldige prijs.'; end if;
  update verhuur set status = nieuw, prijs = coalesce(prijs, r.prijs),
                     antwoord = left(coalesce(antwoord, ''), 1000), behandeld = now()
   where id = r.id;
end $$;

-- Is het café vrij van van tot tot? null = vrij, anders de reden (voor de live controle op huren.html)
create or replace function public.verhuur_vrij(van timestamptz, tot timestamptz) returns text
language sql stable security definer set search_path = public as $$
  select case when van is null or tot is null or tot <= van or tot - van > interval '24 hours' then 'Kies een begin- en einduur.'
              else verhuur_conflict(van, tot, null) end
$$;

-- Wanneer is het café verhuurd? Enkel begin en einde van bevestigde evenementen (geen namen).
create or replace function public.verhuur_bezet(van timestamptz, tot timestamptz)
returns table (start timestamptz, eind timestamptz)
language sql stable security definer set search_path = public as $$
  select v.start, v.eind from verhuur v where v.status = 'bevestigd' and v.start < tot and v.eind > van order by v.start
$$;

-- ── BEURTENKAARTEN ─────────────────────────────────────────────────────
-- Lid: eigen saldo en openstaande aanvraag
create or replace function public.mijn_beurten() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'saldo', beurten_saldo(auth.uid()),
    'aanvraag', (select jsonb_build_object('id', b.id, 'aantal', b.aantal, 'aangemaakt', b.aangemaakt)
                   from beurten b where b.user_id = auth.uid() and b.status = 'aangevraagd'
                  order by b.aangemaakt desc limit 1))
$$;

-- Lid: een beurtenkaart aanvragen (betalen gebeurt ter plaatse; de lesgever bevestigt)
create or replace function public.vraag_beurtenkaart(kaart int) returns void
language plpgsql security definer set search_path = public as $$
declare k jsonb;
begin
  if auth.uid() is null or not exists (select 1 from profielen where id = auth.uid()) then
    raise exception 'Meld je eerst aan.';
  end if;
  select x into k from jsonb_array_elements(coalesce(cfg()->'beurtenkaart'->'kaarten', '[]'::jsonb)) x
   where (x->>'beurten')::int = kaart limit 1;
  if k is null then raise exception 'Deze beurtenkaart bestaat niet.'; end if;
  if exists (select 1 from beurten where user_id = auth.uid() and status = 'aangevraagd') then
    raise exception 'Je hebt al een beurtenkaart aangevraagd. Betaal ze bij de lesgever.';
  end if;
  insert into beurten (user_id, aantal, bedrag, soort, status)
  values (auth.uid(), kaart, coalesce((k->>'prijs')::numeric, 0), 'kaart', 'aangevraagd');
end $$;

-- Lid: eigen aanvraag intrekken (zolang ze niet bevestigd is)
create or replace function public.trek_aanvraag_in() returns void
language sql security definer set search_path = public as $$
  delete from beurten where user_id = auth.uid() and status = 'aangevraagd'
$$;

-- Lesgever/beheerder: betaling ontvangen → beurten bevestigen
create or replace function public.bevestig_beurtenkaart(aanvraag uuid, betaald numeric default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not beheert_beurten() then raise exception 'Enkel de lesgever of de beheerder kan beurten bevestigen.'; end if;
  update beurten set status = 'bevestigd', bevestigd_op = now(), bevestigd_door = auth.uid(),
                     bedrag = greatest(coalesce(betaald, bedrag), 0)
   where id = aanvraag and status = 'aangevraagd' and (user_id <> auth.uid() or is_admin());
  if not found then raise exception 'Deze aanvraag bestaat niet (meer).'; end if;
end $$;

-- Lesgever/beheerder: een aanvraag weigeren (bv. dubbel aangevraagd)
create or replace function public.weiger_aanvraag(aanvraag uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not beheert_beurten() then raise exception 'Enkel de lesgever of de beheerder kan dit.'; end if;
  delete from beurten where id = aanvraag and status = 'aangevraagd';
  if not found then raise exception 'Deze aanvraag bestaat niet (meer).'; end if;
end $$;

-- Lesgever/beheerder: rechtstreeks beurten geven (kaart ter plaatse betaald) of corrigeren
create or replace function public.geef_beurten(klant uuid, aantal_beurten int, betaald numeric default 0,
                                               notitie text default '', correctie boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not beheert_beurten() then raise exception 'Enkel de lesgever of de beheerder kan beurten geven.'; end if;
  if not exists (select 1 from profielen where id = klant) then raise exception 'Klant niet gevonden.'; end if;
  if klant = auth.uid() and not is_admin() then raise exception 'Je kan jezelf geen beurten geven.'; end if;
  if aantal_beurten is null or aantal_beurten = 0 or abs(aantal_beurten) > 50 then
    raise exception 'Kies tussen 1 en 50 beurten.';
  end if;
  if aantal_beurten < 0 and beurten_saldo(klant) + aantal_beurten < 0 then
    raise exception 'Zoveel beurten heeft deze klant niet.';
  end if;
  insert into beurten (user_id, aantal, bedrag, soort, status, opmerking, bevestigd_op, bevestigd_door)
  values (klant, aantal_beurten,
          case when aantal_beurten > 0 and not correctie then greatest(coalesce(betaald, 0), 0) else 0 end,
          case when aantal_beurten > 0 and not correctie then 'kaart' else 'correctie' end,
          'bevestigd', left(coalesce(notitie, ''), 200), now(), auth.uid());
end $$;

-- Lesgever/beheerder: leden zoeken op naam of e-mail (met saldo en openstaande aanvraag)
create or replace function public.zoek_klanten(term text)
returns table (id uuid, naam text, email text, saldo int, aanvraag int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare t text := btrim(coalesce(term, ''));
begin
  if not beheert_beurten() then raise exception 'Enkel de lesgever of de beheerder kan leden zoeken.'; end if;
  if length(t) < 2 then return; end if;
  t := '%' || replace(replace(t, '%', ''), '_', '') || '%';
  return query
    select p.id, p.naam, p.email, beurten_saldo(p.id),
           (select b.aantal from beurten b where b.user_id = p.id and b.status = 'aangevraagd' limit 1)
      from profielen p
     where p.naam ilike t or p.email ilike t
     order by p.naam
     limit 25;
end $$;

-- Lesgever/beheerder: openstaande aanvragen en kaarten/correcties van de laatste 90 dagen
create or replace function public.beurten_overzicht()
returns table (id uuid, user_id uuid, naam text, email text, aantal int, bedrag numeric, soort text, status text,
               opmerking text, aangemaakt timestamptz, bevestigd_op timestamptz, door text, saldo int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not beheert_beurten() then raise exception 'Enkel de lesgever of de beheerder kan dit zien.'; end if;
  return query
    select b.id, b.user_id, p.naam, p.email, b.aantal, b.bedrag, b.soort, b.status, b.opmerking,
           b.aangemaakt, b.bevestigd_op, d.naam, beurten_saldo(b.user_id)
      from beurten b
      join profielen p on p.id = b.user_id
      left join profielen d on d.id = b.bevestigd_door
     where b.status = 'aangevraagd' or b.bevestigd_op > now() - interval '90 days'
     order by (b.status = 'aangevraagd') desc, coalesce(b.bevestigd_op, b.aangemaakt) desc
     limit 200;
end $$;

-- Lesgever/beheerder: wie komt er naar de lessen met beurten (in een periode)?
create or replace function public.deelnemers(van timestamptz, tot timestamptz)
returns table (id uuid, les text, start timestamptz, naam text, beurt boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not beheert_beurten() then raise exception 'Enkel de lesgever of de beheerder kan dit zien.'; end if;
  return query
    select b.id, b.les, b.start, p.naam, b.beurt
      from boekingen b join profielen p on p.id = b.user_id
     where b.start >= van and b.start < tot and telt(b) and b.status <> 'intern'
       and coalesce(cfg()->'beurtenkaart'->'lessen', '[]'::jsonb) ? b.les
     order by b.start, p.naam;
end $$;

-- Lesgever/beheerder: een deelnemer uitschrijven, met of zonder beurt terug
-- (zonder = te laat geannuleerd: de beurt blijft gebruikt)
create or replace function public.schrijf_uit(boeking uuid, beurt_terug boolean) returns void
language plpgsql security definer set search_path = public as $$
declare b boekingen;
begin
  if not beheert_beurten() then raise exception 'Enkel de lesgever of de beheerder kan dit.'; end if;
  select * into b from boekingen where id = boeking;
  if b.id is null or not (coalesce(cfg()->'beurtenkaart'->'lessen', '[]'::jsonb) ? b.les) then
    raise exception 'Deze reservatie bestaat niet (meer).';
  end if;
  delete from boekingen where id = boeking;
  if b.beurt and not beurt_terug then
    insert into beurten (user_id, aantal, soort, status, opmerking, bevestigd_op, bevestigd_door)
    values (b.user_id, -1, 'correctie', 'bevestigd',
            'Te laat geannuleerd: ' || to_char(b.start at time zone 'Europe/Brussels', 'DD/MM/YYYY HH24:MI'), now(), auth.uid());
  end if;
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
revoke all on function public.zet_mijn_uren(jsonb)      from anon;
revoke all on function public.beurten_saldo(uuid)       from public, anon, authenticated;
revoke all on function public.mijn_beurten()            from anon;
revoke all on function public.vraag_beurtenkaart(int)   from anon;
revoke all on function public.trek_aanvraag_in()        from anon;
revoke all on function public.bevestig_beurtenkaart(uuid, numeric) from anon;
revoke all on function public.weiger_aanvraag(uuid)     from anon;
revoke all on function public.geef_beurten(uuid, int, numeric, text, boolean) from anon;
revoke all on function public.zoek_klanten(text)        from anon;
revoke all on function public.beurten_overzicht()       from anon;
revoke all on function public.deelnemers(timestamptz, timestamptz) from anon;
revoke all on function public.schrijf_uit(uuid, boolean) from anon;
grant execute on function public.bezetting(timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.aantal_leden() to anon, authenticated;
grant execute on function public.verhuur_bezet(timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.verhuur_vrij(timestamptz, timestamptz) to anon, authenticated;
revoke all on function public.vraag_verhuur(timestamptz, timestamptz, boolean, text, int, text, text, jsonb) from anon;
revoke all on function public.trek_verhuur_in(uuid) from anon;
revoke all on function public.zet_verhuur_status(uuid, text, numeric, text) from anon;

-- ── STARTWAARDEN ───────────────────────────────────────────────────────
insert into public.beheerders (email) values ('pieterv-d-s@hotmail.com') on conflict do nothing;
insert into public.vaste_lesgevers (email, naam, type) values ('gwen.deryck@telenet.be', 'Gwen Deryck', 'yoga-instructeur')
  on conflict (email) do update set naam = excluded.naam, type = excluded.type;

insert into public.instellingen (id, config) values (1, '{"lessen":{"yoga":{"naam":"Yoga","duur":60,"max":25,"prijs":15,"stijlen":["Hatha yoga","Vinyasa flow","Yin yoga","Yoga Nidra"]},"kine":{"naam":"Kinesitherapie","duur":45,"max":1,"prijs":40,"binnenkort":true},"groep":{"naam":"Groepsles","duur":60,"max":12,"prijs":15,"binnenkort":true}},"rooster":{"0":[["10:00","yoga"],["11:30","kine"]],"1":[["09:00","yoga"],["18:00","groep"]],"2":[["09:00","kine"]],"3":[["12:00","yoga"],["17:00","kine"],["18:00","groep"],["19:30","yoga"]],"4":[["16:00","kine"]],"5":[["07:00","yoga"]],"6":[["10:00","yoga"],["16:00","groep"]]},"openingsuren":{"0":["07:00","22:00"],"1":["07:00","22:00"],"2":["07:00","22:00"],"3":["07:00","22:00"],"4":["07:00","22:00"],"5":["07:00","22:00"],"6":["07:00","22:00"]},"gesloten":{},"regels":{"betaaltermijnMin":5,"boekenTotMinVooraf":60,"annulerenTotUurVooraf":24,"maxUrenPerWeek":10,"zaalDuren":[60,90,120]},"zaal":{"prijs":20,"binnenkort":true},"beurtenkaart":{"lessen":["yoga"],"kaarten":[{"beurten":10,"prijs":null}]},"types":{"lid":{"pro":false,"zaal":false,"lessen":[]},"kinesist":{"pro":true,"zaal":true,"lessen":["kine"]},"yoga-instructeur":{"pro":true,"zaal":true,"lessen":["yoga"]},"groepslesgever":{"pro":true,"zaal":true,"lessen":["groep"]}},"verhuur":{"prijzen":{"cafeUur":null,"zaalUur":null},"minUren":2,"minDagenVooraf":7},"migratie":4}'::jsonb)
on conflict (id) do nothing;

-- ── OMSCHAKELING oktober 2026 ──────────────────────────────────────────
-- Personal training wordt groepsles; types zijn nu kinesist, yoga-instructeur en groepslesgever.
-- Veilig bij opnieuw uitvoeren: verandert enkel iets aan een database met de oude indeling.
update public.instellingen set
  config = jsonb_set(jsonb_set(jsonb_set(config,
    '{lessen}', ((config->'lessen') - 'pt') || jsonb_build_object('groep', coalesce(config->'lessen'->'groep', '{"naam":"Groepsles","duur":60,"max":12,"prijs":15}'::jsonb))),
    '{rooster}', coalesce((select jsonb_object_agg(d.key, coalesce((
        select jsonb_agg(case when z->>1 = 'pt' then jsonb_set(z, '{1}', '"groep"') else z end order by n)
          from jsonb_array_elements(d.value) with ordinality t(z, n)), '[]'::jsonb))
      from jsonb_each(config->'rooster') d), '{}'::jsonb)),
    '{types}', '{"lid":{"pro":false,"zaal":false,"lessen":[]},"kinesist":{"pro":true,"zaal":true,"lessen":["kine"]},"yoga-instructeur":{"pro":true,"zaal":true,"lessen":["yoga"]},"groepslesgever":{"pro":true,"zaal":true,"lessen":["groep"]}}'::jsonb),
  bijgewerkt = now()
where id = 1 and (config->'lessen' ? 'pt' or not (config->'types' ? 'groepslesgever'));

alter table public.profielen disable trigger controleer_gewijzigd_profiel;
update public.profielen set type = 'groepslesgever' where type in ('personal-trainer', 'lesgever');
update public.profielen set type = 'lid', goedgekeurd = true where type = 'dietist';
alter table public.profielen enable trigger controleer_gewijzigd_profiel;

-- ── OMSCHAKELING oktober 2026 (2) ──────────────────────────────────────
-- Voorlopig enkel yoga online (max. 25 personen, met beurtenkaart); kinesitherapie,
-- groepslessen en zaalhuur staan op de website als "binnenkort".
-- Gebeurt één keer: daarna past de beheerder dit aan via assets/boeken.js → Regels naar database sturen.
update public.instellingen set
  config = config
    || jsonb_build_object('lessen', (select jsonb_object_agg(e.key,
           case when e.key = 'yoga' then e.value || '{"max":25}'::jsonb
                else e.value || '{"binnenkort":true}'::jsonb end)
         from jsonb_each(config->'lessen') e))
    || jsonb_build_object('zaal', coalesce(config->'zaal', '{}'::jsonb) || '{"binnenkort":true}'::jsonb)
    || jsonb_build_object('beurtenkaart', '{"lessen":["yoga"],"kaarten":[{"beurten":10,"prijs":null}]}'::jsonb),
  bijgewerkt = now()
where id = 1 and not (config ? 'beurtenkaart');

-- ── OMSCHAKELING oktober 2026 (3): soorten yoga ───────────────────────
-- De lesgever kiest per wekelijkse les de soort yoga. Gebeurt één keer.
update public.instellingen
   set config = jsonb_set(config, '{lessen,yoga,stijlen}', '["Hatha yoga", "Vinyasa flow", "Yin yoga", "Yoga Nidra"]'::jsonb), bijgewerkt = now()
 where id = 1 and config->'lessen' ? 'yoga' and not (config->'lessen'->'yoga' ? 'stijlen');

-- ── OMSCHAKELING oktober 2026 (4) ──────────────────────────────────────
-- Alles weer open: elke dag 07:00 – 22:00 en geen gesloten periodes meer. Gesloten periodes
-- zet de beheerder voortaan zelf in Beheer → Rooster (🔒 Gesloten). Gebeurt één keer.
update public.instellingen
   set config = config || '{"openingsuren":{"0":["07:00","22:00"],"1":["07:00","22:00"],"2":["07:00","22:00"],"3":["07:00","22:00"],"4":["07:00","22:00"],"5":["07:00","22:00"],"6":["07:00","22:00"]},"gesloten":{},"migratie":4}'::jsonb,
       bijgewerkt = now()
 where id = 1 and coalesce((config->>'migratie')::int, 0) < 4;

-- Heeft een vaste lesgever (Gwen) al een account? Dan nu herkennen en haar lessen toewijzen.
alter table public.profielen disable trigger controleer_gewijzigd_profiel;
update public.profielen p set type = v.type, goedgekeurd = true, naam = coalesce(nullif(p.naam, ''), v.naam)
  from public.vaste_lesgevers v where p.email = v.email and (p.type <> v.type or not p.goedgekeurd);
alter table public.profielen enable trigger controleer_gewijzigd_profiel;
select public.wijs_lessen_toe(p.id) from public.profielen p join public.vaste_lesgevers v on v.email = p.email;

-- ── OMSCHAKELING oktober 2026 (5): café huren voor evenementen ─────────
-- Prijzen per uur (null = prijs op aanvraag) en regels; de beheerder past ze aan in Beheer → Evenementen.
update public.instellingen
   set config = config || '{"verhuur":{"prijzen":{"cafeUur":null,"zaalUur":null},"minUren":2,"minDagenVooraf":7}}'::jsonb, bijgewerkt = now()
 where id = 1 and not (config ? 'verhuur');
