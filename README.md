# La Vie en Rose – Sports Café · Aalst

Website van La Vie en Rose: yoga, kinesitherapie, groepslessen en een bar,
met online lessen boeken en zaalhuur voor lesgevers (kinesisten, yoga-instructeurs, groepslesgevers).

## Pagina's

| Bestand | Wat |
|---|---|
| `index.html` | Hoofdpagina (over ons, rooster, lessen, evenementen, contact) |
| `yoga.html` | **Yoga reserveren**: eenvoudige pagina voor de gsm (grote tekst en knoppen), met aanmelden, beurtenkaart en reservaties op één plek |
| `beurten.html` | Beurtenkaarten voor de yoga-lesgever en de beheerder: betalingen bevestigen, beurten geven, deelnemers per les |
| `boeken.html` | Volledig weekrooster (alle lessen; wat nog niet kan staat als "binnenkort") |
| `login.html` | Aanmelden en account maken (met type persoon) |
| `reserveren.html` | Reservatie bevestigen (enkel na aanmelden) |
| `betalen.html` | Betaalpagina (online betalen nog niet actief; betalen aan de bar bevestigt) |
| `account.html` | Mijn account: gegevens, naam/wachtwoord wijzigen, komende en voorbije reservaties (klik op je initialen); goedgekeurde lesgevers zetten hier hun **eigen uren** in het rooster en zien hoe vol hun lessen zijn |
| `beheer.html` | Beheerpagina: reservaties en bezetting per les, **weekrooster slepen met de muis**, leden goedkeuren, regels naar database sturen |
| `fotos.html` | Fotogalerij (`Gallery.html` stuurt door naar deze pagina) |

## Waar pas je wat aan?

**Het weekrooster** pas je aan op de website zelf: `beheer.html` → **🗓️ Rooster**. Sleep lessen
met de muis naar een andere dag of uur, sleep een les uit de balk bovenaan in de kalender om ze
toe te voegen, sleep naar 🗑️ (of druk Delete) om te verwijderen, of klik op een les om ze te
wijzigen. Ctrl+Z maakt ongedaan. Pas na **Publiceren** gaat het rooster naar de database en
gebruiken de website, het boekingssysteem en de server het meteen. Raakt een wijziging
komende reservaties, dan krijg je eerst een lijst; die reservaties blijven bestaan.

**Lesgevers** (kinesist, yoga-instructeur, groepslesgever) passen na goedkeuring hun eigen uren
aan bij *Mijn account*, met dezelfde kalender. Ze kunnen enkel hun eigen lessoort plaatsen
(`TYPES[].lessen`) en enkel hun eigen uren verschuiven; lessen van anderen zien ze grijs. De
beheerder kiest per les in het rooster welke lesgever ze geeft (klik op de les → *Lesgever*).
Een uur in het rooster is dan `[uur, les, id lesgever, naam lesgever]`.

**Hoe vol zijn de lessen?** Op de boekingspagina en in de kalender op de hoofdpagina staat bij
elke groepsles een balkje (bv. 5/16). In Beheer → Reservaties staat per les wie er komt, en
lesgevers zien de bezetting van hun eigen lessen bij *Mijn account*.

**Voorlopig enkel yoga online.** Kinesitherapie, groepslessen en zaalhuur staan wel op de website,
maar als *binnenkort* (`binnenkort:true` bij de les in `LESSEN` en bij `ZAAL`). Zet je dat op
`false` (of haal het weg) en stuur je de regels naar de database, dan kan je ze weer online boeken.
Ook de evenementen en de foto's dragen een *binnenkort*-melding.

**Beurtenkaart (yoga).** Een les uit `BEURTENKAART.lessen` reserveren kost 1 beurt:

1. Het lid vraagt op `yoga.html` een kaart aan (bv. 10 beurten) en betaalt ter plaatse bij Gwen.
2. Gwen tikt op `beurten.html` op *Betaald ontvangen*; de beurten staan meteen op de kaart.
   Ze kan ook een klant opzoeken en rechtstreeks een kaart geven, of beurten bijgeven/afnemen
   (bv. een gratis eerste les, of −1 bij te laat annuleren).
3. Annuleren (tot 24 uur op voorhand) geeft de beurt terug. Daarna kan het via WhatsApp; Gwen
   kan dan iemand uitschrijven met of zonder beurt terug.

De kaarten en hun prijs staan in `BEURTENKAART.kaarten` (`prijs:null` = "vraag de prijs aan Gwen").

De rest staat bovenaan in **`assets/boeken.js`**:

- `LESSEN`: lessoorten, begeleiding, duur, max. aantal personen en prijs
- `ROOSTER`: enkel een reserve voor als de database niet bereikbaar is
- `OPENINGSUREN` en `GESLOTEN`: wanneer niemand kan boeken of huren
- `REGELS`: betaaltermijn, hoe lang op voorhand boeken/annuleren, max. uren per week, zaalduren
- `ZAAL`: prijs per uur voor zaalhuur (en of het al online kan)
- `BEURTENKAART`: welke lessen je met een beurt boekt en welke kaarten er zijn
- `TYPES`: types personen, wie de zaal mag huren en welke lessen een lesgever zelf plant

De hoofdpagina leest de openingsuren en lessen uit dit bestand en het rooster uit de database.

## Agenda-abonnement (Google Calendar, Apple, Outlook)

`rooster.ics` is het lessenrooster als agenda. De knop **+ Google Calendar** op de hoofdpagina
abonneert bezoekers erop, zodat wijzigingen vanzelf in hun agenda komen (Google ververst
ongeveer elke 12 tot 24 uur). Het bestand wordt gemaakt uit het rooster in de database:

- automatisch door GitHub Actions (`.github/workflows/agenda.yml`), elke 2 uur;
- of zelf: `node tools/maak-agenda.js`.

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
- Leden kunnen enkel hun eigen naam wijzigen; type en goedkeuring wijzigt enkel de beheerder.
- Beheerders staan in de tabel `beheerders` (e-mailadres).
- De beheerder kan in het rooster op elk vrij moment een eigen activiteit **inplannen**
  (status `intern`: geen betaling, geen weeklimiet, ook buiten de openingsuren; wel geen
  overlap met lessen of zaalhuur). Trainers zien dan "Zaal bezet", leden zien niets.
- Lesgevers zetten hun uren via de functie `zet_mijn_uren`: de server vervangt enkel hun eigen
  uren en controleert lessoort, openingsuren, gesloten periodes en overlap.
- Beurtenkaarten staan in de tabel `beurten` (kaarten en correcties). Saldo = bevestigde beurten
  min reservaties met een beurt. Enkel de beheerder en de goedgekeurde lesgever van een les met
  beurten (de yoga-instructeur) kunnen betalingen bevestigen, leden zoeken en deelnemers zien;
  dat kan enkel via de functies in `schema.sql` (geen rechtstreekse toegang tot de tabel).

**Lessen of regels gewijzigd in `assets/boeken.js`?** Open `beheer.html` → Instellingen →
*Regels naar database sturen*, zodat de server dezelfde regels gebruikt (het rooster blijft dan
zoals het in de database staat).
