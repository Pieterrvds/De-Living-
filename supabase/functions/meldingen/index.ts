// La Vie en Rose – meldingen op de gsm versturen (Supabase Edge Function "meldingen").
//
// De database zet meldingen klaar in de tabel public.meldingen (zie supabase/schema.sql) en roept deze
// functie op (meteen, en elke minuut via pg_cron). Deze functie:
//   GET   → geeft de publieke sleutel voor de app (en maakt de sleutels aan de eerste keer)
//   POST  → verstuurt de wachtende meldingen naar alle gsm's van die persoon
//
// De sleutels (VAPID) worden één keer aangemaakt en bewaard in public.push_sleutels; die tabel is niet
// leesbaar via de website. Er hoeft dus geen geheime sleutel ingesteld te worden.
// SUPABASE_DB_URL geeft Supabase zelf mee aan elke Edge Function.
//
// Zet bij het aanmaken "Verify JWT" UIT: deze functie verstuurt enkel wat al klaarstaat in de database,
// dus iedereen mag ze oproepen.

import postgres from "npm:postgres@3.4.5";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const CONTACT = "mailto:pieterv-d-s@hotmail.com";
const MAX_POGINGEN = 5;

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 20 });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Sleutels = { publiek: string; vapid: CryptoKeyPair };
let sleutelCache: Sleutels | null = null;

// VAPID-sleutels ophalen, of de eerste keer aanmaken en bewaren
async function sleutels(): Promise<Sleutels> {
  if (sleutelCache) return sleutelCache;
  let [rij] = await sql`select publiek, prive from public.push_sleutels where id = 1`;
  if (!rij) {
    const nieuw = await webpush.generateVapidKeys({ extractable: true });
    const bewaard = await webpush.exportVapidKeys(nieuw);
    const publiek = await webpush.exportApplicationServerKey(nieuw);
    await sql`insert into public.push_sleutels (id, publiek, prive)
              values (1, ${publiek}, ${sql.json(bewaard as unknown as postgres.JSONValue)})
              on conflict (id) do nothing`;
    [rij] = await sql`select publiek, prive from public.push_sleutels where id = 1`;
  }
  sleutelCache = { publiek: rij.publiek, vapid: await webpush.importVapidKeys(rij.prive) };
  return sleutelCache;
}

// Wachtende meldingen versturen
async function verstuur() {
  const { vapid } = await sleutels();
  const server = await webpush.ApplicationServer.new({ contactInformation: CONTACT, vapidKeys: vapid });

  // Meldingen "opeisen" zodat twee oproepen tegelijk niets dubbel versturen
  const lijst = await sql`
    update public.meldingen set verstuurd = now(), pogingen = pogingen + 1
     where id in (select id from public.meldingen
                   where verstuurd is null and pogingen < ${MAX_POGINGEN} and aangemaakt > now() - interval '2 days'
                   order by id limit 50 for update skip locked)
    returning id, user_id, titel, tekst, url`;

  const uitslag = { meldingen: lijst.length, verstuurd: 0, verwijderd: 0, mislukt: 0 };
  for (const m of lijst) {
    const toestellen = await sql`select endpoint, p256dh, auth from public.push_abonnementen where user_id = ${m.user_id}`;
    let opnieuw = false;
    for (const t of toestellen) {
      try {
        await server.subscribe({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } })
          .pushTextMessage(JSON.stringify({ id: m.id, titel: m.titel, tekst: m.tekst, url: m.url }),
                           { ttl: 24 * 3600, urgency: webpush.Urgency.High });
        uitslag.verstuurd++;
        await sql`update public.push_abonnementen set laatst_gebruikt = now() where endpoint = ${t.endpoint}`;
      } catch (e) {
        const status = e instanceof webpush.PushMessageError ? e.response.status : 0;
        if (status === 404 || status === 410) {
          // deze gsm bestaat niet meer of zette meldingen uit
          await sql`delete from public.push_abonnementen where endpoint = ${t.endpoint}`;
          uitslag.verwijderd++;
        } else {
          console.error("Versturen mislukt", status, String(e));
          uitslag.mislukt++;
          opnieuw = true;
        }
      }
    }
    // tijdelijk probleem bij de pushdienst: later opnieuw proberen (hoogstens MAX_POGINGEN keer)
    if (opnieuw) await sql`update public.meldingen set verstuurd = null where id = ${m.id}`;
  }
  return uitslag;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    if (req.method === "GET") {
      const { publiek } = await sleutels();
      return Response.json({ publiek }, { headers: CORS });
    }
    return Response.json(await verstuur(), { headers: CORS });
  } catch (e) {
    console.error(e);
    return Response.json({ fout: String(e) }, { status: 500, headers: CORS });
  }
});
