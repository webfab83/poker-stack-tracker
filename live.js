/* STACK V24 — publication de snapshots en direct.
 * Dépend de live-config.js, stack-live.sql, et de la passerelle STACKLiveBridge dans index.html.
 * Aucun envoi réseau avant l'activation explicite d'un partage.
 */
(()=>{'use strict';
  const $=id=>document.getElementById(id);
  const bridge=window.STACKLiveBridge;
  if(!bridge)return;
  // Le manifeste et l'application peuvent être mis à jour à des moments distincts
  // par Chrome Android. Relire la configuration évite une erreur figée au démarrage.
  let C={}, validConfig=false, configError='';
  function checkConfig(){
    const raw=window.STACK_LIVE_CONFIG;
    if(!raw||typeof raw!=='object'){
      C={};validConfig=false;
      configError='Connexion absente : live-config.js n\'a pas été exécuté dans STACK. Réessaie avec Internet.';
      return false;
    }
    C={
      url:String(raw.url||raw.supabaseUrl||raw.supabase_url||raw.NEXT_PUBLIC_SUPABASE_URL||'').trim().replace(/\/+$/,''),
      publishableKey:String(raw.publishableKey||raw.publishable_key||raw.supabasePublishableKey||raw.anonKey||raw.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'').trim()
    };
    if(!C.url){configError='URL Supabase introuvable : vérifie le champ url dans live-config.js.';}
    else if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(C.url)){
      configError='Adresse Supabase non reconnue : elle doit ressembler à https://projet.supabase.co.';
    }else if(!C.publishableKey){configError='Clé publique introuvable : vérifie publishableKey dans live-config.js.';}
    else if(/^sb_secret_|service_role/i.test(C.publishableKey)){
      configError='Clé secrète refusée : utilise uniquement la clé publique sb_publishable_.';
    }else if(!/^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(C.publishableKey)||/REMPLACER|VOTRE/i.test(C.publishableKey)){
      configError='Format de la clé publique non reconnu : recopie uniquement la valeur sb_publishable_.';
    }else{configError='';validConfig=true;return true;}
    validConfig=false;return false;
  }
  let configReloadPromise=null;
  function reloadConfig(){
    if(configReloadPromise)return configReloadPromise;
    configReloadPromise=new Promise(resolve=>{
      const script=document.createElement('script');
      // URL unique pour contourner l'ancienne version conservée par Chrome/PWA.
      script.src='./live-config.js?stack-config-refresh='+Date.now();
      script.onload=()=>{checkConfig();updateControls();resolve(validConfig)};
      script.onerror=()=>{configError='Fichier live-config.js inaccessible : vérifie sa présence à la racine de GitHub.';setStatus(configError,true);resolve(false)};
      document.head.appendChild(script);
    }).finally(()=>{configReloadPromise=null});
    return configReloadPromise;
  }
  checkConfig();
  const storeKey='poker-stack-live-v24-map';
  let db=null, sdkPromise=null, syncTimer=null, busy=false, dirty=false;
  let liveMap={};
  try {const saved=JSON.parse(localStorage.getItem(storeKey)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))liveMap=saved;}catch(e){}
  const saveMap=()=>{try{localStorage.setItem(storeKey,JSON.stringify(liveMap));}catch(e){setStatus('Stockage local indisponible. Sauvegarde conseillée.',true)}};
  const entry=()=>liveMap[bridge.currentId()]||null;
  const setStatus=(txt,bad=false)=>{const el=$('liveStatus');if(!el)return;el.textContent=txt;el.classList.toggle('live-error',bad)};
  const viewerUrl=token=>new URL('./live.html?token='+encodeURIComponent(token),location.href).href;
  const configMessage=()=>configError||'Configuration Supabase à vérifier.';
  function ensureSdk(){
    checkConfig();
    if(!validConfig)return Promise.reject(Error(configMessage()));
    if(db)return Promise.resolve(db);
    if(sdkPromise)return sdkPromise;
    sdkPromise=new Promise((resolve,reject)=>{
      if(window.supabase?.createClient){resolve(window.supabase.createClient(C.url,C.publishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}}));return;}
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload=()=>window.supabase?.createClient?resolve(window.supabase.createClient(C.url,C.publishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}})):reject(Error('Bibliothèque Supabase indisponible'));
      script.onerror=()=>reject(Error('Impossible de charger Supabase (connexion Internet nécessaire)'));
      document.head.appendChild(script);
    }).then(client=>{db=client;return client}).catch(err=>{sdkPromise=null;throw err});
    return sdkPromise;
  }
  async function ensureOwner(client){
    let {data,error}=await client.auth.getSession();
    if(error)throw error;
    if(data.session?.user?.id)return data.session.user.id;
    ({data,error}=await client.auth.signInAnonymously());
    if(error)throw error;
    if(!data?.user?.id)throw Error('Identification anonyme impossible');
    return data.user.id;
  }
  function updateControls(){
    checkConfig();
    const e=entry(),active=!!e?.active;
    $('liveStart').hidden=active;
    $('liveStop').hidden=!active;
    $('liveCopy').hidden=!active;
    $('liveShare').hidden=!active;
    $('liveLinkWrap').hidden=!active;
    $('liveLink').value=active?viewerUrl(e.token):'';
    $('liveLabel').textContent=active?'🔴 Direct activé':'Direct inactif';
    if(!validConfig)setStatus(configMessage(),true);
    else if(!navigator.onLine&&active)setStatus('Hors ligne : le partage reprendra après reconnexion.',true);
    else if(active)setStatus('Lien actif. Les modifications seront envoyées automatiquement.');
    else setStatus('Active le direct pour créer un lien privé à partager.');
  }
  function queueSync(){
    if(!entry()?.active)return;
    dirty=true;
    clearTimeout(syncTimer);
    syncTimer=setTimeout(flush,800);
  }
  async function flush(){
    if(busy||!dirty||!entry()?.active||!navigator.onLine)return;
    busy=true;
    try{
      const client=await ensureSdk();
      await ensureOwner(client);
      while(dirty){
        dirty=false;
        const e=entry();if(!e?.active)break;
        const sessionId=bridge.currentId();
        const payload=bridge.snapshot();
        const {data:written,error}=await client.from('stack_live_tournaments')
          .update({snapshot:payload,updated_at:new Date().toISOString()})
          .eq('id',e.id).select('id').single();
        if(error)throw error;
        if(!written?.id)throw Error('Ce partage ne t’appartient plus sur ce téléphone.');
        if(sessionId===bridge.currentId()&&entry()?.id===e.id)
          setStatus('Synchronisé à '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}));
      }
    }catch(err){dirty=true;setStatus('Synchronisation en attente : '+err.message,true)}
    finally{busy=false}
  }
  async function start(){
    if(!checkConfig()&&!(await reloadConfig())){setStatus(configMessage(),true);return}
    if(!navigator.onLine){setStatus('Connecte le téléphone à Internet pour activer le direct.',true);return}
    if(!window.crypto?.randomUUID){setStatus('HTTPS requis pour créer un lien sécurisé.',true);return}
    const btn=$('liveStart');btn.disabled=true;setStatus('Création du partage…');
    try{
      const client=await ensureSdk();
      const owner=await ensureOwner(client);
      const id=crypto.randomUUID(),token=crypto.randomUUID();
      const payload={id,owner_id:owner,share_token:token,snapshot:bridge.snapshot(),is_active:true};
      const {error}=await client.from('stack_live_tournaments').insert(payload);
      if(error)throw error;
      liveMap[bridge.currentId()]={id,token,active:true};
      saveMap();updateControls();setStatus('En direct ! Copie le lien pour tes amis.');
    }catch(err){setStatus('Impossible d’activer : '+err.message,true)}
    finally{btn.disabled=false}
  }
  async function stop(){
    const e=entry();if(!e?.active)return;
    if(!navigator.onLine){setStatus('Reconnecte-toi à Internet pour désactiver le lien.',true);return}
    const btn=$('liveStop');btn.disabled=true;setStatus('Désactivation du lien…');
    try{
      const client=await ensureSdk();await ensureOwner(client);
      const {data:stopped,error}=await client.from('stack_live_tournaments').update({is_active:false}).eq('id',e.id).select('id').single();
      if(error)throw error;
      if(!stopped?.id)throw Error('Impossible de vérifier la désactivation du partage.');
      e.active=false;saveMap();dirty=false;clearTimeout(syncTimer);
      updateControls();setStatus('Partage arrêté : l’ancien lien n’affiche plus de données.');
    }catch(err){setStatus('Arrêt impossible : '+err.message,true)}
    finally{btn.disabled=false}
  }
  async function copyLink(){
    const e=entry();if(!e?.active)return;
    const url=viewerUrl(e.token);
    try{await navigator.clipboard.writeText(url);setStatus('Lien copié !')}catch(err){
      const input=$('liveLink');input.focus();input.select();setStatus('Sélectionne et copie le lien ci-dessus.');
    }
  }
  async function shareLink(){
    const e=entry();if(!e?.active)return;
    const url=viewerUrl(e.token);
    if(navigator.share){try{await navigator.share({title:'Suivre mon tournoi — STACK',text:'Mon tournoi en direct :',url});return}catch(e){if(e.name==='AbortError')return}}
    copyLink();
  }
  $('liveStart').addEventListener('click',start);
  $('liveStop').addEventListener('click',stop);
  $('liveCopy').addEventListener('click',copyLink);
  $('liveShare').addEventListener('click',shareLink);
  $('liveShortcut').addEventListener('click',()=>{
    if($('sharePanel').hidden)$('shareToggle').click();
    $('livePanel').scrollIntoView({behavior:'smooth',block:'center'});
  });
  window.addEventListener('stack:changed',()=>{updateControls();queueSync()});
  window.addEventListener('online',()=>{updateControls();queueSync();flush()});
  window.addEventListener('offline',updateControls);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){updateControls();queueSync()}});
  setInterval(()=>{if(navigator.onLine&&dirty)flush()},12000);
  updateControls();
  // Recharger la configuration fraîche une fois si l'ancienne n'est pas valide.
  if(!validConfig)reloadConfig();
  // Reprise après fermeture/rechargement : republier le snapshot local le plus récent.
  if(entry()?.active)queueSync();
})();
