const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let games=[], filterCat='', loggedIn=false, editing=null;
let gamePage=1, lastCatalogQuery='', featureGames=[], featureIndex=0, featureSignature='', featureMotion=null;
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
const SITE_BASE=window.GAMEHUB_BASE||'/';
const GH_DATA_GAMES='data/games.json', GH_DATA_DONATIONS='data/donations.json';
const GH_TOKEN_KEY='gamehubGithubToken', GH_REPO_KEY='gamehubGithubRepo';
function withBase(path=''){const s=String(path||'');if(/^(?:https?:|data:|blob:)/i.test(s))return s;return SITE_BASE+ s.replace(/^\/+/, '')}
function sitePath(path='/'){const clean=String(path||'/');return SITE_BASE+(clean==='/'?'':clean.replace(/^\/+/,''))}
function currentPath(){let p=location.pathname||'/';if(SITE_BASE!=='/'&&p.startsWith(SITE_BASE))p='/'+p.slice(SITE_BASE.length);else if(SITE_BASE!=='/'&&p===SITE_BASE.slice(0,-1))p='/';return p||'/'}
function mediaUrl(value=''){const s=String(value||'').trim();if(!s)return '';if(/^(?:https?:|data:|blob:)/i.test(s))return s;if(s.startsWith('/'))return withBase(s);return s}
function safeLink(value=''){const s=String(value||'').trim();try{const u=new URL(s,location.href);return /^(https?:)$/i.test(u.protocol)?u.href:'#'}catch{return '#'}}
function go(path){history.pushState({},'',sitePath(path));route();scrollTo({top:0,behavior:'smooth'})}
function show(id){['homeView','detailView','donateView','adminView'].forEach(x=>$('#'+x).classList.toggle('hidden',x!==id));$$('.menu button').forEach(button=>{const active=button.dataset.go?button.dataset.go===currentPath()&&(button.dataset.go!=='/'||!filterCat):id==='homeView'&&button.dataset.cat===filterCat;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});document.dispatchEvent(new Event('gamehub:view'))}
function parseRepoSpec(spec=''){let raw=String(spec||'').trim(),branch='main';const at=raw.lastIndexOf('@');if(at>0){branch=raw.slice(at+1).trim()||'main';raw=raw.slice(0,at)}const parts=raw.split('/').map(x=>x.trim()).filter(Boolean);if(!parts[0])throw new Error('Nhập GitHub theo dạng username/gamehub');return {owner:parts[0],repo:parts[1]||'gamehub',branch}}
function adminSession(){const token=sessionStorage.getItem(GH_TOKEN_KEY)||'';const spec=localStorage.getItem(GH_REPO_KEY)||'';if(!token||!spec)return null;try{return {...parseRepoSpec(spec),token,spec}}catch{return null}}
function requireAdminClient(){const s=adminSession();if(!s)throw new Error('Chưa đăng nhập GitHub');return s}
function ghContentUrl(session,path){return `https://api.github.com/repos/${encodeURIComponent(session.owner)}/${encodeURIComponent(session.repo)}/contents/${String(path).split('/').map(encodeURIComponent).join('/')}`}
async function ghRequest(path,opt={}){const s=requireAdminClient();const headers={'Accept':'application/vnd.github+json','Authorization':`Bearer ${s.token}`,'X-GitHub-Api-Version':'2022-11-28',...(opt.headers||{})};const suffix=opt.query||'';const r=await fetch(ghContentUrl(s,path)+suffix,{method:opt.method||'GET',headers,body:opt.body});let d=null;try{d=await r.json()}catch{}if(!r.ok){const e=new Error(d?.message||`GitHub API ${r.status}`);e.status=r.status;throw e}return d}
function b64ToBytes(s=''){const bin=atob(String(s).replace(/\s/g,'')),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
function bytesToB64(bytes){let out='';const step=0x8000;for(let i=0;i<bytes.length;i+=step)out+=String.fromCharCode(...bytes.subarray(i,i+step));return btoa(out)}
async function ghReadFile(path){const s=requireAdminClient();const d=await ghRequest(path,{query:`?ref=${encodeURIComponent(s.branch)}`});return {text:new TextDecoder().decode(b64ToBytes(d.content||'')),sha:d.sha}}
async function ghWriteFile(path,bytes,message,sha=null){const s=requireAdminClient();const body={message,content:bytesToB64(bytes),branch:s.branch};if(sha)body.sha=sha;return ghRequest(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}
async function readRepoJson(path,fallback=[]){try{const {text}=await ghReadFile(path);const d=JSON.parse(text||'[]');return Array.isArray(d)?d:fallback}catch(e){if(e.status===404)return fallback;throw e}}
async function mutateRepoJson(path,mutate,message){let items=[],sha=null;try{const f=await ghReadFile(path);items=JSON.parse(f.text||'[]');if(!Array.isArray(items))items=[];sha=f.sha}catch(e){if(e.status!==404)throw e}const result=await mutate(items);await ghWriteFile(path,new TextEncoder().encode(JSON.stringify(items,null,2)+'\n'),message,sha);return result}
async function readStaticJson(path,fallback=[]){const joiner=String(path).includes('?')?'&':'?';const r=await fetch(withBase(path)+joiner+'v='+Math.floor(Date.now()/60000),{cache:'no-store'});if(r.status===404)return fallback;if(!r.ok)throw new Error(`Không tải được ${path} (${r.status})`);const d=await r.json();return Array.isArray(d)?d:fallback}
function slugify(s=''){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'game-'+Date.now()}
function newId(){return globalThis.crypto?.randomUUID?.()||Array.from(globalThis.crypto.getRandomValues(new Uint8Array(8)),x=>x.toString(16).padStart(2,'0')).join('')}
async function uploadCoverDataUrl(dataUrl,slug){if(!dataUrl||!String(dataUrl).startsWith('data:image/'))return '';const m=String(dataUrl).match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);if(!m)throw new Error('Ảnh bìa không hợp lệ');const ext=m[1].toLowerCase()==='jpeg'?'jpg':m[1].toLowerCase(),bytes=b64ToBytes(m[2]);if(bytes.length>5*1024*1024)throw new Error('Ảnh bìa tối đa 5 MB');const target=`covers/${slug}-${Date.now()}.${ext}`;await ghWriteFile(target,bytes,`Add cover ${slug}`);return '/'+target}
function parseBody(opt={}){if(!opt.body)return {};if(typeof opt.body==='string'){try{return JSON.parse(opt.body)}catch{return {}}}return opt.body||{}}
function donationValues(body={}){if(body.confirmed!==true)throw new Error('Hãy xác nhận đã nhận khoản ủng hộ trước khi đăng.');const name=String(body.name||'').trim(),message=String(body.message||'').trim();if(!name||name.length>80)throw new Error('Tên hiển thị cần có từ 1 đến 80 ký tự.');if(message.length>240)throw new Error('Lời nhắn tối đa 240 ký tự.');const amount=body.amount===''||body.amount==null?null:Number(body.amount);if(amount!==null&&(!Number.isSafeInteger(amount)||amount<=0||amount>1000000000))throw new Error('Số tiền không hợp lệ.');const donatedAt=String(body.donatedAt||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(donatedAt)||!Number.isFinite(Date.parse(donatedAt)))throw new Error('Ngày nhận tiền không hợp lệ.');return {name,amount,message,donatedAt}}
async function localApi(url,opt={}){const method=String(opt.method||'GET').toUpperCase(),body=parseBody(opt);
  if(url==='/api/me'&&method==='GET')return {loggedIn:!!adminSession()};
  if(url==='/api/login'&&method==='POST'){const spec=String(body.username||'').trim(),token=String(body.password||'').trim();if(!spec||!token)throw new Error('Nhập username/repo và GitHub token');parseRepoSpec(spec);localStorage.setItem(GH_REPO_KEY,spec);sessionStorage.setItem(GH_TOKEN_KEY,token);try{await ghReadFile(GH_DATA_GAMES)}catch(e){sessionStorage.removeItem(GH_TOKEN_KEY);throw new Error(e.status===404?'Không tìm thấy data/games.json trong repo.':`Không truy cập được GitHub: ${e.message}`)}return {ok:true}};
  if(url==='/api/logout'&&method==='POST'){sessionStorage.removeItem(GH_TOKEN_KEY);return {ok:true}};
  if(url==='/api/games'&&method==='GET')return adminSession()?readRepoJson(GH_DATA_GAMES,[]):readStaticJson(GH_DATA_GAMES,[]);
  if(url.startsWith('/api/games/')&&method==='GET'){const slug=decodeURIComponent(url.slice('/api/games/'.length)),arr=adminSession()?await readRepoJson(GH_DATA_GAMES,[]):await readStaticJson(GH_DATA_GAMES,[]);const g=arr.find(x=>x.slug===slug);if(!g)throw new Error('Không tìm thấy game');return g}
  if(url==='/api/games'&&method==='POST'){requireAdminClient();return mutateRepoJson(GH_DATA_GAMES,async arr=>{if(!String(body.title||'').trim())throw new Error('Thiếu tên game');const base=slugify(body.title);let slug=base,n=2;while(arr.some(g=>g.slug===slug))slug=`${base}-${n++}`;let cover=String(body.coverUrl||'').trim();if(body.coverDataUrl)cover=await uploadCoverDataUrl(body.coverDataUrl,slug);const now=new Date().toISOString();const item={id:newId(),title:String(body.title).trim(),slug,summary:String(body.summary||''),info:body.info||{},genres:Array.isArray(body.genres)?body.genres:[],cover,screenshots:Array.isArray(body.screenshots)?body.screenshots:[],downloadLinks:Array.isArray(body.downloadLinks)?body.downloadLinks:[],extractPassword:String(body.extractPassword||''),instructions:String(body.instructions||''),featured:!!body.featured,createdAt:now,updatedAt:now};arr.unshift(item);return item},`Add game: ${String(body.title||'').trim()}`)}
  const gameMatch=url.match(/^\/api\/games\/([^/]+)$/);if(gameMatch&&method==='PUT'){requireAdminClient();const id=decodeURIComponent(gameMatch[1]);return mutateRepoJson(GH_DATA_GAMES,async arr=>{const i=arr.findIndex(x=>String(x.id)===String(id));if(i<0)throw new Error('Không tìm thấy game');const old=arr[i];let cover=String(body.coverUrl??old.cover??'').trim();if(body.coverDataUrl)cover=await uploadCoverDataUrl(body.coverDataUrl,old.slug);arr[i]={...old,title:String(body.title??old.title),summary:String(body.summary??old.summary??''),info:body.info||old.info||{},genres:Array.isArray(body.genres)?body.genres:old.genres||[],cover,screenshots:Array.isArray(body.screenshots)?body.screenshots:old.screenshots||[],downloadLinks:Array.isArray(body.downloadLinks)?body.downloadLinks:old.downloadLinks||[],extractPassword:String(body.extractPassword??old.extractPassword??''),instructions:String(body.instructions??old.instructions??''),featured:!!body.featured,updatedAt:new Date().toISOString()};return arr[i]},`Update game: ${String(body.title||id)}`)}
  if(gameMatch&&method==='DELETE'){requireAdminClient();const id=decodeURIComponent(gameMatch[1]);return mutateRepoJson(GH_DATA_GAMES,arr=>{const i=arr.findIndex(x=>String(x.id)===String(id));if(i<0)throw new Error('Không tìm thấy game');const [removed]=arr.splice(i,1);return {ok:true,removed}},'Delete game')}
  if(url==='/api/donations'&&method==='GET'){const arr=adminSession()?await readRepoJson(GH_DATA_DONATIONS,[]):await readStaticJson(GH_DATA_DONATIONS,[]);return [...arr].sort((a,b)=>String(b.donatedAt||'').localeCompare(String(a.donatedAt||''))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')))}
  if(url==='/api/donations'&&method==='POST'){requireAdminClient();const values=donationValues(body),now=new Date().toISOString();const item={id:newId(),...values,createdAt:now,updatedAt:now};return mutateRepoJson(GH_DATA_DONATIONS,arr=>{arr.unshift(item);return item},'Add confirmed donation')}
  const donMatch=url.match(/^\/api\/donations\/([^/]+)$/);if(donMatch&&method==='PUT'){requireAdminClient();const id=decodeURIComponent(donMatch[1]),values=donationValues(body);return mutateRepoJson(GH_DATA_DONATIONS,arr=>{const i=arr.findIndex(x=>String(x.id)===String(id));if(i<0)throw new Error('Không tìm thấy khoản ủng hộ.');arr[i]={...arr[i],...values,updatedAt:new Date().toISOString()};return arr[i]},'Update confirmed donation')}
  if(donMatch&&method==='DELETE'){requireAdminClient();const id=decodeURIComponent(donMatch[1]);return mutateRepoJson(GH_DATA_DONATIONS,arr=>{const i=arr.findIndex(x=>String(x.id)===String(id));if(i<0)throw new Error('Không tìm thấy khoản ủng hộ.');arr.splice(i,1);return {ok:true}},'Remove donation from public list')}
  throw new Error(`API tĩnh chưa hỗ trợ: ${method} ${url}`)
}
async function api(url,opt={}){if(String(url).startsWith('/api/'))return localApi(String(url),opt);const r=await fetch(url,opt);let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||`Lỗi ${r.status}`);return d}
function route(){let p=currentPath();if(p.length>1)p=p.replace(/\/+$/,'');if(p==='/donate'){show('donateView');return}if(p==='/admin'){show('adminView');syncAdmin();return}if(p.startsWith('/game/')){const slug=decodeURIComponent(p.slice('/game/'.length));show('detailView');renderDetail(slug);return}show('homeView')}
document.addEventListener('click',e=>{
  const g=e.target.closest('[data-go]');
  if(g){
    if(g.tagName==='A'&&(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0))return;
    e.preventDefault();
    const path=g.dataset.go;
    if(path==='/'){
      filterCat='';
      const search=$('#search');
      if(search) search.value='';
      renderHome();
    }
    go(path);
    return;
  }

  const c=e.target.closest('[data-cat]');
  if(c){
    e.preventDefault();
    filterCat=c.dataset.cat;
    renderHome();
    go('/');
  }
});
addEventListener('popstate',route);
$('#ageOk').onclick=()=>{localStorage.setItem('age18','1');$('#ageGate').classList.add('hidden')};if(localStorage.getItem('age18')==='1')$('#ageGate').classList.add('hidden');
async function loadGames(){games=await api('/api/games');renderHome();renderAdmin()}
const primaryCategories=['RPG','Visual Novel','Sandbox','PC','Android','Việt Hóa','Hoàn Thành'];
function categoryKey(value){return String(value||'').trim().toLocaleLowerCase('vi-VN')}
function categories(){
  const unique=new Map(primaryCategories.map(tag=>[categoryKey(tag),tag]));
  for(const value of games.flatMap(game=>game.genres||[])){
    const tag=String(value).trim(), key=categoryKey(tag);
    if(tag&&!unique.has(key))unique.set(key,/^(2d|3d|2dcg|3dcg)$/i.test(tag)?tag.toUpperCase():tag);
  }
  return [...unique.values()];
}
function renderCategoryFilters(){
  const expanded=$('#moreGenres')?.open||false;
  const primaryKeys=new Set(primaryCategories.map(categoryKey));
  const extra=categories().filter(tag=>!primaryKeys.has(categoryKey(tag)));
  const selectedExtra=filterCat&&!primaryKeys.has(categoryKey(filterCat))?filterCat:'';
  const chip=tag=>{const active=tag==='Tất cả'?!filterCat:categoryKey(tag)===categoryKey(filterCat);return `<button type="button" class="chip ${active?'active':''}" data-chip="${esc(tag)}" aria-pressed="${active}">${esc(tag)}</button>`};
  $('#categoryChips').innerHTML=['Tất cả',...primaryCategories,...(selectedExtra?[selectedExtra]:[])].map(chip).join('')+
    (extra.length?`<details id="moreGenres" class="more-genres" ${expanded?'open':''}><summary>Thêm thể loại <span aria-hidden="true">+${extra.length}</span></summary><div class="extra-genres" aria-label="Thể loại khác"><p>Chọn thêm thể loại</p><div class="extra-genre-options">${extra.map(chip).join('')}</div></div></details>`:'');
  $$('#categoryChips [data-chip]').forEach(button=>button.onclick=()=>{
    filterCat=button.dataset.chip==='Tất cả'?'':button.dataset.chip;
    if($('#moreGenres'))$('#moreGenres').open=false;
    renderHome();
    $$('#categoryChips > [data-chip]').find(chip=>chip.getAttribute('aria-pressed')==='true')?.focus({preventScroll:true});
  });
}
document.addEventListener('click',event=>{
  const more=$('#moreGenres');
  if(more?.open&&!more.contains(event.target))more.open=false;
});
document.addEventListener('keydown',event=>{
  const more=$('#moreGenres');
  if(event.key==='Escape'&&more?.open){more.open=false;more.querySelector('summary').focus()}
});
const gamesPerPage=12;
function gameImage(game){
  const cover=String(game.cover||'').trim();
  return cover?mediaUrl(cover):withBase('assets/gamehub-background.png');
}
function applyImageFallback(parent){
  parent.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{if(!img.dataset.fallback){img.dataset.fallback='1';img.src=withBase('assets/gamehub-background.png')}},{once:true}));
}
function gameBadges(game){
  const tags=game.genres||[], platform=String(game.info?.nenTang||'')+' '+tags.join(' ');
  const genre=tags.find(tag=>!/^(pc|android|hoàn thành|việt hóa)$/i.test(String(tag).trim()))||game.info?.theLoai||'Game';
  return `<span class="card-badges"><span class="genre-badge">${esc(genre)}</span><span class="platform-badges">${/\bpc\b|windows/i.test(platform)?'<b class="pc">PC</b>':''}${/android|apk/i.test(platform)?'<b class="android">APK</b>':''}</span></span>`;
}
function renderCatalog(arr,q){
  const query=JSON.stringify([q,categoryKey(filterCat)]);
  if(query!==lastCatalogQuery){gamePage=1;lastCatalogQuery=query}
  const totalPages=Math.max(1,Math.ceil(arr.length/gamesPerPage));
  gamePage=Math.min(gamePage,totalPages);
  const start=(gamePage-1)*gamesPerPage, pageGames=arr.slice(start,start+gamesPerPage);
  $('#gameCount').textContent=arr.length?`${start+1}–${Math.min(start+gamesPerPage,arr.length)} / ${arr.length} game`:'0 game';
  $('#posts').innerHTML=pageGames.map(g=>`<article class="post"><a class="game-card" href="${esc(sitePath('/game/'+encodeURIComponent(g.slug)+'/'))}" data-go="/game/${encodeURIComponent(g.slug)}"><div class="thumb"><img src="${esc(gameImage(g))}" alt="" loading="lazy" decoding="async">${gameBadges(g)}</div><div class="post-body"><h2>${esc(g.title)}</h2><p>${esc(g.summary||'Khám phá thông tin và các phiên bản của game.')}<span class="read" aria-hidden="true"> Xem bài ↗</span></p></div></a></article>`).join('')||(games.length?'<div class="box catalog-empty"><h3>Không tìm thấy game phù hợp</h3><p>Thử từ khóa khác hoặc chọn lại thể loại.</p><button class="btn" data-go="/">Xem tất cả game</button></div>':'<div class="box catalog-empty">Chưa có bài game.</div>');
  applyImageFallback($('#posts'));
  const pageButton=(page,label,attrs='')=>`<button type="button" data-page="${page}" ${attrs}>${label}</button>`;
  const numbers=[...new Set([1,gamePage-1,gamePage,gamePage+1,totalPages])].filter(page=>page>=1&&page<=totalPages).sort((a,b)=>a-b);
  $('#pagination').innerHTML=totalPages<=1?'':pageButton(gamePage-1,'← Trước',gamePage===1?'disabled':'')+numbers.map((page,index)=>(index&&page>numbers[index-1]+1?'<span aria-hidden="true">…</span>':'')+pageButton(page,page,`aria-label="Trang ${page}" ${page===gamePage?'aria-current="page"':''}`)).join('')+pageButton(gamePage+1,'Tiếp →',gamePage===totalPages?'disabled':'');
  $('#pagination').querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>{gamePage=Number(button.dataset.page);renderHome();$('#catalogTools').scrollIntoView({behavior:prefersStill()?'instant':'smooth',block:'start'});$('#pagination [aria-current="page"]')?.focus({preventScroll:true})});
}
function prefersStill(){return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false}
function renderFeatured(){
  const selected=games.filter(game=>game.featured);
  const next=(selected.length?selected:games).slice(0,6);
  const signature=JSON.stringify(next.map(game=>[game.id,game.slug,game.title,game.cover,game.summary]));
  $('#featuredShowcase').classList.toggle('hidden',!next.length);
  if(signature===featureSignature)return;
  featureSignature=signature;featureGames=next;featureIndex=0;drawFeatured();
}
function finishFeaturedMotion(){if(featureMotion)featureMotion.finish()}
function drawFeatured(animate=false){
  finishFeaturedMotion();
  const g=featureGames[featureIndex],current=$('#featuredSlide');
  if(!g){current.replaceChildren();return}
  const incoming=document.createElement('div');
  incoming.className='featured-slide';incoming.setAttribute('role','group');
  incoming.setAttribute('aria-label',`${featureIndex+1} trên ${featureGames.length}`);
  incoming.innerHTML=`<img class="featured-image" src="${esc(gameImage(g))}" alt="" fetchpriority="high"><div class="featured-shade"></div><div class="featured-copy"><div class="featured-text"><h2>${esc(g.title)}</h2><p>${esc(g.summary||'Khám phá thông tin và những phiên bản mới nhất của game.')}</p></div><a class="featured-link" href="${esc(sitePath('/game/'+encodeURIComponent(g.slug)+'/'))}" data-go="/game/${encodeURIComponent(g.slug)}">XEM BÀI</a></div>`;
  applyImageFallback(incoming);
  // Load the following cover before its turn so sliding does not reveal an empty image.
  if(featureGames.length>1){const preload=new Image();preload.src=gameImage(featureGames[(featureIndex+1)%featureGames.length])}
  if(!animate||!current.children.length||typeof current.animate!=='function'){
    incoming.id='featuredSlide';current.replaceWith(incoming);return;
  }
  current.inert=true;current.setAttribute('aria-hidden','true');
  current.after(incoming);
  const options={duration:650,easing:'cubic-bezier(.4,0,.2,1)',fill:'both'};
  const outgoingAnimation=current.animate([{transform:'translateX(0)'},{transform:'translateX(-100%)'}],options);
  const incomingAnimation=incoming.animate([{transform:'translateX(100%)'},{transform:'translateX(0)'}],options);
  let settled=false;
  const motion={finish(){
    if(settled)return;settled=true;
    current.remove();incoming.id='featuredSlide';
    outgoingAnimation.cancel();incomingAnimation.cancel();
    if(featureMotion===motion)featureMotion=null;
  }};
  featureMotion=motion;
  return Promise.all([outgoingAnimation.finished,incomingAnimation.finished]).then(motion.finish,motion.finish);
}
function initShowcase(){
  const panel=$('#featuredShowcase');let focused=false;
  const step=amount=>{if(featureGames.length>1&&!featureMotion){featureIndex=(featureIndex+amount+featureGames.length)%featureGames.length;return drawFeatured(true)}};
  // Keep the selected article stable for keyboard users; ordinary hovering keeps autoplay running.
  panel.addEventListener('focusin',()=>{focused=true;finishFeaturedMotion()});panel.addEventListener('focusout',event=>focused=panel.contains(event.relatedTarget));
  document.addEventListener('gamehub:view',finishFeaturedMotion);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finishFeaturedMotion()});
  setInterval(()=>{if(!focused&&!document.hidden&&!$('#homeView').classList.contains('hidden')&&$('#ageGate').classList.contains('hidden'))return step(1)},5000);
  const companion=document.createElement('span');companion.className='cursor-companion';companion.hidden=true;companion.setAttribute('aria-hidden','true');companion.innerHTML=`<img src="${withBase('assets/gamehub-avatar.svg')}" alt="" width="28" height="28">`;document.body.append(companion);
  let cursorFrame=0;
  document.addEventListener('pointermove',event=>{
    const hide=event.pointerType!=='mouse'||prefersStill()||!$('#ageGate').classList.contains('hidden')||!$('#adminView').classList.contains('hidden')||!!event.target.closest('input,textarea');
    companion.hidden=hide;if(hide)return;
    if(cursorFrame)cancelAnimationFrame(cursorFrame);
    cursorFrame=requestAnimationFrame(()=>{companion.style.transform=`translate(${Math.min(event.clientX+18,innerWidth-34)}px,${Math.min(event.clientY+18,innerHeight-34)}px)`;cursorFrame=0});
  });
  document.documentElement.addEventListener('pointerleave',()=>companion.hidden=true);
  document.addEventListener('gamehub:view',()=>companion.hidden=true);
}

