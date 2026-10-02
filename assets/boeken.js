/* La Vie en Rose – gedeelde logica voor het boekingssysteem.
   Bovenaan staan alle instellingen (lessen, rooster, openingsuren, regels).
   Accounts en reservaties staan in de database (Supabase): zie assets/db.js.
   Dit bestand werkt ook zonder db.js (de hoofdpagina gebruikt enkel het rooster). */

/* ── DATABASE ── (Supabase) De 'publishable key' mag publiek zijn: de beveiliging zit in de
   regels van de database (Row Level Security). */
var SUPABASE_URL='https://asogwgjyurkcciaamhld.supabase.co';
var SUPABASE_KEY='sb_publishable_baeXtXYJnKGuO265hWRkhw_iK4Q6NhO';

/* ── LESSEN & ROOSTER ── (prijzen zijn voorlopige voorbeeldprijzen)
   'kort' is de korte naam in de maandkalender op de hoofdpagina.
   binnenkort:true = staat al op de website, maar online boeken kan nog niet ("binnenkort"). */
var LESSEN={
  yoga:{naam:'Yoga',kort:'Yoga',icon:'🧘',duur:60,trainer:'Gwen Deryck',max:25,prijs:15,soort:'Groepsles',
    // soorten yoga: de lesgever kiest per wekelijkse les welke soort het is (Mijn account of Beheer → Rooster)
    stijlen:[
      {naam:'Hatha yoga',uitleg:'Rustig: houdingen en ademhaling'},
      {naam:'Vinyasa flow',uitleg:'Vloeiend en wat actiever'},
      {naam:'Yin yoga',uitleg:'Zacht en lang aanhouden, ontspannend'},
      {naam:'Yoga Nidra',uitleg:'Liggend, diepe ontspanning'}
    ]},
  kine:{naam:'Kinesitherapie',kort:'Kine',icon:'💆',duur:45,trainer:'Onze kinesist',max:1,prijs:40,soort:'Individuele begeleiding',binnenkort:true},
  groep:{naam:'Groepsles',kort:'Groep',icon:'🤸',duur:60,trainer:'Pieter',max:12,prijs:15,soort:'Groepsles',binnenkort:true}
};
/* ── BEURTENKAART ── Lessen in 'lessen' boek je met een beurt (1 beurt per les).
   Een lid koopt de kaart ter plaatse; de lesgever bevestigt de betaling op beurten.html.
   prijs:null = op de website staat "vraag de prijs aan de lesgever". */
var BEURTENKAART={
  lessen:['yoga'],
  kaarten:[{beurten:10,prijs:null}]
};
function metBeurt(lesId){return BEURTENKAART.lessen.indexOf(lesId)>=0;}
// Kan dit online geboekt worden, of is het "binnenkort"?
function isBinnenkort(lesId){return lesId==='zaal'?!!ZAAL.binnenkort:!!(LESSEN[lesId]||{}).binnenkort;}
// Weekdag (0 = zondag … 6 = zaterdag) → lessen: [uur, les, (id lesgever), (naam lesgever), (soort, bv. 'Yin yoga')].
// Het echte rooster staat in de database: de beheerder past het aan in Beheer → Rooster en
// goedgekeurde lesgevers passen hun eigen uren aan bij Mijn account (slepen met de muis).
// Dit is enkel een reserve voor als de database even niet bereikbaar is.
var ROOSTER={
  1:[['09:00','yoga'],['18:00','groep']],
  2:[['09:00','kine']],
  3:[['12:00','yoga'],['17:00','kine'],['18:00','groep'],['19:30','yoga']],
  4:[['16:00','kine']],
  5:[['07:00','yoga']],
  6:[['10:00','yoga'],['16:00','groep']],
  0:[['10:00','yoga'],['11:30','kine']]
};
var UUR_START=7, UUR_EINDE=21;

