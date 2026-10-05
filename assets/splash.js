/* La Vie en Rose – app-modus en laadscherm. Laad dit VROEG in <head> (zonder defer).
   - zet meteen html.app-modus in de geïnstalleerde app (geen flits van de menubalk van de website)
   - toont een roos die openklapt terwijl het scherm laadt:
       bij het openen van de app: de hele animatie (± 1,6 s)
       daarna (andere tabbladen): enkel als het laden langer dan 0,3 s duurt */
(function(){
  var standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
  if(!standalone)return;
  var html=document.documentElement;html.classList.add('app-modus');
  var eerste=true;try{eerste=!sessionStorage.getItem('lvr-gestart');sessionStorage.setItem('lvr-gestart','1');}catch(e){}
  var start=Date.now(),MIN=eerste?1700:0;

  // roos: 3 kransen blaadjes rond het midden (buiten → binnen), elk met eigen draai, grootte en vertraging
  function blaadjes(n,draai,schaal,vertraging,kleur){
    var s='';
    for(var i=0;i<n;i++)s+='<path class="b" fill="url(#'+kleur+')" stroke="#9E4A47" stroke-opacity=".25" stroke-width=".8" '+
      'style="--r:'+(i*360/n+draai)+'deg;--s:'+schaal+';--d:'+(vertraging+i*0.04).toFixed(2)+'s" d="M0,6 C-36,-4 -42,-48 -24,-66 C-13,-77 13,-77 24,-66 C42,-48 36,-4 0,6Z"/>';
    return s;
  }
  var svg='<svg viewBox="-100 -100 200 200" aria-hidden="true"><defs>'+
    '<linearGradient id="lvrB1" x1="0" y1="-80" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#E9A59E"/><stop offset="1" stop-color="#B85A57"/></linearGradient>'+
    '<linearGradient id="lvrB2" x1="0" y1="-80" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#F0B5AE"/><stop offset="1" stop-color="#C4625F"/></linearGradient>'+
    '<linearGradient id="lvrB3" x1="0" y1="-80" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#F6C6BF"/><stop offset="1" stop-color="#CF6E69"/></linearGradient>'+
    '<linearGradient id="lvrB4" x1="0" y1="-80" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#E38C86"/><stop offset="1" stop-color="#A9443F"/></linearGradient>'+
    '<linearGradient id="lvrL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7FA26F"/><stop offset="1" stop-color="#4C7444"/></linearGradient></defs>'+
    '<g class="roos">'+
      '<g class="loof"><path fill="url(#lvrL)" d="M18,40 C40,40 66,52 78,74 C52,78 30,66 18,40Z"/><path fill="url(#lvrL)" d="M-16,44 C-36,48 -58,64 -66,88 C-42,88 -24,72 -16,44Z"/></g>'+
      blaadjes(5,0,1,0.10,'lvrB1')+blaadjes(5,36,.8,0.26,'lvrB2')+blaadjes(5,14,.6,0.42,'lvrB3')+blaadjes(4,52,.42,0.58,'lvrB4')+
      '<g class="hart"><circle r="13" fill="#9C3D39"/><path d="M-8,2 C-9,-9 8,-11 9,-1 C10,8 -3,10 -4,2 C-5,-3 3,-5 3,0" fill="none" stroke="#E7978F" stroke-width="2" stroke-linecap="round"/></g>'+
    '</g></svg>';
  var el=document.createElement('div');
  el.className='a-splash'+(eerste?'':' kort');el.setAttribute('role','status');el.setAttribute('aria-label','La Vie en Rose wordt geladen');
  el.innerHTML=svg+'<div class="woord"><b>La Vie <i>en Rose</i></b><span>Sports café · Aalst</span></div><div class="lijn"></div>';
  html.appendChild(el);   // <body> bestaat nog niet: rechtstreeks in <html>

  var weg=false;
  function verberg(){
    if(weg)return;weg=true;
    setTimeout(function(){el.classList.add('weg');setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},480);},
      Math.max(0,MIN-(Date.now()-start)));
  }
  // klaar = gegevens geladen (assets/db.js), anders als de pagina geladen is; nooit langer dan 6 s
  document.addEventListener('DOMContentLoaded',function(){
    if(window.klaar)klaar(function(){setTimeout(verberg,60);});
    else window.addEventListener('load',verberg);
  });
  setTimeout(verberg,6000);
  window.lvrVerbergLaadscherm=verberg;
})();
