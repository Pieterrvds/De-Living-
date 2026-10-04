/* La Vie en Rose – service worker (installeerbare app).
   - Pagina's en eigen bestanden: eerst het netwerk (altijd de nieuwste versie), zonder internet uit de cache.
   - Lettertypes, de Supabase-bibliotheek en foto's: uit de cache (ze veranderen niet).
   - De database (Supabase) gaat nooit via de cache: reservaties zijn altijd live.
   Verhoog VERSIE als je de lijst hieronder aanpast. */
var VERSIE='lvr-v1';
var KERN=['app.html','index.html','yoga.html','huren.html','account.html','login.html','offline.html',
  'assets/site.css','assets/site.js','assets/app.js','assets/boeken.js','assets/db.js',
  'manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
var VASTE_BRONNEN=/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|images\.unsplash\.com)\//;

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(VERSIE).then(function(c){
    // één bestand dat niet lukt, mag de installatie niet tegenhouden
    return Promise.all(KERN.map(function(u){return c.add(u).catch(function(){});}));
  }).then(function(){return self.skipWaiting();}));
});

self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){return k!==VERSIE;}).map(function(k){return caches.delete(k);}));
  }).then(function(){return self.clients.claim();}));
});

self.addEventListener('fetch',function(e){
  var req=e.request;
  if(req.method!=='GET')return;
  var url=new URL(req.url);
  if(url.origin===self.location.origin){
    e.respondWith(
      fetch(req).then(function(res){
        if(res.ok&&res.type==='basic'){var kopie=res.clone();caches.open(VERSIE).then(function(c){c.put(req,kopie);});}
        return res;
      }).catch(function(){
        return caches.match(req,{ignoreSearch:req.mode==='navigate'}).then(function(r){
          return r||(req.mode==='navigate'?caches.match('offline.html'):Response.error());
        });
      })
    );
    return;
  }
  if(VASTE_BRONNEN.test(req.url)){
    e.respondWith(caches.match(req).then(function(r){
      return r||fetch(req).then(function(res){
        if(res.ok||res.type==='opaque'){var kopie=res.clone();caches.open(VERSIE).then(function(c){c.put(req,kopie);});}
        return res;
      });
    }));
  }
  // al de rest (o.a. de database) gewoon via het netwerk
});