// Rooster vervangen (in de plaats, zodat alle functies het nieuwe rooster zien). Ongeldige lessen vallen weg.
function zetRooster(r){
  Object.keys(ROOSTER).forEach(function(k){delete ROOSTER[k];});
  Object.keys(r||{}).forEach(function(k){
    if(!/^[0-6]$/.test(k)||!Array.isArray(r[k]))return;
    var l=r[k].filter(function(x){return Array.isArray(x)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x[0])&&LESSEN[x[1]];})
      .map(function(x){var st=stijlGeldig(x[1],x[4])?x[4]:'',t=typeof x[2]==='string'?x[2]:'';
        return st?[x[0],x[1],t,t?String(x[3]||''):'',st]:t?[x[0],x[1],t,String(x[3]||'')]:[x[0],x[1]];}).sort(function(a,b){return a[0]<b[0]?-1:a[0]>b[0]?1:0;});
    if(l.length)ROOSTER[k]=l;
  });
}
// Soort yoga (stijl) van een uur in het rooster, en of die stijl bestaat voor die les
function stijlGeldig(les,st){return !!(st&&LESSEN[les]&&(LESSEN[les].stijlen||[]).some(function(s){return s.naam===st;}));}
function stijlVan(x){return x&&stijlGeldig(x[1],x[4])?x[4]:'';}
function stijlUitleg(les,st){var s=((LESSEN[les]||{}).stijlen||[]).find(function(s){return s.naam===st;});return s?s.uitleg:'';}
// Naam om te tonen: de soort yoga als die gekozen is, anders de les ("Yoga")
function lesNaam(lesId,st){return st||(LESSEN[lesId]||{}).naam||lesId;}
// Wie geeft deze les? (naam uit het rooster, anders de standaard bij de les)
function lesgeverVan(x){return (x&&x[3])||(LESSEN[x[1]]||{}).trainer||'';}
// Rooster uit de database halen (één keer per pagina). Lukt het niet, dan blijft het reserverooster staan.
var _rooster=null;
function laadRooster(opnieuw){
  if(_rooster&&!opnieuw)return _rooster;
  var ctrl=window.AbortController?new AbortController():null;
  var t=setTimeout(function(){if(ctrl)ctrl.abort();},5000);
  _rooster=fetch(SUPABASE_URL+'/rest/v1/instellingen?select=config&id=eq.1',{headers:{apikey:SUPABASE_KEY},signal:ctrl&&ctrl.signal})
    .then(function(r){if(!r.ok)throw r.status;return r.json();})
    .then(function(d){if(d&&d[0]&&d[0].config&&d[0].config.rooster){zetRooster(d[0].config.rooster);return true;}return false;})
    .catch(function(){return false;})
    .then(function(ok){clearTimeout(t);return ok;});
  return _rooster;
}

/* ── OPENINGSUREN ── Weekdag (0 = zondag … 6 = zaterdag) → [open, dicht].
   Buiten deze uren kan niemand boeken of huren. De tekst bij Contact op de
   hoofdpagina wordt hier ook uit opgebouwd. */
var OPENINGSUREN={
  1:['07:00','22:00'],2:['07:00','22:00'],3:['07:00','22:00'],4:['07:00','22:00'],5:['07:00','22:00'],
  6:['09:00','18:00'],0:['09:00','18:00']
};

/* ── GESLOTEN PERIODES ── Extra periodes binnen de openingsuren waarin niemand
   een les kan boeken of de zaal kan huren. Weekdag → [van, tot]. */
