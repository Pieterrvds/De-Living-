/* La Vie en Rose – weekrooster aanpassen met de muis (of vinger): slepen, toevoegen, verwijderen.
   Gebruikt door beheer.html (beheerder: alle lessen) en account.html (lesgever: eigen uren).
   Wijzigingen blijven een ontwerp tot de pagina ze publiceert (opties.publiceer).

   var ed=new RoosterEditor({
     el:'id van de container', rooster:{…},
     lessen:['yoga',…],                     // lessen in de balk / bij toevoegen
     magBewerken:function(item){…},         // mag dit uur verschoven worden? (anders grijs)
     eigenaar:{tid,tnaam}|null,             // eigenaar van nieuwe uren
     lesgevers:function(les){return [{id,naam}]}|null,   // beheerder: lesgever kiezen
     publiceer:function(rooster,ed){…},     // pagina slaat op en roept daarna ed.laad(rooster)
     naWijziging:function(){…}              // bv. teller in een tabblad bijwerken
   });                                                                                          */
var RE_DAGVOLG=[1,2,3,4,5,6,0],RE_PPM=1,RE_SNAP=15;
var RE_START=Math.min.apply(null,Object.keys(OPENINGSUREN).map(function(d){return naarMin(OPENINGSUREN[d][0]);}));
var RE_EIND=Math.max.apply(null,Object.keys(OPENINGSUREN).map(function(d){return naarMin(OPENINGSUREN[d][1]);}));
function tijdTekst(m){return pad(Math.floor(m/60))+':'+pad(m%60);}

