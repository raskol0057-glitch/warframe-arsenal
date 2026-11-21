(()=>{
'use strict';
const $=s=>document.querySelector(s), view=$('#view');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const IMG=n=>n?'img/'+n:'';
const pic=(n,cls,alt,size)=>n?`<img class="${cls||''}" src="${IMG(n)}" alt="${esc(alt||'')}" loading="lazy" decoding="async" width="${size||96}" height="${size||96}">`:'';
const num=n=>Number(n).toLocaleString('ru');
let D=null;

/* ---------- Профили (хранятся в этом браузере) ---------- */
const KEY='wa:v1';
let S=load();
function load(){try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&s.profiles)return s}catch(_){}return{cur:null,profiles:{}}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(_){}renderWho();if(S.cur==='cloud'&&user)schedulePush()}
const prof=()=>S.profiles[S.cur]||null;
function newProfile(name){const id='p'+Date.now().toString(36);S.profiles[id]={name:name||'Тэнно',m:{},pid:'',created:Date.now()};S.cur=id;save();return id}
const mkey=(kind,it)=>(kind==='frames'?'f:':kind==='companions'?'c:':'w:')+it.name;
const LIST=kind=>kind==='frames'?D.frames:kind==='companions'?D.companions:D.weapons;
const isDone=(kind,it)=>{const p=prof();return !!(p&&p.m[mkey(kind,it)])};
function setDone(kind,it,v){let p=prof();if(!p){newProfile('Тэнно');p=prof()}const k=mkey(kind,it);if(v)p.m[k]=1;else delete p.m[k];save()}
function applySkin(k){if(k==='classic')document.documentElement.dataset.skin='classic';else delete document.documentElement.dataset.skin;
  document.querySelectorAll('.skin button').forEach(b=>b.classList.toggle('on',b.dataset.skin===(k==='classic'?'classic':'graphite')));try{localStorage.setItem('wa:skin',k)}catch(_){}}
document.querySelectorAll('.skin button').forEach(b=>b.onclick=()=>applySkin(b.dataset.skin));
applySkin(document.documentElement.dataset.skin==='classic'?'classic':'graphite');
(()=>{const ns=document.getElementById('navsel');if(!ns)return;
  ns.innerHTML=[...document.querySelectorAll('#tabs a')].map(a=>`<option value="${a.dataset.v}">${a.textContent}</option>`).join('')+'<option value="profile">Профиль</option>';
  ns.onchange=()=>{location.hash=ns.value}})();
function renderWho(){const p=prof();$('#whoName').textContent=p?(S.cur==='cloud'?'☁ ':'')+p.name:'Войти'}

/* ---------- Облачные аккаунты (Supabase) ---------- */
const CFG=window.WA_CONFIG||{};const CLOUD=!!(CFG.url&&CFG.key);
let sb=null,user=null,pushT=0,syncMsg='',recovering=false;
const SITE=location.origin+location.pathname;
function cloudInit(){
  if(!CLOUD)return Promise.resolve();
  return new Promise(res=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
    s.onload=async()=>{try{
      sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}});
      sb.auth.onAuthStateChange((ev,ses)=>{if(ev==='PASSWORD_RECOVERY'){recovering=true;location.hash='profile'}setTimeout(()=>setUser(ses?ses.user:null),0)});
      const {data}=await sb.auth.getSession();await setUser(data.session?data.session.user:null);
    }catch(e){console.warn('cloud',e)}res()};
    s.onerror=()=>res();document.head.appendChild(s);
  });
}
async function setUser(u){
  if((u&&u.id)===(user&&user.id))return;user=u;
  if(u){
    syncMsg='Загрузка…';
    const {data,error}=await sb.from('progress').select('name,mastered,player_id').eq('user_id',u.id).maybeSingle();
    if(error){syncMsg='Ошибка загрузки: '+error.message;rerender();return}
    const local=S.profiles.cloud&&S.profiles.cloud.uid===u.id?S.profiles.cloud.m:{};
    const m={...local};for(const k of (data&&data.mastered)||[])m[k]=1;
    S.profiles.cloud={name:(data&&data.name)||(u.email||'Тэнно').split('@')[0].slice(0,40),m,pid:(data&&data.player_id)||'',uid:u.id,cloud:true};
    S.cur='cloud';syncMsg='Синхронизировано';save();
    if(!data||Object.keys(m).length!==((data&&data.mastered)||[]).length)pushNow();
  }else{
    delete S.profiles.cloud;if(S.cur==='cloud')S.cur=Object.keys(S.profiles)[0]||null;syncMsg='';save();
  }
  rerender();
}
function schedulePush(){clearTimeout(pushT);syncMsg='Сохранение…';pushT=setTimeout(pushNow,700)}
async function pushNow(){
  const p=S.profiles.cloud;if(!sb||!user||!p)return;
  const {error}=await sb.from('progress').upsert({user_id:user.id,name:p.name.slice(0,40),mastered:Object.keys(p.m),player_id:/^[0-9a-f]{24}$/.test(p.pid||'')?p.pid:null,updated_at:new Date().toISOString()});
  syncMsg=error?'Не сохранилось: '+error.message:'Сохранено в облаке';const el=$('#csync');if(el)el.textContent=syncMsg;
}
function rerender(){if(cur==='profile')profile();else if(cur==='arsenal'||cur==='frames')mastery(cur)}
const AUTH_RU=e=>{const m=String(e&&e.message||e);
  if(/Invalid login credentials/i.test(m))return 'Неверная почта или пароль.';
  if(/Email not confirmed/i.test(m))return 'Почта ещё не подтверждена — откройте письмо от сайта и нажмите ссылку.';
  if(/already registered|already exists/i.test(m))return 'Аккаунт с этой почтой уже есть — войдите.';
  if(/Password should be at least/i.test(m))return 'Пароль слишком короткий: нужно минимум 6 символов.';
  if(/rate limit|too many/i.test(m))return 'Слишком много попыток. Подождите несколько минут.';
  if(/valid email|invalid format/i.test(m))return 'Проверьте адрес почты.';
  return m};
function cloudCard(){
  if(!CLOUD)return `<section class="card cut"><h3>Облачный аккаунт</h3><p>Облако ещё не подключено владельцем сайта. Пока работают профили в этом браузере.</p></section>`;
  if(!sb)return `<section class="card cut"><h3>Облачный аккаунт</h3><p>Не удалось подключиться к облаку. Проверьте интернет и обновите страницу.</p></section>`;
  if(recovering&&user)return `<section class="card cut"><h3>Новый пароль</h3><form id="crec" class="inline"><input class="field" id="cnewpw" type="password" autocomplete="new-password" minlength="6" placeholder="Новый пароль" aria-label="Новый пароль" required><button class="btn gold" type="submit">Сохранить пароль</button></form><div id="cmsg" class="msg"></div></section>`;
  if(user)return `<section class="card cut"><h3>Облачный аккаунт</h3><p>Вы вошли как <b style="color:var(--ink)">${esc(user.email)}</b>. Отметки сохраняются в облаке и видны на любом устройстве после входа.</p>
     <p id="csync" style="color:var(--ok)">${esc(syncMsg)}</p><div class="inline"><button class="btn" id="cout">Выйти</button></div><div id="cmsg" class="msg"></div></section>`;
  return `<section class="card cut"><h3>Облачный аккаунт</h3><p>Войдите, чтобы отметки сохранялись в облаке и открывались на телефоне и любом компьютере.</p>
    <form id="cauth" autocomplete="on"><div class="inline"><input class="field" id="cemail" type="email" autocomplete="email" placeholder="Почта" aria-label="Почта" required></div>
     <div class="inline" style="margin-top:8px"><input class="field" id="cpw" type="password" autocomplete="current-password" minlength="6" placeholder="Пароль (от 6 символов)" aria-label="Пароль" required></div>
     <div class="inline" style="margin-top:10px"><button class="btn gold" type="submit" data-act="in">Войти</button><button class="btn" type="submit" data-act="up">Создать аккаунт</button><button class="btn" type="button" id="cforgot">Забыли пароль?</button></div></form>
    <div id="cmsg" class="msg"></div></section>`;
}
function cloudBind(){
  if(!sb)return;const f=$('#cauth');
  if(f){let act='in';f.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>{act=b.dataset.act});
    f.onsubmit=async e=>{e.preventDefault();const email=$('#cemail').value.trim(),password=$('#cpw').value;msg('#cmsg','Подождите…');
      if(act==='up'){const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:SITE}});
        if(error)return msg('#cmsg',AUTH_RU(error),1);
        if(!data.session)return msg('#cmsg','Аккаунт создан. Откройте письмо на '+email+' и нажмите ссылку для подтверждения, затем войдите.');
      }else{const {error}=await sb.auth.signInWithPassword({email,password});if(error)return msg('#cmsg',AUTH_RU(error),1)}};
    $('#cforgot').onclick=async()=>{const email=$('#cemail').value.trim();if(!email)return msg('#cmsg','Введите почту, на которую придёт ссылка для сброса пароля.',1);
      const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:SITE});msg('#cmsg',error?AUTH_RU(error):'Письмо со ссылкой для сброса пароля отправлено на '+email+'.',!!error)};
  }
  if($('#cout'))$('#cout').onclick=async()=>{clearTimeout(pushT);await pushNow();await sb.auth.signOut()};
  if($('#crec'))$('#crec').onsubmit=async e=>{e.preventDefault();const {error}=await sb.auth.updateUser({password:$('#cnewpw').value});
    if(error)return msg('#cmsg',AUTH_RU(error),1);recovering=false;msg('#cmsg','Пароль изменён.');setTimeout(profile,1200)};
}

/* ---------- Данные ---------- */
const KINDS=[['','Все варианты'],['prime','Prime'],['kuva','Кува'],['tenet','Тенет'],['coda','Кода'],['incarnon','Инкарнон'],['unavailable','Сейчас недоступно']];
function prep(){
  for(const k of ['weapons','frames','companions']) for(const it of D[k]){
    it._s=(it.ru+' '+it.name+' '+it.category+' '+it.method+' '+it.parts.map(p=>p.name+' '+p.where+' '+p.relics).join(' ')+' '+it.materials.map(m=>m.name+' '+m.en).join(' ')).toLowerCase();
    it._un=/Сейчас получить нельзя|новым игрокам недоступен|получить нельзя/.test(it.method);
  }
  for(const k of ['relics','resources']) for(const it of D[k]) it._s=(it.name+' '+(it.ru||'')+' '+(it.status||'')+' '+it.where).toLowerCase();
  D.byUid={};for(const it of D.weapons)if(it.uid)D.byUid[it.uid]=['arsenal',it];for(const it of D.frames)if(it.uid)D.byUid[it.uid]=['frames',it];for(const it of D.companions)if(it.uid)D.byUid[it.uid]=['companions',it];
  D.byName={};for(const [k,l] of [['arsenal',D.weapons],['frames',D.frames],['companions',D.companions]])for(const it of l)D.byName[k+':'+it.name]=it;
  D.matImg={};for(const k of ['weapons','frames','companions'])for(const it of D[k])for(const m of it.materials)if(m.img)D.matImg[m.en||m.name]=m.img;
  D.resByEn={};for(const r of D.resources)D.resByEn[r.name.toLowerCase()]=r;
}
const match=(s,q)=>q.split(/\s+/).filter(Boolean).every(t=>s.includes(t));

/* ---------- Маршрутизация ---------- */
const state={arsenal:{q:'',cat:'',kind:'',done:'',sort:'name'},frames:{q:'',cat:'',kind:'',done:'',sort:'name'},companions:{q:'',cat:'',kind:'',done:'',sort:'name'},relics:{q:''},resources:{q:''},mods:{q:'',t:'',p:'',r:''},arcanes:{q:'',t:''}};
let cur='',loreTimer=null;
function route(){
  const h=decodeURIComponent(location.hash.slice(1))||'arsenal';const m=h.match(/^lore-(\d+)$/);const wk=h.match(/^wiki-(\w+)$/);const bm=h.match(/^build(?:=(.*))?$/);
  const v=m?'lore':wk?'wiki':bm?'build':h;
  const known=['arsenal','frames','companions','mods','arcanes','build','now','bestiary','wiki','relics','resources','new','lore','guide','profile'];
  clearInterval(nowTimer);
  const vv=known.includes(v)?v:'arsenal';
  document.querySelectorAll('#tabs a').forEach(a=>a.classList.toggle('on',a.dataset.v===vv));
  const ns=document.getElementById('navsel');if(ns)ns.value=vv;
  closeDrawer(true);
  if(cur==='lore'&&vv!=='lore')stopLore();
  if(vv==='lore'&&cur==='lore'&&m){showEv(+m[1]-1,true);return}
  cur=vv;window.scrollTo(0,0);
  ({arsenal:()=>catalog('arsenal'),frames:()=>catalog('frames'),companions:()=>catalog('companions'),mods:modsView,arcanes:arcanesView,wiki:()=>wiki(wk?wk[1]:'factions'),build:()=>builder(bm&&bm[1]),now:nowView,bestiary:bestiaryView,relics:()=>table('relics'),resources:()=>table('resources'),new:fresh,lore:()=>lore(m?+m[1]-1:0),guide,profile})[vv]();
}
addEventListener('hashchange',route);

