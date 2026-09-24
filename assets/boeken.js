/* La Vie en Rose – gedeelde logica voor het boekingssysteem.
   LET OP: de site heeft (nog) geen server. Accounts, sessie en reservaties
   worden in de browser (localStorage) bewaard. Dit is een werkend prototype,
   geen echte beveiliging: koppel later een backend voor echte accounts. */

/* ── LESSEN & ROOSTER ── (prijzen zijn voorlopige voorbeeldprijzen) */
var LESSEN={
  yoga:{naam:'Yoga',icon:'🧘',duur:60,trainer:'Gwen Deryck',max:16,prijs:15,soort:'Groepsles'},
  kine:{naam:'Kinesitherapie',icon:'💆',duur:45,trainer:'Onze kinesist',max:1,prijs:40,soort:'Individuele begeleiding'},
  pt:{naam:'Personal Training',icon:'💪',duur:60,trainer:'Je coach',max:1,prijs:50,soort:'1-op-1 training'}
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

/* ── PERSOONSTYPES ── */
var TYPES=[
  {id:'lid',label:'Lid / sporter',icon:'🏃',pro:false},
  {id:'personal-trainer',label:'Personal trainer',icon:'💪',pro:true},
  {id:'kinesist',label:'Kinesist',icon:'🩺',pro:true},
  {id:'dietist',label:'Diëtist',icon:'🥗',pro:true},
  {id:'lesgever',label:'Lesgever',icon:'📣',pro:true}
];
function getType(id){return TYPES.find(function(t){return t.id===id;})||TYPES[0];}

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
  if(!m||!LESSEN[m[5]])return null;
  var datum=new Date(+m[1],+m[2]-1,+m[3]);
  var tijd=m[4],lesId=m[5];
  var geldig=(ROOSTER[datum.getDay()]||[]).some(function(r){return r[0]===tijd&&r[1]===lesId;});
  if(!geldig)return null;
  var p=tijd.split(':');
  var start=new Date(datum.getFullYear(),datum.getMonth(),datum.getDate(),+p[0],+p[1]);
  return {id:id,datum:datum,tijd:tijd,eind:eindTijd(tijd,LESSEN[lesId].duur),lesId:lesId,les:LESSEN[lesId],start:start};
}
function slotsVoorDag(datum){
  return (ROOSTER[datum.getDay()]||[]).map(function(r){return parseSlot(slotId(datum,r[0],r[1]));});
}
// Gesimuleerde bezetting door andere leden + echte reservaties in deze browser.
function bezetting(slot){
  var h=0;for(var i=0;i<slot.id.length;i++){h=(h*31+slot.id.charCodeAt(i))>>>0;}
  var basis=slot.les.max>1?h%Math.round(slot.les.max*0.85):0;
  var eigen=getBookings().filter(function(b){return b.slotId===slot.id;}).reduce(function(s,b){return s+b.plaatsen;},0);
  return Math.min(slot.les.max,basis+eigen);
}
function vrijePlaatsen(slot){return slot.les.max-bezetting(slot);}
function isVoorbij(slot){return slot.start.getTime()<Date.now();}

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
function getBookings(){return load('living_bookings',[]);}
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