var GESLOTEN={
  0:[['13:00','24:00']],   // zondagnamiddag
  1:[['19:00','24:00']],   // maandag na 19:00
  4:[['19:00','24:00']]    // donderdag na 19:00
};
function naarMin(t){var p=t.split(':');return +p[0]*60+ +p[1];}
// Overlapt [van, tot) (in minuten) met een gesloten periode op die dag?
function weekdagGesloten(dow,van,tot){
  var o=OPENINGSUREN[dow];
  if(!o||van<naarMin(o[0])||tot>naarMin(o[1]))return true;   // buiten de openingsuren
  return (GESLOTEN[dow]||[]).some(function(g){return naarMin(g[0])<tot&&naarMin(g[1])>van;});
}
function isGesloten(datum,van,tot){return weekdagGesloten(datum.getDay(),van,tot);}
// Gesloten blokken binnen het rooster (UUR_START … UUR_EINDE+1), per heel uur, als [van, tot] in uren.
function geslotenBlokken(datum){
  var blokken=[],b=null;
  for(var u=UUR_START;u<=UUR_EINDE;u++){
    if(isGesloten(datum,u*60,u*60+60)){if(b)b[1]=u+1;else b=[u,u+1];}
    else if(b){blokken.push(b);b=null;}
  }
  if(b)blokken.push(b);
  return blokken;
}
// Tekst voor de openingsuren, bv. 'Ma–Vr: 07:00 – 22:00<br>Za–Zo: 09:00 – 18:00'
function openingsurenTekst(){
  var volg=[1,2,3,4,5,6,0],regels=[],i=0;
  while(i<volg.length){
    var o=OPENINGSUREN[volg[i]],j=i;
    while(j+1<volg.length&&String(OPENINGSUREN[volg[j+1]])===String(o))j++;
    var dagen=DAGEN_KORT[volg[i]]+(j>i?'–'+DAGEN_KORT[volg[j]]:'');
    regels.push(dagen+': '+(o?o[0]+' – '+o[1]:'gesloten'));
    i=j+1;
  }
  return regels.join('<br>');
}

/* ── BOEKINGSREGELS ── Pas de waarden hier aan. */
var REGELS={
  betaaltermijnMin:5,        // onbetaalde reservatie vervalt na zoveel minuten
  boekenTotMinVooraf:60,     // boeken kan tot zoveel minuten voor de start
  annulerenTotUurVooraf:24,  // zelf annuleren kan tot zoveel uur voor de start; daarna via WhatsApp
  maxUrenPerWeek:10,         // maximaal aantal uren per persoon per week (ma–zo)
  zaalDuren:[60,90,120],     // keuze bij zaalhuur: 1 uur, 1,5 uur of 2 uur
  whatsapp:'32471955489'     // nummer voor annuleren na de termijn
};

/* ── ZAALHUUR ── Professionals (types met zaal:true) kunnen elk vrij uur de zaal huren.
   Een uur is vrij als er geen les uit het ROOSTER overlapt. Prijs is een voorbeeldprijs. */
var ZAAL={naam:'Zaal huren',kort:'Zaal',icon:'🏠',duur:60,trainer:'Zelf begeleid',max:1,prijs:20,soort:'Zaalhuur voor professionals',binnenkort:true};  // prijs per uur

/* ── PERSOONSTYPES ── */
// pro: professional (eerst goedkeuren) · zaal: mag de zaal huren · lessen: welke lessen deze
// lesgever zelf in het rooster kan zetten (bij Mijn account)
var TYPES=[
  {id:'lid',label:'Lid / sporter',icon:'🏃',pro:false},
  {id:'kinesist',label:'Kinesist',icon:'🩺',pro:true,zaal:true,lessen:['kine']},
  {id:'yoga-instructeur',label:'Yoga-instructeur',icon:'🧘',pro:true,zaal:true,lessen:['yoga']},
  {id:'groepslesgever',label:'Groepslesgever',icon:'📣',pro:true,zaal:true,lessen:['groep']}
];
function getType(id){return TYPES.find(function(t){return t.id===id;})||TYPES[0];}
// Professionals krijgen hun extra rechten pas na goedkeuring door de beheerder.
function isGoedgekeurdePro(user){return !!(user&&getType(user.type).pro&&user.goedgekeurd);}
function magZaalHuren(user){return !!(user&&getType(user.type).zaal&&user.goedgekeurd);}
function wachtOpGoedkeuring(user){return !!(user&&getType(user.type).pro&&!user.goedgekeurd);}
// De beheerder (eigenaar) kan de zaal altijd gebruiken voor eigen activiteiten, zonder betaling.
function magInplannen(user){return !!(user&&user.isAdmin);}
// Goedgekeurde lesgevers passen hun eigen uren in het rooster aan
// Beurtenkaarten bevestigen en deelnemers zien: beheerder of goedgekeurde lesgever van een beurtenles
function magBeurtenBeheren(user){return !!(user&&(user.isAdmin||eigenLessenRuw(user).some(metBeurt)));}
function eigenLessenRuw(user){return isGoedgekeurdePro(user)?(getType(user.type).lessen||[]):[];}
function eigenLessen(user){return isGoedgekeurdePro(user)?(getType(user.type).lessen||[]).filter(function(l){return LESSEN[l];}):[];}