/* ---------- Каталог: оружие и варфреймы ---------- */
const BATCH=60;
function catalog(kind){
  const st=state[kind],list=LIST(kind);
  const cats=kind==='frames'?['Варфреймы','Некрамехи']:kind==='companions'?[...new Set(D.companions.map(c=>c.category))]:D.cats;
  const CI={arsenal:['Арсенал Тэнно','Оружие','Основное, вторичное, ближний бой, арч-оружие, Зо, китганы, усилители и Рэйлджек.'],
    frames:['Оболочки Тэнно','Варфреймы','Варфреймы и некрамехи: характеристики, способности, чертежи, детали и рекомендованные билды.'],
    companions:['Спутники Тэнно','Компаньоны','Каваты, кубрау, хищники, вульпафилы и стражи: характеристики, получение и билды.']}[kind];
  view.innerHTML=`<div class="wrap">
   <div class="head"><div><div class="eyebrow">${CI[0]}</div><h1>${CI[1]}</h1>
     <p class="sub">${CI[2]} Нажмите на карточку, чтобы открыть подробности, или на ромб, чтобы отметить освоенное.</p></div>
     <div class="mastery" id="mst"></div></div>
   <div class="tools">
     <input class="field q" id="q" type="search" placeholder="Название, деталь, планета, реликвия…" aria-label="Поиск" value="${esc(st.q)}">
     <select class="field" id="cat" aria-label="Категория"><option value="">Все категории</option>${cats.map(c=>`<option ${st.cat===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
     <select class="field" id="kind" aria-label="Вариант">${KINDS.map(([v,t])=>`<option value="${v}" ${st.kind===v?'selected':''}>${t}</option>`).join('')}</select>
     <select class="field" id="done" aria-label="Освоение"><option value="">Освоено и нет</option><option value="no" ${st.done==='no'?'selected':''}>Ещё не освоено</option><option value="yes" ${st.done==='yes'?'selected':''}>Освоено</option></select>
   </div>
   <div class="info"><span id="cnt"></span><span class="inline"><select class="field" id="sort" aria-label="Сортировка" style="padding:6px 10px;width:auto"><option value="name">По имени</option><option value="mr" ${st.sort==='mr'?'selected':''}>По рангу мастерства</option></select><button class="btn" id="reset">Сбросить</button></span></div>
   <div class="grid" id="grid"></div><div class="more" id="more"></div></div>${foot()}`;
  let arr=[],shown=0;
  const apply=()=>{
    const q=st.q.toLowerCase().trim();
    arr=list.filter(it=>(!q||match(it._s,q))&&(!st.cat||it.category===st.cat)&&
      (!st.kind||(st.kind==='unavailable'?it._un:it.name.toLowerCase().includes(st.kind)))&&
      (!st.done||(st.done==='yes')===isDone(kind,it)));
    arr.sort(st.sort==='mr'?(a,b)=>(a.mr??99)-(b.mr??99)||a.ru.localeCompare(b.ru,'ru'):(a,b)=>a.ru.localeCompare(b.ru,'ru'));
    $('#cnt').textContent=`Найдено: ${num(arr.length)}`;
    $('#grid').innerHTML='';shown=0;more();mastery(kind);
  };
  const more=()=>{
    const slice=arr.slice(shown,shown+BATCH);shown+=slice.length;
    $('#grid').insertAdjacentHTML('beforeend',slice.length?slice.map((it,i)=>tile(kind,it,shown-slice.length+i)).join(''):(shown?'':'<div class="empty" style="grid-column:1/-1">Ничего не найдено. Попробуйте английское название или снимите фильтры.</div>'));
    $('#more').innerHTML=shown<arr.length?`<button class="btn" id="mbtn">Показать ещё (${num(arr.length-shown)})</button>`:'';
    if(shown<arr.length)io.observe($('#mbtn'));
  };
  const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){io.disconnect();more()}},{rootMargin:'600px'});
  let t;$('#q').addEventListener('input',e=>{clearTimeout(t);t=setTimeout(()=>{st.q=e.target.value;apply()},140)});
  for(const id of ['cat','kind','done','sort'])$('#'+id).addEventListener('change',e=>{st[id]=e.target.value;apply()});
  $('#reset').onclick=()=>{Object.assign(st,{q:'',cat:'',kind:'',done:'',sort:'name'});catalog(kind)};
  $('#more').addEventListener('click',e=>{if(e.target.id==='mbtn'){io.disconnect();more()}});
  $('#grid').addEventListener('click',e=>{
    const t=e.target.closest('.tile');if(!t)return;const it=arr[+t.dataset.i];
    if(e.target.closest('.mk')){const v=!isDone(kind,it);setDone(kind,it,v);t.classList.toggle('done',v);t.querySelector('.mk').setAttribute('aria-pressed',v);mastery(kind);return}
    openItem(kind,it,()=>{t.classList.toggle('done',isDone(kind,it));mastery(kind)});
  });
  $('#grid').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.classList.contains('tile'))e.target.click()});
  apply();
}
function tile(kind,it,i){
  const d=isDone(kind,it);
  return `<div class="tile cut${d?' done':''}" data-i="${i}" tabindex="0" role="button" aria-label="${esc(it.ru)}">
   <button class="mk" aria-label="Отметить освоенным" aria-pressed="${d}" title="Освоено"></button>
   ${it.img?pic(it.img,'pic',it.name):`<div class="none">${esc(it.name[0])}</div>`}
   <div class="nm">${esc(it.ru)}</div><div class="en">${esc(it.name)}</div>
   <div class="tags">${it.mr!=null?`<span class="tag">РМ ${it.mr}</span>`:''}${/Prime/.test(it.name)?'<span class="tag p">PRIME</span>':''}${it.vaulted?'<span class="tag v">Хранилище</span>':''}${it._un?'<span class="tag v">Недоступно</span>':''}</div></div>`;
}
function mastery(kind){
  const el=$('#mst');if(!el)return;const list=LIST(kind);const p=prof();
  const n=p?list.filter(it=>p.m[mkey(kind,it)]).length:0;
  el.innerHTML=`<div class="lbl"><span>${p?esc(p.name):'Без профиля'} · освоено</span><b>${n} / ${list.length}</b></div><div class="bar"><i style="width:${(n/list.length*100).toFixed(1)}%"></i></div>`;
}

/* ---------- Подробности ---------- */
let onClose=null;
function openItem(kind,it,cb){
  onClose=cb||null;
  const relhtml=s=>esc(s).replace(/\b(?:Lith|Meso|Neo|Axi|Requiem|Vanguard) [A-Z]\d+\b/g,n=>`<button data-rel="${n}">${n}</button>`);
  const d=$('#drawer');
  d.innerHTML=`<button class="close" id="dclose" aria-label="Закрыть">×</button>
   <div class="dhead">${it.img?pic(it.img,'',it.name,132):`<div class="none">${esc(it.name[0])}</div>`}
    <div><h2>${esc(it.ru)}</h2><div class="en">${esc(it.name)} · ${esc(it.category)}</div>
    <div class="tags">${it.mr!=null?`<span class="tag">РМ ${it.mr}</span>`:''}${/Prime/.test(it.name)?'<span class="tag p">PRIME</span>':''}${it.vaulted?'<span class="tag v">В хранилище</span>':''}${it.cap>30?`<span class="tag">Ранг до ${it.cap}</span>`:''}</div></div></div>
   <p class="route">${esc(it.method)}</p>
   <button class="toggle${isDone(kind,it)?' on':''}" id="dtog"><span class="mk"></span><span id="dtogt">${isDone(kind,it)?'Освоено':'Отметить освоенным'}</span></button>
   <div class="slabel">Состав и получение</div>
   ${it.parts.map(p=>`<div class="part"><b>${esc(p.name)}</b><span class="q">×${p.qty}</span><div class="w">${esc(p.where)}${p.relics?`<div class="rel">${relhtml(p.relics)}</div>`:''}</div></div>`).join('')||'<p class="route">Отдельных деталей нет.</p>'}
   ${it.materials.length?`<div class="slabel">Материалы рецепта</div><div class="chips">${it.materials.map(m=>`<button class="chip" data-res="${esc(m.en||m.name)}">${pic(m.img||D.matImg[m.en||m.name],'',m.name,24)}${esc(m.name)} × ${num(m.qty)}</button>`).join('')}</div>`:''}
   ${it.pr?`<div class="stats" style="margin-top:14px">${box('Набор на рынке',`≈ ${it.pr} платины <a href="https://warframe.market/items/${esc(it.name.toLowerCase().replace(/[^a-z0-9]+/g,'_'))}_set" target="_blank" rel="noopener" style="font:500 12px var(--f-body)">warframe.market</a>`)}</div>`:''}
   ${statsHtml(kind,it)}
   <div id="drec"></div>
   <div class="src">Источник: <a href="${esc(it.source)}" target="_blank" rel="noopener">WARFRAME Wiki — ${esc(it.name)}</a>; состав и реликвии — WFCD. Билды сообщества: <a href="https://overframe.gg/search/?q=${encodeURIComponent(it.name)}" target="_blank" rel="noopener">Overframe</a>.</div>`;
  recInDrawer(kind,it);
  $('#scrim').hidden=false;d.hidden=false;d.scrollTop=0;$('#dclose').focus();
  $('#dtog').onclick=()=>{const v=!isDone(kind,it);setDone(kind,it,v);$('#dtog').classList.toggle('on',v);$('#dtogt').textContent=v?'Освоено':'Отметить освоенным'};
  d.onclick=e=>{const r=e.target.closest('[data-rel]'),m=e.target.closest('[data-res]');
    if(r){state.relics.q=r.dataset.rel;location.hash='relics'}
    if(m){const res=D.resByEn[m.dataset.res.toLowerCase()];state.resources.q=res?res.ru:m.dataset.res;location.hash='resources'}};
}
function closeDrawer(silent){const d=$('#drawer');if(d.hidden)return;d.hidden=true;$('#scrim').hidden=true;if(onClose)onClose();onClose=null}
$('#scrim').onclick=()=>closeDrawer();
document.addEventListener('click',e=>{if(e.target.id==='dclose')closeDrawer()});
addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});

/* ---------- Реликвии и ресурсы ---------- */
function table(kind){
  const st=state[kind],list=D[kind];
  view.innerHTML=`<div class="wrap"><div class="head"><div><div class="eyebrow">${kind==='relics'?'Реликвии Бездны':'Материалы'}</div><h1>${kind==='relics'?'Реликвии':'Ресурсы'}</h1>
   <p class="sub">${kind==='relics'?'Где взять каждую реликвию и выпадает ли она сейчас. Статус обновляется автоматически каждую неделю.':'Где добывать ресурсы для рецептов.'}</p></div></div>
   <div class="tools short"><input class="field q" id="q" type="search" placeholder="${kind==='relics'?'Например, Axi A1 или Lith':'Название ресурса или планета'}" aria-label="Поиск" value="${esc(st.q)}"></div>
   <div class="info"><span id="cnt"></span></div><div class="rows" id="rows"></div><div class="more" id="more"></div></div>${foot()}`;
  let arr=[],shown=0;
  const RAR3={Common:'обычная',Uncommon:'необычная',Rare:'редкая'};
  const fis=k=>{const era=(k.name.split(' ')[0]||'');const f=WS&&WS.fissures?WS.fissures.filter(x=>x.tier===era&&!x.isStorm&&!x.expired):[];
    return f.length?`<span class="tag ok" style="display:inline-block;margin-top:6px" title="${esc(f.map(x=>x.node+' — '+x.missionType+(x.isHard?' (Стальной путь)':'')).join('\n'))}">Разломов ${esc(era)} сейчас: ${f.filter(x=>!x.isHard).length} + ${f.filter(x=>x.isHard).length} СП</span>`:''};
  const row=it=>kind==='relics'
    ?`<div class="row cut">${pic(it.img,'',it.name,52)||'<span></span>'}<div><div class="t">${esc(it.name)}</div><div class="s">${esc(it.status)}</div>${it.vaulted!=null?`<span class="tag ${it.vaulted?'v':'ok'}" style="display:inline-block;margin-top:6px">${it.vaulted?'Сейчас в хранилище':'Сейчас выпадает'}</span> `:''}${fis(it)}${it.ev?` <span class="tag p" style="display:inline-block;margin-top:6px" title="Ожидаемая ценность содержимого целой реликвии по ценам warframe.market">≈ ${fmt(it.ev)} пл.</span>`:''}</div>
      <div class="w">${esc(it.where)}${it.rw?`<div class="chips" style="margin-top:8px">${it.rw.map(x=>`<${x.k?'button':'span'} class="chip"${x.k?` data-item="${esc(x.k)}"`:''} title="${esc(x.n)} · ${esc(RAR3[x.r]||x.r||'')} · ${fmt(x.c)}%"><span class="r-${x.r}">●</span>${esc(x.ru)}${x.p?` · ${x.p} пл.`:''}</${x.k?'button':'span'}>`).join('')}</div>`:''}</div></div>`
    :`<div class="row cut">${pic(it.img,'',it.name,52)||'<span></span>'}<div><div class="t">${esc(it.ru)}</div><div class="s">${esc(it.name)}</div></div><div class="w">${esc(it.where)}${(()=>{const u=usedIn(it);return u.length?`<div class="slabel" style="margin:10px 0 6px">Нужен для (${u.length})</div><div class="chips">${u.slice(0,24).map(([k,x,q])=>`<button class="chip" data-item="${k}:${esc(x.name)}">${pic(x.img,'',x.name,24)}${esc(x.ru)} × ${num(q)}</button>`).join('')}${u.length>24?`<span class="chip">и ещё ${u.length-24}</span>`:''}</div>`:''})()}</div></div>`;
  const more=()=>{const s=arr.slice(shown,shown+80);shown+=s.length;$('#rows').insertAdjacentHTML('beforeend',s.map(row).join('')||(shown?'':'<div class="empty">Ничего не найдено.</div>'));
    $('#more').innerHTML=shown<arr.length?`<button class="btn" id="mbtn">Показать ещё (${num(arr.length-shown)})</button>`:''};
  if(kind==='relics'&&!WS)loadWS().then(()=>{if(cur==='relics'){$('#rows').innerHTML='';shown=0;more()}}).catch(()=>{});
  const apply=()=>{const q=st.q.toLowerCase().trim();arr=list.filter(it=>!q||match(it._s,q));$('#cnt').textContent=`Найдено: ${num(arr.length)}`;$('#rows').innerHTML='';shown=0;more()};
  let t;$('#q').addEventListener('input',e=>{clearTimeout(t);t=setTimeout(()=>{st.q=e.target.value;apply()},140)});
  $('#more').onclick=e=>{if(e.target.id==='mbtn')more()};
  apply();
}

/* ---------- Новое в игре ---------- */
function fresh(){
  const items=D.fresh.map(f=>[f.k,D.byName[f.k+':'+f.name],f.date]).filter(x=>x[1]);
  view.innerHTML=`<div class="wrap"><div class="head"><div><div class="eyebrow">Автообновление</div><h1>Новое в игре</h1>
   <p class="sub">Последние предметы, вышедшие в игре, по дате выхода. Каталог обновляется автоматически каждую неделю.</p></div></div>
   <div class="grid" id="grid" style="margin-top:14px">${items.map(([k,it,d],i)=>tile(k,it,i).replace('<div class="tags">',`<div class="tags"><span class="tag ok">${esc(d)}</span>`)).join('')}</div></div>${foot()}`;
  $('#grid').onclick=e=>{const t=e.target.closest('.tile');if(!t)return;const [k,it]=items[+t.dataset.i];
    if(e.target.closest('.mk')){const v=!isDone(k,it);setDone(k,it,v);t.classList.toggle('done',v);return}openItem(k,it,()=>t.classList.toggle('done',isDone(k,it)))};
}

/* ---------- Справка ---------- */
function guide(){view.innerHTML=`<div class="wrap guide"><div class="head"><div><div class="eyebrow">Справка</div><h1>Как пользоваться</h1></div></div><div class="g cut">${D.guide}</div></div>${foot()}`}

/* ---------- Профиль и освоение ---------- */
function profile(){
  const p=prof();
  const stat=(label,list,kind)=>{const n=p?list.filter(it=>p.m[mkey(kind,it)]).length:0;return `<div class="stat"><span>${esc(label)}</span><span class="n">${n} / ${list.length}</span><div class="bar"><i style="width:${list.length?(n/list.length*100).toFixed(1):0}%"></i></div></div>`};
  const byCat={};for(const w of D.weapons)(byCat[w.category]=byCat[w.category]||[]).push(w);
  view.innerHTML=`<div class="wrap"><div class="head"><div><div class="eyebrow">Тэнно</div><h1>Профиль</h1>
   <p class="sub">Профили хранятся в этом браузере. Создайте отдельный профиль для каждого игрока на этом устройстве, а чтобы перенести прогресс на другое устройство, используйте код профиля.</p></div></div>
   <div class="cols">
    ${cloudCard()}
    <section class="card cut"><h3>Профили</h3>
      <div class="plist">${Object.entries(S.profiles).map(([id,x])=>`<div class="pitem${id===S.cur?' cur':''}"><span class="nm">${x.cloud?'☁ ':''}${esc(x.name)}</span><span class="n">${Object.keys(x.m).length} освоено</span>${user&&!x.cloud&&S.profiles.cloud?`<button class="btn" data-merge="${id}" title="Добавить отметки этого профиля в облачный">В облако</button>`:''}${id===S.cur?'<span class="tag p">Активен</span>':`<button class="btn" data-use="${id}">Выбрать</button>`}</div>`).join('')||'<p>Профилей пока нет — войдите в облачный аккаунт или создайте профиль в браузере.</p>'}</div>
      <form class="inline" id="pnew"><input class="field" id="pname" maxlength="40" placeholder="Имя нового профиля в браузере" aria-label="Имя нового профиля" required><button class="btn gold" type="submit">Создать</button></form>
      ${p?`<div class="inline" style="margin-top:10px"><input class="field" id="prn" maxlength="40" value="${esc(p.name)}" aria-label="Имя профиля"><button class="btn" id="prename">Переименовать</button>${S.cur==='cloud'?'':'<button class="btn danger" id="pdel">Удалить</button>'}</div><div id="pconf"></div>`:''}
    </section>
    <section class="card cut"><h3>Освоение${p?' — '+esc(p.name):''}</h3>
      ${stat('Варфреймы и некрамехи',D.frames,'frames')}${stat('Компаньоны',D.companions,'companions')}${stat('Всё оружие',D.weapons,'arsenal')}
      ${Object.keys(byCat).sort((a,b)=>byCat[b].length-byCat[a].length).map(c=>stat(c,byCat[c],'arsenal')).join('')}
    </section>
    <section class="card cut"><h3>Синхронизация с игрой <span class="tag p" style="vertical-align:middle;margin-left:6px">В разработке</span></h3>
      <p>Автоматический перенос освоенного из аккаунта Warframe пока в разработке: игра больше не показывает ID аккаунта, а поиск профиля по нику отключён. Пока отмечайте освоенное вручную ромбом на карточках оружия, варфреймов и компаньонов.</p>
    </section>
    <section class="card cut"><h3>Перенос между устройствами</h3>
      <p>Скопируйте код профиля и вставьте его на другом устройстве, чтобы перенести отметки.</p>
      <div class="inline"><button class="btn" id="pexp" ${p?'':'disabled'}>Скопировать код профиля</button></div>
      <textarea class="field" id="pcode" style="margin-top:8px" placeholder="Код профиля появится здесь, или вставьте сюда чужой код" aria-label="Код профиля"></textarea>
      <div class="inline" style="margin-top:8px"><button class="btn" id="pin">Загрузить из кода</button></div><div id="pmsg2" class="msg"></div>
    </section>
   </div></div>${foot()}`;
  view.querySelectorAll('[data-use]').forEach(b=>b.onclick=()=>{S.cur=b.dataset.use;save();profile()});
  view.querySelectorAll('[data-merge]').forEach(b=>b.onclick=()=>{const src=S.profiles[b.dataset.merge],c=S.profiles.cloud;if(!src||!c)return;Object.assign(c.m,src.m);S.cur='cloud';save();profile()});
  cloudBind();
  $('#pnew').onsubmit=e=>{e.preventDefault();newProfile($('#pname').value.trim());profile()};
  if(p){
    $('#prename').onclick=()=>{p.name=$('#prn').value.trim()||p.name;save();profile()};
    if($('#pdel'))$('#pdel').onclick=()=>{$('#pconf').innerHTML=`<div class="confirm">Удалить профиль «${esc(p.name)}» и все его отметки? Отменить это нельзя. <div class="inline" style="margin-top:8px"><button class="btn danger" id="pdel2">Да, удалить</button><button class="btn" id="pdelno">Отмена</button></div></div>`;
      $('#pdel2').onclick=()=>{delete S.profiles[S.cur];S.cur=Object.keys(S.profiles)[0]||null;save();profile()};$('#pdelno').onclick=()=>{$('#pconf').innerHTML=''}};
  }
  if(p)$('#pexp').onclick=()=>{const code=btoa(unescape(encodeURIComponent(JSON.stringify({n:p.name,m:Object.keys(p.m)}))));$('#pcode').value=code;
    navigator.clipboard?.writeText(code).then(()=>msg('#pmsg2','Код скопирован.'),()=>{$('#pcode').select();msg('#pmsg2','Код выделен — скопируйте его.')})};
  $('#pin').onclick=()=>{try{const o=JSON.parse(decodeURIComponent(escape(atob($('#pcode').value.trim()))));const id=newProfile(String(o.n||'Тэнно').slice(0,40));for(const k of o.m||[])S.profiles[id].m[k]=1;save();profile()}catch(_){msg('#pmsg2','Код не распознан. Скопируйте его целиком.',1)}};
}
function msg(sel,t,err){const el=$(sel);if(!el)return;el.className='msg '+(err?'err':'ok');el.textContent=t}

/* ---------- Хроники ---------- */
const L=window.LORE;let li=0,lcv=null,lraf=0;
function lore(start){
  let ok=false;try{ok=!!sessionStorage.getItem('lore-ok')}catch(_){}
  view.innerHTML=`<section class="lore" id="lore"><canvas id="lcv" aria-hidden="true"></canvas><div class="vig"></div>
   <div class="in"><div class="stage" id="stage" aria-live="polite"></div>
    <div class="tl"><div class="tl-in"><button class="arrow" id="lprev" aria-label="Предыдущее событие">‹</button>
     <div class="track" id="ltrack"><div class="eras">${L.ERAS.map(er=>`<div class="eg" data-era="${er.id}" style="--ec:${er.col}"><span>${er.name}</span><div class="dots">${L.EV.map((e,i)=>e.era===er.id?`<button class="dot" data-i="${i}" aria-label="${esc(e.title)}" title="${esc(e.title)}"></button>`:'').join('')}</div></div>`).join('')}</div></div>
     <button class="arrow" id="lnext" aria-label="Следующее событие">›</button></div>
     <div class="lprog"><i id="lbar"></i></div><div class="lhint">${L.EV.length} событий · ← → на клавиатуре, свайп или колесо мыши</div></div></div>
   ${ok?'':`<div class="spoil" id="spoil"><div><h2>Осторожно, спойлеры</h2><p>Здесь кратко пересказан весь сюжет Warframe, включая квесты «Второй сон», «Новая война», «Старый мир» и «Пролог к Тау». Если ещё не прошли их, лучше сначала пройти.</p><button class="btn gold" id="lok">Всё равно смотреть</button></div></div>`}</section>`;
  if(!ok)$('#lok').onclick=()=>{$('#spoil').remove();try{sessionStorage.setItem('lore-ok','1')}catch(_){}};
  $('#ltrack').onclick=e=>{const b=e.target.closest('.dot');if(b)showEv(+b.dataset.i)};
  $('#lprev').onclick=()=>showEv(li-1);$('#lnext').onclick=()=>showEv(li+1);
  const lv=$('#lore');let wl=0,tx=null;
  lv.addEventListener('wheel',e=>{if(innerWidth<=860||e.target.closest('.ltext'))return;const n=Date.now();if(n-wl<700||Math.abs(e.deltaY)+Math.abs(e.deltaX)<20)return;wl=n;e.preventDefault();showEv(li+((e.deltaY||e.deltaX)>0?1:-1))},{passive:false});
  lv.addEventListener('touchstart',e=>{tx=e.touches[0].clientX},{passive:true});
  lv.addEventListener('touchend',e=>{if(tx==null)return;const dx=e.changedTouches[0].clientX-tx;if(Math.abs(dx)>60)showEv(li+(dx<0?1:-1));tx=null},{passive:true});
  startCanvas();showEv(start||0,true);
}
function showEv(i,noHash){
  if(!$('#stage'))return;
  li=Math.max(0,Math.min(L.EV.length-1,i));const e=L.EV[li],er=L.ERAS.find(x=>x.id===e.era);
  document.documentElement.style.setProperty('--accent',er.col);lcol=er.bg;
  $('#stage').innerHTML=`<div class="emblem" style="color:${er.col}"><div class="halo"></div><svg viewBox="0 0 400 400" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${L.EM[e.em]||L.EM.wake}</svg></div>
   <div class="ltext reveal"><div class="era">${er.name}</div><h2>${esc(e.title)}</h2><div class="when">${esc(e.when)}</div>${e.p.map(t=>`<p>${esc(t)}</p>`).join('')}${e.quest?`<div><span class="quest cut">Квест: ${esc(e.quest)}</span></div>`:''}</div>`;
  document.querySelectorAll('.dot').forEach(d=>d.classList.toggle('on',+d.dataset.i===li));
  document.querySelectorAll('.eg').forEach(g=>g.classList.toggle('cur',g.dataset.era===e.era));
  const on=document.querySelector('.dot.on');if(on)on.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'});
  $('#lprev').disabled=li===0;$('#lnext').disabled=li===L.EV.length-1;
  $('#lbar').style.width=((li+1)/L.EV.length*100)+'%';
  const h='#lore-'+(li+1);if(!noHash&&location.hash!==h)history.replaceState(null,'',h);
}
addEventListener('keydown',e=>{if(cur!=='lore'||!$('#stage')||e.target.closest('input,textarea,select'))return;if(e.key==='ArrowRight')showEv(li+1);if(e.key==='ArrowLeft')showEv(li-1)});
let lcol=[214,180,106],lc=[214,180,106];
function startCanvas(){
  const cv=$('#lcv');if(!cv)return;const cx=cv.getContext('2d');const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W,H,P;const size=()=>{const d=Math.min(devicePixelRatio||1,1.5);W=cv.width=cv.clientWidth*d;H=cv.height=cv.clientHeight*d;
    P=Array.from({length:Math.min(140,Math.round(cv.clientWidth*cv.clientHeight/11000))},()=>({x:Math.random()*W,y:Math.random()*H,r:(Math.random()*1.5+.4)*d,v:Math.random()*.25+.05,a:Math.random()*6.3,t:Math.random()*6}))};
  size();const ro=new ResizeObserver(size);ro.observe(cv);let tick=0;
  const frame=()=>{if(!document.body.contains(cv)){ro.disconnect();return}tick++;lc=lc.map((c,i)=>c+(lcol[i]-c)*.04);const rgb=lc.map(Math.round).join(',');
    cx.clearRect(0,0,W,H);const g=cx.createRadialGradient(W*.32,H*.45,0,W*.32,H*.45,Math.max(W,H)*.6);g.addColorStop(0,`rgba(${rgb},.15)`);g.addColorStop(1,'rgba(6,10,17,0)');cx.fillStyle=g;cx.fillRect(0,0,W,H);
    for(const p of P){p.a+=.003;p.x+=Math.cos(p.a)*p.v;p.y-=p.v;if(p.y<-5){p.y=H+5;p.x=Math.random()*W}
      cx.fillStyle=`rgba(${rgb},${(.3+.6*Math.abs(Math.sin(tick*.01+p.t))).toFixed(2)})`;cx.fillRect(p.x,p.y,p.r,p.r)}
    if(!reduce&&!document.hidden)lraf=requestAnimationFrame(frame);else lraf=0};
  cancelAnimationFrame(lraf);frame();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&cur==='lore'&&!lraf&&!reduce)frame()});
}
function stopLore(){cancelAnimationFrame(lraf);lraf=0}

/* ---------- Общие помощники для модов и билдов ---------- */
const W=window.WA;
const POLS=['madurai','vazarin','naramon','zenurik','unairu','penjaga','umbra','any'];
const POLCOL={madurai:'#e8a66a',vazarin:'#8fc9e0',naramon:'#d9c48e',zenurik:'#b9a0e6',unairu:'#c4bcb0',penjaga:'#8fd0a8',umbra:'#e6cc93',any:'#ede7dd'};
const polIcon=p=>p&&POLCOL[p]?`<span class="pol" title="${esc(W.POL[p]||p)}" style="color:${POLCOL[p]}"><i style="--m:url(pol/${p}.svg)"></i></span>`:'';
const polRow=l=>l&&l.length?l.map(polIcon).join(''):null;
const fmt=v=>v==null?'—':(Math.abs(v)>=100?Math.round(v):Math.round(v*100)/100).toLocaleString('ru');
const pct=v=>v==null?null:fmt(v*100)+'%';
const box=(k,v)=>v==null||v===''?'':`<div class="stat2"><div class="k">${k}</div><div class="v">${v}</div></div>`;
const enc=o=>btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const dec=s=>{try{return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g,'+').replace(/_/g,'/')))))}catch(_){return null}};
let MODS=null,modsP=null;
function loadMods(){
  if(MODS)return Promise.resolve(MODS);
  if(!modsP)modsP=fetch('mods.json?v='+(window.WA_V||'')).then(r=>r.json()).then(j=>{
    j.byN={};for(const m of j.mods){if(!j.byN[m.n])j.byN[m.n]=m;m._s=(m.ru+' '+m.n+' '+m.rs.join(' ')+' '+m.en.join(' ')).toLowerCase()}
    j.arcN={};for(const a of j.arcanes){j.arcN[a.n]=a;a._s=(a.ru+' '+a.n+' '+a.rs.join(' ')).toLowerCase()}
    MODS=j;return j});
  return modsP;
}
function elChips(dmg){
  if(!dmg)return '';const tot=Object.values(dmg).reduce((a,b)=>a+b,0)||1;
  return `<div class="elchips">${Object.entries(dmg).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<span class="el" style="color:${W.ELC[k]||'#ccc'}">${esc(W.EL[k]||k)} ${fmt(v)} <small style="color:var(--muted)">${Math.round(v/tot*100)}%</small></span>`).join('')}</div>`;
}
function statsHtml(kind,it){
  const st=it.st;if(!st)return '';
  let h='<div class="slabel">Характеристики</div>';
  if(kind==='arsenal'){
    h+=`<div class="stats">${box('Урон',st.tot!=null?fmt(st.tot):null)}${box('Крит. шанс',pct(st.cc))}${box('Крит. урон',st.cm!=null?'×'+fmt(st.cm):null)}${box('Шанс статуса',pct(st.sc))}
      ${box(st.wt==='Melee'?'Скорость атаки':'Скорострельность',st.fr!=null?fmt(st.fr):null)}${box('Магазин',st.mag)}${box('Перезарядка',st.rl!=null?fmt(st.rl)+' с':null)}
      ${box('Мультивыстрел',st.ms&&st.ms!==1?fmt(st.ms):null)}${box('Дальность',st.rng!=null?fmt(st.rng)+' м':null)}${box('Тяжёлая атака',st.heavy?fmt(st.heavy):null)}
      ${box('Предрасположенность',st.disp?'●'.repeat(st.disp)+'○'.repeat(Math.max(0,5-st.disp)):null)}${box('Полярности',polRow(st.pol))}${box('Эксилус',polIcon(st.exi)||null)}${box('Стойка',polIcon(st.stp)||null)}</div>${elChips(st.dmg)}`;
  }else{
    h+=`<div class="stats">${box('Здоровье',st.hp)}${box('Щиты',st.sh)}${box('Броня',st.ar)}${box('Энергия',st.en)}${box('Скорость',st.sp)}${box('Аура',polIcon(st.aura)||null)}${box('Эксилус',polIcon(st.exi)||null)}${box('Полярности',polRow(st.pol))}</div>`;
    if(st.passive)h+=`<div class="slabel">Пассивный навык</div><p class="route">${esc(st.passive)}</p>`;
    if(st.ab)h+=`<div class="slabel">Способности</div>${st.ab.map(a=>`<div class="ab">${pic(a.img,'',a.n,44)||'<span></span>'}<div><b>${esc(a.n)}</b><p>${esc(a.d)}</p></div></div>`).join('')}`;
  }
  return h;
}

/* ---------- Правила совместимости и ёмкости ---------- */
const GEN=new Set(['WARFRAME','AURA','Rifle','PRIMARY','Assault Rifle','Sniper','Bow','Shotgun','Pistol','Pistol (No Aoe)','Melee','Thrown Melee','Claws','Daggers','Dual Daggers','Polearms','Tome','Unique','Thrown','ANY','COMPANION','BEAST','ROBOTIC','Archgun','Archmelee','Necramech','Hound','Moa','Kavat','Kubrow','Sentinel','Archwing','K-Drive','Parazon']);
const baseN=n=>n.replace(/ (Prime|Umbra|Wraith|Vandal|Prisma)$/,'').replace(/^(Kuva|Tenet|Coda|Prisma|Mutalist|Rakta|Sancti|Secura|Synoid|Telos|Vaykor|Dex|MK1-) /,'');
const augOK=(m,it)=>m.c&&!GEN.has(m.c)&&(it.name===m.c||baseN(it.name)===m.c||it.name.startsWith(m.c+' '));
function bkOf(kind,it){return it.bk||null}
function layout(bk){
  return ({frame:{aura:'Аура',exi:1,n:8,arc:2,arcT:['Warframe Arcane']},necramech:{n:12,arc:0},companion:{n:10,arc:0},
    melee:{aura:'Стойка',exi:1,n:8,arc:1,arcT:['Melee Arcane']},rifle:{exi:1,n:8,arc:1,arcT:['Primary Arcane','Bow Arcane']},
    shotgun:{exi:1,n:8,arc:1,arcT:['Primary Arcane','Shotgun Arcane']},pistol:{exi:1,n:8,arc:1,arcT:['Secondary Arcane']},
    archgun:{n:8,arc:0},archmelee:{n:8,arc:0}})[bk];
}
function defaults(it,bk){const st=it.st||{},L=layout(bk),pol=st.pol||[];
  return {s:Array.from({length:L.n},(_,i)=>pol[i]||null),a:L.aura?(bk==='melee'?st.stp:st.aura)||null:null,x:L.exi?st.exi||null:null}}
function compat(m,it,bk,slot){
  if(slot==='a')return bk==='melee'?m.t==='Stance Mod':m.c==='AURA';
  if(slot==='x'&&!m.exi)return false;
  if(m.t==='Stance Mod'||m.c==='AURA')return false;
  const wt=(it.st||{}).wt;
  switch(bk){
    case 'frame':return m.t==='Warframe Mod'&&(m.c==='WARFRAME'||augOK(m,it));
    case 'necramech':return m.t==='Necramech Mod';
    case 'companion':{if(m.t!=='Companion Mod')return false;if(m.c==='COMPANION'||augOK(m,it))return true;const beast=it.category!=='Стражи';
      if(m.c==='BEAST')return beast;if(m.c==='ROBOTIC'||m.c==='Sentinel')return !beast;if(m.c==='Kavat')return it.category==='Каваты';if(m.c==='Kubrow')return it.category==='Кубрау';return false}
    case 'rifle':return m.t==='Primary Mod'&&(!m.c||['Rifle','PRIMARY','Assault Rifle'].includes(m.c)||(m.c==='Sniper'&&wt==='Sniper')||(m.c==='Bow'&&wt==='Bow')||augOK(m,it));
    case 'shotgun':return (m.t==='Shotgun Mod'&&(!m.c||m.c==='Shotgun'||augOK(m,it)))||(m.t==='Primary Mod'&&m.c==='PRIMARY');
    case 'pistol':return m.t==='Secondary Mod'&&(!m.c||['Pistol','Pistol (No Aoe)','Thrown'].includes(m.c)||augOK(m,it));
    case 'melee':return m.t==='Melee Mod'&&(!m.c||m.c==='Melee'||augOK(m,it));
    case 'archgun':return m.t==='Arch-Gun Mod';
    case 'archmelee':return m.t==='Arch-Melee Mod';
  }
  return false;
}
// Ёмкость: совпадение полярности — расход вдвое меньше (с округлением вверх), несовпадение — +25%.
// Аура и стойка добавляют ёмкость: при совпадении вдвое больше, при несовпадении на 20% меньше.
function cost(sp,m,r){
  if(!m)return 0;
  if(m.d<0){let bonus=-m.d+r;if(sp&&m.p){if(sp===m.p||(sp==='any'&&m.p!=='umbra'))bonus*=2;else bonus=Math.floor(bonus*0.8)}return -bonus}
  const base=m.d+r;if(!sp||!m.p)return base;
  const same=sp===m.p||(sp==='any'&&m.p!=='umbra');
  return same?Math.ceil(base/2):Math.ceil(base*1.25);
}
const MD=n=>n==='__riven'?rivenMod():n&&MODS&&MODS.byN[n];
// Ривен-мод: свои характеристики (до 4), полярность и расход на 8 ранге
const RIVST=[['dmg','Damage','Урон'],['ms','Multishot','Мультивыстрел'],['cc','Critical Chance','Шанс крита'],['cd','Critical Damage','Крит. урон'],['sc','Status Chance','Шанс статуса'],
  ['fr','Fire Rate','Скорострельность / скорость атаки'],['mag','Magazine Capacity','Магазин'],['rl','Reload Speed','Скорость перезарядки'],['heat','Heat','Огонь'],['cold','Cold','Холод'],
  ['electricity','Electricity','Электричество'],['toxin','Toxin','Токсин'],['impact','Impact','Удар'],['puncture','Puncture','Прокол'],['slash','Slash','Разрез']];
function rivenMod(){const r=(CB&&CB.riv)||{p:'madurai',cost:18,st:[]};const L=r.st.filter(s=>s[0]&&s[1]);
  return {n:'__riven',ru:'Мод Разлома',p:r.p||null,d:Math.max(0,(r.cost||18)-8),f:8,r:'Riven',img:null,
    en:L.map(([k,v])=>`${v>=0?'+':''}${v}% ${(RIVST.find(x=>x[0]===k)||[0,k])[1]}`),rs:L.map(([k,v])=>`${v>=0?'+':''}${v}% ${(RIVST.find(x=>x[0]===k)||[0,0,k])[2]}`)}}
// Осколки архонта (WARFRAME Wiki, Archon Shard): [ключ для расчёта, значение, текст]; закалённые (Tauforged) ×1,5
const SHARDS={crimson:['Багровый',[['str',10,'Сила способностей +{v}%'],['dur',10,'Длительность +{v}%'],[null,25,'Крит. урон ближнего боя +{v}%'],[null,25,'Шанс статуса основного оружия +{v}%'],[null,25,'Шанс крита вторичного оружия +{v}%']]],
  amber:['Янтарный',[[null,30,'Энергия при появлении +{v}%'],[null,100,'Сферы здоровья +{v}%'],[null,50,'Сферы энергии +{v}%'],[null,25,'Скорость применения +{v}%'],[null,15,'Скорость паркура +{v}%']]],
  azure:['Лазурный',[['fhp',150,'Здоровье +{v}'],['fsh',150,'Щиты +{v}'],['fen',50,'Энергия +{v}'],['far',150,'Броня +{v}'],[null,5,'Регенерация здоровья +{v}/с']]],
  emerald:['Изумрудный',[[null,30,'Урон статуса Токсин +{v}%'],[null,2,'+{v} здоровья за удар токсином'],[null,10,'Урон способностей по целям с Коррозией +{v}%'],[null,2,'Макс. зарядов Коррозии +{v}']]],
  topaz:['Топазовый',[[null,1,'+{v} к макс. здоровью за убийство взрывом (до 300)'],[null,5,'+{v} щитов за убийство взрывом'],[null,1,'+{v}% крита вторичного за убийство под Огнём'],[null,10,'Урон способностей по целям с Радиацией +{v}%']]],
  violet:['Фиолетовый',[[null,10,'Урон способностей по целям с Электричеством +{v}%'],[null,30,'Электричество основного оружия +{v}%'],[null,25,'Крит. урон ближнего боя +{v}%'],[null,20,'Сферы здоровья дают +{v}% энергии и наоборот']]]};
const SHCOL={crimson:'#d24a4a',amber:'#e0a040',azure:'#4aa8e0',emerald:'#4ac07a',topaz:'#e0c040',violet:'#a070e0'};
const shardText=s=>{const o=SHARDS[s.c]&&SHARDS[s.c][1][s.o];if(!o)return '';const v=o[1]*(s.t?1.5:1);return o[2].replace('{v}',fmt(v))};
function emptyBuild(kind,it){const bk=bkOf(kind,it),L=layout(bk),d=defaults(it,bk);
  return {k:kind,i:it.name,rt:1,a:L.aura?{p:d.a,m:null,r:0}:null,x:L.exi?{p:d.x,m:null,r:0}:null,s:d.s.map(p=>({p,m:null,r:0})),c:Array(L.arc).fill(null),title:'',sh:bk==='frame'?Array(5).fill(null):[],fac:'',riv:null,prio:null}}
function setMod(slot,n){const m=MD(n);if(slot&&m){slot.m=n;slot.r=m.f}}
function itemOf(b){return D.byName[b.k+':'+b.i]}
function calc(b){
  const it=itemOf(b),bk=bkOf(b.k,it),def=defaults(it,bk);
  const base=(it.cap||30)*(b.rt?2:1);let used=0,bonus=0;const f={forma:0,aura:0,stance:0,umbra:0,omni:0};
  const all=[...(b.a?[['a',b.a,def.a]]:[]),...(b.x?[['x',b.x,def.x]]:[]),...b.s.map((x,i)=>['s',x,def.s[i]])];
  for(const [t,x,dp] of all){const cc=cost(x.p,MD(x.m),x.r);if(cc<0)bonus+=-cc;else used+=cc;
    if(x.p&&x.p!==dp){if(x.p==='umbra')f.umbra++;else if(x.p==='any')f.omni++;else if(t==='a')f[bk==='melee'?'stance':'aura']++;else f.forma++}}
  const cap=base+bonus;return {cap,base,bonus,used,free:cap-used,f};
}
function optimize(b){
  const it=itemOf(b),bk=bkOf(b.k,it),def=defaults(it,bk);
  if(b.a)b.a.p=def.a;if(b.x)b.x.p=def.x;
  const mods=b.s.filter(x=>x.m&&MD(x.m)).map(x=>({m:x.m,r:x.r}));
  const slots=def.s.map(p=>({p,m:null,r:0}));
  mods.sort((u,v)=>(MD(v.m).d+v.r)-(MD(u.m).d+u.r));
  const rest=[];
  for(const mo of mods){const i=slots.findIndex(s=>!s.m&&s.p&&s.p===MD(mo.m).p);if(i>=0){slots[i].m=mo.m;slots[i].r=mo.r}else rest.push(mo)}
  for(const mo of rest){let i=slots.findIndex(s=>!s.m&&!s.p);if(i<0)i=slots.findIndex(s=>!s.m);slots[i].m=mo.m;slots[i].r=mo.r}
  b.s=slots;
  for(let g=0;g<24&&calc(b).free<0;g++){
    let best=null,gain=0;
    for(const x of [...(b.a?[b.a]:[]),...(b.x?[b.x]:[]),...b.s]){const m=MD(x.m);if(!m||!m.p||x.p===m.p)continue;const d=cost(x.p,m,x.r)-cost(m.p,m,x.r);if(d>gain){gain=d;best=x}}
    if(!best)break;best.p=MD(best.m).p;
  }
  return b;
}
// Вариант без форм: стандартные полярности, моды расставлены под них; если не помещается — убираются наименее важные
function zeroForma(b){
  const it=itemOf(b),bk=bkOf(b.k,it),def=defaults(it,bk);
  if(b.a)b.a.p=def.a;if(b.x)b.x.p=def.x;
  let mods=b.s.filter(x=>x.m&&MD(x.m)).map(x=>({m:x.m,r:x.r}));const order=(b.prio&&b.prio.length?b.prio:mods.map(x=>x.m));
  const place=()=>{const slots=def.s.map(p=>({p,m:null,r:0}));const rest=[];
    for(const mo of [...mods].sort((u,v)=>(MD(v.m).d+v.r)-(MD(u.m).d+u.r))){const i=slots.findIndex(s=>!s.m&&s.p&&s.p===MD(mo.m).p);if(i>=0){slots[i].m=mo.m;slots[i].r=mo.r}else rest.push(mo)}
    for(const mo of rest){let i=slots.findIndex(s=>!s.m&&!s.p);if(i<0)i=slots.findIndex(s=>!s.m);slots[i].m=mo.m;slots[i].r=mo.r}b.s=slots};
  place();
  for(let g=0;g<12&&calc(b).free<0&&mods.length;g++){let v=null;for(let i=order.length-1;i>=0;i--)if(mods.some(x=>x.m===order[i])){v=order[i];break}
    if(!v)v=mods[mods.length-1].m;mods=mods.filter(x=>x.m!==v);place()}
  b.title=(b.title?b.title+', ':'')+'без форм';return b;
}
function polarizeAll(b){for(const x of [...(b.a?[b.a]:[]),...(b.x?[b.x]:[]),...b.s]){const m=MD(x.m);if(m&&m.p)x.p=m.p}return b}

/* Бонус мода на текущем ранге: на максимальном — текст из игры, ниже — проценты пересчитываются пропорционально рангу */
function modBonus(m,r,mult){
  mult=mult||1;const k=(r+1)/((m.f||0)+1);
  const lines=(m.rs||[]).map(s=>(r>=m.f&&mult===1)?s:s.replace(/([+-]?)(\d+(?:[.,]\d+)?)%/g,(_,sg,v)=>sg+fmt(parseFloat(v.replace(',','.'))*(r>=m.f?1:k)*mult)+'%'));
  const full=lines.join('\n');return {full,short:lines.slice(0,2).join(' · ')};
}
/* ---------- Наборы модов ---------- */
// Умбра и Жертвенный набор усиливают сами моды набора (WARFRAME Wiki, Set Mods):
// Умбра: 2 мода — Живучесть и Волокно +30%, Усиление +25%; 3 мода — +80% и +75%. Жертвенный: оба мода +25%.
const SETNAME={UmbraSetMod:'Умбра',SacrificeSetMod:'Жертвенный',AugurSetMod:'Авгур',GladiatorSetMod:'Гладиатор',VigilanteSetMod:'Бдительный',HunterSetMod:'Охотник',MechaSetMod:'Меха',TekSetMod:'Тек',SynthSetMod:'Синтез',StrainSetMod:'Штамм',AmarSetMod:'Амар',AshenSetMod:'Пепельный',BonebladeSetMod:'Костяной клинок',BorealSetMod:'Бореал',FemurSetMod:'Бедренный',HawkSetMod:'Ястреб',NiraSetMod:'Нира',RaptorSetMod:'Раптор',SpiderSetMod:'Паук'};
const SETRU={AugurSetMod:n=>`${n}% энергии, потраченной на способности, превращается в щиты.`,GladiatorSetMod:n=>`+${n}% шанса крита ближнего боя за каждый множитель комбо.`,
  VigilanteSetMod:n=>`${n}% шанс усилить критическое попадание основного оружия на уровень.`,HunterSetMod:n=>`+${n}% урона компаньона по врагам под Кровотечением.`,
  SynthSetMod:n=>`Убранное основное и вторичное оружие перезаряжает ${n}% магазина в секунду.`};
function setCounts(b){const c={};for(const x of [...(b.a?[b.a]:[]),...(b.x?[b.x]:[]),...b.s]){const m=MD(x.m);if(m&&m.set)c[m.set]=(c[m.set]||0)+1}return c}
function setMult(m,c){if(!m||!m.set)return 1;const n=c[m.set]||0;
  if(m.set==='UmbraSetMod'){const intens=/Intensify/.test(m.n);return n>=3?(intens?1.75:1.8):n===2?(intens?1.25:1.3):1}
  if(m.set==='SacrificeSetMod')return n>=2?1.25:1;return 1}
function setsHtml(b){const c=setCounts(b);const keys=Object.keys(c);if(!keys.length)return '';
  return `<div class="slabel">Наборы модов</div><div class="stats">${keys.map(k=>{const st=MODS.sets&&MODS.sets[k];const n=c[k],max=st?st.k:n;
    let txt='';if(k==='UmbraSetMod')txt=n>=3?'Умбральная Живучесть и Волокно +80%, Умбральное Усиление +75%':n===2?'Умбральная Живучесть и Волокно +30%, Умбральное Усиление +25%':'Поставьте ещё моды Умбры для бонуса набора';
    else if(k==='SacrificeSetMod')txt=n>=2?'Оба Жертвенных мода +25%':'Поставьте второй Жертвенный мод для бонуса';
    else if(st){const raw=st.s[Math.min(n,st.s.length)-1]||'';const num=(raw.match(/\d+(?:\.\d+)?/)||[''])[0];txt=SETRU[k]?SETRU[k](num):raw}
    return box(`Набор «${esc(SETNAME[k]||k.replace('SetMod',''))}» · ${n}/${max}`,`<span style="font:500 12.5px var(--f-body);display:block;white-space:normal">${esc(txt)}</span>`)}).join('')}</div>`}
/* ---------- Расчёт характеристик ---------- */
const STATRE=/^([+-]?\d+(?:[.,]\d+)?)%\s+([A-Za-z ()]+?)\s*$/;
function modStats(m,r,mult){const k=(r+1)/((m.f||0)+1)*(mult||1),out=[];for(const s of m.en||[]){const mm=String(s).trim().match(STATRE);if(mm)out.push([mm[2].trim().toLowerCase(),parseFloat(mm[1].replace(',','.'))*k])}return out}
const FMAP={'ability strength':'str','ability duration':'dur','ability range':'rng','ability efficiency':'eff','health':'hp','shield capacity':'sh','armor':'ar','energy max':'en','sprint speed':'sp','casting speed':'cast'};
const WMAP={'damage':'dmg','melee damage':'dmg','multishot':'ms','critical chance':'cc','critical damage':'cd','status chance':'sc','fire rate':'fr','attack speed':'fr','fire rate (x2 for bows)':'fr','magazine capacity':'mag','reload speed':'rl',
  'heat':'heat','cold':'cold','electricity':'electricity','toxin':'toxin','impact':'impact','puncture':'puncture','slash':'slash','radiation':'radiation','viral':'viral','corrosive':'corrosive','magnetic':'magnetic','blast':'blast','gas':'gas'};
function combine(order){
  const prim=['heat','cold','electricity','toxin'],res=[];
  for(const [e,v] of order){
    const ex=res.find(x=>x[0]===e);if(ex){ex[1]+=v;continue}
    if(prim.includes(e)){const j=res.findIndex(x=>prim.includes(x[0])&&!x[2]);
      if(j>=0){const a=res[j][0];const c=Object.entries(W.COMBO).find(([k,[x,y]])=>(x===a&&y===e)||(x===e&&y===a));
        if(c){const ex2=res.find(x=>x[0]===c[0]);if(ex2){ex2[1]+=res[j][1]+v;res.splice(j,1)}else res[j]=[c[0],res[j][1]+v,true];continue}}}
    res.push([e,v,false]);
  }
  return res;
}
function statsOf(b){
  const SC=setCounts(b);
  const it=itemOf(b),st=it.st||{},sum={},order=[];
  for(const x of [...(b.a?[b.a]:[]),...(b.x?[b.x]:[]),...b.s]){const m=MD(x.m);if(!m)continue;
    for(const [k,v] of modStats(m,x.r,setMult(m,SC))){const key=(b.k==='arsenal'?WMAP:FMAP)[k];if(!key)continue;
      if(b.k==='arsenal'&&['heat','cold','electricity','toxin','radiation','viral','corrosive','magnetic','blast','gas'].includes(key))order.push([key,v]);else sum[key]=(sum[key]||0)+v}}
  const flat={};
  for(const s of b.sh||[]){const o=s&&SHARDS[s.c]&&SHARDS[s.c][1][s.o];if(!o||!o[0])continue;const v=o[1]*(s.t?1.5:1);if(o[0][0]==='f')flat[o[0].slice(1)]=(flat[o[0].slice(1)]||0)+v;else sum[o[0]]=(sum[o[0]]||0)+v}
  const S2=k=>sum[k]||0,F=k=>flat[k]||0;
  if(b.k!=='arsenal'){
    const hp=st.hp!=null?st.hp*(1+S2('hp')/100)+F('hp'):null,sh=st.sh!=null?st.sh*(1+S2('sh')/100)+F('sh'):null,ar=st.ar!=null?st.ar*(1+S2('ar')/100)+F('ar'):null;
    const dr=ar!=null?ar/(ar+300):0,dr0=st.ar!=null?st.ar/(st.ar+300):0;
    return {kind:'body',rows:[['Сила',100+S2('str'),'%'],['Длительность',100+S2('dur'),'%'],['Дальность',100+S2('rng'),'%'],['Эффективность',Math.min(175,100+S2('eff')),'%'],
      ['Здоровье',hp,''],['Щиты',sh,''],['Броня',ar,''],['Снижение урона',dr*100,'%'],['Эффективное здоровье',hp!=null?hp/(1-dr)+(sh||0):null,''],
      ['Энергия',st.en!=null?st.en*(1+S2('en')/100)+F('en'):null,''],['Скорость',st.sp!=null?st.sp*(1+S2('sp')/100):null,'']],
      base:{'Сила':100,'Длительность':100,'Дальность':100,'Эффективность':100,'Здоровье':st.hp,'Щиты':st.sh,'Броня':st.ar,'Снижение урона':dr0*100,'Эффективное здоровье':st.hp!=null?st.hp/(1-dr0)+(st.sh||0):null,'Энергия':st.en,'Скорость':st.sp}};
  }
  const B=st.tot||0,dm=1+S2('dmg')/100,phys={};
  for(const p of ['impact','puncture','slash'])if(st.dmg&&st.dmg[p])phys[p]=st.dmg[p]*dm*(1+S2(p)/100);
  const inn=Object.entries(st.dmg||{}).filter(([k])=>!['impact','puncture','slash'].includes(k)).map(([k,v])=>[k,v/(B||1)*100]);
  const els=combine([...order,...inn]).map(([k,v])=>[k,B*dm*v/100]);
  const dmg={...phys};for(const [k,v] of els)dmg[k]=(dmg[k]||0)+v;
  const total=Object.values(dmg).reduce((a,v)=>a+v,0);
  const cc=(st.cc||0)*(1+S2('cc')/100),cm=(st.cm||1)*(1+S2('cd')/100),sc=(st.sc||0)*(1+S2('sc')/100),fr=(st.fr||1)*(1+S2('fr')/100),ms=(st.ms||1)*(1+S2('ms')/100);
  const avg=total*(1+cc*(cm-1));
  const fac=b.fac&&W.FACTIONS.find(f=>f.id===b.fac);let facRows=[];
  if(fac){const tf=Object.entries(dmg).reduce((a,[k,v])=>a+v*(fac.wk.includes(k)?1.5:fac.rs.includes(k)?0.5:1),0);const af=tf*(1+cc*(cm-1));
    facRows=[[`Урон по «${fac.name}» за попадание`,tf,''],[`Урон в секунду по «${fac.name}»`,af*ms*fr,'']]}
  return {kind:'weapon',dmg,rows:[...facRows,['Урон за попадание',total,''],['Крит. шанс',cc*100,'%'],['Крит. урон',cm,'×'],['Шанс статуса',sc*100,'%'],
    [st.wt==='Melee'?'Скорость атаки':'Скорострельность',fr,''],['Мультивыстрел',ms,''],['Магазин',st.mag?Math.round(st.mag*(1+S2('mag')/100)):null,''],
    ['Перезарядка',st.rl?st.rl/(1+S2('rl')/100):null,' с'],['Средний урон с критами',avg*ms,''],['Урон в секунду (без перезарядки)',avg*ms*fr,'']],
    base:(()=>{const a0=B*(1+(st.cc||0)*((st.cm||1)-1))*(st.ms||1);return {'Урон за попадание':B,'Крит. шанс':(st.cc||0)*100,'Крит. урон':st.cm,'Шанс статуса':(st.sc||0)*100,
      [st.wt==='Melee'?'Скорость атаки':'Скорострельность']:st.fr,'Мультивыстрел':st.ms||1,'Магазин':st.mag,'Перезарядка':st.rl,'Средний урон с критами':a0,'Урон в секунду (без перезарядки)':a0*(st.fr||1)}})()};
}

/* ---------- Рекомендованные билды ---------- */
function recBuild(kind,it){
  const bk=bkOf(kind,it);if(!bk||!MODS)return null;const L=layout(bk);const b=emptyBuild(kind,it);
  const ok=(n,slot)=>MD(n)&&compat(MD(n),it,bk,slot||'s');
  if(bk==='frame'){const role=W.FRAME_ROLE[baseN(it.name)]||'bal',t=W.FRAME_TPL[role];b.title=t.label;
    if(ok(t.aura,'a'))setMod(b.a,t.aura);if(ok(t.exi,'x'))setMod(b.x,t.exi);
    t.mods.filter(n=>ok(n)).forEach((n,i)=>setMod(b.s[i],n));b.c=t.arc.filter(n=>MODS.arcN[n]).slice(0,L.arc);}
  else if(bk==='companion'){W.COMP_TPL[it.category==='Стражи'?'robot':'beast'].filter(n=>ok(n)).slice(0,L.n).forEach((n,i)=>setMod(b.s[i],n));b.title='Базовый';}
  else{const t=W.WEAPON_TPL[bk==='archmelee'?'':bk];if(!t)return null;const st=it.st||{};const crit=(st.cc||0)>=0.2||(st.cc||0)>=(st.sc||0);
    b.title=crit?'Критический':'Статусный';(crit?t.crit:t.status).filter(n=>ok(n)).slice(0,L.n).forEach((n,i)=>setMod(b.s[i],n));
    if(t.arc&&MODS.arcN[t.arc]&&L.arc)b.c=[t.arc];}
  if(!b.s.some(x=>x.m))return null;
  b.prio=b.s.map(x=>x.m).filter(Boolean);
  return optimize(b);
}
function recInDrawer(kind,it){
  if(!bkOf(kind,it))return;
  loadMods().then(()=>{const el=$('#drec');if(!el)return;const b=recBuild(kind,it);
    const own=enc(packB(emptyBuild(kind,it)));
    if(!b){el.innerHTML=`<div class="btnrow"><a class="btn" href="#build=${own}">Собрать билд в конструкторе</a></div>`;return}
    const c=calc(b),f=c.f,ms=[...(b.a&&b.a.m?[b.a]:[]),...(b.x&&b.x.m?[b.x]:[]),...b.s.filter(x=>x.m)];
    el.innerHTML=`<div class="slabel">Рекомендованный билд — ${esc(b.title)}</div>
      <div class="rec">${ms.map(x=>{const m=MD(x.m);return `<button class="recm" data-mod="${esc(m.n)}">${pic(m.img,'',m.n,28)}<span title="${esc(m.ru)}">${esc(m.ru)}</span></button>`}).join('')}${b.c.filter(Boolean).map(n=>{const a=MODS.arcN[n];return `<div class="recm">${pic(a.img,'',a.n,28)}<span>${esc(a.ru)}</span></div>`}).join('')}</div>
      <p class="route" style="margin-top:10px">Нужно форм: <b>${f.forma}</b>${f.aura?` + аура-форм: ${f.aura}`:''}${f.stance?` + форм стойки: ${f.stance}`:''}${f.umbra?` + Умбра-форм: ${f.umbra}`:''}${f.omni?` + Омни-форм: ${f.omni}`:''}. Ёмкость: ${c.used} / ${c.cap} (${c.base} с Реактором Орокин или Катализатором${c.bonus?` + ${c.bonus} от ${kind==='frames'?'ауры':'стойки'}`:''}).</p>
      <div class="btnrow"><a class="btn gold" href="#build=${enc(packB(b))}">Открыть в конструкторе</a><a class="btn" href="#build=${enc(packB(zeroForma(unpackB(packB(b)))))}">Вариант без форм</a><a class="btn" href="#build=${own}">Собрать свой</a></div>
      <p class="sub" style="font-size:12.5px">Базовый билд по типу ${kind==='frames'?'варфрейма':kind==='companions'?'компаньона':'оружия'}. Prime-моды можно заменить обычными версиями. Подробные билды игроков — на Overframe по ссылке ниже.</p>`;
  });
}
const packB=b=>({k:b.k,i:b.i,rt:b.rt,t:b.title,a:b.a&&[b.a.p,b.a.m,b.a.r],x:b.x&&[b.x.p,b.x.m,b.x.r],s:b.s.map(x=>[x.p,x.m,x.r]),c:b.c,sh:b.sh&&b.sh.some(Boolean)?b.sh:undefined,fac:b.fac||undefined,riv:b.riv||undefined,pr:b.prio||undefined});
function unpackB(o){const it=D.byName[o.k+':'+o.i];if(!it||!bkOf(o.k,it))return null;const b=emptyBuild(o.k,it);b.rt=o.rt?1:0;b.title=o.t||'';
  const u=(t,v)=>{if(t&&v){t.p=v[0]||null;t.m=v[1]||null;t.r=v[2]||0}};u(b.a,o.a);u(b.x,o.x);(o.s||[]).forEach((v,i)=>b.s[i]&&u(b.s[i],v));(o.c||[]).forEach((n,i)=>{if(i<b.c.length)b.c[i]=n});if(o.sh&&b.sh.length)o.sh.forEach((s,i)=>{if(i<5)b.sh[i]=s});b.fac=o.fac||'';b.riv=o.riv||null;b.prio=o.pr||null;return b}

/* ---------- Конструктор ---------- */
let CB=null;
function builder(param){
  view.innerHTML='<div class="loading">ЗАГРУЗКА МОДОВ…</div>';
  loadMods().then(()=>{
    if(param){const o=dec(param);const b=o&&unpackB(o);if(b)CB=b;history.replaceState(null,'','#build')}
    renderBuilder();
  });
}
function pickables(){const out=[];for(const [k,l] of [['frames',D.frames],['arsenal',D.weapons],['companions',D.companions]])for(const it of l)if(bkOf(k,it))out.push([k,it]);return out}
function renderBuilder(){
  const b=CB,it=b&&itemOf(b),bk=b&&bkOf(b.k,it),L=b&&layout(bk);
  const saved=(S.builds||[]);
  view.innerHTML=`<div class="wrap"><div class="head"><div><div class="eyebrow">Кузница</div><h1>Конструктор билдов</h1>
    <p class="sub">Выберите варфрейм, оружие или компаньона, расставьте моды и полярности. Конструктор посчитает ёмкость, нужное число форм и итоговые характеристики.</p></div></div>
   <div class="bwrap">
    <aside class="bside">
     <section class="card cut"><h3>Предмет</h3><input class="field" id="bq" type="search" placeholder="Найти варфрейм, оружие, компаньона…" aria-label="Поиск предмета"><div id="bres" class="plist" style="margin-top:8px"></div>
      ${it?`<div class="bitem">${it.img?pic(it.img,'',it.name,72):`<div class="none">${esc(it.name[0])}</div>`}<div><div style="font:600 17px var(--f-display)">${esc(it.ru)}</div><div class="en" style="font:500 11.5px var(--f-data);color:var(--muted)">${esc(it.name)} · ${esc(it.category)}</div></div></div>`:'<p>Начните с выбора предмета.</p>'}
     </section>
     ${b?`<section class="card cut"><h3>Ёмкость и формы</h3><div id="bcap"></div>
      <label style="display:flex;gap:8px;align-items:center;margin:10px 0;font-size:14px"><input type="checkbox" id="brt" ${b.rt?'checked':''}> Реактор Орокин / Катализатор (ёмкость ×2)</label>
      <div class="btnrow"><button class="btn gold" id="bopt">Минимум форм</button><button class="btn" id="bpolall">Полярность под каждый мод</button><button class="btn" id="brec">Рекомендованный</button><button class="btn" id="bzero">Без форм</button><button class="btn danger" id="bclr">Очистить</button></div>
      <div class="btnrow"><button class="btn" id="bsave">Сохранить</button><button class="btn" id="blink">Скопировать ссылку</button></div><div id="bmsg" class="msg"></div></section>`:''}
     <section class="card cut"><h3>Мои билды</h3>${saved.length?`<div class="plist">${saved.map((s,i)=>`<div class="pitem"><span class="nm" style="font-size:13.5px">${esc(s.title)}</span><button class="btn" data-load="${i}">Открыть</button><button class="btn danger" data-del="${i}" aria-label="Удалить">×</button></div>`).join('')}</div>`:'<p>Сохранённые билды появятся здесь. Они хранятся в этом браузере.</p>'}</section>
    </aside>
    <div>${b?`<div class="slots top" id="topslots"></div><div class="slots" id="slots"></div><p class="sub" style="font-size:12px;margin:6px 0 0">Моды можно переставлять: перетащите мышью или нажмите ⇅ на моде, а затем на слот, куда его поставить.</p>
      ${bk==='frame'?'<div class="slabel">Осколки архонта</div><div class="shards" id="bshards"></div>':''}<div id="bsets"></div><div class="slabel">Итоговые характеристики</div><div class="inline" style="gap:10px;margin-bottom:10px"><label class="dtoggle" style="margin:0"><input type="checkbox" id="bdelta"> Показать, что изменили моды (база → итог, + / −)</label>
      ${b.k==='arsenal'?`<select class="field" id="bfac" style="width:auto;padding:8px 10px" aria-label="Урон по фракции"><option value="">Урон без учёта фракции</option>${W.FACTIONS.map(f=>`<option value="${f.id}" ${b.fac===f.id?'selected':''}>Против: ${esc(f.name)}</option>`).join('')}</select>`:''}
      <select class="field" id="bcmp" style="width:auto;padding:8px 10px" aria-label="Сравнить с билдом"><option value="">Сравнить с сохранённым билдом…</option>${saved.map((s,i)=>{const o=dec(s.code);return o&&o.k===b.k&&o.i===b.i?`<option value="${i}">${esc(s.title)}</option>`:''}).join('')}<option value="rec">Сравнить с рекомендованным</option></select></div>
      <div id="bstats"></div><div id="bcmpout"></div>
      <p class="sub" style="font-size:12.5px;margin-top:12px">Учитываются моды с прямыми бонусами («+165% урона», «+55% силы способностей»); условные эффекты, наборы и мистификаторы в расчёт не входят. Полярность слота меняется в окне выбора мода. Формы считаются относительно стандартных полярностей предмета. Стихии объединяются по порядку слотов: слева направо, сверху вниз. Ёмкость: 30 на максимальном ранге, с Реактором Орокин или Катализатором — 60; аура и стойка добавляют ёмкость (при совпадении полярности вдвое больше). Мод в слоте своей полярности стоит вдвое дешевле, в слоте чужой полярности — на 25% дороже, как в игре. Универсальная полярность (Форма Омни) подходит любому моду, кроме Умбры.</p>`:'<div class="empty">Выберите предмет слева или откройте рекомендованный билд из карточки варфрейма или оружия.</div>'}</div>
   </div></div>${foot()}`;
  const all=pickables();
  $('#bq').addEventListener('input',e=>{const q=e.target.value.toLowerCase().trim();$('#bres').innerHTML=q?all.filter(([k,x])=>match(x._s.slice(0,200)+' '+x.name.toLowerCase(),q)).slice(0,10).map(([k,x])=>`<div class="pitem" style="cursor:pointer" data-pk="${k}:${esc(x.name)}">${pic(x.img,'',x.name,32)}<span class="nm" style="font-size:14px">${esc(x.ru)}</span><span class="n">${esc(x.category)}</span></div>`).join('')||'<p>Ничего не найдено.</p>':''});
  $('#bres').onclick=e=>{const p=e.target.closest('[data-pk]');if(!p)return;const [k,...n]=p.dataset.pk.split(':');const x=D.byName[k+':'+n.join(':')];CB=emptyBuild(k,x);renderBuilder()};
  view.querySelectorAll('[data-load]').forEach(el=>el.onclick=()=>{const o=dec(saved[+el.dataset.load].code);const nb=o&&unpackB(o);if(nb){CB=nb;renderBuilder()}});
  view.querySelectorAll('[data-del]').forEach(el=>el.onclick=()=>{S.builds.splice(+el.dataset.del,1);save();renderBuilder()});
  if(!b)return;
  $('#brt').onchange=e=>{b.rt=e.target.checked?1:0;refresh()};
  $('#bopt').onclick=()=>{optimize(b);refresh()};
  $('#bpolall').onclick=()=>{polarizeAll(b);refresh()};
  $('#brec').onclick=()=>{const r=recBuild(b.k,it);if(r){CB=r;renderBuilder()}else msg('#bmsg','Для этого предмета нет готового шаблона.',1)};
  $('#bclr').onclick=()=>{CB=emptyBuild(b.k,it);renderBuilder()};
  $('#bzero').onclick=()=>{zeroForma(b);refresh()};
  if($('#bfac'))$('#bfac').onchange=e=>{b.fac=e.target.value;refresh()};
  $('#bcmp').onchange=()=>refresh();
  let moveFrom=null;
  $('#bsave').onclick=()=>{S.builds=S.builds||[];S.builds.unshift({title:`${it.ru}${b.title?' — '+b.title:''} (${new Date().toLocaleDateString('ru')})`,code:enc(packB(b))});S.builds=S.builds.slice(0,50);save();renderBuilder();msg('#bmsg','Билд сохранён.')};
  $('#blink').onclick=()=>{const url=location.origin+location.pathname+'#build='+enc(packB(b));navigator.clipboard?.writeText(url).then(()=>msg('#bmsg','Ссылка скопирована.'),()=>msg('#bmsg',url))};
  refresh();
  function slotHtml(x,label,idx,type){
    if(type==='c'){const a=x&&MODS.arcN[x];return `<div class="slot lbl${a?'':' empty'}" data-l="${label}" data-t="c" data-i="${idx}">${a?`<div class="row1">${pic(a.img,'',a.n,34)}<div class="mn">${esc(a.ru)}</div></div><div class="bonus" title="${esc(a.rs.join(' '))}">${esc((a.rs[0]||'').split('\n').slice(0,2).join(' '))}</div>`:'+ мистификатор'}</div>`}
    const m=MD(x.m);
    if(m&&m.n==='__riven'&&!m.img)m.img=null;
    if(!m)return `<div class="slot lbl empty" data-l="${label}" data-t="${type}" data-i="${idx}" title="${x.p?'Полярность слота: '+esc(W.POL[x.p]):'Слот без полярности'}">${polIcon(x.p)||''}<span>+ мод</span></div>`;
    const c=cost(x.p,m,x.r);
    // Одна иконка: полярность слота (зелёная — совпадает с модом, красная — нет); если у слота полярности нет — полярность мода
    const same=x.p&&m.p&&(x.p===m.p||(x.p==='any'&&m.p!=='umbra'));
    const st=x.p&&m.p?(same?'m':'x'):'';
    const tip=x.p?`Слот: ${W.POL[x.p]}, мод: ${W.POL[m.p]||'без полярности'}${st==='m'?' — совпадает, расход вдвое меньше':st==='x'?' — не совпадает, расход на 25% больше':''}`:`Слот без полярности, мод: ${W.POL[m.p]||'без полярности'}`;
    const bonus=modBonus(m,x.r,setMult(m,setCounts(b)));
    return `<div class="slot lbl${type==='s'&&moveFrom===idx?' moving':''}" data-l="${label}" data-t="${type}" data-i="${idx}"${type==='s'?' draggable="true"':''}>
      <div class="shead"><span class="bonus" title="${esc(bonus.full)}">${esc(bonus.short)}</span><span class="cst ${st}" title="${esc(tip)}">${polIcon(x.p||m.p)}${c<0?'+'+(-c):c}</span></div>${type==='s'?'<button class="mv" title="Переставить мод" aria-label="Переставить мод">⇅</button>':''}
      <div class="row1">${pic(m.img,'',m.n,34)}<div class="mn">${esc(m.ru)}</div></div>
      <div class="stars" role="group" aria-label="Ранг ${x.r} из ${m.f}">${Array.from({length:m.f},(_,k)=>`<button class="star${k<x.r?' on':''}" data-r="${k+1}" aria-label="Ранг ${k+1}"></button>`).join('')}</div></div>`;
  }
  function refresh(){
    const top=[];if(b.a)top.push(slotHtml(b.a,L.aura,0,'a'));if(b.x)top.push(slotHtml(b.x,'Эксилус',0,'x'));b.c.forEach((n,i)=>top.push(slotHtml(n,'Мистификатор',i,'c')));
    $('#topslots').innerHTML=top.join('');$('#topslots').hidden=!top.length;
    $('#slots').innerHTML=b.s.map((x,i)=>slotHtml(x,'Слот '+(i+1),i,'s')).join('');
    const c=calc(b),f=c.f;
    $('#bcap').innerHTML=`<div class="lbl" style="display:flex;justify-content:space-between;font:500 12px var(--f-data);color:var(--muted)"><span>Ёмкость</span><span>свободно ${c.free}</span></div>
      <div class="cap ${c.free<0?'over':''}">${c.used} / ${c.cap}</div><div style="font:500 11.5px var(--f-data);color:var(--muted);margin-top:2px">${c.base} базовая${c.bonus?` + ${c.bonus} от ${bk==='melee'?'стойки':'ауры'}${(()=>{const s=b.a,m=s&&MD(s.m);return m&&s.p&&m.p?(s.p===m.p||s.p==='any'?' (полярность совпадает, ×2)':' (полярность не совпадает)'):''})()}`:''} = ${c.cap}</div><div class="bar" style="margin:6px 0 12px"><i style="width:${Math.min(100,Math.max(0,c.used/c.cap*100))}%;${c.free<0?'background:var(--warn)':''}"></i></div>
      <div class="formas">${box('Формы',f.forma)}${bk==='melee'?box('Формы стойки',f.stance):box('Аура-формы',L.aura?f.aura:null)}${box('Умбра-формы',f.umbra||null)}${box('Омни-формы',f.omni||null)}${box('Всего форм',f.forma+f.aura+f.stance+f.umbra+f.omni)}</div>
      ${c.free<0?'<p class="msg err">Не хватает ёмкости. Нажмите «Минимум форм», чтобы подобрать полярности.</p>':''}`;
    $('#bsets').innerHTML=setsHtml(b);
    if($('#bshards'))$('#bshards').innerHTML=b.sh.map((s,i)=>`<div class="shard" style="--sc:${s?SHCOL[s.c]:'var(--line2)'}"><div class="gem"></div>
      <select class="field" data-shc="${i}" aria-label="Цвет осколка ${i+1}"><option value="">Пусто</option>${Object.entries(SHARDS).map(([k,v])=>`<option value="${k}" ${s&&s.c===k?'selected':''}>${v[0]}</option>`).join('')}</select>
      ${s?`<select class="field" data-sho="${i}" aria-label="Эффект осколка ${i+1}">${SHARDS[s.c][1].map((o,k)=>`<option value="${k}" ${s.o===k?'selected':''}>${esc(o[2].replace('{v}',fmt(o[1]*(s.t?1.5:1))))}</option>`).join('')}</select>
      <label style="font-size:12px;display:flex;gap:6px;align-items:center"><input type="checkbox" data-sht="${i}" ${s.t?'checked':''}> Закалённый (×1,5)</label>`:''}</div>`).join('');
    const sres=statsOf(b);
    let showD=false;try{showD=localStorage.getItem('wa:delta')==='1'}catch(_){}
    const dt=$('#bdelta');if(dt){dt.checked=showD;dt.onchange=e=>{try{localStorage.setItem('wa:delta',e.target.checked?'1':'0')}catch(_){}refresh()}}
    // «Перезарядка» — чем меньше, тем лучше
    const lowerBetter=k=>k==='Перезарядка';
    $('#bstats').innerHTML=`<div class="stats">${sres.rows.filter(r=>r[1]!=null).map(([k,v,u])=>{
      const base=sres.base&&sres.base[k];const val=`${u==='×'?'×':''}${fmt(v)}${u&&u!=='×'?u:''}`;
      if(!showD||base==null)return box(k,val);
      const d=v-base;if(Math.abs(d)<1e-6)return box(k,`${val} <small>без изменений</small>`);
      const good=lowerBetter(k)?d<0:d>0;const rel=base?` (${d>0?'+':'−'}${fmt(Math.abs(d/base*100))}%)`:'';
      const unit=u==='%'?' п.п.':(u==='×'?'':u);
      return box(k,`${val}<span class="dline ${good?'up':'down'}">${d>0?'+':'−'}${fmt(Math.abs(d))}${unit}${u==='%'?'':rel}</span><span class="dbase">база ${u==='×'?'×':''}${fmt(base)}${u==='%'?'%':u&&u!=='×'?u:''}</span>`)}).join('')}</div>${sres.dmg?elChips(sres.dmg):''}`;
    const cv=$('#bcmp').value;let other=null;
    if(cv==='rec')other=recBuild(b.k,it);else if(cv!==''){const o=dec((S.builds||[])[+cv]?.code||'');other=o&&unpackB(o)}
    if(other){other.fac=b.fac;const so=statsOf(other);const mo=Object.fromEntries(so.rows.map(r=>[r[0],r[1]]));const cf=calc(other).f;
      $('#bcmpout').innerHTML=`<div class="slabel">Сравнение: этот билд и «${esc(cv==='rec'?'Рекомендованный':(S.builds[+cv].title))}»</div><div class="cmp"><div class="cr ch"><span>Характеристика</span><span>Этот</span><span>Другой</span><span>Разница</span></div>
        ${sres.rows.filter(r=>r[1]!=null&&mo[r[0]]!=null).map(([k,v,u])=>{const o=mo[k],d=v-o,good=lowerBetter(k)?d<0:d>0;return `<div class="cr"><span>${esc(k)}</span><span>${fmt(v)}${u==='%'?'%':''}</span><span>${fmt(o)}${u==='%'?'%':''}</span><span class="${Math.abs(d)<1e-6?'':good?'up':'down'}">${Math.abs(d)<1e-6?'=':(d>0?'+':'−')+fmt(Math.abs(d))}</span></div>`}).join('')}
        <div class="cr"><span>Всего форм</span><span>${f.forma+f.aura+f.stance+f.umbra+f.omni}</span><span>${cf.forma+cf.aura+cf.stance+cf.umbra+cf.omni}</span><span></span></div></div>`}
    else $('#bcmpout').innerHTML='';
    history.replaceState(null,'','#build');
  }
  // Перестановка модов: перетаскивание мышью и кнопка ⇅ (для телефонов)
  const swap=(i,k)=>{if(i===k||i==null||k==null)return;const a=b.s[i],c=b.s[k];[a.m,c.m]=[c.m,a.m];[a.r,c.r]=[c.r,a.r];refresh()};
  const sl=$('#slots');
  sl.addEventListener('dragstart',e=>{const s=e.target.closest('.slot[data-t="s"]');if(!s||!b.s[+s.dataset.i].m)return e.preventDefault();e.dataTransfer.setData('text/plain',s.dataset.i);e.dataTransfer.effectAllowed='move'});
  sl.addEventListener('dragover',e=>{if(e.target.closest('.slot[data-t="s"]'))e.preventDefault()});
  sl.addEventListener('drop',e=>{const s=e.target.closest('.slot[data-t="s"]');if(!s)return;e.preventDefault();swap(+e.dataTransfer.getData('text/plain'),+s.dataset.i)});
  view.querySelector('.bwrap').addEventListener('change',e=>{const t=e.target;
    if(t.dataset.shc!=null){const i=+t.dataset.shc;b.sh[i]=t.value?{c:t.value,o:0,t:false}:null;refresh()}
    else if(t.dataset.sho!=null){b.sh[+t.dataset.sho].o=+t.value;refresh()}
    else if(t.dataset.sht!=null){b.sh[+t.dataset.sht].t=t.checked;refresh()}});
  view.querySelector('.bwrap').addEventListener('click',e=>{const s=e.target.closest('.slot');if(!s)return;
    if(e.target.closest('.mv')){const i=+s.dataset.i;moveFrom=moveFrom===i?null:i;refresh();return}
    if(moveFrom!=null&&s.dataset.t==='s'){const i=moveFrom;moveFrom=null;swap(i,+s.dataset.i);return}
    const star=e.target.closest('.star');if(star){const t=s.dataset.t,i=+s.dataset.i,x=t==='a'?b.a:t==='x'?b.x:b.s[i];const r=+star.dataset.r;x.r=x.r===r?r-1:r;refresh();return}openPicker(b,it,bk,s.dataset.t,+s.dataset.i,refresh)});
}
function openPicker(b,it,bk,t,i,done){
  const L=layout(bk);
  const ov=document.createElement('div');ov.className='picker';
  const isArc=t==='c';const slot=isArc?null:(t==='a'?b.a:t==='x'?b.x:b.s[i]);
  const used=new Set([...(b.a&&b.a.m?[b.a.m]:[]),...(b.x&&b.x.m?[b.x.m]:[]),...b.s.map(x=>x.m).filter(Boolean)]);
  const list=isArc?MODS.arcanes.filter(a=>L.arcT.includes(a.t)&&!b.c.includes(a.n)):MODS.mods.filter(m=>compat(m,it,bk,t)&&(!used.has(m.n)||m.n===slot.m));
  const canRiven=!isArc&&t==='s'&&b.k==='arsenal'&&(!used.has('__riven')||slot.m==='__riven');
  ov.innerHTML=`<div role="dialog" aria-modal="true" aria-label="Выбор мода"><div class="pk-head">
     <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font:700 15px var(--f-display);letter-spacing:.12em;text-transform:uppercase;color:var(--gold2)">${isArc?'Мистификатор':t==='a'?L.aura:t==='x'?'Эксилус':'Слот '+(i+1)}</b><button class="btn" data-x>Закрыть</button></div>
     ${isArc?'':`<div class="pk-pols"><span style="font:500 11px var(--f-data);color:var(--muted)">Полярность слота:</span>${['',...POLS].map(p=>`<button data-pol="${p}" class="${(slot.p||'')===p?'on':''}">${p?polIcon(p)+esc(W.POL[p]):'Нет'}</button>`).join('')}</div>`}
     ${!isArc&&slot.m?`<label style="display:flex;gap:10px;align-items:center;font:500 12px var(--f-data);color:var(--muted)">Ранг <input type="range" id="pkr" min="0" max="${MD(slot.m).f}" value="${slot.r}" style="flex:1"> <span id="pkrv">${slot.r}</span></label>`:''}
     <input class="field" id="pkq" type="search" placeholder="Поиск по названию или эффекту" aria-label="Поиск мода"></div>
    ${canRiven?`<div class="pk-riv"><button class="btn" data-riv>${slot.m==='__riven'?'Изменить мод Разлома':'+ Мод Разлома (ривен) со своими характеристиками'}</button><div id="rived" hidden></div></div>`:''}
    <div class="pk-list" id="pkl"></div>
    <div class="pk-foot">${(isArc?b.c[i]:slot.m)?'<button class="btn danger" data-rm>Убрать</button>':''}<span style="font:500 11.5px var(--f-data);color:var(--muted)">Доступно: ${list.length}</span></div></div>`;
  document.body.appendChild(ov);
  const close=()=>{ov.remove();done()};
  const draw=q=>{q=(q||'').toLowerCase().trim();const arr=list.filter(m=>!q||match(m._s,q)).sort((u,v)=>(isArc?0:((v.p===slot.p)-(u.p===slot.p)))||u.ru.localeCompare(v.ru,'ru')).slice(0,150);
    $('#pkl').innerHTML=arr.map(m=>`<button class="pk-item" data-n="${esc(m.n)}">${pic(m.img,'',m.n,40)}<div style="min-width:0"><div class="t">${esc(m.ru)} <span class="r-${m.r}" style="font:500 11px var(--f-data)">${esc(m.n)}</span></div><div class="s">${esc((m.rs||[]).join(' · '))}</div></div><div style="display:flex;align-items:center;gap:4px;font:600 12px var(--f-data)">${isArc?'':polIcon(m.p)+(m.d<0?'+'+(-m.d+m.f):m.d+m.f)}</div></button>`).join('')||'<div class="empty">Ничего не найдено.</div>'};
  draw('');
  ov.querySelector('#pkq').addEventListener('input',e=>draw(e.target.value));setTimeout(()=>ov.querySelector('#pkq').focus(),30);
  ov.onclick=e=>{
    if(e.target===ov||e.target.closest('[data-x]'))return close();
    const pb=e.target.closest('[data-pol]');if(pb){slot.p=pb.dataset.pol||null;ov.querySelectorAll('[data-pol]').forEach(x=>x.classList.toggle('on',x===pb));done();return}
    if(e.target.closest('[data-rm]')){if(isArc)b.c[i]=null;else{slot.m=null;slot.r=0}return close()}
    const it2=e.target.closest('[data-n]');if(it2){if(isArc)b.c[i]=it2.dataset.n;else{slot.m=it2.dataset.n;slot.r=MD(slot.m).f}return close()}
  };
  const rivBtn=ov.querySelector('[data-riv]');
  if(rivBtn)rivBtn.onclick=e=>{e.stopPropagation();const r=b.riv||{p:'madurai',cost:18,st:[['',0],['',0],['',0],['',0]]};while(r.st.length<4)r.st.push(['',0]);
    const ed=ov.querySelector('#rived');ed.hidden=false;
    ed.innerHTML=`<div class="rivgrid">${r.st.map(([k,v],n)=>`<select class="field" data-rk="${n}" aria-label="Характеристика ${n+1}"><option value="">—</option>${RIVST.map(s=>`<option value="${s[0]}" ${k===s[0]?'selected':''}>${s[2]}</option>`).join('')}</select><input class="field" type="number" step="0.1" data-rv="${n}" value="${v||''}" placeholder="+%" aria-label="Значение ${n+1}">`).join('')}</div>
      <div class="inline" style="margin-top:8px"><label style="font-size:13px;display:flex;gap:6px;align-items:center">Полярность <select class="field" id="rpol" style="width:auto">${POLS.filter(p=>p!=='any'&&p!=='umbra').map(p=>`<option value="${p}" ${r.p===p?'selected':''}>${W.POL[p]}</option>`).join('')}</select></label>
      <label style="font-size:13px;display:flex;gap:6px;align-items:center">Расход на 8 ранге <input class="field" type="number" id="rcost" min="8" max="18" value="${r.cost}" style="width:80px"></label><button class="btn gold" id="rok">Поставить</button></div>
      <p class="sub" style="font-size:12px">Отрицательные значения пишите с минусом, например −40 к мультивыстрелу.</p>`;
    ed.querySelector('#rok').onclick=ev=>{ev.stopPropagation();r.st=r.st.map((_,n)=>[ed.querySelector(`[data-rk="${n}"]`).value,parseFloat(ed.querySelector(`[data-rv="${n}"]`).value)||0]);
      r.p=ed.querySelector('#rpol').value;r.cost=Math.min(18,Math.max(8,+ed.querySelector('#rcost').value||18));b.riv=r;slot.m='__riven';slot.r=8;close()}};
  const rr=ov.querySelector('#pkr');if(rr)rr.oninput=e=>{slot.r=+e.target.value;ov.querySelector('#pkrv').textContent=slot.r;done()};
  ov.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close()}});
}

