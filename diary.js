'use strict';
/* Haze · RIFT — дневник атмосферы дня. Без библиотек: Canvas 2D, Web Audio, Web Speech, IndexedDB. */
const $=s=>document.querySelector(s),W=1080,H=1350,M=70;let cur=null,timer=null,urls=[];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=u=>/^https?:\/\//i.test(u||'')?u:'';
const hd=(a,b)=>((a-b+540)%360)-180,cl=(v,a,b)=>Math.min(b,Math.max(a,v));

/* ---------- хранилище: IndexedDB (записи остаются в браузере после закрытия) ---------- */
const DB=new Promise((res,rej)=>{const q=indexedDB.open('polutone',1);q.onupgradeneeded=()=>q.result.createObjectStore('d',{keyPath:'id'});q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)});
const explain=x=>x&&x.name=='QuotaExceededError'?new Error('браузеру не хватило места: удали старые дни в архиве или возьми меньше фото'):x&&x.name=='DataCloneError'?new Error('не удалось сохранить файл (DataCloneError)'):(x||new Error('не удалось записать в хранилище'));
const tx=async(m,f)=>{const d=await DB;return new Promise((res,rej)=>{let q,er=null;const t=d.transaction('d',m);try{q=f(t.objectStore('d'))}catch(x){return rej(explain(x))}q.onerror=()=>{er=q.error};t.oncomplete=()=>res(q.result);t.onerror=t.onabort=()=>rej(explain(er||t.error))})};
try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(_){}
const put=e=>tx('readwrite',s=>s.put(e)),all=()=>tx('readonly',s=>s.getAll()),del=id=>tx('readwrite',s=>s.delete(id));

/* ---------- навигация ---------- */
function show(v){['new','arch'].forEach(x=>{const s=$('#'+x);s.hidden=x!=v;if(x==v){s.classList.remove('enter');void s.offsetWidth;s.classList.add('enter')}});
 document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.v==v));movePill();live();if(v=='arch')renderArch()}
// подсветка-«таблетка» переезжает под активную вкладку
function movePill(){const b=$('nav button.on'),n=$('nav');if(!b)return;n.style.setProperty('--px',b.offsetLeft+'px');n.style.setProperty('--pw',b.offsetWidth+'px')}
addEventListener('resize',movePill);document.fonts.ready.then(movePill);movePill();
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>show(b.dataset.v));
$('#dt').valueAsDate=new Date();
$('#ph').onchange=e=>{$('#th').innerHTML='';[...e.target.files].slice(0,4).forEach(f=>{const i=new Image();i.alt='';i.onerror=()=>i.replaceWith(Object.assign(document.createElement('span'),{className:'bad',textContent:'не открылось'}));i.src=URL.createObjectURL(f);$('#th').append(i)})};
$('#au').onchange=async e=>{const f=e.target.files[0];if(!f)return;$('#ah').textContent='Слушаем трек…';
 try{const a=await analyzeAudio(f);$('#bp').value=a.bpm;$('#en').value=a.energy<.4?'.25':a.energy<.7?'.55':'.85';if(a.mode)$('#md').value=a.mode;live();
  $('#ah').textContent=`Определили по файлу: ~${a.bpm} BPM, энергия ${Math.round(a.energy*100)}%${a.key?`, тональность ≈ ${a.key}`:''}. Можно поправить вручную.`}
 catch(_){$('#ah').textContent='Не удалось разобрать файл, задай темп и лад вручную.'}};

/* ---------- аудиоанализ ---------- */
// энергия — средняя громкость (RMS), темп — автокорреляция всплесков громкости, лад — хрома (алгоритм Гёрцеля) + профили Крумханзля
async function analyzeAudio(f){const ac=new(window.AudioContext||webkitAudioContext)();try{return analyzeBuffer(await ac.decodeAudioData(await f.arrayBuffer()))}finally{ac.close()}}
function analyzeBuffer(buf){const d=buf.getChannelData(0),hop=Math.floor(buf.sampleRate/100),n=Math.min(Math.floor(d.length/hop),6000),env=[];let sum=0;
 for(let i=0;i<n;i++){let s=0;for(let j=0;j<hop;j++)s+=d[i*hop+j]**2;env.push(Math.sqrt(s/hop));sum+=env[i]}
 const on=env.map((v,i)=>Math.max(0,v-(env[i-1]||0))),fps=buf.sampleRate/hop,lo=Math.floor(fps*60/180),hi=Math.ceil(fps*60/60),C={};
 // корреляция нормируется на число пар (иначе короткие лаги всегда выигрывают) и сглаживается по соседям (доля попадает между кадрами)
 for(let l=lo-2;l<=hi+2;l++){let c=0;for(let i=l;i<n;i++)c+=on[i]*on[i-l];C[l]=c/((n-l)||1)}
 const S={};for(let l=lo-1;l<=hi+1;l++)S[l]=C[l]+Math.max(C[l-1],C[l+1]);
 // у периодичного ритма кратные лаги (2, 3 доли) почти равны — берём самый короткий пик, близкий к максимуму
 let mx=0;for(let l=lo;l<=hi;l++)mx=Math.max(mx,S[l]);let bl=lo;for(let l=lo;l<=hi;l++)if(S[l]>=.85*mx&&S[l]>=S[l-1]&&S[l]>=S[l+1]){bl=l;break}
 const w=C[bl-1]+C[bl]+C[bl+1],lag=w?((bl-1)*C[bl-1]+bl*C[bl]+(bl+1)*C[bl+1])/w:bl;let bpm=mx>0?cl(60*fps/lag,60,180):100;
 const k=detectKey(buf);return{bpm:Math.round(bpm),energy:Math.min(1,sum/(n||1)*5),mode:k&&k.mode,key:k&&k.key}}
const NOTE=['до','до♯','ре','ми♭','ми','фа','фа♯','соль','ля♭','ля','си♭','си'];
function detectKey(buf){const d=buf.getChannelData(0),sr=buf.sampleRate,N=4096,ch=new Float64Array(12),fr=[];
 for(let mi=48;mi<84;mi++)fr.push([mi%12,2*Math.cos(2*Math.PI*440*2**((mi-69)/12)/sr)]);
 const a=Math.floor(d.length*.1),b=Math.floor(d.length*.9),frames=40,step=Math.max(N,Math.floor((b-a-N)/frames));
 for(let p=a,c=0;p+N<b&&c<frames;p+=step,c++)for(const[pc,co]of fr){let s1=0,s2=0;for(let i=0;i<N;i++){const s0=d[p+i]+co*s1-s2;s2=s1;s1=s0}ch[pc]+=Math.sqrt(Math.max(0,s1*s1+s2*s2-co*s1*s2))}
 if(!ch.some(v=>v>0))return null;
 const MAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],MIN=[6.33,2.68,3.52,5.38,2.6,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
 const corr=(pr,k)=>{const y=[...ch].map((_,i)=>pr[(i-k+12)%12]),mx=ch.reduce((s,v)=>s+v,0)/12,my=y.reduce((s,v)=>s+v,0)/12;let n=0,dx=0,dy=0;for(let i=0;i<12;i++){n+=(ch[i]-mx)*(y[i]-my);dx+=(ch[i]-mx)**2;dy+=(y[i]-my)**2}return n/(Math.sqrt(dx*dy)||1)};
 let best={r:-2};for(let k=0;k<12;k++)for(const[mode,pr]of[['major',MAJ],['minor',MIN]]){const r=corr(pr,k);if(r>best.r)best={r,k,mode}}
 return{mode:best.mode,key:`${NOTE[best.k]} ${best.mode=='major'?'мажор':'минор'}`}}

