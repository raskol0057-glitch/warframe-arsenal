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
  const known=['arsenal','frames','companions','mods','arcanes','build','wiki','relics','resources','new','lore','guide','profile'];
  const vv=known.includes(v)?v:'arsenal';
  document.querySelectorAll('#tabs a').forEach(a=>a.classList.toggle('on',a.dataset.v===vv));
  closeDrawer(true);
  if(cur==='lore'&&vv!=='lore')stopLore();
  if(vv==='lore'&&cur==='lore'&&m){showEv(+m[1]-1,true);return}
  cur=vv;window.scrollTo(0,0);
  ({arsenal:()=>catalog('arsenal'),frames:()=>catalog('frames'),companions:()=>catalog('companions'),mods:modsView,arcanes:arcanesView,wiki:()=>wiki(wk?wk[1]:'factions'),build:()=>builder(bm&&bm[1]),relics:()=>table('relics'),resources:()=>table('resources'),new:fresh,lore:()=>lore(m?+m[1]-1:0),guide,profile})[vv]();
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
  const row=it=>kind==='relics'
    ?`<div class="row cut">${pic(it.img,'',it.name,52)||'<span></span>'}<div><div class="t">${esc(it.name)}</div><div class="s">${esc(it.status)}</div>${it.vaulted!=null?`<span class="tag ${it.vaulted?'v':'ok'}" style="display:inline-block;margin-top:6px">${it.vaulted?'Сейчас в хранилище':'Сейчас выпадает'}</span>`:''}</div><div class="w">${esc(it.where)}</div></div>`
    :`<div class="row cut">${pic(it.img,'',it.name,52)||'<span></span>'}<div><div class="t">${esc(it.ru)}</div><div class="s">${esc(it.name)}</div></div><div class="w">${esc(it.where)}</div></div>`;
  const more=()=>{const s=arr.slice(shown,shown+80);shown+=s.length;$('#rows').insertAdjacentHTML('beforeend',s.map(row).join('')||(shown?'':'<div class="empty">Ничего не найдено.</div>'));
    $('#more').innerHTML=shown<arr.length?`<button class="btn" id="mbtn">Показать ещё (${num(arr.length-shown)})</button>`:''};
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
    <section class="card cut"><h3>Синхронизация с игрой</h3>
      <p>У Warframe есть открытая страница профиля игрока с опытом каждого предмета. Сайт может отметить всё, что прокачано до максимального ранга. Браузер не даёт сайту запросить её сам, поэтому нужен один шаг вручную.</p>
      <ol class="steps">
       <li>Найдите ID аккаунта: откройте файл <code>%LOCALAPPDATA%\\Warframe\\EE.log</code> (после запуска игры) и найдите строку <code>Logged in</code> — в скобках 24 символа, это ваш ID. Можно вставить сюда всю строку.</li>
       <li>Вставьте ID и откройте ссылку на профиль.</li>
       <li>Скопируйте всё, что откроется на странице (Ctrl+A, Ctrl+C), и вставьте в поле ниже.</li>
      </ol>
      <div class="inline"><input class="field" id="pid" placeholder="ID аккаунта или строка из EE.log" aria-label="ID аккаунта" value="${esc(p?p.pid:'')}"><a class="btn" id="popen" target="_blank" rel="noopener" href="#">Открыть профиль</a></div>
      <textarea class="field" id="pjson" style="margin-top:8px" placeholder="Сюда вставьте ответ страницы профиля" aria-label="Данные профиля"></textarea>
      <div class="inline" style="margin-top:8px"><button class="btn gold" id="pimp">Импортировать освоение</button></div><div id="pmsg" class="msg"></div>
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
  const pidOf=()=>{const m=$('#pid').value.match(/[0-9a-f]{24}/i);return m?m[0].toLowerCase():''};
  const upd=()=>{const id=pidOf();$('#popen').href=id?'https://api.warframe.com/cdn/getProfileViewingData.php?playerId='+id:'#'};
  $('#pid').addEventListener('input',upd);upd();
  $('#popen').onclick=e=>{if(!pidOf()){e.preventDefault();msg('#pmsg','Сначала вставьте ID аккаунта (24 символа).',1)}};
  $('#pimp').onclick=()=>{
    let j;try{j=JSON.parse($('#pjson').value)}catch(_){return msg('#pmsg','Не получилось прочитать данные. Скопируйте страницу профиля целиком, начиная с фигурной скобки.',1)}
    const xp=[];let name='';(function walk(o){if(Array.isArray(o)){for(const x of o){if(x&&typeof x==='object'&&'ItemType' in x&&'XP' in x)xp.push(x);else walk(x)}}else if(o&&typeof o==='object'){if(typeof o.DisplayName==='string'&&!name)name=o.DisplayName;for(const k in o)walk(o[k])}})(j);
    if(!xp.length)return msg('#pmsg','В данных нет списка опыта предметов. Проверьте, что скопирована страница профиля.',1);
    if(!prof())newProfile(name?name.replace(/[^\w\-. ]/g,'').trim()||'Тэнно':'Тэнно');
    const pp=prof();if(pidOf())pp.pid=pidOf();let n=0,seen=0;
    for(const x of xp){const hit=D.byUid[x.ItemType];if(!hit)continue;seen++;const [kind,it]=hit;const need=(it.xpk||500)*Math.pow(it.cap||30,2);if(x.XP>=need&&!pp.m[mkey(kind,it)]){pp.m[mkey(kind,it)]=1;n++}}
    save();msg('#pmsg',`Готово: найдено ${seen} предметов каталога с опытом, отмечено новых освоенных: ${n}.`);setTimeout(profile,1600);
  };
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
  if(!modsP)modsP=fetch('mods.json').then(r=>r.json()).then(j=>{
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
const MD=n=>n&&MODS&&MODS.byN[n];
function emptyBuild(kind,it){const bk=bkOf(kind,it),L=layout(bk),d=defaults(it,bk);
  return {k:kind,i:it.name,rt:1,a:L.aura?{p:d.a,m:null,r:0}:null,x:L.exi?{p:d.x,m:null,r:0}:null,s:d.s.map(p=>({p,m:null,r:0})),c:Array(L.arc).fill(null),title:''}}
function setMod(slot,n){const m=MD(n);if(slot&&m){slot.m=n;slot.r=m.f}}
function itemOf(b){return D.byName[b.k+':'+b.i]}
function calc(b){
  const it=itemOf(b),bk=bkOf(b.k,it),def=defaults(it,bk);
  const cap=(it.cap||30)*(b.rt?2:1);let used=0;const f={forma:0,aura:0,stance:0,umbra:0,omni:0};
  const all=[...(b.a?[['a',b.a,def.a]]:[]),...(b.x?[['x',b.x,def.x]]:[]),...b.s.map((x,i)=>['s',x,def.s[i]])];
  for(const [t,x,dp] of all){used+=cost(x.p,MD(x.m),x.r);
    if(x.p&&x.p!==dp){if(x.p==='umbra')f.umbra++;else if(x.p==='any')f.omni++;else if(t==='a')f[bk==='melee'?'stance':'aura']++;else f.forma++}}
  return {cap,used,free:cap-used,f};
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
function polarizeAll(b){for(const x of [...(b.a?[b.a]:[]),...(b.x?[b.x]:[]),...b.s]){const m=MD(x.m);if(m&&m.p)x.p=m.p}return b}

/* ---------- Расчёт характеристик ---------- */
const STATRE=/^([+-]?\d+(?:[.,]\d+)?)%\s+([A-Za-z ()]+?)\s*$/;
function modStats(m,r){const k=(r+1)/((m.f||0)+1),out=[];for(const s of m.en||[]){const mm=String(s).trim().match(STATRE);if(mm)out.push([mm[2].trim().toLowerCase(),parseFloat(mm[1].replace(',','.'))*k])}return out}
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
  const it=itemOf(b),st=it.st||{},sum={},order=[];
  for(const x of [...(b.a?[b.a]:[]),...(b.x?[b.x]:[]),...b.s]){const m=MD(x.m);if(!m)continue;
    for(const [k,v] of modStats(m,x.r)){const key=(b.k==='arsenal'?WMAP:FMAP)[k];if(!key)continue;
      if(b.k==='arsenal'&&['heat','cold','electricity','toxin','radiation','viral','corrosive','magnetic','blast','gas'].includes(key))order.push([key,v]);else sum[key]=(sum[key]||0)+v}}
  const S2=k=>sum[k]||0;
  if(b.k!=='arsenal'){
    return {kind:'body',rows:[['Сила',100+S2('str'),'%'],['Длительность',100+S2('dur'),'%'],['Дальность',100+S2('rng'),'%'],['Эффективность',Math.min(175,100+S2('eff')),'%'],
      ['Здоровье',st.hp!=null?st.hp*(1+S2('hp')/100):null,''],['Щиты',st.sh!=null?st.sh*(1+S2('sh')/100):null,''],['Броня',st.ar!=null?st.ar*(1+S2('ar')/100):null,''],
      ['Энергия',st.en!=null?st.en*(1+S2('en')/100):null,''],['Скорость',st.sp!=null?st.sp*(1+S2('sp')/100):null,'']]};
  }
  const B=st.tot||0,dm=1+S2('dmg')/100,phys={};
  for(const p of ['impact','puncture','slash'])if(st.dmg&&st.dmg[p])phys[p]=st.dmg[p]*dm*(1+S2(p)/100);
  const inn=Object.entries(st.dmg||{}).filter(([k])=>!['impact','puncture','slash'].includes(k)).map(([k,v])=>[k,v/(B||1)*100]);
  const els=combine([...order,...inn]).map(([k,v])=>[k,B*dm*v/100]);
  const dmg={...phys};for(const [k,v] of els)dmg[k]=(dmg[k]||0)+v;
  const total=Object.values(dmg).reduce((a,v)=>a+v,0);
  const cc=(st.cc||0)*(1+S2('cc')/100),cm=(st.cm||1)*(1+S2('cd')/100),sc=(st.sc||0)*(1+S2('sc')/100),fr=(st.fr||1)*(1+S2('fr')/100),ms=(st.ms||1)*(1+S2('ms')/100);
  const avg=total*(1+cc*(cm-1));
  return {kind:'weapon',dmg,rows:[['Урон за попадание',total,''],['Крит. шанс',cc*100,'%'],['Крит. урон',cm,'×'],['Шанс статуса',sc*100,'%'],
    [st.wt==='Melee'?'Скорость атаки':'Скорострельность',fr,''],['Мультивыстрел',ms,''],['Магазин',st.mag?Math.round(st.mag*(1+S2('mag')/100)):null,''],
    ['Перезарядка',st.rl?st.rl/(1+S2('rl')/100):null,' с'],['Средний урон с критами',avg*ms,''],['Урон в секунду (без перезарядки)',avg*ms*fr,'']],
    base:{'Урон за попадание':B,'Крит. шанс':(st.cc||0)*100,'Крит. урон':st.cm,'Шанс статуса':(st.sc||0)*100}};
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
  return optimize(b);
}
function recInDrawer(kind,it){
  if(!bkOf(kind,it))return;
  loadMods().then(()=>{const el=$('#drec');if(!el)return;const b=recBuild(kind,it);
    const own=enc(packB(emptyBuild(kind,it)));
    if(!b){el.innerHTML=`<div class="btnrow"><a class="btn" href="#build=${own}">Собрать билд в конструкторе</a></div>`;return}
    const c=calc(b),f=c.f,ms=[...(b.a&&b.a.m?[b.a]:[]),...(b.x&&b.x.m?[b.x]:[]),...b.s.filter(x=>x.m)];
    el.innerHTML=`<div class="slabel">Рекомендованный билд — ${esc(b.title)}</div>
      <div class="rec">${ms.map(x=>{const m=MD(x.m);return `<div class="recm">${pic(m.img,'',m.n,28)}<span title="${esc(m.ru)}">${esc(m.ru)}</span></div>`}).join('')}${b.c.filter(Boolean).map(n=>{const a=MODS.arcN[n];return `<div class="recm">${pic(a.img,'',a.n,28)}<span>${esc(a.ru)}</span></div>`}).join('')}</div>
      <p class="route" style="margin-top:10px">Нужно форм: <b>${f.forma}</b>${f.aura?` + аура-форм: ${f.aura}`:''}${f.stance?` + форм стойки: ${f.stance}`:''}${f.umbra?` + Умбра-форм: ${f.umbra}`:''}${f.omni?` + Омни-форм: ${f.omni}`:''}. Ёмкость: ${c.used} / ${c.cap} (с Реактором Орокин или Катализатором).</p>
      <div class="btnrow"><a class="btn gold" href="#build=${enc(packB(b))}">Открыть в конструкторе</a><a class="btn" href="#build=${own}">Собрать свой</a></div>
      <p class="sub" style="font-size:12.5px">Базовый билд по типу ${kind==='frames'?'варфрейма':kind==='companions'?'компаньона':'оружия'}. Prime-моды можно заменить обычными версиями. Подробные билды игроков — на Overframe по ссылке ниже.</p>`;
  });
}
const packB=b=>({k:b.k,i:b.i,rt:b.rt,t:b.title,a:b.a&&[b.a.p,b.a.m,b.a.r],x:b.x&&[b.x.p,b.x.m,b.x.r],s:b.s.map(x=>[x.p,x.m,x.r]),c:b.c});
function unpackB(o){const it=D.byName[o.k+':'+o.i];if(!it||!bkOf(o.k,it))return null;const b=emptyBuild(o.k,it);b.rt=o.rt?1:0;b.title=o.t||'';
  const u=(t,v)=>{if(t&&v){t.p=v[0]||null;t.m=v[1]||null;t.r=v[2]||0}};u(b.a,o.a);u(b.x,o.x);(o.s||[]).forEach((v,i)=>b.s[i]&&u(b.s[i],v));(o.c||[]).forEach((n,i)=>{if(i<b.c.length)b.c[i]=n});return b}

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
      <div class="btnrow"><button class="btn gold" id="bopt">Минимум форм</button><button class="btn" id="bpolall">Полярность под каждый мод</button><button class="btn" id="brec">Рекомендованный</button><button class="btn danger" id="bclr">Очистить</button></div>
      <div class="btnrow"><button class="btn" id="bsave">Сохранить</button><button class="btn" id="blink">Скопировать ссылку</button></div><div id="bmsg" class="msg"></div></section>`:''}
     <section class="card cut"><h3>Мои билды</h3>${saved.length?`<div class="plist">${saved.map((s,i)=>`<div class="pitem"><span class="nm" style="font-size:13.5px">${esc(s.title)}</span><button class="btn" data-load="${i}">Открыть</button><button class="btn danger" data-del="${i}" aria-label="Удалить">×</button></div>`).join('')}</div>`:'<p>Сохранённые билды появятся здесь. Они хранятся в этом браузере.</p>'}</section>
    </aside>
    <div>${b?`<div class="slots top" id="topslots"></div><div class="slots" id="slots"></div><div class="slabel">Итоговые характеристики</div><div id="bstats"></div>
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
  $('#bsave').onclick=()=>{S.builds=S.builds||[];S.builds.unshift({title:`${it.ru}${b.title?' — '+b.title:''} (${new Date().toLocaleDateString('ru')})`,code:enc(packB(b))});S.builds=S.builds.slice(0,50);save();renderBuilder();msg('#bmsg','Билд сохранён.')};
  $('#blink').onclick=()=>{const url=location.origin+location.pathname+'#build='+enc(packB(b));navigator.clipboard?.writeText(url).then(()=>msg('#bmsg','Ссылка скопирована.'),()=>msg('#bmsg',url))};
  refresh();
  function slotHtml(x,label,idx,type){
    const m=MD(x.m);const c=m?cost(x.p,m,x.r):0;const cls=m&&x.p&&m.p?(x.p===m.p?'m':'x'):'';
    if(type==='c'){const a=x&&MODS.arcN[x];return `<div class="slot lbl${a?'':' empty'}" data-l="${label}" data-t="c" data-i="${idx}">${a?`<div class="row1">${pic(a.img,'',a.n,34)}<div class="mn">${esc(a.ru)}</div></div>`:'+ мистификатор'}</div>`}
    return `<div class="slot lbl${m?'':' empty'}" data-l="${label}" data-t="${type}" data-i="${idx}">
      ${m?`<div class="sh">${polIcon(x.p)||'<span class="pol"></span>'}<span class="dr ${cls}">${c<0?'+'+(-c):c}</span></div><div class="row1">${pic(m.img,'',m.n,34)}<div class="mn">${esc(m.ru)}</div></div><div class="sh"><span>ранг ${x.r}/${m.f}</span>${polIcon(m.p)}</div>`
        :`${polIcon(x.p)||''}<span>+ мод</span>`}</div>`;
  }
  function refresh(){
    const top=[];if(b.a)top.push(slotHtml(b.a,L.aura,0,'a'));if(b.x)top.push(slotHtml(b.x,'Эксилус',0,'x'));b.c.forEach((n,i)=>top.push(slotHtml(n,'Мистификатор',i,'c')));
    $('#topslots').innerHTML=top.join('');$('#topslots').hidden=!top.length;
    $('#slots').innerHTML=b.s.map((x,i)=>slotHtml(x,'Слот '+(i+1),i,'s')).join('');
    const c=calc(b),f=c.f;
    $('#bcap').innerHTML=`<div class="lbl" style="display:flex;justify-content:space-between;font:500 12px var(--f-data);color:var(--muted)"><span>Ёмкость</span><span>свободно ${c.free}</span></div>
      <div class="cap ${c.free<0?'over':''}">${c.used} / ${c.cap}</div><div class="bar" style="margin:6px 0 12px"><i style="width:${Math.min(100,Math.max(0,c.used/c.cap*100))}%;${c.free<0?'background:var(--warn)':''}"></i></div>
      <div class="formas">${box('Формы',f.forma)}${bk==='melee'?box('Формы стойки',f.stance):box('Аура-формы',L.aura?f.aura:null)}${box('Умбра-формы',f.umbra||null)}${box('Омни-формы',f.omni||null)}${box('Всего форм',f.forma+f.aura+f.stance+f.umbra+f.omni)}</div>
      ${c.free<0?'<p class="msg err">Не хватает ёмкости. Нажмите «Минимум форм», чтобы подобрать полярности.</p>':''}`;
    const sres=statsOf(b);
    $('#bstats').innerHTML=`<div class="stats">${sres.rows.filter(r=>r[1]!=null).map(([k,v,u])=>{const base=sres.base&&sres.base[k];const up=base!=null&&Math.abs(v-base)>1e-6;return box(k,`${u==='×'?'×':''}${fmt(v)}${u&&u!=='×'?u:''}${up?` <small class="${v>base?'up':'down'}">было ${fmt(base)}${u==='%'?'%':''}</small>`:''}`)}).join('')}</div>${sres.dmg?elChips(sres.dmg):''}`;
    history.replaceState(null,'','#build');
  }
  view.querySelector('.bwrap').addEventListener('click',e=>{const s=e.target.closest('.slot');if(!s)return;openPicker(b,it,bk,s.dataset.t,+s.dataset.i,refresh)});
}
function openPicker(b,it,bk,t,i,done){
  const L=layout(bk);
  const ov=document.createElement('div');ov.className='picker';
  const isArc=t==='c';const slot=isArc?null:(t==='a'?b.a:t==='x'?b.x:b.s[i]);
  const used=new Set([...(b.a&&b.a.m?[b.a.m]:[]),...(b.x&&b.x.m?[b.x.m]:[]),...b.s.map(x=>x.m).filter(Boolean)]);
  const list=isArc?MODS.arcanes.filter(a=>L.arcT.includes(a.t)&&!b.c.includes(a.n)):MODS.mods.filter(m=>compat(m,it,bk,t)&&(!used.has(m.n)||m.n===slot.m));
  ov.innerHTML=`<div role="dialog" aria-modal="true" aria-label="Выбор мода"><div class="pk-head">
     <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font:700 15px var(--f-display);letter-spacing:.12em;text-transform:uppercase;color:var(--gold2)">${isArc?'Мистификатор':t==='a'?L.aura:t==='x'?'Эксилус':'Слот '+(i+1)}</b><button class="btn" data-x>Закрыть</button></div>
     ${isArc?'':`<div class="pk-pols"><span style="font:500 11px var(--f-data);color:var(--muted)">Полярность слота:</span>${['',...POLS].map(p=>`<button data-pol="${p}" class="${(slot.p||'')===p?'on':''}">${p?polIcon(p)+esc(W.POL[p]):'Нет'}</button>`).join('')}</div>`}
     ${!isArc&&slot.m?`<label style="display:flex;gap:10px;align-items:center;font:500 12px var(--f-data);color:var(--muted)">Ранг <input type="range" id="pkr" min="0" max="${MD(slot.m).f}" value="${slot.r}" style="flex:1"> <span id="pkrv">${slot.r}</span></label>`:''}
     <input class="field" id="pkq" type="search" placeholder="Поиск по названию или эффекту" aria-label="Поиск мода"></div>
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
   ${dropsHtml(m.dr)}`;
  $('#scrim').hidden=false;d.hidden=false;d.scrollTop=0;d.onclick=null;
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
    $('#grid').onclick=e=>{const c=e.target.closest('.modc');if(!c)return;const a=arr[+c.dataset.i];onClose=null;const d=$('#drawer');
      d.innerHTML=`<button class="close" id="dclose" aria-label="Закрыть">×</button><div class="dhead">${pic(a.img,'',a.n,132)||'<div class="none">A</div>'}<div><h2>${esc(a.ru)}</h2><div class="en">${esc(a.n)} · ${esc(ARCT[a.t]||a.t)}</div><div class="tags"><span class="tag r-${a.r}">${esc(RAR[a.r]||'')}</span><span class="tag">Рангов: ${a.f}</span></div></div></div>
        <div class="slabel">Эффект на максимальном ранге</div><p class="modtext">${esc(a.rs.join('\n'))}</p>${dropsHtml(a.dr)}`;
      $('#scrim').hidden=false;d.hidden=false;d.scrollTop=0;d.onclick=null};
    apply();
  });
}

