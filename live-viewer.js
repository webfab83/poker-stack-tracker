/* STACK V24 — page spectateur, lecture seule par jeton secret UUID.
 * Realtime Broadcast ne transporte QUE un signal « actualiser » ;
 * les données viennent d'une RPC contrôlée, aucun accès SQL direct à la table. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const qs=new URLSearchParams(location.search),token=qs.get('token')||'';
 const validToken=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);
 const R=window.STACK_LIVE_CONFIG||{};
 const C={
  url:String(R.url||R.supabaseUrl||R.supabase_url||R.NEXT_PUBLIC_SUPABASE_URL||'').trim().replace(/\/+$/,''),
  publishableKey:String(R.publishableKey||R.publishable_key||R.supabasePublishableKey||R.anonKey||R.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'').trim()
 };
 const validConfig=/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(C.url)&&
  /^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(C.publishableKey)&&
  !/REMPLACER|VOTRE/i.test(C.publishableKey);
 const nf=new Intl.NumberFormat('fr-FR');
 const fmt=x=>nf.format(Math.round(Number(x)||0));
 let mode='chips',bbScale='poker',db=null,latest=null,inFlight=false,reload=false,channel=null,lastGood=0;
 try{if(localStorage.getItem('stack-live-spectator-bb-scale')==='linear')bbScale='linear'}catch(e){}
 // Identique à l'échelle Paliers BB de l'application principale.
 // 0-5, 5-10, 10-20, 20-40, 40-80... : intervalles de même hauteur.
 function bbPokerMap(value){
   const v=Math.max(0,Number(value)||0);
   if(v<=5)return v/5;
   if(v<=10)return 1+(v-5)/5;
   return 2+Math.log2(v/10);
 }
 function bbPokerUnmap(position){
   const z=Math.max(0,Number(position)||0);
   if(z<=1)return 5*z;
   if(z<=2)return 5+5*(z-1);
   return 10*Math.pow(2,z-2);
 }
 function chartTicks(maxMapped,usePoker){
   if(!usePoker)return Array.from({length:5},(_,k)=>k*maxMapped/4);
   const ticks=[0,5,10];
   for(let value=20;bbPokerMap(value)<=maxMapped+1e-8 && value<1e12;value*=2)ticks.push(value);
   return ticks.filter(v=>bbPokerMap(v)<=maxMapped+1e-8);
 }

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
  const usePoker=mode==='bb'&&bbScale==='poker';
  const toAxis=v=>usePoker?bbPokerMap(v):v;
  const vals=points.map(p=>mode==='bb'?(p[2]>0?p[1]/p[2]:0):p[1]);
  const maxVal=Math.max(1,...vals);
  const maxAxis=Math.max(usePoker?.35:1,toAxis(maxVal)*1.10);
  const yAt=v=>top+plotH-(toAxis(Math.max(0,v))/maxAxis)*plotH;
  const fmtAxis=v=>mode==='bb'?(v<10?v.toLocaleString('fr-FR',{maximumFractionDigits:1}):Math.round(v).toLocaleString('fr-FR')):
     (v>=1000?(v/1000).toLocaleString('fr-FR',{maximumFractionDigits:v<10000?1:0})+'k':Math.round(v).toLocaleString('fr-FR'));
  ctx.font='11px system-ui';ctx.textAlign='right';ctx.textBaseline='middle';ctx.lineWidth=1;
  let lastLabelY=Infinity;
  for(const tick of chartTicks(maxAxis,usePoker)){
   // Les graduations des paliers restent lisibles même pour de grands stacks.
   const value=usePoker?tick:tick;
   const y=yAt(value);
   if(y<top-1||y>top+plotH+1)continue;
   const isTen=mode==='bb'&&Math.abs(value-10)<1e-7;
   const isTwenty=mode==='bb'&&Math.abs(value-20)<1e-7;
   ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);
   ctx.strokeStyle=isTen?'#ac6966':isTwenty?'#a69467':'#2d4660';
   if(isTen||isTwenty)ctx.setLineDash([5,5]);
   ctx.stroke();ctx.setLineDash([]);
   if(Math.abs(lastLabelY-y)>=17){
     ctx.fillStyle=isTen?'#ffb9b8':isTwenty?'#ffe2a0':'#a1bacc';
     ctx.fillText(fmtAxis(value),left-7,y);lastLabelY=y;
   }
  }
  // Toujours conserver les repères 10/20 BB, même si une graduation a été supprimée.
  if(mode==='bb')for(const [limit,color] of [[10,'#ff9291'],[20,'#f3cc76']]){
   if(toAxis(limit)>maxAxis)continue;
   const y=yAt(limit);
   ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);
   ctx.setLineDash([5,5]);ctx.lineWidth=1.2;ctx.strokeStyle=color+'b5';ctx.stroke();ctx.setLineDash([]);ctx.lineWidth=1;
  }
  // L'abscisse utilise les numéros de main réels, même si les points sont échantillonnés.
  const minN=points[0][0],maxN=points[points.length-1][0],diff=Math.max(1,maxN-minN);
  const xp=p=>left+(p[0]-minN)/diff*plotW;
  const baseline=top+plotH;
  const fill=ctx.createLinearGradient(0,top,0,baseline);
  fill.addColorStop(0,'rgba(72,220,182,.24)');fill.addColorStop(1,'rgba(72,220,182,.01)');
  ctx.beginPath();ctx.moveTo(xp(points[0]),baseline);
  points.forEach(p=>ctx.lineTo(xp(p),yAt(mode==='bb'?(p[2]>0?p[1]/p[2]:0):p[1])));
  ctx.lineTo(xp(points[points.length-1]),baseline);ctx.closePath();ctx.fillStyle=fill;ctx.fill();
  ctx.lineWidth=2.6;ctx.strokeStyle='#48dcb6';ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
  points.forEach((p,i)=>{const x=xp(p),y=yAt(vals[i]);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke();
  const end=points[points.length-1];ctx.fillStyle='#48dcb6';ctx.beginPath();ctx.arc(xp(end),yAt(vals[vals.length-1]),4.5,0,Math.PI*2);ctx.fill();
  ctx.font='11px system-ui';ctx.fillStyle='#a1bacc';ctx.textBaseline='alphabetic';ctx.textAlign='left';
  ctx.fillText('Départ',left,height-9);ctx.textAlign='right';ctx.fillText('Main '+fmt(end[0]),width-right,height-9);
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
  // Données facultatives : les spectateurs des anciennes versions restent compatibles.
  const playersTotal=Number.isSafeInteger(s.playersTotal)&&s.playersTotal>0?s.playersTotal:null;
  const playersRemaining=Number.isSafeInteger(s.playersRemaining)&&s.playersRemaining>=0?s.playersRemaining:null;
  $('livePlayersRow').hidden=(playersTotal===null&&playersRemaining===null);
  $('livePlayers').textContent=(playersRemaining===null?'—':fmt(playersRemaining))+' / '+(playersTotal===null?'—':fmt(playersTotal));
  // Average provenant de STACK, avec repli pour les anciennes versions du partage.
  const average=Number.isFinite(s.averageChips)&&s.averageChips>0?s.averageChips:
    (playersRemaining!==null&&playersRemaining>0
      ?(Number.isSafeInteger(s.totalChips)&&s.totalChips>0?s.totalChips:
         (playersTotal!==null&&Number.isFinite(s.start)?s.start*playersTotal:null))/playersRemaining:null);
  const validAverage=Number.isFinite(average)&&average>0;
  $('liveAverage').textContent=validAverage?fmt(average)+' jetons':'—';
  $('liveAverageBB').textContent=validAverage
    ?(average/s.bb).toLocaleString('fr-FR',{maximumFractionDigits:1})+' BB · '+fmt(playersRemaining)+' joueurs restants'
    :(playersRemaining===0?'Tournoi terminé · aucun joueur restant':'En attente des joueurs restants');
  const delta=s.stack-s.start;
  $('liveDiff').textContent=(delta>=0?'+':'')+fmt(delta);
  $('liveDiff').className=delta>0?'green':'';
  $('livePlayed').textContent=s.hands?((100*s.played/s.hands).toLocaleString('fr-FR',{maximumFractionDigits:1})+' %'):'—';
  $('liveAnte').textContent=fmt(s.ante)+(s.anteMode==='bba'?' BBA':'');
  // Bilan final : compatible avec les snapshots V24.4 qui n'ont pas ces champs.
  const finished=!!s.finished;
  $('finalPanel').hidden=!finished;
  if(finished){
    const rank=Number.isSafeInteger(s.finalRank)&&s.finalRank>0?s.finalRank:null;
    const entrants=Number.isSafeInteger(s.finalPlayers)&&s.finalPlayers>0?s.finalPlayers:playersTotal;
    const rankLabel=rank===null?'Tournoi terminé':(rank===1?'1er':fmt(rank)+'e')+(entrants?' / '+fmt(entrants):'');
    $('finalPlace').textContent=rankLabel;
    const outcomes={elimine:'Éliminé',vainqueur:'🏆 Victoire !',termine:'Tournoi terminé'};
    $('finalOutcome').textContent=outcomes[s.finalStatus]||'Résultat enregistré';
    const meta=[];
    if(entrants)meta.push(fmt(entrants)+' participants au départ');
    if(typeof s.finishedAt==='string'&&Number.isFinite(Date.parse(s.finishedAt))){
      meta.push('Clôturé le '+new Date(s.finishedAt).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}));
    }
    if(Number.isFinite(s.durationMinutes)&&s.durationMinutes>=0){
      const minutes=Math.round(s.durationMinutes),hours=Math.floor(minutes/60);
      meta.push('Suivi : '+(hours?fmt(hours)+' h '+String(minutes%60).padStart(2,'0'):'')+(hours?'':' '+fmt(minutes)+' min').trim());
    }
    $('finalMeta').textContent=meta.join(' · ');
    $('finalHands').textContent=fmt(s.hands);
    $('finalPlayed').textContent=s.hands?(100*s.played/s.hands).toLocaleString('fr-FR',{maximumFractionDigits:1})+' %':'—';
    const dataPoints=Array.isArray(s.points)?s.points:[];
    const peakChip=Number.isFinite(s.peakStack)&&s.peakStack>=0?s.peakStack:Math.max(0,...dataPoints.filter(p=>Array.isArray(p)).map(p=>Number(p[1])||0));
    const peakBlind=Number.isFinite(s.peakBB)&&s.peakBB>=0?s.peakBB:Math.max(0,...dataPoints.filter(p=>Array.isArray(p)&&p[2]>0).map(p=>p[1]/p[2]));
    $('finalPeak').textContent=fmt(peakChip)+' jetons';
    $('finalPeakBB').textContent=peakBlind.toLocaleString('fr-FR',{maximumFractionDigits:1})+' BB';
  }
  $('liveBadge').textContent=s.finished?'🏁 Terminé':'● En direct';
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
 function updateScaleControls(){
  const asBB=mode==='bb';
  $('bbScaleRow').hidden=!asBB;
  $('scaleNote').hidden=!(asBB&&bbScale==='poker');
  $('scaleLinear').setAttribute('aria-pressed',String(bbScale==='linear'));
  $('scalePoker').setAttribute('aria-pressed',String(bbScale==='poker'));
 }
 function changeMode(m){
  mode=m==='bb'?'bb':'chips';
  $('chipsMode').setAttribute('aria-pressed',String(mode==='chips'));
  $('bbMode').setAttribute('aria-pressed',String(mode==='bb'));
  updateScaleControls();draw();
 }
 function changeScale(scale){
  bbScale=scale==='linear'?'linear':'poker';
  try{localStorage.setItem('stack-live-spectator-bb-scale',bbScale)}catch(e){}
  updateScaleControls();draw();
 }
 $('chipsMode').addEventListener('click',()=>changeMode('chips'));
 $('bbMode').addEventListener('click',()=>changeMode('bb'));
 $('scaleLinear').addEventListener('click',()=>changeScale('linear'));
 $('scalePoker').addEventListener('click',()=>changeScale('poker'));
 updateScaleControls();
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