/* ---------- анализ текста ---------- */
const norm=t=>String(t).toLowerCase().replace(/ё/g,'е');
const rx=(src,g='')=>new RegExp(`(?<![а-яё])(?:${src})`,'i'+g); // совпадение только с начала слова: «город» ≠ «гор», «билет» ≠ «лет»
const LEX={
 calm:rx('тих|спокой|уют|тепл|какао|чай|чая|чаю|закат|неспеш|разговар|прогул|медлен|кофе|плед|книг|обним|мягк','g'),
 joy:rx('рад(?:ост|ов|а|ы|уюсь)|смех|смея|друз|праздн|весел|ура(?![а-я])|счаст|танц|вечеринк|мор(?:е|я|ю|ем)(?![а-я])|солн|любл|ярк|концерт','g'),
 tense:rx('срочн|дедлайн|сдач|офис|нерв|спеш|экзамен|успел|устал|напряж|бегом|бежал|проект|аврал|не спал','g'),
 sad:rx('груст|одинок|дожд|скуч|тоск|холодн|слез|прощ|сер(?:ый|ая|ое|ые|о|ого)(?![а-я])|пуст|печал|плака','g'),
 angry:rx('зл(?:ост|ой|ая|ое|ые|ого|ую|ит|ись|ил)|злю(?![а-я])|злюс|зло(?:б|ст)|бесит|бесят|бесил|взбес|выбес|ярост|гнев|бешен|раздраж|агресс|ненави|враж|драк|дерус|подрал|хамств|хамил|кричал|крича|крик|вопил|орал[аи]?(?![а-я])|ссор|скандал|руга(?:л|ю|ет|ем|лись)|руган|идиот|дебил|придур|сволоч|мерзав|убь(?:ю|ем)(?![а-я])|взорвал|психан|вспылил|обозлил|достал[аи]? меня|задолбал|надоел','g')};
const TECH={calm:'monet',joy:'film',tense:'kandinsky',sad:'minimal',angry:'kandinsky'};
const TN={monet:'Клод Моне: мазки и мягкий свет',kandinsky:'Кандинский: геометрия линий и пятен',film:'Плёночная фотография: зерно, виньетка, засвет',minimal:'Японский минимализм: воздух и одна форма'};
const MN={calm:'спокойствие',joy:'радость',tense:'напряжение',sad:'тихая грусть',angry:'злость'};
const CAP={calm:'тихо и тепло',joy:'светло и громко',tense:'на одном дыхании',sad:'серо, но по-настоящему',angry:'горячо и резко'};
const VOICE={calm:[.85,.9,'тихий и тёплый'],joy:[1.1,1.15,'живой и быстрый'],tense:[1.2,.8,'сжатый и собранный'],sad:[.8,.7,'низкий и медленный'],angry:[1.25,.6,'резкий и жёсткий']};
const ERA={old:'до 1980 года',mid:'1980–1999',new:'после 2000'};
const eraOf=y=>!y?'new':y<1980?'old':y<2000?'mid':'new';
function mood(t,m){t=norm(t).replace(/(?<![а-я])не\s+(?:спеш|торопи)[а-я]*/g,' неспешно ');const s={},words={},mus=[];for(const k in LEX)words[k]=s[k]=(t.match(LEX[k])||[]).length;s.angry*=2;
 const minor=m.mode=='minor',add=k=>{s[k]++;mus.push(k)};if(minor)add('sad');if(m.bpm<95)add(minor?'sad':'calm');if(m.bpm>125)add(minor?'tense':'joy');if(minor&&m.bpm>140&&m.energy>.8)add('angry');
 // при равенстве сумм решает текст: слова пользователя важнее музыки
 return{mo:Object.keys(s).sort((a,b)=>s[b]-s[a]||words[b]-words[a])[0],words,mus}}
function scene(t){t=norm(t);const f=(a,d='')=>(a.find(([r])=>rx(r).test(t))||[0,d])[1];return{
 tod:f([['утр|рассвет','Утро'],['ноч','Ночь'],['вечер|закат|ужин','Вечер'],['днем|обед|полдень','День']]),
 se:f([['осен|листопад|листья|листьях|листьев','осенью'],['зим|снег|мороз|сугроб','зимой'],['весн|подснеж','весной'],['лето(?![а-я])|летом|летн|жар(?:а|ко|кий)','летом']]),
 pl:f([['парк','в парке'],['пруд','у пруда'],['озер','у озера'],['рек[аеиу](?![а-я])|набережн','у реки'],['мор(?:е|я|ю|ем)(?![а-я])|пляж','у моря'],['офис','в офисе'],['дома(?![а-я])|домой|кухн|квартир','дома'],['лес(?:у|а|ом|ной|ном)?(?![а-я])','в лесу'],['гор(?:ы|ах|ам)(?![а-я])','в горах'],['кафе|кофейн|ресторан','в кафе'],['город|улиц','в городе'],['дач','на даче']]),
 wh:f([['девушк','с девушкой'],['парн(?:ем|я|ю)|муж(?:ем)?(?![а-я])|любим','с любимым'],['друз|подруг','с друзьями'],['семь|родител|мам|пап|бабушк|дедушк','с семьёй'],['сдач|дедлайн','перед сдачей'],['коллег','с коллегами']])}}
const ADJ={calm:['Тёплый','Тёплое','Тёплая'],joy:['Яркий','Яркое','Яркая'],tense:['Напряжённый','Напряжённое','Напряжённая'],sad:['Серый','Серое','Серая'],angry:['Злой','Злое','Злая']};
const GEN={День:0,Вечер:0,Утро:1,Ночь:2},TAIL={calm:'без спешки',joy:'на полную громкость',tense:'на пределе сил',sad:'в тихой грусти',angry:'на пределе терпения'};
// название папки: «время суток + сезон + место + с кем», всегда 3–7 слов в одном тоне
function mkTitle(t,mo){const s=scene(t),tod=s.tod||'День';let w=[tod,s.se,s.pl,s.wh].filter(Boolean).join(' ').split(' ');
 if(w.length<3){w=[ADJ[mo][GEN[tod]],tod.toLowerCase(),...w.slice(1)];if(w.length<3)w.push(...TAIL[mo].split(' '))}
 return w.slice(0,7).join(' ')}

