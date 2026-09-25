/* La Vie en Rose – gedeelde logica voor het boekingssysteem.
   Bovenaan staan alle instellingen (lessen, rooster, openingsuren, regels).
   Accounts en reservaties staan in de database (Supabase): zie assets/db.js.
   Dit bestand werkt ook zonder db.js (de hoofdpagina gebruikt enkel het rooster). */

/* ── LESSEN & ROOSTER ── (prijzen zijn voorlopige voorbeeldprijzen)
   Dit is de enige plek waar het rooster staat: index.html en boeken.html lezen het hier.
   'kort' is de korte naam in de maandkalender op de hoofdpagina. */
var LESSEN={
  yoga:{naam:'Yoga',kort:'Yoga',icon:'🧘',duur:60,trainer:'Gwen Deryck',max:16,prijs:15,soort:'Groepsles'},
  kine:{naam:'Kinesitherapie',kort:'Kine',icon:'💆',duur:45,trainer:'Onze kinesist',max:1,prijs:40,soort:'Individuele begeleiding'},
  pt:{naam:'Personal Training',kort:'PT',icon:'💪',duur:60,trainer:'Je coach',max:1,prijs:50,soort:'1-op-1 training'}
};
// Weekdag (0 = zondag … 6 = zaterdag) → lessen. Zelfde rooster als op index.html.
var ROOSTER={
  1:[['09:00','yoga'],['18:00','pt']],
  2:[['09:00','kine'],['19:00','pt']],
  3:[['12:00','yoga'],['17:00','kine'],['19:30','yoga']],
  4:[['07:30','pt'],['16:00','kine']],
  5:[['07:00','yoga'],['12:00','pt']],
  6:[['10:00','yoga'],['11:30','pt']],
  0:[['10:00','yoga'],['11:30','kine']]
};
var UUR_START=7, UUR_EINDE=21;

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
var ZAAL={naam:'Zaal huren',kort:'Zaal',icon:'🏠',duur:60,trainer:'Zelf begeleid',max:1,prijs:20,soort:'Zaalhuur voor professionals'};  // prijs per uur