/* ── ACTIVITEITEN ── keuzelijst bij 'Inplannen' door de beheerder */
var ACTIVITEITEN=[
  {naam:'Groepsles',icon:'🤸'},{naam:'Kinesitherapie',icon:'💆'},{naam:'Yoga (privé of groep)',icon:'🧘'},
  {naam:'Groepstraining / bootcamp',icon:'🏋️'},{naam:'Pilates',icon:'🤸'},{naam:'Stretching & mobiliteit',icon:'🌿'},
  {naam:'Intake & meting',icon:'📋'},{naam:'Workshop / infosessie',icon:'💡'},{naam:'Evenement / privéfeest',icon:'🎉'},
  {naam:'Foto- of filmopname',icon:'📸'},{naam:'Vergadering / overleg',icon:'🗣️'},{naam:'Onderhoud / schoonmaak',icon:'🧹'}
];
function activiteitIcon(naam){var a=ACTIVITEITEN.find(function(x){return x.naam===naam;});return a?a.icon:'🗓️';}

var DAGEN=['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'];
var DAGEN_KORT=['Zo','Ma','Di','Wo','Do','Vr','Za'];
var MAANDEN=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];

/* ── GEGEVENS UIT DE DATABASE ── (gevuld door assets/db.js)
   bezet: bezetting van alle leden (enkel aantallen) · mijn: eigen reservaties */
var CACHE={bezet:[],mijn:[]};

/* ── DATUM & SLOTS ── */
function pad(n){return(n<10?'0':'')+n;}
function isoDate(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function mondayOf(d){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());var dow=x.getDay();x.setDate(x.getDate()-(dow===0?6:dow-1));return x;}
function addDays(d,n){var x=new Date(d);x.setDate(x.getDate()+n);return x;}
function fmtDatum(d){return DAGEN[d.getDay()]+' '+d.getDate()+' '+MAANDEN[d.getMonth()];}
function fmtEuro(n){return '€ '+n.toFixed(2).replace('.',',');}
function eindTijd(tijd,duur){var p=tijd.split(':');var m=+p[0]*60+ +p[1]+duur;return pad(Math.floor(m/60))+':'+pad(m%60);}