function renderHome(){
  const q=($('#search').value||'').toLowerCase();
  const arr=games.filter(g=>{
    const info=g.info||{};
    const matchesSearch=!q||
      String(g.title||'').toLowerCase().includes(q)||
      String(g.summary||'').toLowerCase().includes(q)||
      String(info.theLoai||'').toLowerCase().includes(q)||
      String(info.developer||'').toLowerCase().includes(q)||
      (g.genres||[]).some(x=>String(x).toLowerCase().includes(q));

    let matchesCategory=true;
    if(filterCat){
      const genres=(g.genres||[]).map(x=>String(x).trim().toLowerCase());
      const cat=String(filterCat).toLowerCase();

      if(filterCat==='Việt Hóa'){
        matchesCategory=
          String(info.ngonNgu||'').toLowerCase().includes('tiếng việt')||
          String(info.vietHoa||'').trim()!=='';
      }else if(filterCat==='English'){
        matchesCategory=String(info.ngonNgu||'').toLowerCase().includes('english');
      }else if(filterCat==='PC' || filterCat==='Android'){
        matchesCategory=
          String(info.nenTang||'').toLowerCase().includes(cat)||
          genres.includes(cat);
      }else{
        matchesCategory=
          genres.includes(cat)||
          String(info.theLoai||'').toLowerCase().includes(cat)||
          String(info.nenTang||'').toLowerCase().includes(cat);
      }
    }

    return matchesSearch&&matchesCategory;
  });
  renderCategoryFilters();
  $$('[data-cat]').forEach(b=>{b.classList.toggle('active',b.dataset.cat===filterCat);b.setAttribute('aria-pressed',String(b.dataset.cat===filterCat))});
  const homeBtn=$('.menu [data-go="/"]');
  if(homeBtn) homeBtn.classList.toggle('active',!filterCat&&currentPath()==='/');
  renderCatalog(arr, q);
  renderFeatured();
}
$('#search').oninput=renderHome;
function renderDetail(slug){
  const g=games.find(x=>x.slug===slug);if(!g){$('#detailBox').innerHTML='<div class="article">Không tìm thấy game.</div>';return}
  const i=g.info||{};
  $('#detailBox').innerHTML=`<article class="article">${g.cover?`<img class="hero-cover" src="${esc(mediaUrl(g.cover))}">`:''}<h1>${esc(g.title)}</h1><p class="summary">${esc(g.summary||'')}</p><h3>Hình ảnh trong game</h3><div class="sensitive"><b>NỘI DUNG NHẠY CẢM</b><div style="margin-top:10px"><button id="showScreens" class="btn">ẤN ĐỂ XEM</button></div><div id="screens" class="screens hidden" style="margin-top:14px">${(g.screenshots||[]).map(x=>`<img src="${esc(mediaUrl(x))}">`).join('')}</div></div><h3 style="margin-top:24px">LINK TẢI GAME</h3><button id="showDownloads" class="btn primary">NHẤN ĐỂ HIỆN LINK TẢI</button><div id="downloads" class="downloads">${(g.downloadLinks||[]).map(x=>`<a class="download-btn" target="_blank" rel="noopener" href="${esc(safeLink(x.url))}">${esc(x.label)}</a>`).join('')}</div>${g.extractPassword?`<p><b>Mật khẩu giải nén:</b> ${esc(g.extractPassword)}</p>`:''}${g.instructions?`<p><b>Hướng dẫn:</b> ${esc(g.instructions)}</p>`:''}</article><aside class="info-card"><h3>Thông Tin Game</h3>${[['Thể loại',i.theLoai],['Engine',i.engine],['Ngôn ngữ',i.ngonNgu],['Việt Hóa',i.vietHoa],['Nền Tảng',i.nenTang],['Dung lượng',i.dungLuong],['Phiên bản',i.phienBan],['Developer',i.developer]].filter(x=>x[1]).map(x=>`<div class="info-row"><span>${x[0]}</span><b>${esc(x[1])}</b></div>`).join('')}<h4>Genre</h4><div class="genre-cloud">${(g.genres||[]).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div></aside>`;
  $('#showScreens').onclick=()=>$('#screens').classList.toggle('hidden');
  $('#showDownloads').onclick=()=>$('#downloads').classList.toggle('show');
}
async function checkAuth(){try{loggedIn=(await api('/api/me')).loggedIn}catch{loggedIn=false}syncAdmin()}
function syncAdmin(){$('#loginBox').classList.toggle('hidden',loggedIn);$('#adminPanel').classList.toggle('hidden',!loggedIn);if(loggedIn)renderAdmin();document.dispatchEvent(new Event('gamehub:auth'))}
$('#loginForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('#loginUser').value,password:$('#loginPass').value})});loggedIn=true;$('#loginStatus').textContent='';syncAdmin()}catch(err){$('#loginStatus').textContent=err.message}}
$('#logoutBtn').onclick=async()=>{await api('/api/logout',{method:'POST'});loggedIn=false;syncAdmin()}
function parseLinks(text){return String(text||'').split('\n').map(s=>s.trim()).filter(Boolean).map(line=>{const i=line.indexOf('|');return i>=0?{label:line.slice(0,i).trim(),url:line.slice(i+1).trim()}:{label:'TẢI GAME',url:line}})}
function resetForm(){editing=null;$('#gameForm').reset();$('#editId').value='';$('#formStatus').textContent='';document.dispatchEvent(new Event('gamehub:genres'))}
$('#resetBtn').onclick=resetForm;
function startEdit(id){const g=games.find(x=>String(x.id)===String(id));if(!g)return;editing=g;$('#editId').value=g.id;$('#title').value=g.title||'';$('#summary').value=g.summary||'';$('#theLoai').value=g.info?.theLoai||'';$('#engine').value=g.info?.engine||'';$('#ngonNgu').value=g.info?.ngonNgu||'';$('#vietHoa').value=g.info?.vietHoa||'';$('#nenTang').value=g.info?.nenTang||'';$('#dungLuong').value=g.info?.dungLuong||'';$('#phienBan').value=g.info?.phienBan||'';$('#developer').value=g.info?.developer||'';$('#genres').value=(g.genres||[]).join(', ');$('#coverUrl').value=g.cover||'';$('#screenshots').value=(g.screenshots||[]).join('\n');$('#downloadLinks').value=(g.downloadLinks||[]).map(x=>x.label+'|'+x.url).join('\n');$('#extractPassword').value=g.extractPassword||'';$('#instructions').value=g.instructions||'';$('#featured').checked=!!g.featured;document.dispatchEvent(new Event('gamehub:genres'));scrollTo({top:0,behavior:'smooth'})}
async function deleteGame(id){if(!confirm('Xóa bài này?'))return;await api('/api/games/'+id,{method:'DELETE'});await loadGames()}
function renderAdmin(){if(!loggedIn)return;$('#adminList').innerHTML=games.map(g=>`<div class="admin-item"><div><b>${esc(g.title)}</b><div class="meta">${esc(g.info?.dungLuong||'')}</div></div><div class="actions"><button class="btn" data-edit="${g.id}">Sửa</button><button class="btn danger" data-del="${g.id}">Xóa</button></div></div>`).join('');$$('[data-edit]').forEach(b=>b.onclick=()=>startEdit(b.dataset.edit));$$('[data-del]').forEach(b=>b.onclick=()=>deleteGame(b.dataset.del))}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{if(!file)return resolve('');const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
$('#gameForm').onsubmit=async e=>{e.preventDefault();$('#saveBtn').disabled=true;$('#formStatus').textContent='Đang lưu vào GitHub...';try{const coverDataUrl=await fileToDataUrl($('#coverFile').files[0]);const payload={title:$('#title').value.trim(),summary:$('#summary').value,info:{theLoai:$('#theLoai').value,engine:$('#engine').value,ngonNgu:$('#ngonNgu').value,vietHoa:$('#vietHoa').value,nenTang:$('#nenTang').value,dungLuong:$('#dungLuong').value,phienBan:$('#phienBan').value,developer:$('#developer').value},genres:$('#genres').value.split(',').map(x=>x.trim()).filter(Boolean),coverUrl:$('#coverUrl').value.trim(),coverDataUrl,screenshots:$('#screenshots').value.split('\n').map(x=>x.trim()).filter(Boolean),downloadLinks:parseLinks($('#downloadLinks').value),extractPassword:$('#extractPassword').value,instructions:$('#instructions').value,featured:$('#featured').checked};await api(editing?'/api/games/'+editing.id:'/api/games',{method:editing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});$('#formStatus').textContent='Đã lưu vào GitHub';await loadGames();resetForm()}catch(err){$('#formStatus').textContent=err.message}finally{$('#saveBtn').disabled=false}}
(async()=>{route();await Promise.allSettled([loadGames(),checkAuth()]);route()})();
initShowcase();