/* ── PERSOONSTYPES ── */
var TYPES=[
  {id:'lid',label:'Lid / sporter',icon:'🏃',pro:false},
  {id:'personal-trainer',label:'Personal trainer',icon:'💪',pro:true,zaal:true},
  {id:'kinesist',label:'Kinesist',icon:'🩺',pro:true,zaal:true},
  {id:'dietist',label:'Diëtist',icon:'🥗',pro:true},
  {id:'lesgever',label:'Lesgever',icon:'📣',pro:true,zaal:true}
];
function getType(id){return TYPES.find(function(t){return t.id===id;})||TYPES[0];}
// Professionals krijgen hun extra rechten pas na goedkeuring door de beheerder.
function isGoedgekeurdePro(user){return !!(user&&getType(user.type).pro&&user.goedgekeurd);}
function magZaalHuren(user){return !!(user&&getType(user.type).zaal&&user.goedgekeurd);}
function wachtOpGoedkeuring(user){return !!(user&&getType(user.type).pro&&!user.goedgekeurd);}

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
function parseSlot(id){
  var m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})_([a-z]+)$/.exec(id||'');
  if(!m)return null;
  var datum=new Date(+m[1],+m[2]-1,+m[3]);
  var tijd=m[4],lesId=m[5],les;
  if(lesId==='zaal'){
    var uur=+tijd.slice(0,2);
    if(tijd.slice(3)!=='00'||uur<UUR_START||uur>UUR_EINDE||!zaalVrij(datum,uur))return null;
    les=ZAAL;
  }else{
    les=LESSEN[lesId];
    if(!les||!(ROOSTER[datum.getDay()]||[]).some(function(r){return r[0]===tijd&&r[1]===lesId;}))return null;
    if(isGesloten(datum,naarMin(tijd),naarMin(tijd)+les.duur))return null;
  }
  var p=tijd.split(':');
  var start=new Date(datum.getFullYear(),datum.getMonth(),datum.getDate(),+p[0],+p[1]);
  return {id:id,datum:datum,tijd:tijd,eind:eindTijd(tijd,les.duur),lesId:lesId,les:les,start:start};
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
function lessenPerWeek(){
  return Object.keys(ROOSTER).reduce(function(n,dow){
    return n+ROOSTER[dow].filter(function(r){return !weekdagGesloten(+dow,naarMin(r[0]),naarMin(r[0])+LESSEN[r[1]].duur);}).length;
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
function isVoorbij(slot){return slot.start.getTime()<Date.now();}
// Te laat om nog te boeken (minder dan REGELS.boekenTotMinVooraf voor de start)?
function isTeLaat(slot){return slot.start.getTime()-Date.now()<REGELS.boekenTotMinVooraf*60000;}

/* ── ACCOUNT ── */
// Ingelogde gebruiker (profiel uit de database) of null. Gevuld door assets/db.js.
function currentUser(){return (window.DB&&DB.user)||null;}

// Alleen interne pagina's toelaten als doorverwijzing (geen open redirect).
function veiligeNext(next){return /^[a-z]+\.html(\?[\w=&%.:-]*)?$/.test(next||'')?next:'boeken.html';}
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
function isBevestigd(b){return b.status==='betaald'||b.status==='bevestigd';}
function statusLabel(b){return b.status==='betaald'?'Betaald':b.status==='bevestigd'?'Bevestigd · betalen aan de bar':'Wacht op betaling';}
function boekingDuur(b,slot){return b.duur||(slot||parseSlot(b.slotId)).les.duur;}
function boekingEind(b,slot){slot=slot||parseSlot(b.slotId);return eindTijd(slot.tijd,boekingDuur(b,slot));}
// Geboekte uren van een persoon in de week (ma–zo) van een datum.
function urenInWeek(user,datum){
  var ma=mondayOf(datum).getTime(),zo=ma+7*864e5;
  return getBookings().filter(function(b){return b.userId===user.id;}).reduce(function(som,b){
    var s=parseSlot(b.slotId);if(!s)return som;
    var t=s.datum.getTime();return t>=ma&&t<zo?som+boekingDuur(b,s)/60:som;
  },0);
}
function magZelfAnnuleren(b,slot){
  slot=slot||parseSlot(b.slotId);
  return !isBevestigd(b)||slot.start.getTime()-Date.now()>=REGELS.annulerenTotUurVooraf*3600000;
}
function waAnnuleerLink(b,slot){
  slot=slot||parseSlot(b.slotId);
  var t='Hallo! Ik wil graag mijn reservatie annuleren: '+slot.les.naam+' op '+fmtDatum(slot.datum)+' om '+slot.tijd+'.';
  return 'https://wa.me/'+REGELS.whatsapp+'?text='+encodeURIComponent(t);
}
function fmtUren(u){return (Math.round(u*100)/100).toString().replace('.',',')+' uur';}
function mijnBookings(user){
  return getBookings().filter(function(b){return b.userId===user.id;})
    .map(function(b){return Object.assign({},b,{slot:parseSlot(b.slotId)});})
    .filter(function(b){return b.slot;})
    .sort(function(a,b){return a.slot.start-b.slot.start;});
}

// Instellingen voor de database (zelfde vorm als in supabase/schema.sql).
// De beheerpagina stuurt dit naar de database, zodat de server dezelfde regels gebruikt.
function configVoorDatabase(){
  var m=function(o,f){var r={};Object.keys(o).forEach(function(k){r[k]=f(o[k],k);});return r;};
  return {
    lessen:m(LESSEN,function(l){return {naam:l.naam,duur:l.duur,max:l.max,prijs:l.prijs};}),
    rooster:ROOSTER,openingsuren:OPENINGSUREN,gesloten:GESLOTEN,
    regels:{betaaltermijnMin:REGELS.betaaltermijnMin,boekenTotMinVooraf:REGELS.boekenTotMinVooraf,
      annulerenTotUurVooraf:REGELS.annulerenTotUurVooraf,maxUrenPerWeek:REGELS.maxUrenPerWeek,zaalDuren:REGELS.zaalDuren},
    zaal:{prijs:ZAAL.prijs},
    types:TYPES.reduce(function(r,t){r[t.id]={pro:!!t.pro,zaal:!!t.zaal};return r;},{})
  };
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
  if(mob&&u&&u.isAdmin&&!document.getElementById('mobBeheer'))mob.insertAdjacentHTML('afterbegin','<a href="beheer.html" id="mobBeheer">⚙️ Beheer</a>');
  if(u){
    el.innerHTML=(u.isAdmin?'<a class="nav-pill ghost nav-beheer" href="beheer.html">⚙️ Beheer</a>':'')+
      '<div class="user-chip"><div class="user-avatar">'+esc(initialen(u.naam))+'</div>'+
      '<div class="user-meta"><div class="user-name">'+esc(u.naam)+'</div>'+typeBadge(u)+'</div></div>'+
      '<button class="nav-pill ghost" onclick="logout()">Afmelden</button>';
  }else{
    el.innerHTML='<a class="nav-pill" href="login.html?next='+encodeURIComponent(huidigePagina())+'">Aanmelden</a>';
  }
}
