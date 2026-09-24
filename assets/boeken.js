/* La Vie en Rose – gedeelde logica voor het boekingssysteem.
   LET OP: de site heeft (nog) geen server. Accounts, sessie en reservaties
   worden in de browser (localStorage) bewaard. Dit is een werkend prototype,
   geen echte beveiliging: koppel later een backend voor echte accounts. */

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
function magZaalHuren(user){return !!(user&&getType(user.type).zaal);}

var DAGEN=['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'];
var DAGEN_KORT=['Zo','Ma','Di','Wo','Do','Vr','Za'];
var MAANDEN=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];

/* ── OPSLAG ── */
function load(key,def){try{var v=localStorage.getItem(key);return v?JSON.parse(v):def;}catch(e){return def;}}
function save(key,val){try{localStorage.setItem(key,JSON.stringify(val));}catch(e){}}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}

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
// Zaalreservatie die [van, tot) (minuten) op die dag overlapt, of null.
function zaalBoekingOp(datum,van,tot){
  var dag=isoDate(datum);
  return getBookings().find(function(b){
    if(b.slotId.slice(0,10)!==dag||!/_zaal$/.test(b.slotId))return false;
    var s=naarMin(b.slotId.slice(11,16)),e=s+(b.duur||60);
    return s<tot&&e>van;
  })||null;
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
function slotsVoorDag(datum){
  return (ROOSTER[datum.getDay()]||[]).map(function(r){return parseSlot(slotId(datum,r[0],r[1]));}).filter(Boolean);
}
// Gesimuleerde bezetting door andere leden + echte reservaties in deze browser.
function bezetting(slot){
  var h=0;for(var i=0;i<slot.id.length;i++){h=(h*31+slot.id.charCodeAt(i))>>>0;}
  var basis=slot.les.max>1?h%Math.round(slot.les.max*0.85):0;
  if(slot.lesId==='zaal'){var v=naarMin(slot.tijd);return zaalBoekingOp(slot.datum,v,v+60)?1:0;}
  var eigen=getBookings().filter(function(b){return b.slotId===slot.id;}).reduce(function(s,b){return s+b.plaatsen;},0);
  return Math.min(slot.les.max,basis+eigen);
}
function vrijePlaatsen(slot){return slot.les.max-bezetting(slot);}
function isVoorbij(slot){return slot.start.getTime()<Date.now();}
// Te laat om nog te boeken (minder dan REGELS.boekenTotMinVooraf voor de start)?
function isTeLaat(slot){return slot.start.getTime()-Date.now()<REGELS.boekenTotMinVooraf*60000;}

/* ── ACCOUNTS & SESSIE ── */
function getUsers(){return load('living_users',[]);}
function currentUser(){
  var s=load('living_session',null);if(!s)return null;
  return getUsers().find(function(u){return u.id===s.userId;})||null;
}
function hashPw(pw){
  // SHA-256 waar de browser het toelaat; anders een eenvoudige fallback.
  if(window.crypto&&crypto.subtle&&window.TextEncoder){
    return crypto.subtle.digest('SHA-256',new TextEncoder().encode('living:'+pw)).then(function(buf){
      return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
    });
  }
  var h=5381;for(var i=0;i<pw.length;i++){h=((h<<5)+h+pw.charCodeAt(i))>>>0;}
  return Promise.resolve('d'+h.toString(16));
}
function registreer(naam,email,type,pw){
  email=email.trim().toLowerCase();
  var users=getUsers();
  if(users.some(function(u){return u.email===email;}))return Promise.reject('Er bestaat al een account met dit e-mailadres.');
  return hashPw(pw).then(function(hash){
    var u={id:uid(),naam:naam.trim(),email:email,type:getType(type).id,pw:hash,aangemaakt:new Date().toISOString()};
    users.push(u);save('living_users',users);save('living_session',{userId:u.id});
    return u;
  });
}
function login(email,pw){
  email=email.trim().toLowerCase();
  var u=getUsers().find(function(x){return x.email===email;});
  if(!u)return Promise.reject('E-mailadres of wachtwoord klopt niet.');
  return hashPw(pw).then(function(hash){
    if(hash!==u.pw)throw 'E-mailadres of wachtwoord klopt niet.';
    save('living_session',{userId:u.id});return u;
  });
}
function logout(){try{localStorage.removeItem('living_session');}catch(e){}location.href='boeken.html';}

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
function getBookings(){
  var alle=load('living_bookings',[]),nu=Date.now();
  var geldig=alle.filter(function(b){return !(b.status==='wacht-op-betaling'&&vervaltOm(b)<=nu);});
  if(geldig.length!==alle.length)save('living_bookings',geldig);
  return geldig;
}
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
function annuleerBoeking(id){saveBookings(getBookings().filter(function(b){return b.id!==id;}));}
function waAnnuleerLink(b,slot){
  slot=slot||parseSlot(b.slotId);
  var t='Hallo! Ik wil graag mijn reservatie annuleren: '+slot.les.naam+' op '+fmtDatum(slot.datum)+' om '+slot.tijd+'.';
  return 'https://wa.me/'+REGELS.whatsapp+'?text='+encodeURIComponent(t);
}
function fmtUren(u){return (Math.round(u*100)/100).toString().replace('.',',')+' uur';}
function saveBookings(b){save('living_bookings',b);}
function mijnBookings(user){
  return getBookings().filter(function(b){return b.userId===user.id;})
    .map(function(b){return Object.assign({},b,{slot:parseSlot(b.slotId)});})
    .filter(function(b){return b.slot;})
    .sort(function(a,b){return a.slot.start-b.slot.start;});
}

/* ── UI HELPERS ── */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function initialen(naam){return naam.split(/\s+/).filter(Boolean).slice(0,2).map(function(w){return w[0].toUpperCase();}).join('');}
function typeBadge(user){var t=getType(user.type);return '<span class="type-badge'+(t.pro?' pro':'')+'">'+t.icon+' '+esc(t.label)+'</span>';}

function renderNav(){
  var el=document.getElementById('navRight');if(!el)return;
  var u=currentUser();
  if(u){
    el.innerHTML='<div class="user-chip"><div class="user-avatar">'+esc(initialen(u.naam))+'</div>'+
      '<div class="user-meta"><div class="user-name">'+esc(u.naam)+'</div>'+typeBadge(u)+'</div></div>'+
      '<button class="nav-pill ghost" onclick="logout()">Afmelden</button>';
  }else{
    el.innerHTML='<a class="nav-pill" href="login.html?next='+encodeURIComponent(huidigePagina())+'">Aanmelden</a>';
  }
}