/* ---------- Моды и мистификаторы ---------- */
const MODTYPES=[['Warframe Mod','Варфрейм'],['Primary Mod','Основное'],['Shotgun Mod','Дробовики'],['Secondary Mod','Вторичное'],['Melee Mod','Ближний бой'],['Stance Mod','Стойки'],['Companion Mod','Компаньоны'],['Arch-Gun Mod','Арч-пушки'],['Arch-Melee Mod','Арч-ближний бой'],['Archwing Mod','Арчвинг'],['Necramech Mod','Некрамехи'],['Parazon Mod','Паразон'],['K-Drive Mod','К-драйв'],['Plexus Mod','Плексус'],['Railjack Mod','Рэйлджек'],['Mod Set Mod','Наборы']];
const RAR={Common:'Обычный',Uncommon:'Необычный',Rare:'Редкий',Legendary:'Легендарный'};
function modsView(){
  view.innerHTML='<div class="loading">ЗАГРУЗКА МОДОВ…</div>';
  loadMods().then(()=>{
    const st=state.mods;
    view.innerHTML=`<div class="wrap"><div class="head"><div><div class="eyebrow">Модификации</div><h1>Моды</h1><p class="sub">Все моды игры: эффект на максимальном ранге, расход ёмкости, полярность и где выпадают.</p></div></div>
     <div class="tools"><input class="field q" id="q" type="search" placeholder="Название или эффект, например «мультивыстрел»" aria-label="Поиск" value="${esc(st.q)}">
      <select class="field" id="t" aria-label="Тип"><option value="">Все типы</option>${MODTYPES.map(([v,t])=>`<option value="${v}" ${st.t===v?'selected':''}>${t}</option>`).join('')}</select>
      <select class="field" id="p" aria-label="Полярность"><option value="">Все полярности</option>${POLS.map(p=>`<option value="${p}" ${st.p===p?'selected':''}>${W.POL[p]}</option>`).join('')}</select>
      <select class="field" id="r" aria-label="Редкость"><option value="">Любая редкость</option>${Object.entries(RAR).map(([v,t])=>`<option value="${v}" ${st.r===v?'selected':''}>${t}</option>`).join('')}</select></div>
     <div class="info"><span id="cnt"></span></div><div class="modgrid" id="grid"></div><div class="more" id="more"></div></div>${foot()}`;
    let arr=[],shown=0;
    const card=(m,i)=>`<button class="modc cut" data-i="${i}">${pic(m.img,'',m.n,52)||'<span></span>'}<div style="min-width:0"><div class="nm">${esc(m.ru)}</div><div class="meta">${polIcon(m.p)}<span>${m.d<0?'+'+(-m.d+m.f):m.d+m.f}</span><span class="r-${m.r}">${esc(RAR[m.r]||'')}</span></div><div class="meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc((m.rs||[])[0]||'')}</div></div></button>`;
    const more=()=>{const s=arr.slice(shown,shown+90);$('#grid').insertAdjacentHTML('beforeend',s.map((m,j)=>card(m,shown+j)).join('')||(shown?'':'<div class="empty" style="grid-column:1/-1">Ничего не найдено.</div>'));shown+=s.length;
      $('#more').innerHTML=shown<arr.length?`<button class="btn" id="mbtn">Показать ещё (${num(arr.length-shown)})</button>`:''};
    const apply=()=>{const q=st.q.toLowerCase().trim();arr=MODS.mods.filter(m=>(!q||match(m._s,q))&&(!st.t||m.t===st.t)&&(!st.p||m.p===st.p)&&(!st.r||m.r===st.r));$('#cnt').textContent=`Найдено: ${num(arr.length)}`;$('#grid').innerHTML='';shown=0;more()};
    let tm;$('#q').addEventListener('input',e=>{clearTimeout(tm);tm=setTimeout(()=>{st.q=e.target.value;apply()},140)});
    for(const id of ['t','p','r'])$('#'+id).addEventListener('change',e=>{st[id]=e.target.value;apply()});
    $('#more').onclick=e=>{if(e.target.id==='mbtn')more()};
    $('#grid').onclick=e=>{const c=e.target.closest('.modc');if(c)openMod(arr[+c.dataset.i])};
    apply();
  });
}
function dropsHtml(dr){return dr&&dr.length?`<div class="slabel">Где выпадает</div>${dr.map(([l,c])=>`<div class="part" style="grid-template-columns:minmax(0,1fr) 80px"><span class="w">${esc(l)}</span><span class="q">${c?fmt(c)+'%':''}</span></div>`).join('')}`:'<div class="slabel">Где выпадает</div><p class="route">Источник не указан в базе — смотрите вики.</p>'}
function openMod(m){
  onClose=null;const d=$('#drawer');
  d.innerHTML=`<button class="close" id="dclose" aria-label="Закрыть">×</button>
   <div class="dhead">${pic(m.img,'',m.n,132)||'<div class="none">M</div>'}<div><h2>${esc(m.ru)}</h2><div class="en">${esc(m.n)} · ${esc((MODTYPES.find(x=>x[0]===m.t)||[0,m.t])[1])}${m.c&&!GEN.has(m.c)?' · для '+esc(m.c):''}</div>
    <div class="tags"><span class="tag r-${m.r}">${esc(RAR[m.r]||m.r||'')}</span>${m.aug?'<span class="tag p">Аугмент</span>':''}${m.exi?'<span class="tag">Эксилус</span>':''}${m.set?`<span class="tag">Набор ${esc(m.set)}</span>`:''}</div></div></div>
   <div class="stats">${box('Полярность',polIcon(m.p)+esc(W.POL[m.p]||'—'))}${box(m.d<0?'Даёт ёмкости':'Расход ёмкости',m.d<0?`+${-m.d} → +${-m.d+m.f}`:`${m.d} → ${m.d+m.f}`)}${box('Рангов',m.f)}</div>
   <div class="slabel">Эффект на максимальном ранге</div><p class="modtext">${esc((m.rs||[]).join('\n'))}</p>${m.rs.join('')!==m.en.join('')?`<p class="sub" style="font-size:12.5px">${esc(m.en.join(' · '))}</p>`:''}
   ${dropsHtml(m.dr)}<div id="menemy"></div>`;
  $('#scrim').hidden=false;d.hidden=false;d.scrollTop=0;d.onclick=null;
  loadBest().then(B=>{const el=$('#menemy');if(!el)return;const l=(B.byMod[m.n]||[]).sort((a,b)=>b[1]-a[1]);
    if(l.length)el.innerHTML=`<div class="slabel">С кого падает (${l.length})</div><div class="chips">${l.slice(0,40).map(([e,c])=>`<button class="chip" data-enemy="${esc(e.n)}">${pic(e.img,'',e.n,24)}${esc(e.n)} · ${fmt(c)}%</button>`).join('')}</div><p class="sub" style="font-size:12px">Шанс выпадения с одного убийства.</p>`});
}
const ARCT={'Warframe Arcane':'Варфрейм','Operator Arcane':'Оператор','Primary Arcane':'Основное','Secondary Arcane':'Вторичное','Melee Arcane':'Ближний бой','Amp Arcane':'Усилитель','Zaw Arcane':'Зо','Kitgun Arcane':'Китган','Bow Arcane':'Лук','Shotgun Arcane':'Дробовик','Arcane':'Прочие'};
function arcanesView(){
  view.innerHTML='<div class="loading">ЗАГРУЗКА…</div>';
  loadMods().then(()=>{const st=state.arcanes;
    view.innerHTML=`<div class="wrap"><div class="head"><div><div class="eyebrow">Мистификаторы</div><h1>Мистификаторы</h1><p class="sub">Аркейны для варфреймов, оператора и оружия: эффект на максимальном ранге и где добывать.</p></div></div>
     <div class="tools" style="grid-template-columns:minmax(200px,1fr) minmax(160px,220px)"><input class="field q" id="q" type="search" placeholder="Название или эффект" aria-label="Поиск" value="${esc(st.q)}">
      <select class="field" id="t" aria-label="Тип"><option value="">Все типы</option>${Object.entries(ARCT).map(([v,t])=>`<option value="${v}" ${st.t===v?'selected':''}>${t}</option>`).join('')}</select></div>
     <div class="info"><span id="cnt"></span></div><div class="modgrid" id="grid"></div></div>${foot()}`;
    let arr=[];
    const apply=()=>{const q=st.q.toLowerCase().trim();arr=MODS.arcanes.filter(a=>(!q||match(a._s,q))&&(!st.t||a.t===st.t));$('#cnt').textContent=`Найдено: ${num(arr.length)}`;
      $('#grid').innerHTML=arr.map((a,i)=>`<button class="modc cut" data-i="${i}">${pic(a.img,'',a.n,52)||'<span></span>'}<div style="min-width:0"><div class="nm">${esc(a.ru)}</div><div class="meta"><span>${esc(ARCT[a.t]||a.t)}</span><span class="r-${a.r}">${esc(RAR[a.r]||'')}</span></div><div class="meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc((a.rs[0]||'').split('\n')[0])}</div></div></button>`).join('')||'<div class="empty" style="grid-column:1/-1">Ничего не найдено.</div>'};
    let tm;$('#q').addEventListener('input',e=>{clearTimeout(tm);tm=setTimeout(()=>{st.q=e.target.value;apply()},140)});
    $('#t').onchange=e=>{st.t=e.target.value;apply()};
    $('#grid').onclick=e=>{const c=e.target.closest('.modc');if(c)openArc(arr[+c.dataset.i])};
    apply();
  });
}