function RoosterEditor(o){
  var ed=this;ed.o=o;ed.volg=0;ed.terug=[];ed.vooruit=[];ed.sleep=null;ed.geenKlik=false;ed.bewerkUid=null;
  RoosterEditor.zorgVoorExtra();
  ed.laad(o.rooster);
  document.addEventListener('keydown',function(e){
    if(!ed.zichtbaar())return;
    if(e.key==='Escape')return ed.sluit();
    if(RoosterEditor.venster().classList.contains('open')||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    var k=e.key.toLowerCase();
    if((e.ctrlKey||e.metaKey)&&k==='z'&&!e.shiftKey){e.preventDefault();ed.ongedaan();}
    else if((e.ctrlKey||e.metaKey)&&(k==='y'||(k==='z'&&e.shiftKey))){e.preventDefault();ed.opnieuw();}
  });
  window.addEventListener('beforeunload',function(e){if(ed.aantal()){e.preventDefault();e.returnValue='';}});
}
// Prullenbak en venster één keer per pagina
RoosterEditor.zorgVoorExtra=function(){
  if(document.getElementById('rePrul'))return;
  document.body.insertAdjacentHTML('beforeend','<div class="re-prul" id="rePrul">🗑️ Sleep hierheen om te verwijderen</div>'+
    '<div class="re-modal-bg" id="reModal"><div class="re-modal" id="reModalInhoud" role="dialog" aria-modal="true"></div></div>');
  document.getElementById('reModal').addEventListener('click',function(e){if(e.target===this)this.classList.remove('open');});
};
RoosterEditor.venster=function(){return document.getElementById('reModal');};

var RE=RoosterEditor.prototype;
RE.zichtbaar=function(){return !!document.getElementById(this.o.el);};
RE.laad=function(rooster){
  var ed=this,l=[];
  Object.keys(rooster||{}).forEach(function(d){(rooster[d]||[]).forEach(function(x){
    if(LESSEN[x[1]])l.push({uid:++ed.volg,dow:+d,min:naarMin(x[0]),les:x[1],tid:x[2]||'',tnaam:x[3]||''});});});
  ed.orig=l;ed.werk=l.map(function(x){return Object.assign({},x);});ed.terug=[];ed.vooruit=[];
  ed.origRooster=ed.naarRooster(ed.orig);
};
RE.naarRooster=function(lijst){
  var r={};(lijst||this.werk).slice().sort(function(a,b){return a.min-b.min;}).forEach(function(x){
    (r[x.dow]=r[x.dow]||[]).push(x.tid?[tijdTekst(x.min),x.les,x.tid,x.tnaam]:[tijdTekst(x.min),x.les]);});
  return r;
};
RE.zoek=function(uid){return this.werk.find(function(x){return x.uid===uid;});};
RE.mag=function(x){return !this.o.magBewerken||this.o.magBewerken(x);};
RE.lesgever=function(x){return x.tnaam||LESSEN[x.les].trainer;};
RE.stap=function(){this.terug.push(JSON.stringify(this.werk));if(this.terug.length>100)this.terug.shift();this.vooruit=[];};
RE.ververs=function(){if(this.o.naWijziging)this.o.naWijziging();this.teken();};
RE.ongedaan=function(){if(!this.terug.length)return;this.vooruit.push(JSON.stringify(this.werk));this.werk=JSON.parse(this.terug.pop());this.ververs();};
RE.opnieuw=function(){if(!this.vooruit.length)return;this.terug.push(JSON.stringify(this.werk));this.werk=JSON.parse(this.vooruit.pop());this.ververs();};
RE.terugzetten=function(){if(!this.aantal()||!confirm('Alle wijzigingen sinds de laatste publicatie wissen?'))return;this.stap();this.werk=this.orig.map(function(x){return Object.assign({},x);});this.ververs();};
RE.anders=function(a,x){return a.dow!==x.dow||a.min!==x.min||a.les!==x.les||a.tid!==x.tid;};
RE.aantal=function(){
  var ed=this,o={},w={};ed.orig.forEach(function(x){o[x.uid]=x;});ed.werk.forEach(function(x){w[x.uid]=x;});
  return ed.werk.filter(function(x){return !o[x.uid]||ed.anders(o[x.uid],x);}).length+ed.orig.filter(function(x){return !w[x.uid];}).length;
};
RE.gewijzigd=function(x){var a=this.orig.find(function(o){return o.uid===x.uid;});return !a||this.anders(a,x);};
// Kan les 'les' op dag 'dow' om 'min' staan? Geeft de reden terug als dat niet kan.
RE.probleem=function(dow,min,les,uid){
  var e=min+LESSEN[les].duur,o=OPENINGSUREN[dow];
  if(!o||min<naarMin(o[0])||e>naarMin(o[1]))return 'Buiten de openingsuren ('+(o?o[0]+' – '+o[1]:'gesloten')+')';
  if(weekdagGesloten(dow,min,e))return 'In een gesloten periode';
  var x=this.werk.find(function(x){return x.uid!==uid&&x.dow===dow&&x.min<e&&x.min+LESSEN[x.les].duur>min;});
  return x?'Overlapt met '+LESSEN[x.les].naam+' om '+tijdTekst(x.min):'';
};

RE.teken=function(){
  var ed=this,el=document.getElementById(ed.o.el);if(!el)return;
  var n=ed.aantal(),hoogte=(RE_EIND-RE_START)*RE_PPM;
  var h='<div class="re-balk"><div class="re-palet"><span>Sleep een les in de kalender:</span>'+ed.o.lessen.map(function(k){
      return '<button class="re-chip les-'+k+'" data-les="'+k+'" title="Sleep naar een dag en uur, of klik om toe te voegen">'+LESSEN[k].icon+' '+esc(LESSEN[k].kort||LESSEN[k].naam)+'<small>'+LESSEN[k].duur+' min</small></button>';}).join('')+'</div>'+
    '<div class="re-acties"><span class="re-status'+(n?' open':'')+'">'+(n?n+' niet-gepubliceerde wijziging'+(n>1?'en':''):'✓ Gepubliceerd')+'</span>'+
    '<button class="knop rond" data-actie="ongedaan" title="Ongedaan maken (Ctrl+Z)" aria-label="Ongedaan maken"'+(ed.terug.length?'':' disabled')+'>↶</button>'+
    '<button class="knop rond" data-actie="opnieuw" title="Opnieuw (Ctrl+Y)" aria-label="Opnieuw"'+(ed.vooruit.length?'':' disabled')+'>↷</button>'+
    '<button class="knop" data-actie="terugzetten"'+(n?'':' disabled')+'>Terugzetten</button>'+
    '<button class="knop groen" data-actie="publiceer"'+(n?'':' disabled')+'>💾 Publiceren</button></div></div>'+
    '<p class="re-hulp">Sleep een les om ze te <b>verplaatsen</b> (per kwartier) · sleep naar 🗑️ of druk <b>Delete</b> om te <b>verwijderen</b> · <b>dubbelklik</b> op een leeg vak of klik op een les hierboven om <b>toe te voegen</b> · klik op een les om ze te <b>wijzigen</b>. '+
    (ed.o.hulp||'')+'Pas na <b>Publiceren</b> ziet iedereen het nieuwe rooster.</p>';
  h+='<div class="re-wrap"><div class="re-grid"><div class="re-kop"></div>'+RE_DAGVOLG.map(function(d){
    var k=ed.werk.filter(function(x){return x.dow===d;}).length;
    return '<div class="re-kop">'+DAGEN[d]+'<small>'+(k?k+' les'+(k>1?'sen':''):'geen lessen')+'</small></div>';}).join('');
  h+='<div class="re-as" style="height:'+hoogte+'px">';
  for(var m=RE_START+60;m<RE_EIND;m+=60)h+='<div style="top:'+(m-RE_START)*RE_PPM+'px">'+tijdTekst(m)+'</div>';
  h+='</div>'+RE_DAGVOLG.map(function(d){
    var c='<div class="re-kol" data-dow="'+d+'" style="height:'+hoogte+'px">',o=OPENINGSUREN[d],dicht=[];
    if(!o)dicht.push([RE_START,RE_EIND,'Gesloten']);
    else{dicht.push([RE_START,naarMin(o[0]),'']);dicht.push([naarMin(o[1]),RE_EIND,'Dicht']);}
    (GESLOTEN[d]||[]).forEach(function(g){dicht.push([naarMin(g[0]),Math.min(naarMin(g[1]),RE_EIND),'Gesloten']);});
    dicht.forEach(function(g){var a=Math.max(g[0],RE_START),b=Math.min(g[1],RE_EIND);if(b>a)c+='<div class="re-dicht" style="top:'+(a-RE_START)*RE_PPM+'px;height:'+(b-a)*RE_PPM+'px">'+(b-a>=45?g[2]:'')+'</div>';});
    ed.werk.filter(function(x){return x.dow===d;}).forEach(function(x){
      var l=LESSEN[x.les],mag=ed.mag(x),wie=ed.lesgever(x);
      c+='<button class="re-blok les-'+x.les+(ed.gewijzigd(x)?' nieuw':'')+(mag?'':' vast')+'" data-uid="'+x.uid+'" style="top:'+(x.min-RE_START)*RE_PPM+'px;height:'+l.duur*RE_PPM+'px" '+
        'title="'+esc(l.naam+' · '+tijdTekst(x.min)+' – '+tijdTekst(x.min+l.duur)+' · '+wie+(mag?'':' (niet van jou)'))+'" aria-label="'+esc(l.naam+' op '+DAGEN[d]+' om '+tijdTekst(x.min)+' met '+wie)+'">'+
        '<b>'+l.icon+' '+esc(l.kort||l.naam)+'</b><span>'+tijdTekst(x.min)+' – '+tijdTekst(x.min+l.duur)+'</span><small>'+esc(wie)+(isBinnenkort(x.les)?' · binnenkort':'')+'</small></button>';
    });
    return c+'</div>';
  }).join('')+'</div></div>';
  el.innerHTML=h;
  ed.koppel(el);
};

/* Slepen met muis of vinger (pointer events) */
RE.koppel=function(el){
  var ed=this;
  el.querySelectorAll('[data-actie]').forEach(function(b){b.addEventListener('click',function(){
    var a=b.dataset.actie;if(a==='publiceer')ed.o.publiceer(ed.naarRooster(),ed);else ed[a]();});});
  el.querySelectorAll('.re-blok,.re-chip').forEach(function(b){
    var vast=b.classList.contains('vast');
    if(!vast)b.addEventListener('pointerdown',function(e){ed.start(e);});
    b.addEventListener('click',function(){
      if(ed.geenKlik){ed.geenKlik=false;return;}
      if(b.dataset.uid){var x=ed.zoek(+b.dataset.uid);if(vast)showToast('Dit uur is van '+ed.lesgever(x)+'. Je kan enkel je eigen uren verschuiven.');else ed.openBewerk(x.uid);}
      else ed.openNieuw(b.dataset.les);
    });
    if(b.dataset.uid&&!vast)b.addEventListener('keydown',function(e){ed.toets(e);});
  });
  el.querySelectorAll('.re-kol').forEach(function(k){
    k.addEventListener('dblclick',function(e){
      if(e.target!==k&&!e.target.classList.contains('re-dicht'))return;
      var r=k.getBoundingClientRect(),min=RE_START+Math.floor((e.clientY-r.top)/RE_PPM/RE_SNAP)*RE_SNAP;
      ed.openNieuw(null,+k.dataset.dow,min);
    });
  });
};
RE.start=function(e){
  if(e.button!==0)return;
  var ed=this,el=e.currentTarget,uid=el.dataset.uid?+el.dataset.uid:null,x=uid&&ed.zoek(uid),les=x?x.les:el.dataset.les;
  var grijp=x?Math.max(0,(e.clientY-el.getBoundingClientRect().top)/RE_PPM):Math.min(15,LESSEN[les].duur/2);
  var beweeg=function(ev){ed.beweeg(ev);},stop=function(ev){
    el.removeEventListener('pointermove',beweeg);el.removeEventListener('pointerup',stop);el.removeEventListener('pointercancel',stop);ed.stop(ev);};
  ed.sleep={el:el,uid:uid,les:les,grijp:grijp,x0:e.clientX,y0:e.clientY,bezig:false,doel:null};
  try{el.setPointerCapture(e.pointerId);}catch(_){}
  el.addEventListener('pointermove',beweeg);el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);
};
RE.beweeg=function(e){
  var ed=this,s=ed.sleep;if(!s)return;
  if(!s.bezig){
    if(Math.abs(e.clientX-s.x0)+Math.abs(e.clientY-s.y0)<6)return;
    s.bezig=true;document.body.classList.add('re-slepen');if(s.uid)s.el.classList.add('weg');
  }
  e.preventDefault();
  if(e.clientY<70)window.scrollBy(0,-14);else if(e.clientY>window.innerHeight-70)window.scrollBy(0,14);
  var prul=document.getElementById('rePrul'),pr=prul.getBoundingClientRect();
  var opPrul=!!s.uid&&e.clientX>=pr.left&&e.clientX<=pr.right&&e.clientY>=pr.top-10&&e.clientY<=pr.bottom+10;
  prul.classList.toggle('actief',opPrul);
  var oud=document.querySelector('.re-ghost');if(oud)oud.remove();
  s.doel=null;
  if(opPrul){s.doel={prul:true};return;}
  var kol=[].slice.call(document.querySelectorAll('#'+ed.o.el+' .re-kol')).find(function(k){var r=k.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<r.right&&e.clientY>=r.top-40&&e.clientY<=r.bottom+40;});
  if(!kol)return;
  var r=kol.getBoundingClientRect(),duur=LESSEN[s.les].duur;
  var min=Math.round((RE_START+(e.clientY-r.top)/RE_PPM-s.grijp)/RE_SNAP)*RE_SNAP;
  min=Math.max(RE_START,Math.min(RE_EIND-duur,min));
  var dow=+kol.dataset.dow,fout=ed.probleem(dow,min,s.les,s.uid);
  s.doel={dow:dow,min:min,fout:fout};
  var g=document.createElement('div');g.className='re-ghost'+(fout?' fout':'');
  g.style.top=(min-RE_START)*RE_PPM+'px';g.style.height=duur*RE_PPM+'px';
  g.textContent=fout?'✕ '+fout:tijdTekst(min)+' – '+tijdTekst(min+duur);
  kol.appendChild(g);
};
RE.stop=function(e){
  var ed=this,s=ed.sleep;ed.sleep=null;if(!s)return;
  document.body.classList.remove('re-slepen');document.getElementById('rePrul').classList.remove('actief');
  var g=document.querySelector('.re-ghost');if(g)g.remove();
  s.el.classList.remove('weg');
  if(!s.bezig)return;            // gewone klik: het click-event opent het venster
  ed.geenKlik=true;setTimeout(function(){ed.geenKlik=false;},0);
  if(e.type==='pointercancel'||!s.doel)return;
  if(s.doel.prul){ed.verwijder(s.uid);return;}
  if(s.doel.fout){showToast('⚠️ '+s.doel.fout);return;}
  ed.stap();
  if(s.uid){var x=ed.zoek(s.uid);x.dow=s.doel.dow;x.min=s.doel.min;}
  else ed.werk.push(ed.nieuwItem(s.doel.dow,s.doel.min,s.les));
  ed.ververs();
};
RE.nieuwItem=function(dow,min,les){var e=this.o.eigenaar;return {uid:++this.volg,dow:dow,min:min,les:les,tid:e?e.tid:'',tnaam:e?e.tnaam:''};};
RE.verwijder=function(uid){
  var x=this.zoek(uid);if(!x)return;
  this.stap();this.werk=this.werk.filter(function(i){return i.uid!==uid;});
  this.ververs();showToast('🗑️ '+LESSEN[x.les].naam+' ('+DAGEN[x.dow].toLowerCase()+' '+tijdTekst(x.min)+') verwijderd · Ctrl+Z om terug te zetten');
};
// Toetsenbord op een les: pijltjes verplaatsen, Delete verwijdert
RE.toets=function(e){
  var ed=this,uid=+e.currentTarget.dataset.uid,x=ed.zoek(uid);if(!x)return;
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();ed.verwijder(uid);return;}
  var dow=x.dow,min=x.min,i=RE_DAGVOLG.indexOf(dow);
  if(e.key==='ArrowUp')min-=RE_SNAP;else if(e.key==='ArrowDown')min+=RE_SNAP;
  else if(e.key==='ArrowLeft')dow=RE_DAGVOLG[(i+6)%7];else if(e.key==='ArrowRight')dow=RE_DAGVOLG[(i+1)%7];else return;
  e.preventDefault();
  var f=ed.probleem(dow,min,x.les,uid);if(f){showToast('⚠️ '+f);return;}
  ed.stap();x.dow=dow;x.min=min;ed.ververs();
  var b=document.querySelector('#'+ed.o.el+' .re-blok[data-uid="'+uid+'"]');if(b)b.focus();
};