/* ---------- фото: доминирующий цвет и яркость по всем кадрам ---------- */
const rgb2hsl=(r,g,b)=>{r/=255;g/=255;b/=255;const m=Math.max(r,g,b),n=Math.min(r,g,b),l=(m+n)/2,d=m-n;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));h=m==r?((g-b)/d)%6:m==g?(b-r)/d+2:(r-g)/d+4;h=(h*60+360)%360}return{h,s:s*100,l:l*100}};
function photoStats(imgs){const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d',{willReadFrequently:true}),bins=Array.from({length:12},()=>({w:0,h:0,s:0}));let L=0,n=0;
 for(const img of imgs){x.clearRect(0,0,32,32);x.drawImage(img,0,0,32,32);const d=x.getImageData(0,0,32,32).data;
  for(let i=0;i<d.length;i+=4){const p=rgb2hsl(d[i],d[i+1],d[i+2]),wt=p.s*(1-Math.abs(p.l-50)/50)+1,b=bins[Math.floor(p.h/30)%12];b.w+=wt;b.h+=p.h*wt;b.s+=p.s*wt;L+=p.l;n++}}
 const b=bins.reduce((a,v)=>v.w>a.w?v:a);return{h:b.h/b.w,s:b.s/b.w,l:L/n,n:imgs.length}}

/* ---------- тема дня: настроение + фото + музыка + время и сезон ---------- */
const SEASON_HUE={осенью:32,зимой:205,весной:110,летом:48},SEASON_SAT={осенью:1.05,зимой:.7,весной:1,летом:1.15};
function theme(mo,ph,m,sc){const minor=m.mode=='minor',bh={calm:34,joy:14,tense:220,sad:225,angry:2}[mo],bs={calm:55,joy:78,tense:50,sad:16,angry:80}[mo];
 let h=bh+hd(ph.h,bh)*.4;const sh=SEASON_HUE[sc.se];if(sh!=null)h+=cl(hd(sh,h)*.25,-15,15);h=(h+(minor?-10:8)+720)%360;
 const s=cl(bs*(minor?.85:1)*(.7+m.energy*.5)*(m.era=='old'?.8:1)*(.8+Math.min(ph.s,60)/150)*(SEASON_SAT[sc.se]||1),8,92);
 const dk=mo=='tense'||mo=='angry'||sc.tod=='Ночь',lb=(ph.l-50)*.08,bgL=dk?cl(8+lb*.5,5,12):cl((mo=='sad'?93:90)+({Утро:2,Вечер:-2}[sc.tod]||0)+lb,82,96);
 return{h,s,dk,tech:TECH[mo],m,bg:dk?`hsl(${h},28%,${bgL}%)`:`hsl(${h},${s*.45}%,${bgL}%)`,ink:dk?`hsl(${h},20%,92%)`:`hsl(${h},30%,13%)`,ac:`hsl(${h},${Math.min(90,s+15)}%,${dk?60:44}%)`,ac2:`hsl(${(h+(mo=='angry'?38:150))%360},${s}%,${dk?62:50}%)`}}
const rng=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};

/* ---------- рисование слайдов 4:5 ---------- */
const fmt=d=>new Date(d).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
function base(P,e){const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle=P.bg;x.fillRect(0,0,W,H);x.fillStyle=P.ink;x.textBaseline='top';
 x.font='500 26px Manrope';x.fillText(fmt(e.date),M,M-14);x.textAlign='right';x.fillText('Haze · RIFT',W-M,M-14);x.textAlign='left';
 x.font='500 48px Caveat';x.fillStyle=P.ac;x.fillText('— '+e.cap,M,H-M-34);return[x,c]}
function wrap(x,t,px,py,mw,lh,max){const ws=t.split(/\s+/);let ln='',n=0;for(let i=0;i<ws.length;i++){const tr=ln+ws[i]+' ';if(x.measureText(tr).width>mw&&ln){if(++n>=max){x.fillText(ln.trim()+'…',px,py);return}x.fillText(ln,px,py);py+=lh;ln=ws[i]+' '}else ln=tr}x.fillText(ln,px,py)}
const grain=(x,fx,fy,fw,fh,rnd,n)=>{for(let i=0;i<n;i++){x.fillStyle=rnd()<.5?'rgba(255,255,255,.08)':'rgba(0,0,0,.1)';x.fillRect(fx+rnd()*fw,fy+rnd()*fh,2,2)}};
function treat(x,img,fx,fy,fw,fh,P,rnd,z=1){x.save();x.beginPath();x.rect(fx,fy,fw,fh);x.clip();
 const k=Math.max(fw/img.width,fh/img.height)*z,w=img.width*k,h=img.height*k,ox=fx+(fw-w)/2,oy=fy+(fh-h)/2,en=P.m.energy;
 if(P.tech=='monet'){const t=document.createElement('canvas');t.width=fw/6|0;t.height=fh/6|0;const q=t.getContext('2d',{willReadFrequently:true});q.drawImage(img,(ox-fx)/6,(oy-fy)/6,w/6,h/6);
  x.imageSmoothingQuality='high';x.drawImage(t,fx,fy,fw,fh);const d=q.getImageData(0,0,t.width,t.height).data;
  for(let i=0;i<2600;i++){const px=rnd()*t.width|0,py=rnd()*t.height|0,o=(py*t.width+px)*4;x.fillStyle=`rgba(${d[o]},${d[o+1]},${d[o+2]},.55)`;x.save();x.translate(fx+px*6,fy+py*6);x.rotate(-.6+rnd()*.5);x.beginPath();x.ellipse(0,0,10+rnd()*16,3+rnd()*5,0,0,7);x.fill();x.restore()}
  x.globalCompositeOperation='soft-light';x.globalAlpha=.4;x.fillStyle=P.ac;x.fillRect(fx,fy,fw,fh)}
 else{x.drawImage(img,ox,oy,w,h);
  if(P.tech=='kandinsky'){x.globalCompositeOperation='multiply';x.globalAlpha=.45;x.fillStyle=P.bg;x.fillRect(fx,fy,fw,fh);x.globalCompositeOperation='source-over';
   for(let i=0,n=8+en*16|0;i<n;i++){const a=rnd(),px=fx+rnd()*fw,py=fy+rnd()*fh,r=30+rnd()*150;x.globalAlpha=.6;x.strokeStyle=x.fillStyle=i%2?P.ac:P.ac2;x.lineWidth=2+rnd()*5;x.beginPath();
    if(a<.35){x.arc(px,py,r,0,7);i%3?x.stroke():x.fill()}else if(a<.7){x.moveTo(px,py);x.lineTo(px+(rnd()-.5)*700,py+(rnd()-.5)*700);x.stroke()}else{x.moveTo(px,py);x.lineTo(px+r,py+r*.4);x.lineTo(px+r*.3,py-r);x.closePath();x.fill()}}}
  else if(P.tech=='film'){x.globalCompositeOperation='overlay';x.globalAlpha=.4;x.fillStyle=P.ac;x.fillRect(fx,fy,fw,fh);x.globalCompositeOperation='source-over';x.globalAlpha=1;
   grain(x,fx,fy,fw,fh,rnd,3000+en*6000|0);
   const g=x.createRadialGradient(fx+fw/2,fy+fh/2,fw*.3,fx+fw/2,fy+fh/2,fw*.85);g.addColorStop(0,'#0000');g.addColorStop(1,'#000a');x.fillStyle=g;x.fillRect(fx,fy,fw,fh)}
  else{x.globalAlpha=.4;x.fillStyle=P.bg;x.fillRect(fx,fy,fw,fh);x.globalAlpha=.9;x.strokeStyle=P.ac;x.lineWidth=4;x.beginPath();x.arc(fx+fw*.7,fy+fh*.28,70,0,7);x.stroke()}}
 // эпоха песни: старая — тёплое выцветание, зерно и царапины плёнки; 80–90-е — лёгкое зерно; новая — чистый кадр
 x.globalCompositeOperation='source-over';x.globalAlpha=1;
 if(P.m.era=='old'){x.globalCompositeOperation='soft-light';x.globalAlpha=.35;x.fillStyle='hsl(35,55%,55%)';x.fillRect(fx,fy,fw,fh);x.globalCompositeOperation='source-over';x.globalAlpha=1;grain(x,fx,fy,fw,fh,rnd,2500);
  x.strokeStyle='rgba(255,250,235,.18)';x.lineWidth=1.5;for(let i=0;i<5;i++){const sx=fx+rnd()*fw;x.beginPath();x.moveTo(sx,fy);x.lineTo(sx+(rnd()-.5)*20,fy+fh);x.stroke()}}
 else if(P.m.era=='mid')grain(x,fx,fy,fw,fh,rnd,1200);
 x.restore()}