/* ---------- Энциклопедия ---------- */
function wiki(sub){
  const tabs=[['factions','Фракции'],['status','Статус-эффекты'],['focus','Школы фокуса'],['mech','Механики']];
  if(!tabs.some(t=>t[0]===sub))sub='factions';
  const head=`<div class="wrap"><div class="head"><div><div class="eyebrow">Кодекс</div><h1>Энциклопедия</h1><p class="sub">Фракции и их уязвимости, статус-эффекты урона и школы фокуса оператора.</p></div></div>
    <div class="subtabs">${tabs.map(([k,t])=>`<a href="#wiki-${k}" class="${k===sub?'on':''}">${t}</a>`).join('')}</div>`;
  const chip=(e,sign)=>`<span class="el" style="color:${W.ELC[e]}">${sign} ${esc(W.EL[e])}</span>`;
  if(sub==='factions'){
    view.innerHTML=head+`<p class="sub" style="margin-bottom:14px">Уязвимость — урон этого типа сильнее на 50%, сопротивление — слабее на 50%. Данные — WARFRAME Wiki.</p><div class="fgrid">${W.FACTIONS.map(f=>`<section class="fcard cut" style="--fc:${f.col}"><h3>${esc(f.name)}</h3><div class="en">${esc(f.en)}</div>
      <p>${esc(f.lore)}</p><div class="lb">Уязвимости</div><div class="elchips">${f.wk.map(e=>chip(e,'+50%')).join('')}${f.rs.map(e=>chip(e,'−50%')).join('')}</div>
      <div class="lb">Что выпадает</div><p>${esc(f.drops)}</p>
      ${f.mods&&D.factionMods&&D.factionMods[f.mods]?`<div class="lb">Частые моды с врагов</div><div class="chips" style="margin-top:6px">${D.factionMods[f.mods].map(([ru,en])=>`<a class="chip" href="#mods" data-mq="${esc(en)}" style="text-decoration:none">${esc(ru)}</a>`).join('')}</div>`:''}</section>`).join('')}</div></div>${foot()}`;
    view.onclick=e=>{const a=e.target.closest('[data-mq]');if(a){state.mods.q=a.dataset.mq;state.mods.t='';state.mods.p='';state.mods.r=''}};
    return;
  }
  view.onclick=null;
  if(sub==='status'){
    view.innerHTML=head+`<div class="stbl">${W.STATUS.map(([e,n,t])=>`<div class="strow cut"><div><span class="el" style="color:${W.ELC[e]}">${esc(W.EL[e])}</span>${W.COMBO[e]?`<div class="f" style="margin-top:6px">${esc(W.EL[W.COMBO[e][0]])} + ${esc(W.EL[W.COMBO[e][1]])}</div>`:''}</div><div style="font:600 15px var(--f-display)">${esc(n)}</div><div style="color:#c6d1de;font-size:14px">${esc(t)}</div></div>`).join('')}</div>
      <p class="sub" style="padding-bottom:30px">Стихии в моде складываются по порядку слотов: две первичные (огонь, холод, электричество, токсин) объединяются во вторичную. Конструктор билдов считает это автоматически.</p></div>${foot()}`;
    return;
  }
  if(sub==='mech'){
    view.innerHTML=head+`<p class="sub" style="margin-bottom:14px">Как в Warframe считаются моды, урон и способности. Кратко, с примерами.</p><div class="mech">${W.MECH.map(([t,h])=>`<section class="card cut"><h3>${esc(t)}</h3>${h}</section>`).join('')}</div></div>${foot()}`;
    return;
  }
  view.innerHTML=head+'<div class="loading">ЗАГРУЗКА…</div></div>';
  loadMods().then(()=>{
    view.innerHTML=head+Object.entries(W.FOCUS).map(([k,s])=>{const ways=MODS.focus.filter(f=>f.s===k);const groups=['Ultimate','Active','Residual','Stats'];
      return `<section class="school cut" style="--fc:${s.col}"><h3>${esc(s.name)}</h3><div style="font:500 12px var(--f-data);color:var(--muted);margin-top:4px">${esc(s.role)} · оружие Тауронова удара: ${esc(s.weapon)}</div><p style="color:#c6d1de;max-width:75ch">${esc(s.text)}</p>
        ${groups.map(g=>{const l=ways.filter(w=>w.k===g);return l.length?`<div class="slabel">${esc(W.FK[g])}</div>${l.map(w=>{const tr=W.FOCUS_RU[w.n];return `<div class="fway"><div><b>${esc(tr?tr[0]:w.n)}</b><small>${esc(w.n)}</small></div><div>${esc(tr?tr[1]:w.en)}</div></div>`}).join('')}`:''}).join('')}</section>`}).join('')+'</div>'+foot();
  });
}

