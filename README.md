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
| `betalen.html` | Betaalpagina (online betalen nog niet actief) |
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

## Let op

De site heeft nog geen server. Accounts en reservaties worden in de browser van de
bezoeker bewaard (localStorage). Voor echte accounts, een beheeroverzicht en online
betalen is een backend nodig (bv. Supabase of Firebase, met Mollie of Stripe).