const loadImg=f=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error(`не открылось фото «${f.name}». Если это HEIC с iPhone, сохрани его как JPG`));i.src=URL.createObjectURL(f)});
async function build(e,imgs){await Promise.all(['600 60px "Cormorant Garamond"','500 30px Manrope','500 40px Caveat'].map(f=>document.fonts.load(f).catch(()=>{})));
 const P=e.P,m=P.m,rnd=rng(e.seed),out=[],jp=c=>c.toDataURL('image/jpeg',.8);let[x,c]=base(P,e);
 treat(x,imgs[0],M,150,W-2*M,780,P,rnd);x.fillStyle=P.ink;x.font='600 78px "Cormorant Garamond"';wrap(x,e.title,M,965,W-2*M,80,3);out.push(jp(c));
 const rest=imgs.slice(1,4);if(!rest.length)rest.push(imgs[0]);
 rest.forEach(im=>{[x,c]=base(P,e);treat(x,im,M,150,W-2*M,1010,P,rnd,imgs.length==1?1.8:1);out.push(jp(c))});
 [x,c]=base(P,e);x.fillStyle=P.ac;x.font='600 260px "Cormorant Garamond"';x.fillText('“',M,120);x.fillStyle=P.ink;x.font='500 44px "Cormorant Garamond"';wrap(x,e.text,M,330,W-2*M,62,13);out.push(jp(c));
 [x,c]=base(P,e);x.fillStyle=P.ink;x.font='500 28px Manrope';x.fillText('Что звучало',M,170);x.font='600 80px "Cormorant Garamond"';wrap(x,e.song.title||'Песня дня',M,220,W-2*M,84,2);
 x.font='500 34px Manrope';x.fillStyle=P.ac;x.fillText([e.song.artist,e.song.year].filter(Boolean).join(' · '),M,420);
 const n=34,bw=(W-2*M)/n,am=.25+m.energy*.75,sp=m.bpm/100;for(let i=0;i<n;i++){const h=(.15+.85*Math.abs(Math.sin(i*sp*.55)*Math.cos(i*.31)+(rnd()-.5)*.5))*am*340;x.fillStyle=i%3?P.ac:P.ac2;x.fillRect(M+i*bw+3,640-h/2,bw-6,h)}
 x.fillStyle=P.ink;x.font='500 30px Manrope';wrap(x,`${m.bpm} BPM задают ритм · ${m.mode=='minor'?'минор — холоднее и тише':'мажор — теплее и ярче'}${m.key?` (${m.key})`:''} · энергия ${Math.round(m.energy*100)}% меняет зерно и контраст · песня ${ERA[m.era||'new']}`,M,860,W-2*M,44,6);out.push(jp(c));return out}

/* ---------- объяснение: почему день выглядит так ---------- */
const slideSec=bpm=>Math.round(8*60/bpm*10)/10;
function why(e,ph,sc,an){const m=e.m,P=e.P,hits=Object.entries(an.words).filter(([,v])=>v).map(([k,v])=>`«${MN[k]}» ×${v}`),ls=[];
 ls.push(`Текст: ${hits.length?'слова про '+hits.join(', '):'слов о настроении не нашлось'}${an.mus.length?`; музыка добавила голос за «${[...new Set(an.mus)].map(k=>MN[k]).join('», «')}»`:''} → итог «${MN[e.mood]}», техника «${TN[P.tech]}».`);
 const sp=[];if(sc.tod)sp.push({Ночь:'ночь → тёмный фон',Утро:'утро → фон светлее',Вечер:'вечер → фон чуть темнее, как в сумерках',День:'день → обычная яркость'}[sc.tod]);
 if(sc.se)sp.push(`${sc.se} → оттенок до 15° ближе к ${{осенью:'охре',зимой:'холодной синеве',весной:'молодой зелени',летом:'солнечно-жёлтому'}[sc.se]}, ${{осенью:'насыщенность +5%',зимой:'насыщенность −30%, цвета как на морозе',весной:'насыщенность без изменений',летом:'насыщенность +15%'}[sc.se]}`);
 if(sp.length)ls.push(`Время и сезон: ${sp.join('; ')}.`);
 ls.push(`Фото (${ph.n}): доминирующий оттенок ${Math.round(ph.h)}°, средняя яркость ${Math.round(ph.l)}% → палитра сдвинута на 40% к цвету снимков, ${ph.l>55?'светлые кадры высветляют фон':ph.l<40?'тёмные кадры приглушают фон':'фон нейтральный'}; ${ph.n>1?`кадров ${ph.n} → фото-слайдов ${Math.min(ph.n-1,3)+1}`:'один кадр → второй слайд показывает крупный план'}.`);
 ls.push(`Музыка: ${m.bpm} BPM → ${m.bpm<95?'больше воздуха, медленнее':m.bpm>125?'резче и плотнее':'ровный темп'}, слайды сменяются каждые 8 долей ≈ ${slideSec(m.bpm)} с; ${m.mode=='minor'?'минор → холоднее и глуше':'мажор → теплее и ярче'}${m.key?` (по файлу: ${m.key})`:''}; энергия ${Math.round(m.energy*100)}% → ${P.tech=='kandinsky'?'число фигур':P.tech=='film'?'сила зерна':'насыщенность'}.`);
 ls.push(`Эпоха песни: ${ERA[m.era]} → ${m.era=='old'?'тёплое выцветание, зерно и царапины старой плёнки':m.era=='mid'?'лёгкое зерно':'чистое изображение без зерна'}.`);
 ls.push('Постоянно: формат 4:5, дата сверху, подпись снизу, шрифты Cormorant, Manrope, Caveat. Меняется: палитра, обработка фото, фактура, ритм.');
 ls.push(`Голос озвучки: ${VOICE[e.mood][2]} (скорость ${VOICE[e.mood][0]}, высота ${VOICE[e.mood][1]}).`);return ls}