/* ---------- Бестиарий ---------- */
let BEST=null,bestP=null;
const EF={Grineer:'Гренир',Corpus:'Корпус',Infestation:'Заражённые',Orokin:'Орокин (Порченые)',Sentient:'Сентиенты',Neutral:'Нейтральные',Stalker:'Сталкер и Аколиты',Tenno:'Тэнно',Predator:'Хищники',Prey:'Добыча'};
const EFID={Grineer:'grineer',Corpus:'corpus',Infestation:'infested',Orokin:'orokin',Sentient:'sentient'};
const RESRU={'Shield':'Щиты','Proto Shield':'Прото-щиты','Ferrite Armor':'Ферритовая броня','Alloy Armor':'Броня из сплава','Cloned Flesh':'Клонированная плоть','Flesh':'Плоть','Robotic':'Роботизированное','Infested':'Заражённое','Infested Flesh':'Заражённая плоть','Infested Sinew':'Заражённые сухожилия','Fossilized':'Окаменелое','Machinery':'Механизмы','Object':'Объект','Sinew':'Сухожилия','Tenno Flesh':'Плоть Тэнно','Tenno Shield':'Щиты Тэнно','Tenno Armor':'Броня Тэнно','Indifferent Facade':'Безразличный фасад','Overguard':'Сверхщит'};
function loadBest(){
  if(BEST)return Promise.resolve(BEST);
  if(!bestP)bestP=fetch('bestiary.json?v='+(window.WA_V||'')).then(r=>r.json()).then(j=>{
    j.byMod={};j.byN={};for(const e of j.enemies){j.byN[e.n]=e;e._s=(e.n+' '+(EF[e.f]||e.f||'')+' '+e.dr.map(d=>d[0]).join(' ')).toLowerCase();for(const [m,c] of e.dr)(j.byMod[m]=j.byMod[m]||[]).push([e,c])}
    BEST=j;return j});
  return bestP;
}
state.bestiary={q:'',f:''};
function bestiaryView(){
  view.innerHTML='<div class="loading">ЗАГРУЗКА БЕСТИАРИЯ…</div>';
  loadBest().then(B=>{const st=state.bestiary;const facs=[...new Set(B.enemies.map(e=>e.f).filter(Boolean))];
    view.innerHTML=`<div class="wrap"><div class="head"><div><div class="eyebrow">Кодекс</div><h1>Бестиарий</h1><p class="sub">Противники всех фракций: здоровье, щиты, броня, типы защиты, уязвимости фракции и что с них выпадает. Названия — как в английской версии игры.</p></div></div>
     <div class="tools" style="grid-template-columns:minmax(200px,1fr) minmax(160px,240px)"><input class="field q" id="q" type="search" placeholder="Имя противника или мод, который с него падает" aria-label="Поиск" value="${esc(st.q)}">
      <select class="field" id="f" aria-label="Фракция"><option value="">Все фракции</option>${facs.map(f=>`<option value="${esc(f)}" ${st.f===f?'selected':''}>${esc(EF[f]||f)} (${B.enemies.filter(e=>e.f===f).length})</option>`).join('')}</select></div>
     <div class="info"><span id="cnt"></span></div><div class="modgrid" id="grid"></div><div class="more" id="more"></div></div>${foot()}`;
    let arr=[],shown=0;
    const card=(e,i)=>`<button class="modc cut" data-i="${i}">${pic(e.img,'',e.n,52)||'<span></span>'}<div style="min-width:0"><div class="nm">${esc(e.n)}</div><div class="meta">${esc(EF[e.f]||e.f||'')}</div><div class="meta">❤ ${num(e.hp||0)} · ⛨ ${num(e.sh||0)} · ▣ ${num(e.ar||0)}</div></div></button>`;
    const more=()=>{const s=arr.slice(shown,shown+90);$('#grid').insertAdjacentHTML('beforeend',s.map((e,k)=>card(e,shown+k)).join('')||(shown?'':'<div class="empty" style="grid-column:1/-1">Ничего не найдено.</div>'));shown+=s.length;
      $('#more').innerHTML=shown<arr.length?`<button class="btn" id="mbtn">Показать ещё (${num(arr.length-shown)})</button>`:''};
    const apply=()=>{const q=st.q.toLowerCase().trim();arr=B.enemies.filter(e=>(!q||match(e._s,q))&&(!st.f||e.f===st.f));$('#cnt').textContent=`Найдено: ${num(arr.length)}`;$('#grid').innerHTML='';shown=0;more()};
    let tm;$('#q').addEventListener('input',e=>{clearTimeout(tm);tm=setTimeout(()=>{st.q=e.target.value;apply()},140)});
    $('#f').onchange=e=>{st.f=e.target.value;apply()};
    $('#more').onclick=e=>{if(e.target.id==='mbtn')more()};
    $('#grid').onclick=e=>{const c=e.target.closest('.modc');if(c)openEnemy(arr[+c.dataset.i])};
    apply();
  });
}
function openEnemy(e){
  if(!MODS){loadMods().then(()=>openEnemy(e));return}
  onClose=null;const d=$('#drawer');const fac=W.FACTIONS.find(f=>f.id===EFID[e.f]);
  const chip=(x,s)=>`<span class="el" style="color:${W.ELC[x]}">${s} ${esc(W.EL[x])}</span>`;
  d.innerHTML=`<button class="close" id="dclose" aria-label="Закрыть">×</button>
   <div class="dhead">${pic(e.img,'',e.n,132)||'<div class="none">?</div>'}<div><h2>${esc(e.n)}</h2><div class="en">${esc(EF[e.f]||e.f||'')}</div></div></div>
   <div class="stats">${box('Здоровье',num(e.hp||0))}${box('Щиты',num(e.sh||0))}${box('Броня',num(e.ar||0))}</div>
   ${e.res&&e.res.length?`<div class="slabel">Типы защиты</div><div class="chips">${e.res.map(([t,a])=>`<span class="chip">${esc(RESRU[t]||t)}${a?' · '+num(a):''}</span>`).join('')}</div>`:''}
   ${fac?`<div class="slabel">Уязвимости фракции «${esc(fac.name)}»</div><div class="elchips">${fac.wk.map(x=>chip(x,'+50%')).join('')}${fac.rs.map(x=>chip(x,'−50%')).join('')}</div>`:''}
   <div class="slabel">Что выпадает</div>${e.dr.length?`<div class="chips">${e.dr.map(([m,c])=>{const mm=MODS&&MODS.byN[m];return mm?`<button class="chip" data-mod="${esc(m)}">${pic(mm.img,'',m,24)}${esc(mm.ru)} · ${fmt(c)}%</button>`:`<span class="chip">${esc(m)} · ${fmt(c)}%</span>`}).join('')}</div><p class="sub" style="font-size:12px">Шанс выпадения с одного убийства. Нажмите на мод, чтобы открыть его.</p>`:'<p class="route">Своей таблицы выпадения нет.</p>'}`;
  $('#scrim').hidden=false;d.hidden=false;d.scrollTop=0;d.onclick=null;
}
function openArc(a){
  onClose=null;const d=$('#drawer');
  d.innerHTML=`<button class="close" id="dclose" aria-label="Закрыть">×</button><div class="dhead">${pic(a.img,'',a.n,132)||'<div class="none">A</div>'}<div><h2>${esc(a.ru)}</h2><div class="en">${esc(a.n)} · ${esc(ARCT[a.t]||a.t)}</div><div class="tags"><span class="tag r-${a.r}">${esc(RAR[a.r]||'')}</span><span class="tag">Рангов: ${a.f}</span>${a.pr?`<span class="tag p">≈ ${a.pr} пл. за штуку</span>`:''}</div></div></div>
    <div class="slabel">Эффект на максимальном ранге</div><p class="modtext">${esc(a.rs.join('\n'))}</p>${dropsHtml(a.dr)}`;
  $('#scrim').hidden=false;d.hidden=false;d.scrollTop=0;d.onclick=null;
}
// Где нужен ресурс: все рецепты каталога, где он есть среди материалов
function usedIn(r){
  if(!D.usage){D.usage={};for(const [k,l] of [['arsenal',D.weapons],['frames',D.frames],['companions',D.companions]])for(const x of l)for(const m of x.materials){const key=(m.en||m.name).toLowerCase();(D.usage[key]=D.usage[key]||[]).push([k,x,m.qty])}}
  return D.usage[r.name.toLowerCase()]||[];
}
// Переходы по ссылкам из любой карточки
document.addEventListener('click',e=>{
  const a=e.target.closest('[data-item]');if(a){const [k,...n]=a.dataset.item.split(':');const it=D.byName[k+':'+n.join(':')];if(it){e.stopPropagation();openItem(k,it)}return}
  const m=e.target.closest('[data-mod]');if(m&&!m.closest('.picker')){e.stopPropagation();loadMods().then(()=>{const x=MODS.byN[m.dataset.mod];if(x)openMod(x)});return}
  const en=e.target.closest('[data-enemy]');if(en){e.stopPropagation();loadBest().then(B=>{const x=B.byN[en.dataset.enemy];if(x)openEnemy(x)})}
},true);

