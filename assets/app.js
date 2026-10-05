/* La Vie en Rose – installeerbare app (PWA). Op elke pagina geladen (in <head>, met defer).
   - registreert de service worker (sw.js: werkt ook even zonder internet)
   - in de geïnstalleerde app: tabbalk onderaan (Start, Yoga, Huren, Mijn), zoals op de gsm gewoon is
   - op de website: knop "Installeer de app" (Android: meteen; iPhone: korte uitleg met de Deel-knop)
   Zelf oproepen: installeerApp() (bv. vanuit een knop). */
(function(){
  var standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
  var ua=navigator.userAgent||'';
  var ios=/iphone|ipad|ipod/i.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
  var iosSafari=ios&&/Safari/i.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  var uitgesteld=null;   // Android/Chrome: het installatievenster van de browser

  if('serviceWorker' in navigator&&location.protocol!=='file:'){
    window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){});});
  }
  if(standalone)document.documentElement.classList.add('app-modus');

  function bewaar(k,v){try{localStorage.setItem(k,v);}catch(e){}}
  function lees(k){try{return localStorage.getItem(k);}catch(e){return null;}}

  var CSS=
    /* tabbalk in de app */
    'html.app-modus body{padding-bottom:calc(84px + env(safe-area-inset-bottom));}'+
    'html.app-modus .wa,html.app-modus .yoga-balk,html.app-modus .cursor,html.app-modus .cursor-ring,html.app-modus #petalCanvas{display:none!important;}'+
    '[data-app-installeer][hidden]{display:none!important;}'+
    /* in de app enkel de tabbalk onderaan: de menubalk bovenaan valt weg en de pagina schuift op */
    'html.app-modus #nav,html.app-modus #mobMenu,html.app-modus .progress-bar,html.app-modus footer{display:none!important;}'+
    'html.app-modus .yg,html.app-modus .hu,html.app-modus .st{padding-top:calc(22px + env(safe-area-inset-top))!important;}'+
    'html.app-modus .page-hero{padding-top:calc(3.5rem + env(safe-area-inset-top))!important;}'+
    '.app-tabs{position:fixed;left:0;right:0;bottom:0;z-index:1100;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));height:calc(70px + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom);background:#fff;border-top:1px solid rgba(61,32,7,.12);box-shadow:0 -6px 24px rgba(61,32,7,.06);font-family:Nunito,system-ui,sans-serif;}'+
    '.app-tabs a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-decoration:none;color:#6E5641;font-size:13px;font-weight:700;-webkit-tap-highlight-color:transparent;}'+
    '.app-tabs a[aria-current]{color:#3F6B34;font-weight:800;}'+
    '.app-tabs svg{width:26px;height:26px;}'+
    /* installatiekaart */
    '.app-inst{position:fixed;left:12px;right:12px;bottom:12px;z-index:1150;max-width:460px;margin:0 auto;background:#fff;border:2px solid rgba(61,32,7,.14);border-radius:20px;box-shadow:0 14px 40px rgba(40,20,5,.25);padding:14px 14px 14px 16px;display:flex;align-items:center;gap:12px;font-family:Nunito,system-ui,sans-serif;color:#2E1A08;}'+
    '.app-inst img{width:52px;height:52px;border-radius:14px;flex-shrink:0;}'+
    '.app-inst b{display:block;font-size:1.02rem;}.app-inst span{font-size:.92rem;color:#5C3314;}'+
    '.app-inst .ja{margin-left:auto;flex-shrink:0;min-height:46px;padding:0 16px;border:none;border-radius:14px;background:#3F6B34;color:#fff;font-weight:800;font-size:1rem;font-family:inherit;cursor:pointer;}'+
    '.app-inst .nee{position:absolute;top:-10px;right:-6px;width:32px;height:32px;border-radius:50%;border:2px solid rgba(61,32,7,.15);background:#fff;color:#5C3314;font-size:1.1rem;line-height:1;cursor:pointer;}'+
    '.app-uitleg-bg{position:fixed;inset:0;z-index:1300;background:rgba(40,20,5,.55);display:flex;align-items:flex-end;justify-content:center;}'+
    '.app-uitleg{background:#FDF8EE;width:100%;max-width:520px;border-radius:26px 26px 0 0;padding:22px 20px calc(22px + env(safe-area-inset-bottom));font-family:Nunito,system-ui,sans-serif;font-size:1.12rem;line-height:1.5;color:#2E1A08;}'+
    '.app-uitleg h2{font-family:"Playfair Display",Georgia,serif;font-size:1.6rem;margin:0 0 .6rem;}'+
    '.app-uitleg ol{margin:.4rem 0 1rem 1.3rem;padding:0;}.app-uitleg li{margin-bottom:.6rem;}'+
    '.app-uitleg .deel{display:inline-flex;vertical-align:-6px;width:30px;height:30px;border-radius:8px;background:#fff;border:1.5px solid rgba(61,32,7,.2);align-items:center;justify-content:center;color:#1D6FE0;}'+
    '.app-uitleg button{width:100%;min-height:58px;border:none;border-radius:16px;background:#3F6B34;color:#fff;font-size:1.1rem;font-weight:800;font-family:inherit;cursor:pointer;}'+
    '@media(max-width:700px){body:has(.yoga-balk) .app-inst{bottom:84px;}}'+
    '@media(min-width:700px){.app-uitleg-bg{align-items:center;}.app-uitleg{border-radius:26px;}}';

  var IC={
    start:'<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    yoga:'<circle cx="12" cy="5" r="2"/><path d="M4 12c3 0 5-2 8-2s5 2 8 2M12 10v5l-4 5M12 15l4 5"/>',
    huren:'<path d="M8 3h8l-1 7a3 3 0 0 1-6 0z"/><path d="M12 13v7M8 21h8"/>',
    massage:'<path d="M12 21c-4-2.5-7-5.5-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 12c0 3.5-3 6.5-7 9z"/><path d="M9 13c1 1 2 1.5 3 1.5s2-.5 3-1.5"/>',
    mijn:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'
  };
  function svg(n){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+IC[n]+'</svg>';}

  function tabbalk(){
    var pagina=(location.pathname.split('/').pop()||'index.html');
    var tabs=[['app.html','start','Start',['app.html','index.html','fotos.html']],['yoga.html','yoga','Yoga',['yoga.html','boeken.html','reserveren.html','betalen.html']],
      ['massage.html','massage','Massage',['massage.html']],['huren.html','huren','Huren',['huren.html']],['account.html','mijn','Mijn',['account.html','login.html','beurten.html','beheer.html']]];
    // een div met role=navigation: de site geeft elk <nav>-element de stijl van de menubalk bovenaan
    var nav=document.createElement('div');nav.className='app-tabs';nav.setAttribute('role','navigation');nav.setAttribute('aria-label','Hoofdmenu');
    nav.innerHTML=tabs.map(function(t){var nu=t[3].indexOf(pagina)>=0;
      return '<a href="'+t[0]+'"'+(nu?' aria-current="page"':'')+'>'+svg(t[1])+t[2]+'</a>';}).join('');
    document.body.appendChild(nav);
  }

  // Installatiekaart: enkel op de gsm-pagina's waar het zin heeft, en niet meer na "nee" (30 dagen)
  var KAART_PAGINAS=['','index.html','yoga.html','massage.html','huren.html','account.html','app.html'];
  function magKaart(){
    if(standalone)return false;
    if(KAART_PAGINAS.indexOf(location.pathname.split('/').pop())<0)return false;
    var nee=+lees('lvr-app-nee')||0;return Date.now()-nee>30*864e5;
  }
  function toonKaart(){
    if(!magKaart()||document.querySelector('.app-inst'))return;
    var d=document.createElement('div');d.className='app-inst';d.setAttribute('role','dialog');d.setAttribute('aria-label','App installeren');
    d.innerHTML='<img src="icons/roos-192.png" alt=""><div><b>Zet onze app op je gsm</b><span>Sneller reserveren, met één tik.</span></div>'+
      '<button class="ja" type="button">Installeer</button><button class="nee" type="button" aria-label="Nee, bedankt">×</button>';
    d.querySelector('.ja').onclick=function(){installeerApp();};
    d.querySelector('.nee').onclick=function(){bewaar('lvr-app-nee',String(Date.now()));d.remove();};
    // boven de groene yogaknop en de WhatsApp-knop
    document.body.appendChild(d);
  }
  function uitlegIphone(){
    var bg=document.createElement('div');bg.className='app-uitleg-bg';
    bg.innerHTML='<div class="app-uitleg" role="dialog" aria-modal="true" aria-labelledby="appUitlegT"><h2 id="appUitlegT">App op je iPhone zetten</h2><ol>'+
      '<li>Tik onderaan in Safari op de knop <b>Delen</b> <span class="deel" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg></span></li>'+
      '<li>Scroll een beetje en tik op <b>Zet op beginscherm</b>.</li><li>Tik rechtsboven op <b>Voeg toe</b>.</li></ol>'+
      '<p>Daarna staat La Vie en Rose als app tussen je andere apps.</p><button type="button">Begrepen</button></div>';
    bg.addEventListener('click',function(e){if(e.target===bg||e.target.tagName==='BUTTON')bg.remove();});
    document.body.appendChild(bg);
  }
  window.installeerApp=function(){
    if(uitgesteld){
      uitgesteld.prompt();
      uitgesteld.userChoice.then(function(k){if(k&&k.outcome==='accepted'){var d=document.querySelector('.app-inst');if(d)d.remove();}uitgesteld=null;});
    }else if(ios)uitlegIphone();
    else alert('Open deze website in Chrome (Android) of Safari (iPhone) en kies in het menu "App installeren" of "Zet op beginscherm".');
  };
  window.appKanInstalleren=function(){return !standalone&&(!!uitgesteld||ios);};
  // knoppen met data-app-installeer enkel tonen als installeren kan
  function knoppen(){document.querySelectorAll('[data-app-installeer]').forEach(function(el){el.hidden=!appKanInstalleren();});}
  window.appKnoppen=knoppen;

  window.addEventListener('beforeinstallprompt',function(e){
    e.preventDefault();uitgesteld=e;
    if(document.body){toonKaart();knoppen();}
    document.dispatchEvent(new Event('app-installeerbaar'));
  });
  window.addEventListener('appinstalled',function(){var d=document.querySelector('.app-inst');if(d)d.remove();uitgesteld=null;knoppen();});

  /* ── MELDINGEN OP DE GSM ──
     Meldingen.toon(element) tekent een kaartje om meldingen aan/uit te zetten (Mijn account, startscherm).
     Op een iPhone kan dit enkel in de geïnstalleerde app (iOS 16.4 of nieuwer). */
  function naarBytes(b64){var p='='.repeat((4-b64.length%4)%4),r=atob((b64+p).replace(/-/g,'+').replace(/_/g,'/'));
    var u=new Uint8Array(r.length);for(var i=0;i<r.length;i++)u[i]=r.charCodeAt(i);return u;}
  function zelfdeSleutel(s,k){try{var a=new Uint8Array(s.options.applicationServerKey),b=naarBytes(k);
    if(a.length!==b.length)return false;for(var i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}catch(e){return true;}}
  function abonneer(reg,k){
    return reg.pushManager.getSubscription().then(function(s){
      if(s&&zelfdeSleutel(s,k))return s;
      return (s?s.unsubscribe():Promise.resolve()).then(function(){
        return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:naarBytes(k)});});
    });
  }
  var Meldingen={
    ondersteund:function(){return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;},
    status:function(){
      if(!this.ondersteund())return Promise.resolve(ios&&!standalone?'installeer':'nee');
      if(Notification.permission==='denied')return Promise.resolve('geblokkeerd');
      if(Notification.permission!=='granted')return Promise.resolve('uit');
      return navigator.serviceWorker.ready.then(function(r){return r.pushManager.getSubscription();}).then(function(s){return s?'aan':'uit';});
    },
    aan:function(){
      // toestemming vragen moet meteen bij de tik gebeuren (iPhone)
      return Notification.requestPermission().then(function(p){
        if(p!=='granted')throw p==='denied'?'Je weigerde meldingen. Zet ze aan in de instellingen van je gsm.':'Je gaf (nog) geen toestemming.';
        return Promise.all([navigator.serviceWorker.ready,DB.push.sleutel()]);
      }).then(function(r){return abonneer(r[0],r[1]);})
        .then(function(s){bewaar('lvr-push-sync',String(Date.now()));return DB.push.bewaar(s);});
    },
    uit:function(){
      return navigator.serviceWorker.ready.then(function(r){return r.pushManager.getSubscription();}).then(function(s){
        if(!s)return;var ep=s.endpoint;
        return s.unsubscribe().then(function(){return DB.push.verwijder(ep).catch(function(){});});
      });
    },
    // bij het openen: het toestel opnieuw doorgeven (één keer per dag), of opnieuw aanmelden als het abonnement verliep
    synchroniseer:function(){
      if(!this.ondersteund()||Notification.permission!=='granted'||!window.DB||!DB.push)return;
      var laatst=+lees('lvr-push-sync')||0;
      navigator.serviceWorker.ready.then(function(r){return r.pushManager.getSubscription().then(function(s){
        if(s&&Date.now()-laatst<864e5)return;
        return DB.push.sleutel().then(function(k){return abonneer(r,k);}).then(function(s2){
          bewaar('lvr-push-sync',String(Date.now()));return DB.push.bewaar(s2);});
      });}).catch(function(){});
    },
    uitleg:function(){
      var u=window.DB&&DB.user,t='Je krijgt een bericht de dag voor je les, als je beurten klaarstaan en als je feest bevestigd is.';
      if(u&&u.isAdmin)t+=' Als beheerder ook bij elke nieuwe aanvraag om het café te huren.';
      if(u&&window.magBeurtenBeheren&&magBeurtenBeheren(u)&&!u.isAdmin)t+=' Als lesgever ook bij elke nieuwe beurtenkaart.';
      return t;
    },
    toon:function(el,opties){
      if(typeof el==='string')el=document.getElementById(el);if(!el)return;
      opties=opties||{};var self=this;
      this.status().then(function(st){
        if(opties.enkelUit&&st!=='uit'){el.innerHTML='';return;}
        var h='<div class="meld-kaart meld-'+st+'"><div class="meld-kop"><span class="meld-ic" aria-hidden="true"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'+(st==='aan'?'':'<path d="M3 3l18 18"/>')+'</svg></span><b>'+
          (st==='aan'?'Meldingen staan aan op deze gsm':'Meldingen op je gsm')+'</b></div>';
        if(st==='aan')h+='<p>'+self.uitleg()+'</p><div class="meld-knoppen"><button type="button" class="meld-knop" data-a="test">Stuur me een testmelding</button><button type="button" class="meld-knop wit" data-a="uit">Uitzetten</button></div>';
        else if(st==='uit')h+='<p>'+self.uitleg()+'</p><div class="meld-knoppen"><button type="button" class="meld-knop" data-a="aan">Meldingen aanzetten</button>'+
          (opties.nietNu?'<button type="button" class="meld-knop wit" data-a="nietnu">Niet nu</button>':'')+'</div>';
        else if(st==='installeer')h+='<p>Op een iPhone werken meldingen enkel in de app. Zet de app eerst op je beginscherm en open hem daar.</p><div class="meld-knoppen"><button type="button" class="meld-knop" data-a="installeer">Installeer de app</button></div>';
        else if(st==='geblokkeerd')h+='<p>Meldingen staan geblokkeerd op deze gsm. Zet ze aan bij <b>Instellingen → Meldingen → La Vie en Rose</b> (of via het slotje naast het adres in je browser).</p>';
        else h+='<p>Deze browser kan geen meldingen tonen. Gebruik Chrome op Android, of de app op een iPhone.</p>';
        el.innerHTML=h+'<p class="meld-fout" role="alert"></p></div>';
        el.querySelectorAll('[data-a]').forEach(function(b){b.onclick=function(){
          var a=b.getAttribute('data-a'),fout=el.querySelector('.meld-fout');fout.textContent='';
          if(a==='installeer')return installeerApp();
          if(a==='nietnu'){bewaar('lvr-meld-nietnu',String(Date.now()));el.innerHTML='';return;}
          b.disabled=true;var oud=b.textContent;b.textContent='Even geduld…';
          var p=a==='aan'?self.aan():a==='uit'?self.uit():DB.push.test();
          p.then(function(){
            if(a==='test'){b.disabled=false;b.textContent=oud;fout.textContent='✓ Verstuurd. Je krijgt zo dadelijk een melding.';fout.className='meld-fout ok';return;}
            if(window.showToast)showToast(a==='aan'?'🔔 Meldingen staan aan':'Meldingen staan uit');
            self.toon(el,opties&&opties.enkelUit?{}:opties);
          }).catch(function(e){b.disabled=false;b.textContent=oud;fout.className='meld-fout';fout.textContent=String(e&&e.message||e);});
        };});
      });
    },
    // startscherm: enkel tonen als ze uit staan en niet net weggeklikt
    magVragen:function(){return Date.now()-(+lees('lvr-meld-nietnu')||0)>14*864e5;}
  };
  window.Meldingen=Meldingen;
  CSS+='.meld-kaart{background:#fff;border:1px solid rgba(30,20,12,.09);border-radius:22px;padding:18px;box-shadow:0 1px 2px rgba(30,20,12,.04),0 6px 20px rgba(30,20,12,.05);font-family:"DM Sans",system-ui,sans-serif;color:#1E140C;font-size:14.5px;line-height:1.5;text-align:left;}'+
    '.meld-kop{display:flex;align-items:center;gap:10px;font-size:15.5px;margin-bottom:4px;}.meld-kop b{font-weight:700;}'+
    '.meld-ic{display:inline-flex;width:34px;height:34px;border-radius:10px;align-items:center;justify-content:center;background:#F6E6E2;color:#B05D59;flex-shrink:0;}'+
    '.meld-aan .meld-ic{background:#E7EFE2;color:#3B6A38;}'+
    '.meld-kaart p{margin:6px 0 0;color:#5B4A3C;}'+
    '.meld-knoppen{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;}'+
    '.meld-knop{flex:1 1 150px;white-space:nowrap;min-height:44px;border:1px solid transparent;border-radius:12px;background:#22160D;color:#fff;font-family:inherit;font-size:14.5px;font-weight:600;cursor:pointer;padding:0 14px;}'+
    '.meld-knop.wit{background:#fff;color:#1E140C;border-color:rgba(30,20,12,.16);}.meld-knop:disabled{opacity:.55;cursor:wait;}'+
    '.meld-knop:focus-visible{outline:2px solid #B05D59;outline-offset:3px;}'+
    '.meld-fout{color:#A33A3A!important;font-weight:600;}.meld-fout:empty{display:none;}.meld-fout.ok{color:#3B6A38!important;}';


  function start(){
    var st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
    knoppen();
    if(standalone)tabbalk();
    else if(iosSafari)setTimeout(toonKaart,2500);   // iPhone kent geen installatievenster: kaart met uitleg
    if(window.klaar)klaar(function(u){if(u)Meldingen.synchroniseer();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
