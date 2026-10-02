/* La Vie en Rose – verbinding met de database (Supabase).
   Accounts, profielen en reservaties staan in Supabase. Alle boekingsregels
   worden daar ook op de server gecontroleerd (zie supabase/schema.sql).
   Het adres en de publishable key staan bovenaan in assets/boeken.js. */

// Als de Supabase-bibliotheek niet kon laden (netwerkstoring), blijft de site bruikbaar met een melding.
var sb=window.supabase?supabase.createClient(SUPABASE_URL,SUPABASE_KEY):null;
var GEEN_VERBINDING='Geen verbinding met de server. Controleer je internet en probeer opnieuw.';
var DB={user:null,herstel:false};

// Adres van de map waarin de site staat (voor links in e-mails)
function siteBasis(){return location.origin+location.pathname.replace(/[^/]*$/,'');}

// Foutmeldingen van Supabase in begrijpelijk Nederlands
function nlFout(e){
  var m=(e&&(e.message||e.error_description||e))+'';
  if(/Invalid login credentials/i.test(m))return 'E-mailadres of wachtwoord klopt niet.';
  if(/Email not confirmed/i.test(m))return 'Bevestig eerst je e-mailadres via de link in je mailbox.';
  if(/already registered|already been registered/i.test(m))return 'Er bestaat al een account met dit e-mailadres.';
  if(/Password should be at least/i.test(m))return 'Je wachtwoord moet minstens 6 tekens hebben.';
  if(/rate limit|too many/i.test(m))return 'Te veel pogingen. Probeer het over een paar minuten opnieuw.';
  if(/invalid.*email|email.*invalid/i.test(m))return 'Dit e-mailadres is niet geldig.';
  if(/Failed to fetch|NetworkError|network/i.test(m))return 'Geen verbinding met de server. Controleer je internet en probeer opnieuw.';
  return m.replace(/^.*?:\s(?=[A-Z])/,'');
}

/* ── PROFIEL ── */
DB.laadProfiel=async function(){
  if(!sb)throw GEEN_VERBINDING;
  var r=await sb.auth.getSession();
  var sessie=r.data&&r.data.session;
  if(!sessie){DB.user=null;return null;}
  var p=await sb.from('profielen').select('*').eq('id',sessie.user.id).maybeSingle();
  if(p.error||!p.data){DB.user=null;return null;}
  var a=await sb.rpc('is_admin');
  DB.user=Object.assign({},p.data,{isAdmin:!!a.data});
  return DB.user;
};

/* ── ACCOUNTS ── */
DB.registreer=async function(naam,email,type,pw,terug){
  if(!sb)throw GEEN_VERBINDING;
  var r=await sb.auth.signUp({email:email.trim(),password:pw,
    options:{data:{naam:naam.trim(),type:type},emailRedirectTo:siteBasis()+(terug||'login.html')}});
  if(r.error)throw nlFout(r.error);
  // Supabase geeft geen fout bij een bestaand e-mailadres, maar een account zonder identiteiten
  if(r.data.user&&r.data.user.identities&&r.data.user.identities.length===0)throw 'Er bestaat al een account met dit e-mailadres.';
  if(!r.data.session)return {bevestigen:true};
  await DB.laadProfiel();return {user:DB.user};
};
DB.login=async function(email,pw){
  if(!sb)throw GEEN_VERBINDING;
  var r=await sb.auth.signInWithPassword({email:email.trim(),password:pw});
  if(r.error)throw nlFout(r.error);
  await DB.laadProfiel();return DB.user;
};
DB.wachtwoordVergeten=async function(email){
  if(!sb)throw GEEN_VERBINDING;
  var r=await sb.auth.resetPasswordForEmail(email.trim(),{redirectTo:siteBasis()+'login.html?herstel=1'});
  if(r.error)throw nlFout(r.error);
};
DB.nieuwWachtwoord=async function(pw){
  var r=await sb.auth.updateUser({password:pw});
  if(r.error)throw nlFout(r.error);
};
// Eigen naam wijzigen (de database laat een lid enkel de naam aanpassen)
DB.wijzigNaam=async function(naam){
  if(!sb)throw GEEN_VERBINDING;
  var r=await sb.from('profielen').update({naam:naam.trim()}).eq('id',DB.user.id).select().maybeSingle();
  if(r.error)throw nlFout(r.error);
  if(!r.data)throw 'Je naam kon niet gewijzigd worden.';
  DB.user=Object.assign({},DB.user,r.data);return DB.user;
};
// Wachtwoord wijzigen: eerst het huidige wachtwoord controleren
DB.wijzigWachtwoord=async function(huidig,nieuw){
  if(!sb)throw GEEN_VERBINDING;
  var c=await sb.auth.signInWithPassword({email:DB.user.email,password:huidig});
  if(c.error)throw /Invalid login credentials/i.test(c.error.message)?'Je huidige wachtwoord klopt niet.':nlFout(c.error);
  await DB.nieuwWachtwoord(nieuw);
};
// Afmelden en daarna naar de yogapagina (of 'naar')
async function logout(naar){if(sb)await sb.auth.signOut();location.href=typeof naar==='string'?naar:'yoga.html';}

