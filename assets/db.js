/* La Vie en Rose – verbinding met de database (Supabase).
   Accounts, profielen en reservaties staan in Supabase. Alle boekingsregels
   worden daar ook op de server gecontroleerd (zie supabase/schema.sql).
   De 'publishable key' hieronder mag publiek zijn: de beveiliging zit in de
   regels van de database (Row Level Security). */
var SUPABASE_URL='https://asogwgjyurkcciaamhld.supabase.co';
var SUPABASE_KEY='sb_publishable_baeXtXYJnKGuO265hWRkhw_iK4Q6NhO';

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
async function logout(){if(sb)await sb.auth.signOut();location.href='boeken.html';}

/* ── RESERVATIES ── */
// Rij uit de database → vorm die de pagina's gebruiken
function naarBoeking(r){
  var s=new Date(r.start).getTime(),e=new Date(r.eind).getTime();
  return {id:r.id,slotId:slotIdVan(s,r.les),userId:r.user_id,plaatsen:1,duur:Math.round((e-s)/60000),
    voorWie:r.voor_wie||'',opmerking:r.opmerking||'',bedrag:+r.bedrag,status:r.status,aangemaakt:r.aangemaakt,
    profiel:r.profielen||null};
}
// Bezetting (van iedereen, enkel aantallen) in een periode
DB.laadBezetting=async function(van,tot){
  if(!sb)throw GEEN_VERBINDING;
  var r=await sb.rpc('bezetting',{van:van.toISOString(),tot:tot.toISOString()});
  if(r.error)throw nlFout(r.error);
  CACHE.bezet=(r.data||[]).map(function(b){return {les:b.les,start:new Date(b.start).getTime(),eind:new Date(b.eind).getTime(),aantal:b.aantal,mijn:b.mijn};});
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
  try{await DB.laadProfiel();}catch(e){DB.user=null;}
  if(sb)sb.auth.onAuthStateChange(function(ev){if(ev==='PASSWORD_RECOVERY')DB.herstel=true;});
  return DB.user;
})();
function klaar(cb){_klaar.then(function(u){cb(u);}).catch(function(e){console.error(e);cb(null);});}