function slotId(datum,tijd,lesId){return isoDate(datum)+'T'+tijd+'_'+lesId;}
// losjes = ook als het uur (niet meer) in het rooster staat, bv. voor een bestaande reservatie
function parseSlot(id,losjes){
  var m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})_([a-z]+)$/.exec(id||'');
  if(!m)return null;
  var datum=new Date(+m[1],+m[2]-1,+m[3]);
  var tijd=m[4],lesId=m[5],les,item=null;
  if(lesId==='zaal'){
    var uur=+tijd.slice(0,2);
    if(!losjes&&(tijd.slice(3)!=='00'||uur<UUR_START||uur>UUR_EINDE||!zaalVrij(datum,uur)))return null;
    les=ZAAL;
  }else{
    les=LESSEN[lesId];
    if(!les)return null;
    item=(ROOSTER[datum.getDay()]||[]).find(function(r){return r[0]===tijd&&r[1]===lesId;});
    if(!losjes&&!item)return null;
    if(!losjes&&isGesloten(datum,naarMin(tijd),naarMin(tijd)+les.duur))return null;
  }
  var p=tijd.split(':');
  var start=new Date(datum.getFullYear(),datum.getMonth(),datum.getDate(),+p[0],+p[1]);
  return {id:id,datum:datum,tijd:tijd,eind:eindTijd(tijd,les.duur),lesId:lesId,les:les,start:start,trainer:item?lesgeverVan(item):les.trainer,stijl:stijlVan(item)};
}
// Is de zaal van uur:00 tot uur+1:00 vrij (geen overlap met een les)?
function zaalVrij(datum,uur){
  var van=uur*60,tot=van+60;
  if(isGesloten(datum,van,tot))return false;
  return !(ROOSTER[datum.getDay()]||[]).some(function(r){
    var p=r[0].split(':'),s=+p[0]*60+ +p[1],e=s+LESSEN[r[1]].duur;
    return s<tot&&e>van;
  });
}
function zaalSlot(datum,uur){return zaalVrij(datum,uur)?parseSlot(slotId(datum,pad(uur)+':00','zaal')):null;}
// Zaalhuur (van wie dan ook) die [van, tot) (minuten) op die dag overlapt, of null.
function zaalBoekingOp(datum,van,tot){
  var dag0=new Date(datum.getFullYear(),datum.getMonth(),datum.getDate()).getTime();
  var r=CACHE.bezet.find(function(b){
    if(b.les!=='zaal')return false;
    var s=(b.start-dag0)/60000,e=(b.eind-dag0)/60000;
    return s<tot&&e>van;
  });
  return r?{slotId:slotIdVan(r.start,'zaal'),duur:Math.round((r.eind-r.start)/60000),mijn:r.mijn}:null;
}
// Welke duren (minuten) kan de zaal vanaf dit uur gehuurd worden?
function zaalDurenVanaf(datum,uur){
  var van=uur*60;
  return REGELS.zaalDuren.filter(function(d){
    for(var m=van;m<van+d;m+=30){
      if(isGesloten(datum,m,m+30)||!zaalVrijLes(datum,m,m+30))return false;
    }
    return !zaalBoekingOp(datum,van,van+d);
  });
}
function zaalVrijLes(datum,van,tot){
  return !(ROOSTER[datum.getDay()]||[]).some(function(r){var s=naarMin(r[0]),e=s+LESSEN[r[1]].duur;return s<tot&&e>van;});
}
// Aantal lessen per week volgens het ROOSTER (lessen in een gesloten periode tellen niet mee).
// boekbaar = enkel lessen die nu al online te boeken zijn (niet "binnenkort").
function lessenPerWeek(boekbaar){
  return Object.keys(ROOSTER).reduce(function(n,dow){
    return n+ROOSTER[dow].filter(function(r){return !(boekbaar&&isBinnenkort(r[1]))&&!weekdagGesloten(+dow,naarMin(r[0]),naarMin(r[0])+LESSEN[r[1]].duur);}).length;
  },0);
}
function slotsVoorDag(datum){
  return (ROOSTER[datum.getDay()]||[]).map(function(r){return parseSlot(slotId(datum,r[0],r[1]));}).filter(Boolean);
}
// Bezetting van een les of zaaluur volgens de database.
function bezetting(slot){
  if(slot.lesId==='zaal'){var v=naarMin(slot.tijd);return zaalBoekingOp(slot.datum,v,v+60)?1:0;}
  var t=slot.start.getTime();
  return Math.min(slot.les.max,CACHE.bezet.reduce(function(n,b){return b.les===slot.lesId&&b.start===t?n+b.aantal:n;},0));
}
function vrijePlaatsen(slot){return slot.les.max-bezetting(slot);}
// Bezetting zonder aangemeld te zijn (hoofdpagina): enkel aantallen per les en tijdstip
function haalBezetting(van,tot){
  return fetch(SUPABASE_URL+'/rest/v1/rpc/bezetting',{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({van:van.toISOString(),tot:tot.toISOString()})})
    .then(function(r){if(!r.ok)throw r.status;return r.json();})
    .then(function(d){return (d||[]).map(function(b){return {les:b.les,start:new Date(b.start).getTime(),aantal:b.aantal};});});
}
// Hoe vol is een les? Balkje met aantal (groepslessen) of vrij/volzet (1-op-1).
function bezettingHtml(aantal,max){
  if(max<=1)return '<span class="bez'+(aantal>=max?' vol':'')+'">'+(aantal>=max?'Volzet':'Vrij')+'</span>';
  var pct=Math.min(100,Math.round(aantal/max*100));
  return '<span class="bez'+(aantal>=max?' vol':pct>=75?' bijna':'')+'" title="'+aantal+' van '+max+' plaatsen bezet"><span class="bez-balk"><i style="width:'+pct+'%"></i></span><b>'+aantal+'/'+max+'</b></span>';
}
function isVoorbij(slot){return slot.start.getTime()<Date.now();}
// Te laat om nog te boeken (minder dan REGELS.boekenTotMinVooraf voor de start)?
function isTeLaat(slot){return slot.start.getTime()-Date.now()<REGELS.boekenTotMinVooraf*60000;}