/* ── RESERVATIES ── */
// Rij uit de database → vorm die de pagina's gebruiken
function naarBoeking(r){
  var s=new Date(r.start).getTime(),e=new Date(r.eind).getTime();
  return {id:r.id,slotId:slotIdVan(s,r.les),userId:r.user_id,plaatsen:1,duur:Math.round((e-s)/60000),
    voorWie:r.voor_wie||'',opmerking:r.opmerking||'',bedrag:+r.bedrag,status:r.status,aangemaakt:r.aangemaakt,activiteit:r.activiteit||'',beurt:!!r.beurt,
    profiel:r.profielen||null};
}
// Bezetting (van iedereen, enkel aantallen) in een periode
DB.bezettingLijst=async function(van,tot){
  if(!sb)throw GEEN_VERBINDING;
  var r=await sb.rpc('bezetting',{van:van.toISOString(),tot:tot.toISOString()});
  if(r.error)throw nlFout(r.error);
  return (r.data||[]).map(function(b){return {les:b.les,start:new Date(b.start).getTime(),eind:new Date(b.eind).getTime(),aantal:b.aantal,mijn:b.mijn};});
};
DB.laadBezetting=async function(van,tot){CACHE.bezet=await DB.bezettingLijst(van,tot);};
// Lesgever: eigen uren in het rooster zetten (de server controleert alles). uren = [[weekdag, 'HH:MM', les], …]
DB.zetMijnUren=async function(uren){
  if(!sb)throw GEEN_VERBINDING;
  var r=await sb.rpc('zet_mijn_uren',{uren:uren});
  if(r.error)throw nlFout(r.error);
  await laadRooster(true);
};
// Eigen reservaties
DB.laadMijn=async function(){
  if(!DB.user||!sb){CACHE.mijn=[];return;}
  var r=await sb.from('boekingen').select('*').eq('user_id',DB.user.id).order('start');
  if(r.error)throw nlFout(r.error);
  CACHE.mijn=r.data.map(naarBoeking);
};
DB.maakBoeking=async function(slot,duur,voorWie,opmerking){
  if(!sb)throw GEEN_VERBINDING;
  var start=slot.start,eind=new Date(start.getTime()+duur*60000);
  var r=await sb.from('boekingen').insert({user_id:DB.user.id,les:slot.lesId,start:start.toISOString(),eind:eind.toISOString(),
    voor_wie:voorWie||'',opmerking:opmerking||''}).select().single();
  if(r.error)throw nlFout(r.error);
  return naarBoeking(r.data);
};
// Beheerder: eigen activiteit in de zaal inplannen (geen betaling)
DB.planActiviteit=async function(start,duur,activiteit,klanten,notitie){
  if(!sb)throw GEEN_VERBINDING;
  var eind=new Date(start.getTime()+duur*60000);
  var r=await sb.from('boekingen').insert({user_id:DB.user.id,les:'zaal',status:'intern',start:start.toISOString(),eind:eind.toISOString(),
    activiteit:activiteit,voor_wie:klanten||'',opmerking:notitie||''}).select().single();
  if(r.error)throw nlFout(r.error);
  return naarBoeking(r.data);
};
DB.bevestigBar=async function(id){
  var r=await sb.from('boekingen').update({status:'bevestigd'}).eq('id',id).select().maybeSingle();
  if(r.error)throw nlFout(r.error);
  if(!r.data)throw 'Deze reservatie bestaat niet (meer).';
};
DB.annuleer=async function(id){
  var r=await sb.from('boekingen').delete().eq('id',id).select();
  if(r.error)throw nlFout(r.error);
  if(!r.data||!r.data.length)throw 'Annuleren kan nu enkel nog via WhatsApp.';
};

