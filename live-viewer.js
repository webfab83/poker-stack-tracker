/* STACK V24 — page spectateur, lecture seule par jeton secret UUID.
 * Realtime Broadcast ne transporte QUE un signal « actualiser » ;
 * les données viennent d'une RPC contrôlée, aucun accès SQL direct à la table. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const qs=new URLSearchParams(location.search),token=qs.get('token')||'';
 const validToken=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);
 const C=window.STACK_LIVE_CONFIG||{};
 const validConfig=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(C.url||'')&&
   /^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(C.publishableKey||'')&&
   !/REMPLACER|VOTRE/i.test(C.publishableKey);
 const nf=new Intl.NumberFormat('fr-FR');
 const fmt=x=>nf.format(Math.round(Number(x)||0));
 let mode='chips',db=null,latest=null,inFlight=false,reload=false,channel=null,lastGood=0;
 const status=(s,bad=false)=>{const e=$('statusMsg');e.hidden=false;e.textContent=s;e.style.color=bad?'#ffaaaa':''};
 const show=()=>{$('tournoi').hidden=false;$('statusMsg').hidden=true};
 function draw(){
  const c=$('liveChart'),s=latest;if(!s)return;
  const box=c.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2);
  const width=Math.max(270,box.width),height=Math.max(170,box.height);
  c.width=Math.round(width*ratio);c.height=Math.round(height*ratio);
  const ctx=c.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
  const left=55,right=15,top=17,bottom=32,plotW=width-left-right,plotH=height-top-bottom;
  const raw=Array.isArray(s.points)?s.points:[];
  const points=raw.filter(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite));
  if(!points.length)return;
  const vals=points.map(p=>mode==='bb'?p[2]>0?p[1]/p[2]:0:p[1]);
  const maxVal=Math.max(1,...vals),minVal=Math.min(0,...vals),span=Math.max(1,maxVal-minVal);
  const xAt=i=>left+(points.length===1?0:(i/(points.length-1))*plotW);
  const yAt=v=>top+plotH-((v-minVal)/span)*plotH;
  ctx.font='11px system-ui';ctx.fillStyle='#a1bacc';ctx.strokeStyle='#2d4660';ctx.lineWidth=1;
  for(let k=0;k<=4;k++){
   const val=minVal+span*k/4,y=yAt(val);
   ctx.globalAlpha=.7;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);ctx.stroke();ctx.globalAlpha=1;
   ctx.textAlign='right';ctx.fillText(mode==='bb'?val.toFixed(val<20?1:0):val>=1000?(val/1000).toFixed(val<10000?1:0)+'k':Math.round(val).toString(),left-7,y+3);
  }
  if(mode==='bb')for(const n of [10,20]){if(n>=minVal&&n<=maxVal){ctx.strokeStyle='#667c9a';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(left,yAt(n));ctx.lineTo(width-right,yAt(n));ctx.stroke();ctx.setLineDash([])}}
  // Les x viennent du n° de main, pour préserver les espacements lors d'un échantillonnage.
  const minN=points[0][0],maxN=points[points.length-1][0],diff=Math.max(1,maxN-minN);
  const xp=p=>left+(p[0]-minN)/diff*plotW;
  ctx.lineWidth=2.6;ctx.strokeStyle='#48dcb6';ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
  points.forEach((p,i)=>{const x=xp(p),y=yAt(vals[i]);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke();
  const end=points[points.length-1];ctx.fillStyle='#48dcb6';ctx.beginPath();ctx.arc(xp(end),yAt(vals[vals.length-1]),4.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#a1bacc';ctx.textAlign='left';ctx.fillText('1',left, height-9);ctx.textAlign='right';ctx.fillText('Main '+fmt(end[0]),width-right,height-9);
 }
 function render(payload){
  const s=payload.snapshot||{};
  if(!Number.isFinite(s.stack)||!Number.isFinite(s.bb)||s.bb<=0||!Array.isArray(s.points)){
   status('Réponse incorrecte du serveur.',true);return;
  }
  latest=s;show();
  $('liveName').textContent=String(s.name||'Tournoi').slice(0,90);
  $('liveStack').textContent=fmt(s.stack);
  $('liveBB').textContent=(s.stack/s.bb).toLocaleString('fr-FR',{maximumFractionDigits:1})+' BB';
  $('liveBlinds').textContent=fmt(s.sb)+' / '+fmt(s.bb);
  $('liveHands').textContent=fmt(s.hands);
  const delta=s.stack-s.start;
  $('liveDiff').textContent=(delta>=0?'+':'')+fmt(delta);
  $('liveDiff').className=delta>0?'green':'';
  $('livePlayed').textContent=s.hands?((100*s.played/s.hands).toLocaleString('fr-FR',{maximumFractionDigits:1})+' %'):'—';
  $('liveAnte').textContent=fmt(s.ante)+(s.anteMode==='bba'?' BBA':'');
  $('liveBadge').textContent=s.finished?'● Terminé':'● En direct';
  $('liveBadge').classList.toggle('off',!!s.finished);
  $('syncTime').textContent='Actualisé le '+new Date(payload.updated_at).toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  lastGood=Date.now();draw();
 }
 async function refresh(){
  if(!db||!navigator.onLine||document.hidden)return;
  if(inFlight){reload=true;return}
  inFlight=true;
  try{
   const {data,error}=await db.rpc('stack_live_read',{p_token:token});
   if(error)throw error;
   if(!data){$('tournoi').hidden=true;status('Ce partage est terminé ou ce lien est invalide.',true);return}
   render(data);
  }catch(e){if(!lastGood)status('Connexion impossible : '+e.message,true);
   else{$('syncTime').textContent='Connexion instable — dernière donnée affichée';}}
  finally{inFlight=false;if(reload){reload=false;refresh()}}
 }
 function changeMode(m){mode=m;$('chipsMode').setAttribute('aria-pressed',String(m==='chips'));$('bbMode').setAttribute('aria-pressed',String(m==='bb'));draw()}
 $('chipsMode').addEventListener('click',()=>changeMode('chips'));
 $('bbMode').addEventListener('click',()=>changeMode('bb'));
 window.addEventListener('resize',()=>{if(latest)draw()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
 window.addEventListener('online',refresh);
 if(!validToken){status('Lien de partage absent ou incorrect.',true);return}
 if(!validConfig){status('Le propriétaire doit compléter la configuration Supabase de STACK.',true);return}
 const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
 script.onload=()=>{
  try{db=window.supabase.createClient(C.url,C.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    channel=db.channel('stack-live:'+token,{config:{private:false}})
       .on('broadcast',{event:'stack_updated'},()=>refresh()).subscribe();
    refresh();
    // Secours de synchronisation : si l'événement WebSocket a été manqué.
    setInterval(()=>{if(!document.hidden)refresh()},10000);
    window.addEventListener('pagehide',()=>{if(channel)db.removeChannel(channel)});
  }catch(e){status('Impossible de démarrer le direct : '+e.message,true)}
 };
 script.onerror=()=>status('Connexion au service de direct impossible.',true);
 document.head.appendChild(script);
})();