const shrink=(f,max=1600)=>loadImg(f).then(i=>{const k=Math.min(1,max/Math.max(i.naturalWidth,i.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(i.naturalWidth*k);c.height=Math.round(i.naturalHeight*k);c.getContext('2d').drawImage(i,0,0,c.width,c.height);return new Promise(r=>c.toBlob(b=>r(b?new File([b],(f.name||'photo').replace(/\.\w+$/,'')+'.jpg',{type:'image/jpeg'}):f),'image/jpeg',.82))}).catch(()=>f);
async function create(o){const imgs=await Promise.all(o.files.map(loadImg)),small=await Promise.all(o.files.map(f=>shrink(f))),ph=photoStats(imgs),m={bpm:o.bpm,mode:o.mode,energy:o.energy,era:eraOf(o.song.year),key:o.key||null},an=mood(o.text,m),mo=an.mo,sc=scene(o.text),P=theme(mo,ph,m,sc);
 const e={id:Date.now()+Math.random().toString(36).slice(2,5),date:o.date,text:o.text,mood:mo,m,P,seed:Date.now()%99999,song:o.song,files:small,audio:o.audio||null,cap:CAP[mo],title:mkTitle(o.text,mo)};
 e.why=why(e,ph,sc,an);e.slides=await build(e,imgs);await put(e);return e}

/* ---------- форма ---------- */
$('#go').onclick=async()=>{const text=$('#tx').value.trim(),files=[...$('#ph').files].slice(0,4),au=$('#au').files[0],yr=parseInt($('#sy').value,10),
 song={title:$('#sn').value.trim(),artist:$('#sa').value.trim(),link:safeUrl($('#sl').value.trim()),year:yr>1800&&yr<2100?yr:null};
 if(!text)return $('#st').textContent='Напиши хотя бы пару строк о дне.';if(!files.length)return $('#st').textContent='Добавь хотя бы одно фото.';
 if($('#sl').value.trim()&&!song.link)return $('#st').textContent='Ссылка на песню должна начинаться с http:// или https://';
 if(!song.title&&!song.link&&!au)return $('#st').textContent='Добавь песню: название, ссылку или файл.';if(au&&au.size>10e6)return $('#st').textContent='Аудиофайл больше 10 МБ.';
 $('#go').disabled=true;$('#go').classList.add('loading');$('#st').textContent='Собираем воспоминание…';
 try{let key=null;if(au){try{key=(await analyzeAudio(au)).key}catch(_){}}
  const e=await create({text,files,song,audio:au,key,date:$('#dt').value||new Date().toISOString().slice(0,10),bpm:+$('#bp').value||100,mode:$('#md').value,energy:+$('#en').value});
  ['#tx','#sn','#sa','#sl','#sy','#ph','#au'].forEach(s=>$(s).value='');$('#th').innerHTML='';$('#st').textContent='';$('#ah').textContent='Из файла темп, энергия и лад определятся сами.';openDay(e)}
 catch(err){$('#st').textContent='Не получилось собрать: '+err.message}
 $('#go').disabled=false;$('#go').classList.remove('loading')};

/* ---------- архив и просмотр ---------- */
async function renderArch(){const q=norm($('#q').value),l=(await all()).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)).filter(e=>norm(e.title+' '+e.text+' '+(e.song.title||'')+' '+(e.song.artist||'')).includes(q));
 $('#cards').innerHTML=l.length?'':'<p class="lead">Пока пусто. Запиши первый день или добавь демо-дни.</p>';
 l.forEach((e,i)=>{const d=document.createElement('button');d.className='card';d.dataset.m=e.mood;d.style.setProperty('--i',Math.min(i,12));d.innerHTML=`<img src="${e.slides[0]}" alt=""><div><b>${esc(e.title)}</b><span>${fmt(e.date)} · ${MN[e.mood]}</span></div>`;d.onclick=()=>openDay(e);$('#cards').append(d)})}
$('#q').oninput=renderArch;
function openDay(e){cur=e;setMood(e.mood);urls.forEach(u=>URL.revokeObjectURL(u));urls=[];
 const au=e.audio?(urls.push(URL.createObjectURL(e.audio)),`<audio id="aud" controls loop src="${urls[0]}"></audio>`):'',link=safeUrl(e.song.link);
 const lk=link?`<a class="btn" href="${esc(link)}" target="_blank" rel="noopener">▶ Открыть песню</a>`:'';
 $('#v').style.setProperty('--beat',(60/e.m.bpm).toFixed(3)+'s');
 $('#v').innerHTML=`<div class="acts"><button onclick="closeDay()">← Закрыть</button><button onclick="$('#tr').classList.toggle('album');auto()">Карусель / альбом</button></div>
 <div class="track" id="tr">${e.slides.map((s,i)=>`<img src="${s}" alt="Слайд ${i+1}" style="animation-delay:${i*60}ms">`).join('')}</div>
 <div class="prog" id="prog"><i></i></div>
 <div class="nv"><button onclick="sc(-1)" aria-label="Назад">←</button><span id="dots">${e.slides.map(()=>'<i class="dot"></i>').join('')}</span><button onclick="sc(1)" aria-label="Вперёд">→</button></div>
 <h2>${esc(e.title)}</h2><div><span class="tag">${fmt(e.date)}</span><span class="tag">${MN[e.mood]}</span><span class="tag">${TN[e.P.tech].split(':')[0]}</span></div>
 <p style="margin:10px 0">${esc(e.text)}</p><p class="now"><span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span><b>${esc(e.song.title||'')}</b> ${esc(e.song.artist||'')}${e.song.year?` · ${e.song.year}`:''}</span></p>${au}
 <div class="acts">${lk}<button onclick="speak()">🔊 Озвучить</button><button onclick="speechSynthesis.cancel()">Стоп</button><button onclick="exportDay()">Скачать папку дня</button><button class="dng" onclick="rm()">Удалить день</button></div>
 <div class="panel"><b>Почему день выглядит так</b><ul class="why">${e.why.map((w,i)=>`<li style="--i:${i}">${esc(w)}</li>`).join('')}</ul></div>`;
 const tr=$('#tr'),up=()=>{const i=Math.round(tr.scrollLeft/step());document.querySelectorAll('#dots i').forEach((d,k)=>d.classList.toggle('on',k==i));tr.querySelectorAll('img').forEach((m,k)=>m.classList.toggle('cur',k==i))};tr.onscroll=up;
 $('#modal').classList.add('open');$('#modal').scrollTop=0;up();autoE=e;auto();
 const a=$('#aud');if(a)a.play().catch(()=>{})}