/* ── ACCOUNT ── */
// Ingelogde gebruiker (profiel uit de database) of null. Gevuld door assets/db.js.
function currentUser(){return (window.DB&&DB.user)||null;}

// Alleen interne pagina's toelaten als doorverwijzing (geen open redirect).
function veiligeNext(next){return /^[a-z]+\.html(\?[\w=&%.:-]*)?$/.test(next||'')?next:'yoga.html';}
function huidigePagina(){return location.pathname.split('/').pop()+location.search;}
// Stuurt niet-ingelogde bezoekers naar de aanmeldpagina en daarna terug.
function requireLogin(next){
  var u=currentUser();
  if(!u){location.replace('login.html?next='+encodeURIComponent(next||huidigePagina()));return null;}
  return u;
}

/* ── RESERVATIES ── */
// Onbetaalde reservaties vervallen na REGELS.betaaltermijnMin minuten.
function vervaltOm(b){return new Date(b.aangemaakt).getTime()+REGELS.betaaltermijnMin*60000;}
// Eigen reservaties (vervallen onbetaalde reservaties tellen niet meer mee).
function getBookings(){
  var nu=Date.now();
  return CACHE.mijn.filter(function(b){return !(b.status==='wacht-op-betaling'&&vervaltOm(b)<=nu);});
}
// 'YYYY-MM-DDTHH:MM_les' voor een tijdstip (lokale tijd)
function slotIdVan(ms,les){var d=new Date(ms);return isoDate(d)+'T'+pad(d.getHours())+':'+pad(d.getMinutes())+'_'+les;}
function isBevestigd(b){return b.status==='betaald'||b.status==='bevestigd'||b.status==='intern';}
function statusLabel(b){return b.beurt?'Met beurt':b.status==='intern'?'Ingepland':b.status==='betaald'?'Betaald':b.status==='bevestigd'?'Bevestigd · betalen aan de bar':'Wacht op betaling';}
function boekingDuur(b,slot){return b.duur||(slot||parseSlot(b.slotId,true)).les.duur;}
function boekingEind(b,slot){slot=slot||parseSlot(b.slotId,true);return eindTijd(slot.tijd,boekingDuur(b,slot));}
// Geboekte uren van een persoon in de week (ma–zo) van een datum.
function urenInWeek(user,datum){
  var ma=mondayOf(datum).getTime(),zo=ma+7*864e5;
  return getBookings().filter(function(b){return b.userId===user.id&&b.status!=='intern';}).reduce(function(som,b){
    var s=parseSlot(b.slotId,true);if(!s)return som;
    var t=s.datum.getTime();return t>=ma&&t<zo?som+boekingDuur(b,s)/60:som;
  },0);
}
function magZelfAnnuleren(b,slot){
  if(b.status==='intern')return true;
  slot=slot||parseSlot(b.slotId,true);
  return !isBevestigd(b)||slot.start.getTime()-Date.now()>=REGELS.annulerenTotUurVooraf*3600000;
}
function waAnnuleerLink(b,slot){
  slot=slot||parseSlot(b.slotId,true);
  var t='Hallo! Ik wil graag mijn reservatie annuleren: '+lesNaam(slot.lesId,slot.stijl)+' op '+fmtDatum(slot.datum)+' om '+slot.tijd+'.';
  return 'https://wa.me/'+REGELS.whatsapp+'?text='+encodeURIComponent(t);
}
function fmtUren(u){return (Math.round(u*100)/100).toString().replace('.',',')+' uur';}
function mijnBookings(user){
  return getBookings().filter(function(b){return b.userId===user.id;})
    .map(function(b){return Object.assign({},b,{slot:b.status==='intern'?activiteitSlot(b):parseSlot(b.slotId,true)});})
    .filter(function(b){return b.slot;})
    .sort(function(a,b){return a.slot.start-b.slot.start;});
}