/* Venster: les toevoegen of wijzigen */
RE.venster=function(html){document.getElementById('reModalInhoud').innerHTML=html;RoosterEditor.venster().classList.add('open');};
RE.sluit=function(){RoosterEditor.venster().classList.remove('open');};
RE.openNieuw=function(les,dow,min){
  var ed=this;ed.bewerkUid=null;les=les||ed.o.lessen[0];
  if(dow==null){   // eerste vrije plaats vanaf maandag
    outer:for(var i=0;i<7;i++)for(var m=RE_START;m<RE_EIND;m+=RE_SNAP)if(!ed.probleem(RE_DAGVOLG[i],m,les)){dow=RE_DAGVOLG[i];min=m;break outer;}
    if(dow==null){dow=1;min=naarMin(OPENINGSUREN[1][0]);}
  }
  var e=ed.o.eigenaar;ed.toonVenster('Les toevoegen',{les:les,dow:dow,min:min,tid:e?e.tid:''});
};
RE.openBewerk=function(uid){var x=this.zoek(uid);if(!x)return;this.bewerkUid=uid;this.toonVenster('Les wijzigen',x);};
RE.toonVenster=function(titel,x){
  var ed=this,lessen=ed.o.lessen.indexOf(x.les)<0?ed.o.lessen.concat([x.les]):ed.o.lessen;
  ed.venster('<h2 class="card-title">'+titel+'</h2>'+
    '<div class="fg"><label for="re-les">Les</label><select id="re-les">'+lessen.map(function(k){
      return '<option value="'+k+'"'+(k===x.les?' selected':'')+'>'+LESSEN[k].icon+' '+esc(LESSEN[k].naam)+' · '+LESSEN[k].duur+' min</option>';}).join('')+'</select></div>'+
    (ed.o.lesgevers?'<div class="fg"><label for="re-wie">Lesgever</label><select id="re-wie"></select></div>':'')+
    '<div class="m-rij"><div class="fg"><label for="re-dag">Dag</label><select id="re-dag">'+RE_DAGVOLG.map(function(d){return '<option value="'+d+'"'+(d===x.dow?' selected':'')+'>'+DAGEN[d]+'</option>';}).join('')+'</select></div>'+
    '<div class="fg"><label for="re-uur">Start</label><select id="re-uur">'+(function(){var s='';for(var m=RE_START;m<RE_EIND;m+=RE_SNAP)s+='<option value="'+m+'"'+(m===x.min?' selected':'')+'>'+tijdTekst(m)+'</option>';return s;})()+'</select></div></div>'+
    '<div class="m-fout" id="re-fout"></div><div class="m-knoppen">'+
    (ed.bewerkUid?'<button class="knop rood" id="re-weg">🗑️ Verwijderen</button>':'')+
    '<button class="knop" id="re-annuleer">Annuleren</button><button class="knop groen" id="re-ok">'+(ed.bewerkUid?'✓ Wijzigen':'+ Toevoegen')+'</button></div>');
  var vulWie=function(tid){
    var s=document.getElementById('re-wie');if(!s)return;var les=document.getElementById('re-les').value;
    var l=ed.o.lesgevers(les),h='<option value="">Zonder account (toont „'+esc(LESSEN[les].trainer)+'”)</option>';
    if(tid&&!l.some(function(p){return p.id===tid;}))l=l.concat([{id:tid,naam:x.tnaam||'?'}]);
    s.innerHTML=h+l.map(function(p){return '<option value="'+p.id+'"'+(p.id===tid?' selected':'')+'>'+esc(p.naam)+'</option>';}).join('');
  };
  vulWie(x.tid);
  ['re-les','re-dag','re-uur','re-wie'].forEach(function(id){var s=document.getElementById(id);if(s)s.addEventListener('change',function(){if(id==='re-les')vulWie(document.getElementById('re-wie')&&document.getElementById('re-wie').value);ed.vensterCheck();});});
  document.getElementById('re-annuleer').onclick=function(){ed.sluit();};
  document.getElementById('re-ok').onclick=function(){ed.vensterOk();};
  if(ed.bewerkUid)document.getElementById('re-weg').onclick=function(){var u=ed.bewerkUid;ed.sluit();ed.verwijder(u);};
  ed.vensterCheck();document.getElementById('re-les').focus();
};
RE.vensterWaarden=function(){var w=document.getElementById('re-wie');return {les:document.getElementById('re-les').value,dow:+document.getElementById('re-dag').value,min:+document.getElementById('re-uur').value,wie:w?w.value:null};};
RE.vensterCheck=function(){
  var v=this.vensterWaarden(),f=this.probleem(v.dow,v.min,v.les,this.bewerkUid),el=document.getElementById('re-fout');
  el.textContent=f?'✕ '+f:'✓ '+DAGEN[v.dow]+' '+tijdTekst(v.min)+' – '+tijdTekst(v.min+LESSEN[v.les].duur);
  el.style.color=f?'':'var(--sage)';
  document.getElementById('re-ok').disabled=!!f;
};
RE.vensterOk=function(){
  var ed=this,v=ed.vensterWaarden();if(ed.probleem(v.dow,v.min,v.les,ed.bewerkUid))return;
  ed.stap();
  var x=ed.bewerkUid?ed.zoek(ed.bewerkUid):ed.nieuwItem(v.dow,v.min,v.les);
  x.les=v.les;x.dow=v.dow;x.min=v.min;
  if(v.wie!==null){   // beheerder koos een lesgever
    var p=v.wie&&ed.o.lesgevers(v.les).find(function(p){return p.id===v.wie;});
    x.tid=v.wie||'';x.tnaam=p?p.naam:(v.wie?x.tnaam:'');
  }
  if(!ed.bewerkUid)ed.werk.push(x);
  ed.sluit();ed.ververs();
};