// ритм просмотра задаёт песня: смена слайда каждые 8 долей, полоска показывает время до следующего кадра
let autoE=null;
function auto(){clearInterval(timer);const tr=$('#tr'),bar=$('#prog i');if(!tr||!autoE)return;const sec=slideSec(autoE.m.bpm),n=autoE.slides.length;
 const kick=()=>{if(!bar)return;bar.style.animation='none';void bar.offsetWidth;bar.style.animation=tr.classList.contains('album')?'none':`prog ${sec}s linear forwards`};kick();
 timer=setInterval(()=>{if(tr.classList.contains('album'))return;const i=Math.round(tr.scrollLeft/step());tr.scrollTo({left:((i+1)%n)*step(),behavior:'smooth'});kick()},sec*1000)}
// шаг карусели = ширина слайда + отступ между слайдами
const step=()=>{const t=$('#tr');return t&&t.children.length>1?t.children[1].offsetLeft-t.children[0].offsetLeft:(t?t.clientWidth:1)||1};
const sc=d=>{const tr=$('#tr');if(tr){tr.scrollBy({left:d*step(),behavior:'smooth'});auto()}};
function closeDay(){clearInterval(timer);autoE=null;speechSynthesis.cancel();const a=$('#aud');if(a)a.pause();$('#modal').classList.remove('open');$('#v').innerHTML='';urls.forEach(u=>URL.revokeObjectURL(u));urls=[];live();if(!$('#arch').hidden)renderArch()}
document.addEventListener('keydown',k=>{if(!$('#modal').classList.contains('open'))return;if(k.key=='Escape')closeDay();if(k.key=='ArrowRight')sc(1);if(k.key=='ArrowLeft')sc(-1)});
function speak(){const u=new SpeechSynthesisUtterance(cur.text),v=speechSynthesis.getVoices().find(v=>v.lang.startsWith('ru')),p=VOICE[cur.mood];if(v)u.voice=v;u.lang='ru-RU';u.rate=p[0];u.pitch=p[1];speechSynthesis.cancel();speechSynthesis.speak(u)}
async function rm(){if(confirm('Удалить этот день из дневника?')){await del(cur.id);closeDay();renderArch()}}