// Eén reservatie als rij (boeken.html en account.html). annuleerFn = naam van de functie op de pagina.
function reservatieRij(b,annuleerFn){
  var s=b.slot,ok=isBevestigd(b),actie='';
  if(!isVoorbij(s)){
    if(!ok)actie='<a href="betalen.html?booking='+b.id+'">Betalen →</a><button class="res-annuleer" onclick="'+annuleerFn+'(\''+b.id+'\')">Annuleren</button>';
    else if(magZelfAnnuleren(b,s))actie='<button class="res-annuleer" onclick="'+annuleerFn+'(\''+b.id+'\')">'+(b.status==='intern'?'Verwijderen':'Annuleren')+'</button>';
    else actie='<a href="'+waAnnuleerLink(b,s)+'" target="_blank" rel="noopener" title="Minder dan '+REGELS.annulerenTotUurVooraf+' uur op voorhand">Annuleren via WhatsApp ↗</a>';
  }
  return '<div class="res-rij"><div class="res-info"><b>'+s.les.icon+' '+esc(lesNaam(s.lesId,s.stijl))+'</b> · '+fmtDatum(s.datum)+' · '+s.tijd+' – '+boekingEind(b,s)+
    (b.voorWie?' · voor '+esc(b.voorWie):'')+(b.bedrag&&b.status!=='intern'?' · '+fmtEuro(b.bedrag):'')+'</div>'+
    '<div class="res-acties"><span class="status '+(ok?'betaald':'wacht')+'">'+statusLabel(b)+'</span>'+actie+'</div></div>';
}

// Instellingen voor de database (zelfde vorm als in supabase/schema.sql).
// De beheerpagina stuurt dit naar de database, zodat de server dezelfde regels gebruikt.
// rooster: het rooster dat al in de database staat (dat beheer je in Beheer → Rooster, niet hier).
function configVoorDatabase(rooster){
  var m=function(o,f){var r={};Object.keys(o).forEach(function(k){r[k]=f(o[k],k);});return r;};
  return {
    lessen:m(LESSEN,function(l){var x={naam:l.naam,duur:l.duur,max:l.max,prijs:l.prijs};if(l.binnenkort)x.binnenkort=true;
      if(l.stijlen)x.stijlen=l.stijlen.map(function(s){return s.naam;});return x;}),
    rooster:rooster||ROOSTER,openingsuren:OPENINGSUREN,gesloten:GESLOTEN,
    regels:{betaaltermijnMin:REGELS.betaaltermijnMin,boekenTotMinVooraf:REGELS.boekenTotMinVooraf,
      annulerenTotUurVooraf:REGELS.annulerenTotUurVooraf,maxUrenPerWeek:REGELS.maxUrenPerWeek,zaalDuren:REGELS.zaalDuren},
    zaal:ZAAL.binnenkort?{prijs:ZAAL.prijs,binnenkort:true}:{prijs:ZAAL.prijs},
    beurtenkaart:{lessen:BEURTENKAART.lessen.slice(),kaarten:BEURTENKAART.kaarten.map(function(k){return {beurten:k.beurten,prijs:k.prijs};})},
    types:TYPES.reduce(function(r,t){r[t.id]={pro:!!t.pro,zaal:!!t.zaal,lessen:t.lessen||[]};return r;},{})
  };
}

