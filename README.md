# La Vie en Rose – Sports Café · Aalst

Website van La Vie en Rose: yoga, kinesitherapie, personal training en een bar,
met online lessen boeken en zaalhuur voor professionals.

## Pagina's

| Bestand | Wat |
|---|---|
| `index.html` | Hoofdpagina (over ons, rooster, lessen, evenementen, contact) |
| `boeken.html` | Weekrooster om een les te boeken of de zaal te huren |
| `login.html` | Aanmelden en account maken (met type persoon) |
| `reserveren.html` | Reservatie bevestigen (enkel na aanmelden) |
| `betalen.html` | Betaalpagina (online betalen nog niet actief; betalen aan de bar bevestigt) |
| `beheer.html` | Beheerpagina: reservaties, leden goedkeuren, rooster naar database sturen |
| `fotos.html` | Fotogalerij (`Gallery.html` stuurt door naar deze pagina) |

## Waar pas je wat aan?

Bijna alles staat bovenaan in **`assets/boeken.js`**:

- `LESSEN`: lessoorten, begeleiding, duur, max. aantal personen en prijs
- `ROOSTER`: welke les wanneer (per weekdag)
- `OPENINGSUREN` en `GESLOTEN`: wanneer niemand kan boeken of huren
- `REGELS`: betaaltermijn, hoe lang op voorhand boeken/annuleren, max. uren per week, zaalduren
- `ZAAL`: prijs per uur voor zaalhuur
- `TYPES`: types personen en wie de zaal mag huren

De hoofdpagina leest het rooster, de openingsuren en de cijfers ook uit dit bestand.

## Stijl

- `assets/site.css`: gedeelde huisstijl (kleuren, lettertypes, menubalk, voettekst, formulieren)
- `assets/site.js`: menubalk, voettekst en animaties voor alle pagina's behalve de hoofdpagina
- `index.html` bevat daarnaast enkel de stijl die eigen is aan de hoofdpagina

## Database (Supabase)

Accounts en reservaties staan in Supabase (project `asogwgjyurkcciaamhld`, regio EU).

- `supabase/schema.sql`: tabellen, beveiliging en alle boekingsregels. Uitvoeren in
  Supabase → SQL Editor. Opnieuw uitvoeren mag: bestaande gegevens blijven behouden.
- `assets/db.js`: verbinding vanuit de website (de *publishable key* mag publiek zijn;
  de beveiliging zit in de database via Row Level Security).
- De server controleert zelf alle regels (openingsuren, 1 uur op voorhand, 10 uur per week,
  geen overlap, vervallen na 5 minuten, zaalhuur enkel voor goedgekeurde professionals).
- Leden zien enkel hun eigen reservaties; van anderen zien ze alleen *dat* een uur bezet is.
- Beheerders staan in de tabel `beheerders` (e-mailadres).

**Rooster of regels gewijzigd in `assets/boeken.js`?** Open `beheer.html` → Instellingen →
*Rooster naar database sturen*, zodat de server dezelfde regels gebruikt.