/* ---------- папка дня: .zip без библиотек (формат ZIP «store», UTF-8 имена) ---------- */
const enc=new TextEncoder();
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const crc32=u=>{let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=CRC[(c^u[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};
function zip(files){const parts=[],cd=[];let off=0;
 for(const f of files){const nm=enc.encode(f.name),crc=crc32(f.data),sz=f.data.length,lh=new DataView(new ArrayBuffer(30)),ch=new DataView(new ArrayBuffer(46));
  [[0,0x04034b50,4],[4,20],[6,0x0800],[8,0],[10,0],[12,0x21],[14,crc,4],[18,sz,4],[22,sz,4],[26,nm.length],[28,0]].forEach(([o,v,b])=>b?lh.setUint32(o,v,true):lh.setUint16(o,v,true));
  [[0,0x02014b50,4],[4,20],[6,20],[8,0x0800],[10,0],[12,0],[14,0x21],[16,crc,4],[20,sz,4],[24,sz,4],[28,nm.length],[30,0],[32,0],[34,0],[36,0],[38,0,4],[42,off,4]].forEach(([o,v,b])=>b?ch.setUint32(o,v,true):ch.setUint16(o,v,true));
  parts.push(lh,nm,f.data);cd.push(ch,nm);off+=30+nm.length+sz}
 const cs=cd.reduce((a,p)=>a+p.byteLength,0),end=new DataView(new ArrayBuffer(22));
 end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,cs,true);end.setUint32(16,off,true);
 return new Blob([...parts,...cd,end],{type:'application/zip'})}
const safeName=t=>t.replace(/[\\/:*?"<>|]/g,'').trim()||'День';
const du8=s=>Uint8Array.from(atob(s.split(',')[1]),c=>c.charCodeAt(0));
async function folderFiles(e){const T=safeName(e.title),out=[],add=(n,d)=>out.push({name:`${T}/${n}`,data:typeof d=='string'?enc.encode(d):d}),m=e.m,v=VOICE[e.mood];
 add('запись.txt',`${e.title}\n${fmt(e.date)}\nНастроение (оценка алгоритма, не диагноз): ${MN[e.mood]}\n\n${e.text}\n`);
 add('песня.txt',`${e.song.title||'—'}\n${e.song.artist||''}${e.song.year?`, ${e.song.year}`:''}\n${e.song.link||''}\n\nТемп: ${m.bpm} BPM\nЛад: ${m.mode=='minor'?'минор':'мажор'}${m.key?` (${m.key})`:''}\nЭнергия: ${Math.round(m.energy*100)}%\nЭпоха: ${ERA[m.era||'new']}\n\nСам аудиофайл в папку не копируется (авторское право): он звучит при просмотре дня в дневнике.\n`);
 for(let i=0;i<e.files.length;i++){const f=e.files[i],ext=(f.name.match(/\.\w+$/)||['.jpg'])[0].toLowerCase();add(`фото/фото-${i+1}${ext}`,new Uint8Array(await f.arrayBuffer()))}
 e.slides.forEach((s,i)=>add(`воспоминание/слайд-${i+1}.jpg`,du8(s)));
 add('озвучка.txt',`Голос: ${v[2]}\nСкорость речи: ${v[0]}\nВысота голоса: ${v[1]}\nСинтез речи браузера (Web Speech API), русский голос.\nОткрой «открыть.html» и нажми «Озвучить».\n\n${e.text}\n`);
 add('почему-так.txt',e.why.join('\n')+'\n');
 add('открыть.html',`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(e.title)}</title>
<style>body{margin:0;background:${e.P.bg};color:${e.P.ink};font:16px/1.5 system-ui,sans-serif}main{max-width:560px;margin:auto;padding:16px}img{width:100%;border-radius:14px;margin:0 0 12px;display:block}button,a{font:inherit;padding:10px 18px;border-radius:99px;border:0;background:${e.P.ac};color:#fff;cursor:pointer;text-decoration:none;display:inline-block;margin:0 6px 12px 0}</style>
<main><h1>${esc(e.title)}</h1><p>${fmt(e.date)}</p>${e.slides.map((_,i)=>`<img src="воспоминание/слайд-${i+1}.jpg" alt="Слайд ${i+1}">`).join('')}
<p>${esc(e.text)}</p><p><b>${esc(e.song.title||'')}</b> ${esc(e.song.artist||'')}</p>${safeUrl(e.song.link)?`<a href="${esc(e.song.link)}" target="_blank" rel="noopener">▶ Песня</a>`:''}<button onclick="s()">🔊 Озвучить</button></main>
<script>function s(){const u=new SpeechSynthesisUtterance(${JSON.stringify(e.text).replace(/</g,'\\u003c')}),v=speechSynthesis.getVoices().find(v=>v.lang.startsWith('ru'));if(v)u.voice=v;u.lang='ru-RU';u.rate=${v[0]};u.pitch=${v[1]};speechSynthesis.cancel();speechSynthesis.speak(u)}<\/script></html>`);
 add('день.json',JSON.stringify({title:e.title,date:e.date,mood:e.mood,technique:e.P.tech,palette:{bg:e.P.bg,ink:e.P.ink,accent:e.P.ac,accent2:e.P.ac2},music:m,song:e.song,voice:{rate:v[0],pitch:v[1],tone:v[2]},why:e.why},null,2));
 return out}
async function exportDay(){const a=document.createElement('a');a.href=URL.createObjectURL(zip(await folderFiles(cur)));a.download=safeName(cur.title)+'.zip';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)}

/* ---------- демо-дни: «фото» рисуются кодом, их можно заменить настоящими ---------- */
function scenePhoto(kind,v,seed){const w=900,h=1125,c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d'),r=rng(seed);
 const gr=(st,y0=0,y1=h)=>{const g=x.createLinearGradient(0,y0,0,y1);st.forEach((s,i)=>g.addColorStop(i/(st.length-1),s));return g};
 const ci=(cx,cy,rr,col)=>{x.fillStyle=col;x.beginPath();x.arc(cx,cy,rr,0,7);x.fill()};
 const steam=(cx,cy)=>{x.strokeStyle='rgba(255,255,255,.35)';x.lineWidth=7;x.lineCap='round';for(let k=-1;k<=1;k++){x.beginPath();x.moveTo(cx+k*36,cy);x.bezierCurveTo(cx+k*36-30,cy-60,cx+k*36+30,cy-110,cx+k*36,cy-170);x.stroke()}};
 if(kind=='park'){x.fillStyle=gr(['#f3d9a6','#e8b878','#c98b4f']);x.fillRect(0,0,w,h);x.fillStyle=gr(['#b98a4a','#7a5a32'],h*.62,h);x.fillRect(0,h*.62,w,h*.38);
  if(!v){x.fillStyle='#8aa0a8';x.beginPath();x.ellipse(w*.66,h*.8,250,55,0,0,7);x.fill();
   for(let i=0;i<5;i++){const tx=60+i*200+r()*60,ty=h*.62;x.fillStyle='#4a3020';x.fillRect(tx-12,ty-260,24,270);for(let k=0;k<60;k++)ci(tx+(r()-.5)*240,ty-300+(r()-.5)*220,14+r()*26,`hsla(${30+r()*25},${70+r()*20}%,${45+r()*20}%,.85)`)}
   [[w*.36,0],[w*.43,10]].forEach(([fx,d])=>{x.fillStyle='#3a2a22';x.fillRect(fx-14,h*.7-110+d,28,110);ci(fx,h*.7-130+d,18,'#3a2a22')})}
  else{x.fillStyle=gr(['#8a6a3a','#5a4026']);x.fillRect(0,0,w,h);for(let k=0;k<160;k++){x.save();x.translate(r()*w,r()*h);x.rotate(r()*6);x.fillStyle=`hsla(${25+r()*30},${70+r()*20}%,${40+r()*25}%,.9)`;x.beginPath();x.ellipse(0,0,30+r()*20,12+r()*8,0,0,7);x.fill();x.restore()}
   ci(w*.5,h*.6,170,'#efe6d8');ci(w*.5,h*.6,140,'#6b3e22');ci(w*.46,h*.57,40,'#a46a42');steam(w*.5,h*.4)}}
 else if(kind=='office'){x.fillStyle=gr(['#0b1230','#141c44','#0a0f24']);x.fillRect(0,0,w,h);
  if(!v){for(let i=0;i<14;i++){const bx=i*70,bh=200+r()*380;x.fillStyle='#1a2350';x.fillRect(bx,h*.62-bh,62,bh);for(let yy=h*.62-bh+12;yy<h*.62-10;yy+=26)for(let xx=bx+8;xx<bx+56;xx+=16)if(r()<.35){x.fillStyle=`hsla(${45+r()*20},90%,${60+r()*20}%,.85)`;x.fillRect(xx,yy,8,12)}}
   x.fillStyle='#05081a';x.fillRect(0,h*.62,w,h*.38);x.shadowColor='#4f8cff';x.shadowBlur=60;x.fillStyle='#4f8cff';x.fillRect(w*.22,h*.5,w*.56,h*.25);x.shadowBlur=0;x.fillStyle='#0d1640';x.fillRect(w*.24,h*.52,w*.52,h*.21);
   for(let k=0;k<12;k++){x.fillStyle=k%3?'#7fb0ff':'#ff4fa3';x.fillRect(w*.27,h*.54+k*18,60+r()*300,7)}x.fillStyle='#1a1f33';x.fillRect(w*.46,h*.75,w*.08,h*.05)}
  else{x.save();x.translate(w*.5,h*.42);x.rotate(-.08);x.shadowColor='#4f8cff';x.shadowBlur=80;x.fillStyle='#4f8cff';x.fillRect(-330,-230,660,420);x.shadowBlur=0;x.fillStyle='#0b1236';x.fillRect(-310,-210,620,380);
   for(let k=0;k<17;k++){x.fillStyle=k%4?'#86b4ff':'#22e3d0';x.fillRect(-280+(k%3)*30,-190+k*21,80+r()*380,8)}x.restore();ci(w*.8,h*.84,95,'#d8d8e8');ci(w*.8,h*.84,75,'#2b1a12')}}
 else if(kind=='sea'){const ss=v==1;x.fillStyle=gr(ss?['#ff9a5a','#ffcf7a','#ffe6b0']:['#4aa8ff','#8fd0ff','#d8f0ff'],0,h*.5);x.fillRect(0,0,w,h*.5);ci(w*.7,h*(ss?.44:.16),ss?110:80,ss?'#ff6a3a':'#fff6c8');
  x.fillStyle=gr(ss?['#e8705a','#5a3a6a']:['#1f8fc8','#0d5a8a'],h*.5,h*.72);x.fillRect(0,h*.5,w,h*.22);for(let k=0;k<40;k++){x.fillStyle=`rgba(255,255,255,${.2+r()*.3})`;x.fillRect(r()*w,h*.5+r()*h*.22,40+r()*120,3)}
  x.fillStyle=gr(['#f4d9a0','#e0b878'],h*.72,h);x.fillRect(0,h*.72,w,h*.28);
  for(let k=0;k<4;k++){const px=150+k*180+r()*40,py=h*.88,col=ss?'#2a1830':'#c0503a';x.strokeStyle=col;x.lineWidth=14;x.lineCap='round';ci(px,py-150,22,col);x.beginPath();x.moveTo(px,py-125);x.lineTo(px,py-50);x.lineTo(px-30,py+10);x.moveTo(px,py-50);x.lineTo(px+30,py+10);x.moveTo(px,py-110);x.lineTo(px-50,py-170-r()*30);x.moveTo(px,py-110);x.lineTo(px+50,py-170-r()*30);x.stroke()}}
 else if(kind=='snow'){if(!v){x.fillStyle=gr(['#c9d8ea','#e6eef7']);x.fillRect(0,0,w,h);x.fillStyle='#f7fafd';x.fillRect(0,h*.68,w,h*.32);
   x.fillStyle='#7a5a4a';x.fillRect(w*.28,h*.42,w*.44,h*.28);x.fillStyle='#5a3a30';x.beginPath();x.moveTo(w*.22,h*.43);x.lineTo(w*.5,h*.28);x.lineTo(w*.78,h*.43);x.fill();x.fillStyle='#f7fafd';x.fillRect(w*.22,h*.42,w*.56,14);
   [[.36,.5],[.56,.5]].forEach(([a,b])=>{x.shadowColor='#ffcc66';x.shadowBlur=40;x.fillStyle='#ffd27a';x.fillRect(w*a,h*b,w*.1,h*.09);x.shadowBlur=0});
   for(let k=0;k<300;k++)ci(r()*w,r()*h,1.5+r()*4,'rgba(255,255,255,.9)')}
  else{x.fillStyle=gr(['#e9dccb','#cdb79c']);x.fillRect(0,0,w,h);ci(w*.5,h*.58,260,'#f5f1ea');for(let k=0;k<7;k++)ci(w*.5,h*.58-k*9,190,`hsl(${36+k},${70-k*2}%,${55+k*3}%)`);ci(w*.5,h*.58-63,60,'#fff3c4');
   ci(w*.15,h*.18,70,'#efe6d8');ci(w*.15,h*.18,55,'#6b3e22');steam(w*.15,h*.1)}}
 else{x.fillStyle=gr(['#6b7685','#8a95a3','#5a6472']);x.fillRect(0,0,w,h);for(let k=0;k<30;k++)ci(r()*w,r()*h*.7,30+r()*90,`hsla(${200+r()*30},15%,${55+r()*25}%,.25)`);
  x.strokeStyle='rgba(230,236,244,.35)';x.lineWidth=2;for(let k=0;k<260;k++){const sx=r()*w,sy=r()*h;x.beginPath();x.moveTo(sx,sy);x.lineTo(sx-8,sy+40+r()*40);x.stroke()}
  for(let k=0;k<120;k++)ci(r()*w,r()*h,2+r()*7,'rgba(240,245,250,.35)');x.fillStyle='#3a414c';x.fillRect(w*.48,0,24,h*.78);x.fillRect(0,h*.38,w,20);x.fillRect(0,h*.78,w,h*.22);
  if(v){ci(w*.3,h*.88,80,'#e8e4dc');ci(w*.3,h*.88,62,'#a87a3a');steam(w*.3,h*.8)}}
 return new Promise(res=>c.toBlob(res,'image/jpeg',.9))}
const DEMO=[
 ['Гуляли с девушкой по парку осенью, всё в жёлтых листьях, было холодно, но мы пили какао у пруда и долго разговаривали. Тихий вечер, закат.',{title:'Fly Me to the Moon',artist:'Frank Sinatra',year:1964},90,'major',.3,'park'],
 ['Срочная сдача проекта, ночь в офисе. Дедлайн, кофе, нервы, но мы успели. В наушниках электронная музыка.',{title:'Midnight City',artist:'M83',year:2011},138,'minor',.85,'office'],
 ['Летом с друзьями поехали к морю. Смех, солнце, танцы на пляже до вечера. Были счастливы.',{title:'Happy',artist:'Pharrell Williams',year:2013},120,'major',.8,'sea'],
 ['Дождливый серый день дома. Скучно и немного грустно, смотрела в окно, пила чай. Одиноко, но спокойно.',{title:'Gymnopédie No.1',artist:'Erik Satie',year:1888},70,'minor',.2,'rain'],
 ['Первое утро зимы: за окном снег, мы с мамой не спешили, пекли блины на кухне, пили чай с вареньем. Тепло, уютно и тихо.',{title:'Last Christmas',artist:'Wham!',year:1984},107,'major',.5,'snow']];
async function addDemo(){for(let i=0;i<DEMO.length;i++){const[text,song,bpm,mode,energy,kind]=DEMO[i],date=new Date(Date.now()-(DEMO.length-i)*864e5*3).toISOString().slice(0,10);
 const files=await Promise.all([0,1].map(async j=>new File([await scenePhoto(kind,j,1000+i*10+j)],`${kind}-${j+1}.jpg`,{type:'image/jpeg'})));
 await create({text,song:{...song,link:''},bpm,mode,energy,files,date})}}
$('#demo').onclick=async()=>{const b=$('#demo');b.disabled=true;b.classList.add('loading');b.textContent='Собираем…';try{await addDemo()}catch(err){alert('Не получилось: '+err.message)}b.disabled=false;b.classList.remove('loading');b.textContent=`Добавить ${DEMO.length} демо-дней`;renderArch()};

/* ---------- сайт подстраивается под настроение дня ---------- */
function setMood(mo){if(mo)document.body.dataset.mood=mo;else delete document.body.dataset.mood;$('#mh').textContent=mo?`Сайт слышит настроение: ${MN[mo]}`:'Сайт подстроится под настроение текста и музыки.'}
function live(){const t=$('#tx').value.trim();setMood(t?mood(t,{bpm:+$('#bp').value||100,mode:$('#md').value,energy:+$('#en').value}).mo:'')}
['#tx','#bp','#md','#en'].forEach(s=>$(s).addEventListener('input',live));live();

/* ---------- motion: свет за курсором и 3D-наклон карточек (только мышь, без prefers-reduced-motion) ---------- */
if(matchMedia('(pointer:fine)').matches&&!matchMedia('(prefers-reduced-motion:reduce)').matches){
 let raf=0,px=0,py=0;addEventListener('pointermove',ev=>{px=ev.clientX;py=ev.clientY;if(raf)return;raf=requestAnimationFrame(()=>{raf=0;document.body.style.setProperty('--cx',px+'px');document.body.style.setProperty('--cy',py+'px')})},{passive:true});
 const cards=$('#cards');
 cards.addEventListener('pointermove',ev=>{const c=ev.target.closest('.card');if(!c)return;const r=c.getBoundingClientRect(),x=(ev.clientX-r.left)/r.width,y=(ev.clientY-r.top)/r.height;
  c.style.setProperty('--ry',((x-.5)*12).toFixed(2)+'deg');c.style.setProperty('--rx',((.5-y)*12).toFixed(2)+'deg');c.style.setProperty('--mx',(x*100).toFixed(1)+'%');c.style.setProperty('--my',(y*100).toFixed(1)+'%')});
 cards.addEventListener('pointerout',ev=>{const c=ev.target.closest('.card');if(c&&!c.contains(ev.relatedTarget)){c.style.setProperty('--rx','0deg');c.style.setProperty('--ry','0deg')}})}
