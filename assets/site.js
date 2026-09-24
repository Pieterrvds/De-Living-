/* La Vie en Rose – gedeelde menubalk, voettekst en animaties voor alle
   pagina's naast index.html. Laad dit script vlak na <body>. */
(function(){
  var NAV_LINKS=[
    ['index.html#about','Over ons'],
    ['index.html#kalender','Rooster'],
    ['index.html#lessen','Lessen'],
    ['index.html#evenementen','Evenementen'],
    ['index.html#contact','Contact']
  ];
  var WA_ICON='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  var body=document.body;
  body.insertAdjacentHTML('afterbegin',
    '<div class="progress-bar" id="progressBar"></div>'+
    '<div class="cursor" id="cursor"></div><div class="cursor-ring" id="cursorRing"></div>'+
    '<canvas id="petalCanvas"></canvas>'+
    '<a class="wa" href="https://wa.me/32471955489" target="_blank" rel="noopener" aria-label="WhatsApp"><div class="wa-tip">Stuur ons een berichtje</div>'+WA_ICON+'</a>'+
    '<nav id="nav"><a href="index.html" class="nav-logo">La Vie <em>en Rose</em></a>'+
    '<ul class="nav-links">'+NAV_LINKS.map(function(l){return '<li><a href="'+l[0]+'">'+l[1]+'</a></li>';}).join('')+'</ul>'+
    '<div class="nav-right" id="navRight"><a href="boeken.html" class="nav-pill">🌹 Les boeken</a></div>'+
    '<button class="hamburger" id="hbg" aria-label="Menu"><span></span><span></span><span></span></button></nav>'+
    '<div class="mob-menu" id="mobMenu">'+NAV_LINKS.map(function(l){return '<a href="'+l[0]+'">'+l[1]+'</a>';}).join('')+
    '<a href="boeken.html" class="mob-pill-m">🌹 Les boeken</a></div>');

  window.addEventListener('DOMContentLoaded',function(){
    body.insertAdjacentHTML('beforeend',
      '<footer><div class="foot-inner"><span class="foot-logo">La Vie en Rose</span><span class="foot-tag">Sports Café · Aalst</span>'+
      '<div class="foot-lks"><a href="index.html">Home</a>'+NAV_LINKS.map(function(l){return '<a href="'+l[0]+'">'+l[1]+'</a>';}).join('')+
      '<a href="boeken.html">Les boeken</a><a href="Gallery.html">Foto\'s</a></div>'+
      '<div class="foot-copy">© 2025 La Vie en Rose · Hoogstraat 40, 9308 Aalst · Gemaakt met ❤️</div></div></footer>'+
      '<div class="toast" id="toast"></div>');
    reveal();
  });

  /* Menu */
  var hbg=document.getElementById('hbg'),mob=document.getElementById('mobMenu');
  hbg.addEventListener('click',function(){hbg.classList.toggle('open');mob.classList.toggle('open');});
  mob.addEventListener('click',function(e){if(e.target.tagName==='A'){hbg.classList.remove('open');mob.classList.remove('open');}});

  /* Nav wordt vast na scrollen; voortgangsbalk; parallax */
  var nav=document.getElementById('nav'),pb=document.getElementById('progressBar');
  function onScroll(){
    var sy=window.scrollY;
    nav.classList.toggle('solid',sy>60||!document.querySelector('.page-hero'));
    var h=document.body.scrollHeight-window.innerHeight;
    pb.style.width=(h>0?sy/h*100:0)+'%';
    var bg=document.querySelector('.ph-bg');
    if(bg)bg.style.transform='translateY('+(sy*.35)+'px)';
  }
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('DOMContentLoaded',onScroll);

  var reduced=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Cursor */
  var cur=document.getElementById('cursor'),ring=document.getElementById('cursorRing');
  var mx=-100,my=-100,rx=-100,ry=-100;
  document.addEventListener('mousemove',function(e){mx=e.clientX;my=e.clientY;cur.style.left=mx+'px';cur.style.top=my+'px';});
  (function animRing(){rx+=(mx-rx)*.12;ry+=(my-ry)*.12;ring.style.left=rx+'px';ring.style.top=ry+'px';requestAnimationFrame(animRing);})();
  var HOVER='a,button,label,.slot,.chip,.card-hover,.gallery-item';
  document.addEventListener('mouseover',function(e){
    var on=!!(e.target.closest&&e.target.closest(HOVER));
    cur.classList.toggle('hover',on);ring.classList.toggle('hover',on);
  });

  /* Rozenblaadjes */
  if(!reduced)(function(){
    var c=document.getElementById('petalCanvas'),ctx=c.getContext('2d');
    function resize(){c.width=window.innerWidth;c.height=window.innerHeight;}
    resize();window.addEventListener('resize',resize);
    var petals=[];
    for(var i=0;i<22;i++)petals.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight*2,r:Math.random()*14+6,vx:(Math.random()-.5)*.4,vy:Math.random()*.5+.2,rot:Math.random()*Math.PI*2,vr:(Math.random()-.5)*.02,op:Math.random()*.35+.05,hue:Math.random()*20+340});
    (function draw(){
      ctx.clearRect(0,0,c.width,c.height);
      petals.forEach(function(p){
        ctx.save();ctx.translate(p.x,p.y-scrollY*.15);ctx.rotate(p.rot);ctx.globalAlpha=p.op;
        ctx.fillStyle='hsl('+p.hue+',70%,78%)';ctx.beginPath();ctx.moveTo(0,0);
        ctx.bezierCurveTo(p.r*.5,-p.r,p.r,-p.r*.5,0,-p.r*1.6);ctx.bezierCurveTo(-p.r,-p.r*.5,-p.r*.5,-p.r,0,0);
        ctx.fill();ctx.restore();
        p.x+=p.vx;p.y+=p.vy;p.rot+=p.vr;
        if(p.y-scrollY*.15>innerHeight+20){p.y=scrollY*.15-20;p.x=Math.random()*innerWidth;}
      });
      requestAnimationFrame(draw);
    })();
  })();

  /* Golvende scheidingslijn onder de page hero */
  window.addEventListener('DOMContentLoaded',function(){
    var path=document.getElementById('wavePath');if(!path||reduced)return;
    var t=0;
    (function anim(){t+=.012;var a=Math.sin(t)*12,b=Math.cos(t*.7)*10;
      path.setAttribute('d','M0,'+(40+a)+' C240,'+(80+b)+' 480,'+b+' 720,'+(40+a)+' C960,'+(80-b)+' 1200,'+b+' 1440,'+(40+a)+' L1440,80 L0,80 Z');
      requestAnimationFrame(anim);})();
  });

  /* Scroll reveal – ook voor elementen die later via JS worden toegevoegd: roep reveal() opnieuw aan. */
  var io=('IntersectionObserver' in window)?new IntersectionObserver(function(entries){
    entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});
  },{threshold:.08,rootMargin:'0px 0px -40px 0px'}):null;
  function reveal(){
    document.querySelectorAll('.sr:not(.in):not([data-sr])').forEach(function(el){
      el.setAttribute('data-sr','');
      if(io)io.observe(el);else el.classList.add('in');
    });
  }
  window.reveal=reveal;

  /* Toast */
  window.showToast=function(msg){
    var t=document.getElementById('toast');if(!t)return;
    t.textContent=msg;t.classList.add('show');
    clearTimeout(t._h);t._h=setTimeout(function(){t.classList.remove('show');},3400);
  };
})();