/* ── ACTIVITEITEN VAN DE BEHEERDER ── */
// 'Slot'-vorm voor een ingeplande activiteit (kan op elk kwartier starten, ook buiten de openingsuren)
function activiteitSlot(b){
  var m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})_/.exec(b.slotId);
  var datum=new Date(+m[1],+m[2]-1,+m[3]),t=m[4],p=t.split(':');
  return {id:b.slotId,datum:datum,tijd:t,eind:eindTijd(t,b.duur),lesId:'zaal',start:new Date(datum.getFullYear(),datum.getMonth(),datum.getDate(),+p[0],+p[1]),
    les:{naam:b.activiteit||'Activiteit',icon:activiteitIcon(b.activiteit),duur:b.duur,max:1,prijs:0,trainer:'La Vie en Rose',soort:'Ingepland door de beheerder'}};
}
// Welke duren (minuten) zijn vrij vanaf een tijdstip? Geen overlap met lessen of andere zaalgebruik;
// openingsuren en sluitingen gelden niet voor de beheerder.
function vrijeDurenBeheer(datum,van){
  var r=[];
  for(var d=30;d<=240;d+=30){
    if(van+d>1440||!zaalVrijLes(datum,van,van+d)||zaalBoekingOp(datum,van,van+d))break;
    r.push(d);
  }
  return r;
}

/* ── UI HELPERS ── */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function initialen(naam){return naam.split(/\s+/).filter(Boolean).slice(0,2).map(function(w){return w[0].toUpperCase();}).join('');}
function typeBadge(user){var t=getType(user.type);return '<span class="type-badge'+(t.pro?' pro':'')+'">'+t.icon+' '+esc(t.label)+'</span>';}

function renderNav(){
  var el=document.getElementById('navRight');if(!el)return;
  var u=currentUser();
  var nav=document.getElementById('nav');if(nav)nav.classList.toggle('met-gebruiker',!!u);
  var mob=document.getElementById('mobMenu');
  if(mob&&u&&!document.getElementById('mobAccount'))mob.insertAdjacentHTML('afterbegin','<a href="account.html" id="mobAccount">👤 Mijn account</a>');
  if(mob&&magBeurtenBeheren(u)&&!document.getElementById('mobBeurten'))mob.insertAdjacentHTML('afterbegin','<a href="beurten.html" id="mobBeurten">🎟️ Beurtenkaarten</a>');
  if(mob&&u&&u.isAdmin&&!document.getElementById('mobBeheer'))mob.insertAdjacentHTML('afterbegin','<a href="beheer.html" id="mobBeheer">⚙️ Beheer</a>');
  if(u){
    el.innerHTML=(u.isAdmin?'<a class="nav-pill ghost nav-beheer" href="beheer.html">⚙️ Beheer</a>':'')+
      '<a class="user-chip" href="account.html" title="Mijn account en reservaties"><div class="user-avatar">'+esc(initialen(u.naam))+'</div>'+
      '<div class="user-meta"><div class="user-name">'+esc(u.naam)+'</div>'+typeBadge(u)+'</div></a>'+
      '<button class="nav-pill ghost nav-afmelden" onclick="logout()">Afmelden</button>';
  }else{
    el.innerHTML='<a class="nav-pill" href="login.html?next='+encodeURIComponent(huidigePagina())+'">Aanmelden</a>';
  }
}