/* ---------- Сейчас в игре ---------- */
let WS=null,wsAt=0,wsP=null,nowTimer=0;
function loadWS(){
  if(WS&&Date.now()-wsAt<60000)return Promise.resolve(WS);
  if(!wsP)wsP=fetch('https://api.warframestat.us/pc/?language=ru').then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}).then(j=>{WS=j;wsAt=Date.now();wsP=null;return j}).catch(e=>{wsP=null;throw e});
  return wsP;
}
const left=iso=>{const ms=new Date(iso)-Date.now();if(!(ms>0))return 'истекло';const s=Math.floor(ms/1000),dd=Math.floor(s/86400),h=Math.floor(s%86400/3600),mi=Math.floor(s%3600/60),se=s%60;
  return dd?`${dd} д ${h} ч`:h?`${h} ч ${String(mi).padStart(2,'0')} мин`:`${mi}:${String(se).padStart(2,'0')}`};
const T=iso=>iso?`<span class="cd" data-exp="${esc(iso)}">${left(iso)}</span>`:'';
const TIERS=['Lith','Meso','Neo','Axi','Requiem','Omnia'];
function nowView(){
  view.innerHTML=`<div class="wrap"><div class="head"><div><div class="eyebrow">Мир Origin</div><h1>Сейчас в игре</h1><p class="sub">Разломы Бездны, вылазка, архонт, циклы открытых миров, Баро Ки'Тиир, Ночная волна и вторжения. Данные обновляются раз в минуту, таймеры идут в реальном времени.</p></div></div><div id="nowb" class="loading">ЗАГРУЗКА…</div></div>${foot()}`;
  let fm='normal';
  const draw=ws=>{
    const f=(ws.fissures||[]).filter(x=>!x.expired&&new Date(x.expiry)>Date.now()&&(fm==='storm'?x.isStorm:fm==='hard'?x.isHard&&!x.isStorm:!x.isHard&&!x.isStorm));
    const fz=TIERS.map(t=>[t,f.filter(x=>x.tier===t)]).filter(x=>x[1].length);
    const cyc=[['Цетус','cetusCycle'],['Орб-Валлис','vallisCycle'],['Камбиональный дрейф','cambionCycle'],['Земля','earthCycle'],['Зариман','zarimanCycle'],['Дувири','duviriCycle']].map(([n,k])=>[n,ws[k]]).filter(x=>x[1]);
    const so=ws.sortie,ar=ws.archonHunt,vt=ws.voidTrader,nw=ws.nightwave,inv=(ws.invasions||[]).filter(x=>!x.completed),arb=ws.arbitration,sp=ws.steelPath;
    $('#nowb').className='';
    $('#nowb').innerHTML=`<section class="card cut" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h3 style="margin:0">Разломы Бездны</h3>
       <div class="subtabs" style="margin:0">${[['normal','Обычные'],['hard','Стальной путь'],['storm','Бури Бездны']].map(([k,t])=>`<a href="#now" data-fm="${k}" class="${fm===k?'on':''}">${t}</a>`).join('')}</div></div>
       <div class="fgrid" style="padding:12px 0 0;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${fz.map(([t,l])=>`<div class="stat2"><div class="k" style="display:flex;justify-content:space-between"><span>${t} · ${l.length}</span><a href="#relics" data-tier="${t}" style="font-size:11px">реликвии ${t} →</a></div>
         ${l.map(x=>`<div style="padding:6px 0;border-top:1px solid var(--line);font-size:13.5px"><b style="font-family:var(--f-display)">${esc(x.missionType)}</b> · ${esc(x.node)}<div style="font:500 11.5px var(--f-data);color:var(--muted);display:flex;justify-content:space-between"><span>${esc(x.enemy||'')}</span>${T(x.expiry)}</div></div>`).join('')}</div>`).join('')||'<p>Сейчас таких разломов нет.</p>'}</div></section>
     <div class="fgrid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">
      ${so&&so.variants?`<section class="card cut"><h3>Вылазка</h3><p>${esc(so.boss||'')} · ${esc(so.faction||'')} · осталось ${T(so.expiry)}</p>${so.variants.map((v,i)=>`<div class="fway" style="grid-template-columns:28px 1fr"><b>${i+1}</b><div><b>${esc(v.missionType)}</b> · ${esc(v.node)}<small>${esc(v.modifier||'')}</small></div></div>`).join('')}</section>`:''}
      ${ar&&ar.missions?`<section class="card cut"><h3>Охота на архонта</h3><p>${esc(ar.boss||'')} · осталось ${T(ar.expiry)}</p>${ar.missions.map((v,i)=>`<div class="fway" style="grid-template-columns:28px 1fr"><b>${i+1}</b><div><b>${esc(v.type)}</b> · ${esc(v.node)}</div></div>`).join('')}</section>`:''}
      <section class="card cut"><h3>Циклы открытых миров</h3>${cyc.map(([n,c])=>`<div class="fway" style="grid-template-columns:1fr auto"><div><b>${n}</b><small>${esc(c.state||'')}</small></div><div>${T(c.expiry)}</div></div>`).join('')}</section>
      ${vt?`<section class="card cut"><h3>Баро Ки'Тиир</h3>${vt.active?`<p>Сейчас на ${esc(vt.location)} · уйдёт через ${T(vt.expiry)}</p>${(vt.inventory||[]).map(x=>`<div class="fway" style="grid-template-columns:1fr auto"><div>${esc(x.item)}</div><div style="font:500 12px var(--f-data)">${x.ducats} дук. · ${num(x.credits)} кр.</div></div>`).join('')}`:`<p>Прибудет на ${esc(vt.location||'')} через ${T(vt.activation)}</p>`}</section>`:''}
      ${nw&&nw.activeChallenges?`<section class="card cut"><h3>Ночная волна</h3>${nw.activeChallenges.map(c=>`<div class="fway" style="grid-template-columns:1fr auto"><div><b>${esc(c.title)}</b><small>${esc(c.desc)}</small></div><div style="font:500 12px var(--f-data);text-align:right">${num(c.reputation)}<br>${T(c.expiry)}</div></div>`).join('')}</section>`:''}
      ${arb&&arb.node?`<section class="card cut"><h3>Арбитраж</h3><p><b>${esc(arb.type||'')}</b> · ${esc(arb.node)} · ${esc(arb.enemy||'')} · ${T(arb.expiry)}</p></section>`:''}
      ${sp&&sp.currentReward?`<section class="card cut"><h3>Стальной путь</h3><p>Награда недели у Тешина: <b>${esc(sp.currentReward.name)}</b> · ${num(sp.currentReward.cost||0)} эссенции · ${T(sp.expiry)}</p></section>`:''}
      ${inv.length?`<section class="card cut"><h3>Вторжения (${inv.length})</h3>${inv.slice(0,12).map(x=>`<div class="fway" style="grid-template-columns:1fr"><div><b>${esc(x.node)}</b> · ${Math.round(x.completion||0)}%<small>${esc([x.vsInfestation?'':x.attacker&&x.attacker.reward&&x.attacker.reward.asString,x.defender&&x.defender.reward&&x.defender.reward.asString].filter(Boolean).join(' / '))}</small></div></div>`).join('')}</section>`:''}
     </div><p class="sub" style="font-size:12px;padding-bottom:20px">Источник: открытое API сообщества warframestat.us (WFCD). Обновлено: ${new Date(wsAt).toLocaleTimeString('ru')}.</p>`;
  };
  const go=()=>loadWS().then(ws=>{if(cur==='now')draw(ws)}).catch(()=>{const b=$('#nowb');if(b)b.innerHTML='<div class="empty">Не удалось получить данные игрового мира. Попробуйте обновить страницу чуть позже.</div>'});
  go();
  view.onclick=e=>{const a=e.target.closest('[data-fm]');if(a){e.preventDefault();fm=a.dataset.fm;draw(WS);return}const t=e.target.closest('[data-tier]');if(t){state.relics.q=t.dataset.tier}};
  let tick=0;nowTimer=setInterval(()=>{document.querySelectorAll('.cd[data-exp]').forEach(el=>el.textContent=left(el.dataset.exp));if(++tick%60===0)go()},1000);
}

/* ---------- Сквозной поиск ---------- */
let SIDX=null;
function buildIndex(){
  const out=[];const add=(t,n,e,s,img,go)=>out.push({t,n,e,s,img,go,_s:(n+' '+(e||'')).toLowerCase()});
  for(const [k,l,t] of [['arsenal',D.weapons,'Оружие'],['frames',D.frames,'Варфрейм'],['companions',D.companions,'Компаньон']])for(const x of l)add(t,x.ru,x.name,x.category,x.img,()=>openItem(k,x));
  for(const r of D.relics)add('Реликвия',r.name,'',r.status,r.img,()=>{state.relics.q=r.name;location.hash='relics'});
  for(const r of D.resources)add('Ресурс',r.ru,r.name,'',r.img,()=>{state.resources.q=r.ru;location.hash='resources'});
  W.FACTIONS.forEach(f=>add('Фракция',f.name,f.en,'Энциклопедия',null,()=>{location.hash='wiki-factions'}));
  W.STATUS.forEach(([e,n])=>add('Статус-эффект',n,W.EL[e],'Энциклопедия',null,()=>{location.hash='wiki-status'}));
  Object.values(W.FOCUS).forEach(f=>add('Школа фокуса',f.name,'',f.role,null,()=>{location.hash='wiki-focus'}));
  window.LORE.EV.forEach((e,i)=>add('Хроники',e.title,e.quest||'',e.when,null,()=>{location.hash='lore-'+(i+1)}));
  if(MODS){for(const m of MODS.mods)add('Мод',m.ru,m.n,(m.rs||[])[0]||'',m.img,()=>openMod(m));for(const a of MODS.arcanes)add('Мистификатор',a.ru,a.n,(a.rs[0]||'').split('\n')[0],a.img,()=>openArc(a))}
  if(BEST)for(const e of BEST.enemies)add('Противник',e.n,'',EF[e.f]||e.f||'',e.img,()=>openEnemy(e));
  return out;
}
function openSearch(){
  if(document.querySelector('.gsearch'))return;
  const ov=document.createElement('div');ov.className='picker gsearch';
  ov.innerHTML=`<div role="dialog" aria-modal="true" aria-label="Поиск по сайту"><div class="pk-head"><input class="field" id="gsq" type="search" placeholder="Оружие, варфрейм, мод, реликвия, противник, событие лора…" aria-label="Поиск по сайту" autocomplete="off">
    <div style="font:500 11px var(--f-data);color:var(--muted)">↑ ↓ — выбор · Enter — открыть · Esc — закрыть</div></div><div class="pk-list" id="gsl"></div></div>`;
  document.body.appendChild(ov);const inp=ov.querySelector('#gsq');setTimeout(()=>inp.focus(),20);
  SIDX=buildIndex();let res=[],sel=0;
  Promise.all([loadMods(),loadBest()]).then(()=>{SIDX=buildIndex();draw()}).catch(()=>{});
  const score=(x,q,toks)=>{const n=x.n.toLowerCase(),e=(x.e||'').toLowerCase();if(!toks.every(t=>x._s.includes(t)))return 0;
    return (n===q||e===q?100:0)+(n.startsWith(q)||e.startsWith(q)?50:0)+(n.split(/[\s-]+/).some(w=>w.startsWith(toks[0]))?20:0)+10-Math.min(9,n.length/10)};
  const draw=()=>{const q=inp.value.toLowerCase().trim();const toks=q.split(/\s+/).filter(Boolean);
    if(!toks.length){$('#gsl').innerHTML='<div class="empty">Начните вводить название на русском или английском.</div>';res=[];return}
    res=SIDX.map(x=>[x,score(x,q,toks)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,40).map(x=>x[0]);sel=Math.min(sel,res.length-1);if(sel<0)sel=0;
    $('#gsl').innerHTML=res.map((x,i)=>`<button class="pk-item${i===sel?' on':''}" data-gi="${i}">${x.img?pic(x.img,'',x.n,40):'<span class="gsi">'+esc(x.t[0])+'</span>'}<div style="min-width:0"><div class="t">${esc(x.n)}${x.e&&x.e!==x.n?` <span style="font:500 11px var(--f-data);color:var(--muted)">${esc(x.e)}</span>`:''}</div><div class="s">${esc(x.s||'')}</div></div><span class="tag">${esc(x.t)}</span></button>`).join('')||'<div class="empty">Ничего не найдено.</div>';
    const el=ov.querySelector('.pk-item.on');if(el)el.scrollIntoView({block:'nearest'})};
  const close=()=>ov.remove();
  const open=i=>{const x=res[i];if(!x)return;close();x.go()};
  inp.addEventListener('input',()=>{sel=0;draw()});
  inp.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){sel=Math.min(res.length-1,sel+1);draw();e.preventDefault()}else if(e.key==='ArrowUp'){sel=Math.max(0,sel-1);draw();e.preventDefault()}else if(e.key==='Enter'){open(sel)}else if(e.key==='Escape'){e.stopPropagation();close()}});
  ov.addEventListener('click',e=>{if(e.target===ov)return close();const b=e.target.closest('[data-gi]');if(b)open(+b.dataset.gi)});
  draw();
}
document.getElementById('gsbtn')?.addEventListener('click',openSearch);
addEventListener('keydown',e=>{if((e.key==='/'&&!e.target.closest('input,textarea,select'))||((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k')){e.preventDefault();openSearch()}});

function foot(){return `<footer class="wrap">Обновлено: ${D.built}. Данные: WARFRAME Wiki и WFCD warframe-items; описания добычи переведены и дополнены вручную. Warframe © Digital Extremes. Неофициальный фанатский сайт.</footer>`}

/* ---------- Запуск ---------- */
const auth=cloudInit();
fetch('data.json?v='+(window.WA_V||'')).then(r=>r.json()).then(async j=>{D=j;prep();await auth;renderWho();route()}).catch(()=>{view.innerHTML='<div class="loading">Не удалось загрузить данные. Обновите страницу.</div>'});
})();