/* ── BEURTENKAARTEN ── */
function _rpc(naam,args){if(!sb)return Promise.reject(GEEN_VERBINDING);return sb.rpc(naam,args||{}).then(function(r){if(r.error)throw nlFout(r.error);return r.data;});}
DB.beurten={
  // lid
  mijn:function(){return _rpc('mijn_beurten').then(function(d){return d||{saldo:0,aanvraag:null};});},
  aanvragen:function(aantal){return _rpc('vraag_beurtenkaart',{kaart:aantal});},
  intrekken:function(){return _rpc('trek_aanvraag_in');},
  // lesgever of beheerder (de database controleert dit)
  overzicht:function(){return _rpc('beurten_overzicht');},
  bevestig:function(id,betaald){return _rpc('bevestig_beurtenkaart',{aanvraag:id,betaald:betaald==null?null:betaald});},
  weiger:function(id){return _rpc('weiger_aanvraag',{aanvraag:id});},
  geef:function(klant,aantal,betaald,notitie,correctie){return _rpc('geef_beurten',{klant:klant,aantal_beurten:aantal,betaald:betaald||0,notitie:notitie||'',correctie:!!correctie});},
  zoek:function(term){return _rpc('zoek_klanten',{term:term});},
  deelnemers:function(van,tot){return _rpc('deelnemers',{van:van.toISOString(),tot:tot.toISOString()});},
  schrijfUit:function(id,beurtTerug){return _rpc('schrijf_uit',{boeking:id,beurt_terug:!!beurtTerug});}
};

/* ── BEHEER ── (de database weigert dit voor wie geen beheerder is) */
function _ok(r){if(r.error)throw nlFout(r.error);return r.data;}
DB.admin={
  boekingen:async function(van,tot){
    var d=_ok(await sb.from('boekingen').select('*, profielen(naam,email,type)')
      .gte('start',van.toISOString()).lt('start',tot.toISOString()).order('start'));
    return d.map(naarBoeking);
  },
  profielen:async function(){return _ok(await sb.from('profielen').select('*').order('aangemaakt',{ascending:false}));},
  zetStatus:async function(id,status){_ok(await sb.from('boekingen').update({status:status}).eq('id',id).select());},
  annuleer:async function(id){var d=_ok(await sb.from('boekingen').delete().eq('id',id).select());if(!d.length)throw 'Niet gevonden.';},
  wijzigProfiel:async function(id,velden){var d=_ok(await sb.from('profielen').update(velden).eq('id',id).select());if(!d.length)throw 'Niet toegestaan.';},
  verwijderGebruiker:async function(id){_ok(await sb.rpc('verwijder_gebruiker',{uid:id}));},
  instellingen:async function(){return _ok(await sb.from('instellingen').select('*').maybeSingle());},
  zetInstellingen:async function(cfg){_ok(await sb.rpc('zet_instellingen',{nieuw:cfg}));}
};

/* ── OPSTARTEN ── */
// Laadt de sessie en roept daarna de pagina-code op: klaar(function(user){ … })
var _klaar=(async function(){
  // Rooster uit de database en het profiel tegelijk laden
  await Promise.all([laadRooster(),DB.laadProfiel().catch(function(){DB.user=null;})]);
  if(sb)sb.auth.onAuthStateChange(function(ev){if(ev==='PASSWORD_RECOVERY')DB.herstel=true;});
  return DB.user;
})();
function klaar(cb){_klaar.then(function(u){cb(u);}).catch(function(e){console.error(e);cb(null);});}