/* ---------- Энциклопедия ---------- */
function wiki(sub){
  const tabs=[['factions','Фракции'],['status','Статус-эффекты'],['focus','Школы фокуса']];
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
  view.innerHTML=head+'<div class="loading">ЗАГРУЗКА…</div></div>';
  loadMods().then(()=>{
    view.innerHTML=head+Object.entries(W.FOCUS).map(([k,s])=>{const ways=MODS.focus.filter(f=>f.s===k);const groups=['Ultimate','Active','Residual','Stats'];
      return `<section class="school cut" style="--fc:${s.col}"><h3>${esc(s.name)}</h3><div style="font:500 12px var(--f-data);color:var(--muted);margin-top:4px">${esc(s.role)} · оружие Тауронова удара: ${esc(s.weapon)}</div><p style="color:#c6d1de;max-width:75ch">${esc(s.text)}</p>
        ${groups.map(g=>{const l=ways.filter(w=>w.k===g);return l.length?`<div class="slabel">${esc(W.FK[g])}</div>${l.map(w=>{const tr=W.FOCUS_RU[w.n];return `<div class="fway"><div><b>${esc(tr?tr[0]:w.n)}</b><small>${esc(w.n)}</small></div><div>${esc(tr?tr[1]:w.en)}</div></div>`}).join('')}`:''}).join('')}</section>`}).join('')+'</div>'+foot();
  });
}

function foot(){return `<footer class="wrap">Обновлено: ${D.built}. Данные: WARFRAME Wiki и WFCD warframe-items; описания добычи переведены и дополнены вручную. Warframe © Digital Extremes. Неофициальный фанатский сайт.</footer>`}

/* ---------- Запуск ---------- */
const auth=cloudInit();
fetch('data.json').then(r=>r.json()).then(async j=>{D=j;prep();await auth;renderWho();route()}).catch(()=>{view.innerHTML='<div class="loading">Не удалось загрузить данные. Обновите страницу.</div>'});
})();
