/* Maakt rooster.ics (agenda-abonnement voor Google Calendar, Apple, Outlook).
   Het rooster komt uit de database (Beheer → Rooster); lukt dat niet, dan uit assets/boeken.js.
   Gebruik: node tools/maak-agenda.js
   Dit gebeurt ook automatisch via GitHub Actions (elke 2 uur en bij een wijziging van boeken.js). */
var fs=require('fs'),path=require('path'),vm=require('vm');
var root=path.join(__dirname,'..');
var ctx={window:{}};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'assets/boeken.js'),'utf8'),ctx);
var LESSEN=vm.runInContext('LESSEN',ctx),ROOSTER=vm.runInContext('ROOSTER',ctx);

(async function(){
try{
  var url=vm.runInContext('SUPABASE_URL',ctx),key=vm.runInContext('SUPABASE_KEY',ctx);
  var res=await fetch(url+'/rest/v1/instellingen?select=config&id=eq.1',{headers:{apikey:key}});
  if(!res.ok)throw new Error('HTTP '+res.status);
  var d=await res.json();
  if(!d[0]||!d[0].config||!d[0].config.rooster)throw new Error('geen rooster');
  vm.runInContext('zetRooster('+JSON.stringify(d[0].config.rooster)+')',ctx);
  console.log('Rooster uit de database');
}catch(e){console.log('Database niet bereikbaar ('+e.message+'): reserverooster uit assets/boeken.js');}

var SITE='https://pieterrvds.github.io/De-Living-/';
var ADRES='La Vie en Rose, Hoogstraat 40, 9308 Aalst';
var BEGIN=[2026,9,28];                      // maandag waarop de reeks start (vast, zodat het bestand enkel wijzigt als het rooster wijzigt)
var BYDAY=['SU','MO','TU','WE','TH','FR','SA'];

function pad(n){return(n<10?'0':'')+n;}
function esc(s){return String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');}
// Regels van max. 75 bytes (iCalendar-standaard), zonder tekens te splitsen
function vouw(regel){
  var uit=[],huidig='',bytes=0;
  for(var ch of regel){var b=Buffer.byteLength(ch);
    if(bytes+b>(uit.length?74:75)){uit.push(huidig);huidig='';bytes=0;}
    huidig+=ch;bytes+=b;}
  uit.push(huidig);return uit.join('\r\n ');
}
function lokaal(dag,tijd){var p=tijd.split(':');return dag.getUTCFullYear()+pad(dag.getUTCMonth()+1)+pad(dag.getUTCDate())+'T'+pad(+p[0])+pad(+p[1])+'00';}
function eind(tijd,duur){var p=tijd.split(':'),m=+p[0]*60+ +p[1]+duur;return pad(Math.floor(m/60))+':'+pad(m%60);}

var r=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//La Vie en Rose//Lessenrooster//NL','CALSCALE:GREGORIAN','METHOD:PUBLISH',
  'X-WR-CALNAME:La Vie en Rose – Lessenrooster','X-WR-CALDESC:Wekelijkse lessen in La Vie en Rose\\, Aalst. Boeken via '+SITE+'boeken.html',
  'X-WR-TIMEZONE:Europe/Brussels','REFRESH-INTERVAL;VALUE=DURATION:PT12H','X-PUBLISHED-TTL:PT12H',
  'BEGIN:VTIMEZONE','TZID:Europe/Brussels',
  'BEGIN:DAYLIGHT','TZOFFSETFROM:+0100','TZOFFSETTO:+0200','TZNAME:CEST','DTSTART:19700329T020000','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU','END:DAYLIGHT',
  'BEGIN:STANDARD','TZOFFSETFROM:+0200','TZOFFSETTO:+0100','TZNAME:CET','DTSTART:19701025T030000','RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU','END:STANDARD',
  'END:VTIMEZONE'];
var stempel=BEGIN[0]+pad(BEGIN[1])+pad(BEGIN[2])+'T000000Z';
Object.keys(ROOSTER).sort().forEach(function(dow){
  var dag=new Date(Date.UTC(BEGIN[0],BEGIN[1]-1,BEGIN[2]));
  while(dag.getUTCDay()!==+dow)dag.setUTCDate(dag.getUTCDate()+1);
  ROOSTER[dow].forEach(function(item){
    var tijd=item[0],id=item[1],les=LESSEN[id];
    // "binnenkort"-lessen en lessen in een gesloten periode staan niet in de agenda
    if(vm.runInContext('isBinnenkort("'+id+'")',ctx))return;
    if(vm.runInContext('weekdagGesloten('+(+dow)+',naarMin("'+tijd+'"),naarMin("'+tijd+'")+'+les.duur+')',ctx))return;
    r.push('BEGIN:VEVENT',
      'UID:lvr-'+id+'-'+BYDAY[dow].toLowerCase()+'-'+tijd.replace(':','')+'@pieterrvds.github.io',
      'DTSTAMP:'+stempel,
      'DTSTART;TZID=Europe/Brussels:'+lokaal(dag,tijd),
      'DTEND;TZID=Europe/Brussels:'+lokaal(dag,eind(tijd,les.duur)),
      'RRULE:FREQ=WEEKLY;BYDAY='+BYDAY[dow],
      'SUMMARY:'+esc(les.icon+' '+vm.runInContext('lesNaam',ctx)(id,vm.runInContext('stijlVan',ctx)(item))+' – '+vm.runInContext('lesgeverVan',ctx)(item)),
      'DESCRIPTION:'+esc(les.soort+' · € '+les.prijs+' · max. '+les.max+(les.max>1?' personen':' persoon')+'\nReserveer je plaats: '+SITE+'boeken.html'),
      'LOCATION:'+esc(ADRES),
      'URL:'+SITE+'boeken.html',
      'TRANSP:TRANSPARENT',
      'END:VEVENT');
  });
});
r.push('END:VCALENDAR');
fs.writeFileSync(path.join(root,'rooster.ics'),r.map(vouw).join('\r\n')+'\r\n');
console.log('rooster.ics gemaakt ('+r.filter(function(x){return x==='BEGIN:VEVENT';}).length+' lessen per week)');
})();
