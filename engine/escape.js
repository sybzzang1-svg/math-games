/* =============================================================
   방탈출 공통 엔진 — 진해중·하늘빛 폐교 탈출
   각 게임 폴더의 index.html이 GAME 설정과 문제(F, STAGES)를 먼저 정의한 뒤
   이 파일을 불러옵니다. 이 파일을 고치면 모든 게임에 한 번에 반영됩니다.
   ============================================================= */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDk7S-qNK3TActSwn9wP_JKmP3MkpcTwQU",
  authDomain: "math-game-a024b.firebaseapp.com",
  databaseURL: "https://math-game-a024b-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "math-game-a024b",
  storageBucket: "math-game-a024b.firebasestorage.app",
  messagingSenderId: "218415319233",
  appId: "1:218415319233:web:0c6a46a6a82b241e47ec40"
};

const GAME_ID = GAME.id;   // 게임 이름은 각 게임 파일의 GAME 설정에서 옵니다
const DOORS = 4;          // 글자를 주는 문
const MAIN = 5;           // 탈출까지: 문 4개 + 마지막 금고           // 탈출에 필요한 방 개수
const LOCK_MS = GAME.lockMs||20000;   // 오답 시 잠금 시간

/* ---- 문제 무작위화: 학생마다 다른 숫자 (같은 학생은 새로고침해도 같은 숫자) ---- */
function rng(seed){let a=(seed>>>0)||1;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const pick=(r,arr)=>arr[Math.floor(r()*arr.length)];
const randInt=(r,lo,hi)=>lo+Math.floor(r()*(hi-lo+1));
const _stageCache={};
function stageOf(i,seed){const k=i+':'+(seed||0);if(_stageCache[k])return _stageCache[k];const b=STAGES[i];
  const o=b&&b.make?Object.assign({},b,b.make(rng((((seed||0)*2654435761)^(i*40503+17))>>>0))):b;return _stageCache[k]=o}

/* ============================================================
   2. 저장소 — Firebase 또는 로컬(같은 브라우저 탭끼리)
   ============================================================ */
function makeLocalStore(key){
  const KEY=key||('escape_local_db_'+GAME_ID);
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{}}catch(e){return {}}};
  const write=(o)=>{localStorage.setItem(KEY,JSON.stringify(o));fire()};
  const get=(o,p)=>p.split('/').filter(Boolean).reduce((a,k)=>a==null?undefined:a[k],o);
  const put=(o,p,v)=>{const ks=p.split('/').filter(Boolean);let c=o;ks.slice(0,-1).forEach(k=>{if(typeof c[k]!=='object'||c[k]===null)c[k]={};c=c[k]});
    if(v===null||v===undefined)delete c[ks[ks.length-1]];else c[ks[ks.length-1]]=v};
  const subs=new Set();
  function fire(){const d=read();subs.forEach(s=>{const v=get(d,s.p);const j=JSON.stringify(v);if(j!==s.last){s.last=j;s.cb(v===undefined?null:JSON.parse(j))}})}
  window.addEventListener('storage',e=>{if(e.key===KEY)fire()});
  return {
    local:true, now:()=>Date.now(),
    on(p,cb){const s={p,cb,last:undefined};subs.add(s);const v=get(read(),p);s.last=JSON.stringify(v);cb(v===undefined?null:v);return()=>subs.delete(s)},
    async once(p){const v=get(read(),p);return v===undefined?null:v},
    async set(p,v){const d=read();put(d,p,v);write(d)},
    async update(p,obj){const d=read();Object.entries(obj).forEach(([k,v])=>put(d,p+'/'+k,v));write(d)},
    async tx(p,fn){const d=read();const cur=get(d,p);const nx=fn(cur===undefined?null:JSON.parse(JSON.stringify(cur)));if(nx===undefined)return false;put(d,p,nx);write(d);return true},
    presence(){}
  };
}
function loadScript(src){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=no;document.head.appendChild(s)})}
async function makeFirebaseStore(cfg){
  await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js');
  firebase.initializeApp(cfg);
  const db=firebase.database(); let offset=0;
  db.ref('.info/serverTimeOffset').on('value',s=>{offset=s.val()||0});
  return {
    local:false, now:()=>Date.now()+offset,
    on(p,cb){const r=db.ref(p);const h=r.on('value',s=>cb(s.val()));return()=>r.off('value',h)},
    async once(p){return (await db.ref(p).once('value')).val()},
    set:(p,v)=>db.ref(p).set(v),
    update:(p,o)=>db.ref(p).update(o),
    async tx(p,fn){const r=await db.ref(p).transaction(c=>{const n=fn(c);return n});return r.committed},
    presence(p){const r=db.ref(p);db.ref('.info/connected').on('value',s=>{if(s.val()){r.onDisconnect().update({online:false});r.update({online:true})}})}
  };
}

/* ============================================================
   3. 공통 도구
   ============================================================ */
const $=(s,r=document)=>r.querySelector(s);
const app=$('#app'), layer=$('#layer');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=ms=>{ms=Math.max(0,ms|0);const s=Math.floor(ms/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
async function hash(s){
  if(window.crypto&&crypto.subtle){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('esc:'+s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
  let h=5381;for(const c of 'esc:'+s)h=((h<<5)+h+c.charCodeAt(0))|0;return 'd'+h;
}
function parseNum(v){const s=String(v).replace(/[^\d.\-]/g,'');return s===''?NaN:parseFloat(s)}
function elapsedOf(meta,now){
  if(!meta||!meta.startedAt)return 0;
  const end=meta.state==='paused'?meta.pausedAt:(meta.state==='ended'?meta.endedAt:now);
  return end-meta.startedAt-(meta.pausedTotal||0);
}
let S=null;               // 저장소
let unsubs=[];            // 현재 화면의 구독
let ticker=null;
function clearView(){unsubs.forEach(u=>u&&u());unsubs=[];clearInterval(ticker);ticker=null;layer.innerHTML='';if(window.FX)FX.leave()}
function modeBanner(){if(PRACTICE)return `<div class="banner row" style="justify-content:space-between"><span>테스트 모드입니다. 기록은 남지 않고, 힌트와 정답을 직접 볼 수 있습니다.</span><button class="btn" style="min-height:36px;padding:6px 12px" onclick="exitPractice()">테스트 끝내기</button></div>`;return S.local?`<div class="banner">로컬 테스트 모드입니다. 같은 브라우저의 탭끼리만 연결됩니다. 교사 탭 하나, 학생 탭 여러 개를 열어 시험해 보세요.</div>`:''}

/* ============================================================
   3-1. 폐교 분위기 — 장면 그림 · 효과음 · 화면 효과
   그림은 모두 직접 그린 SVG, 소리는 파일 없이 브라우저에서 합성합니다.
   ============================================================ */
const SCENES={
  hero:`<svg class="hero-img" viewBox="0 0 360 170" aria-hidden="true"><rect width="360" height="170" fill="#09080a"/>
    <circle cx="296" cy="36" r="19" fill="#d8ddd0" opacity=".28"/><circle cx="296" cy="36" r="34" fill="#d8ddd0" opacity=".05"/>
    <rect x="150" y="30" width="60" height="34" fill="#121114" stroke="#26242a" stroke-width="2"/>
    <circle cx="180" cy="46" r="9" fill="none" stroke="#3a3833" stroke-width="2"/><path d="M180 46v-6M180 46l4 3" stroke="#3a3833" stroke-width="1.5"/>
    <rect x="30" y="62" width="300" height="98" fill="#121114" stroke="#26242a" stroke-width="2"/>
    <text x="180" y="79" text-anchor="middle" font-size="12" fill="#6f695e" letter-spacing="7">${GAME.sign||'진 해 중 학'}<tspan dy="3" rotate="14"> 교</tspan></text>
    <g fill="#0a0c10" stroke="#23222a">
      <rect x="48" y="90" width="26" height="22"/><rect x="94" y="90" width="26" height="22"/><rect x="140" y="90" width="26" height="22"/>
      <rect x="194" y="90" width="26" height="22"/><rect x="240" y="90" width="26" height="22"/><rect x="286" y="90" width="26" height="22"/>
      <rect x="48" y="124" width="26" height="22"/><rect x="94" y="124" width="26" height="22"/><rect x="240" y="124" width="26" height="22"/><rect x="286" y="124" width="26" height="22"/>
    </g>
    <rect class="win-lit" x="194" y="90" width="26" height="22" fill="#4d6b55"/>
    <rect x="160" y="118" width="40" height="42" fill="#050405" stroke="#23222a"/>
    <g stroke="#1c1b1f" stroke-width="3"><path d="M0 160h360"/><path d="M20 160v-26M44 160v-26M68 160v-26M292 160v-26M316 160v-26M340 160v-26"/><path d="M14 138h66M286 138h66"/></g>
  </svg>`,
  cls:`<svg viewBox="0 0 360 130"><rect width="360" height="130" fill="#0c0b0d"/>
    <rect x="40" y="16" width="200" height="74" fill="#1b271f" stroke="#3a3a33" stroke-width="3"/>
    <path d="M92 80 L130 28 L170 80 Z M92 80 L149 52" stroke="#c9c3b3" stroke-width="1.5" fill="none" opacity=".5"/>
    <text x="178" y="44" font-size="17" fill="#a3281d" opacity=".85" font-family="East Sea Dokdo,sans-serif">${GAME.graffiti||'나가지 마'}</text>
    <rect x="272" y="18" width="60" height="62" fill="#10151a" stroke="#2c2c2a" stroke-width="3"/><path d="M302 18v62M272 49h60" stroke="#2c2c2a" stroke-width="2"/>
    <circle cx="314" cy="34" r="8" fill="#cfd6c8" opacity=".3"/>
    <g fill="#050405"><rect x="30" y="102" width="60" height="8"/><rect x="36" y="110" width="4" height="20"/><rect x="80" y="110" width="4" height="20"/>
      <rect x="130" y="100" width="60" height="8" transform="rotate(-9 160 104)"/><rect x="232" y="104" width="60" height="8"/><rect x="238" y="112" width="4" height="18"/><rect x="282" y="112" width="4" height="18"/></g>
    <text x="42" y="11" font-size="10" fill="#6b6457">${GAME.classLabel||'2학년 3반'}</text></svg>`,
  sci:`<svg viewBox="0 0 360 130"><rect width="360" height="130" fill="#0c0b0d"/>
    <g stroke="#2f2d29" stroke-width="4"><path d="M20 32h122M20 67h122M20 102h122"/></g>
    <g fill="#18221d" stroke="#3b463f"><rect x="30" y="12" width="14" height="20" rx="3"/><rect x="56" y="17" width="12" height="15" rx="3"/><rect x="92" y="10" width="17" height="22" rx="3"/>
      <rect x="40" y="47" width="14" height="20" rx="3"/><rect x="102" y="50" width="14" height="17" rx="3"/><rect x="66" y="84" width="16" height="18" rx="3"/></g>
    <ellipse cx="100" cy="21" rx="4" ry="3" fill="#6f8a73" opacity=".6"/>
    <path d="M190 122 L190 28 L322 122 Z" fill="none" stroke="#6b6252" stroke-width="3"/>
    <path d="M190 28 L242 122" stroke="#a3281d" stroke-width="2" opacity=".7"/>
    <circle cx="300" cy="38" r="14" fill="none" stroke="#3b463f" stroke-width="2"/><path d="M300 38v-9M300 38l7 4" stroke="#6b6252" stroke-width="2"/>
    <text x="22" y="125" font-size="10" fill="#6b6457">과학실</text></svg>`,
  lib:`<svg viewBox="0 0 360 130"><rect width="360" height="130" fill="#0c0b0d"/>
    <path d="M122 8 L60 60 L202 60 Z" fill="none" stroke="#4b463d" stroke-width="2"/>
    <path d="M60 60 L133 42 L202 60 M122 8 L133 42" stroke="#a3281d" stroke-width="1.5" opacity=".6"/>
    <path d="M282 0v34" stroke="#3a3833" stroke-width="2"/><path d="M268 34h28l-6 10h-16z" fill="#2a2823"/>
    <ellipse cx="282" cy="84" rx="48" ry="30" fill="#c9c09a" opacity=".06"/>
    <g fill="#16141a" stroke="#2b2830"><rect x="10" y="74" width="120" height="56"/><rect x="150" y="74" width="100" height="56"/></g>
    <g fill="#2a2330"><rect x="16" y="80" width="6" height="20"/><rect x="24" y="82" width="7" height="18"/><rect x="34" y="79" width="5" height="21"/><rect x="60" y="81" width="8" height="19"/>
      <rect x="92" y="86" width="16" height="6" transform="rotate(-20 100 89)"/><rect x="160" y="80" width="6" height="20"/><rect x="170" y="83" width="9" height="17"/><rect x="196" y="79" width="6" height="21"/></g>
    <text x="302" y="125" font-size="10" fill="#6b6457">도서실</text></svg>`,
  off:`<svg viewBox="0 0 360 130"><rect width="360" height="130" fill="#0c0b0d"/>
    <path d="M112 22 L82 110 L252 110 L282 22 Z" fill="#0f141a" stroke="#4b463d" stroke-width="4"/>
    <circle cx="238" cy="48" r="12" fill="#d6dccc" opacity=".28"/>
    <path d="M147 22 L117 110 M182 22 L152 110 M217 22 L187 110 M252 22 L222 110" stroke="#2f2d29" stroke-width="3"/>
    <path d="M112 22 L152 110" stroke="#a3281d" stroke-width="2" opacity=".65"/>
    <path d="M196 70 q6 -16 12 0 v18 h-12z" fill="#050405" opacity=".85"/>
    <g fill="#050405"><rect x="18" y="100" width="44" height="30"/><rect x="298" y="96" width="46" height="34"/></g>
    <text x="20" y="16" font-size="10" fill="#6b6457">교무실</text></svg>`,
  vlt:`<svg viewBox="0 0 360 130"><rect width="360" height="130" fill="#0c0b0d"/>
    <rect x="130" y="18" width="100" height="104" rx="6" fill="#1a1a1c" stroke="#4b463d" stroke-width="3"/>
    <circle cx="180" cy="60" r="20" fill="none" stroke="#6b6252" stroke-width="3"/><path d="M180 60l12-8" stroke="#a3281d" stroke-width="3"/>
    <g fill="#2a2823" stroke="#4b463d"><rect x="146" y="92" width="16" height="20"/><rect x="164" y="92" width="16" height="20"/><rect x="182" y="92" width="16" height="20"/><rect x="200" y="92" width="16" height="20"/></g>
    <rect x="20" y="28" width="72" height="48" fill="#111" stroke="#2c2b28" stroke-width="3"/><text x="30" y="56" font-size="10" fill="#5e584d">교 육 목 표</text>
    <rect x="276" y="60" width="64" height="70" fill="#050405"/><text x="268" y="20" font-size="10" fill="#6b6457">교장실</text></svg>`,
  bsm:`<svg viewBox="0 0 360 130"><rect width="360" height="130" fill="#070608"/>
    <path d="M36 130 L36 110 L76 110 L76 90 L116 90 L116 70 L156 70 L156 50 L196 50" fill="none" stroke="#3a3833" stroke-width="3"/>
    <path d="M272 0v40" stroke="#3a3833"/><circle cx="272" cy="46" r="6" fill="#d9c98a" opacity=".6"/><ellipse cx="272" cy="102" rx="72" ry="24" fill="#d9c98a" opacity=".05"/>
    <path d="M232 112 L222 126 L302 126 L312 112 Z" fill="none" stroke="#6b6252" stroke-width="2"/>
    <text x="302" y="20" font-size="10" fill="#6b6457">지하 창고</text></svg>`
};

/* ---- 효과음: 모두 합성. 첫 터치 뒤에만 소리가 납니다(브라우저 규칙) ---- */
const SND=(()=>{
  let ctx=null, master=null, amb=null, ambNodes=[], NB=null, started=false;
  let on=true; try{on=localStorage.getItem('horror_snd')!=='off'}catch(e){}
  function init(){
    if(ctx)return true;
    try{ctx=new (window.AudioContext||window.webkitAudioContext)();master=ctx.createGain();master.gain.value=on?0.8:0;master.connect(ctx.destination);return true}
    catch(e){return false}
  }
  function nbuf(){if(NB)return NB;NB=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const d=NB.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;return NB}
  function noise(dur,f,q,g,t){const s=ctx.createBufferSource();s.buffer=nbuf();const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f;bp.Q.value=q;
    const gn=ctx.createGain();gn.gain.setValueAtTime(0,t);gn.gain.linearRampToValueAtTime(g,t+Math.min(.05,dur/3));gn.gain.exponentialRampToValueAtTime(.0001,t+dur);
    s.connect(bp);bp.connect(gn);gn.connect(master);s.start(t);s.stop(t+dur+.05)}
  function tone(f,dur,type,g,t,glide){const o=ctx.createOscillator();o.type=type||'sine';o.frequency.setValueAtTime(f,t);if(glide)o.frequency.exponentialRampToValueAtTime(glide,t+dur);
    const gn=ctx.createGain();gn.gain.setValueAtTime(0,t);gn.gain.linearRampToValueAtTime(g,t+.02);gn.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(gn);gn.connect(master);o.start(t);o.stop(t+dur+.05)}
  function ambient(){   // 낮게 웅웅거리는 건물 소리 + 창틈 바람
    const t=ctx.currentTime, g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.05,t+3);g.connect(master);
    const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=170;lp.connect(g);
    ambNodes=[];[55,55.7,82.4].forEach(f=>{const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=f;o.connect(lp);o.start();ambNodes.push(o)});
    const s=ctx.createBufferSource();s.buffer=nbuf();s.loop=true;const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=420;bp.Q.value=.7;
    const wg=ctx.createGain();wg.gain.value=.22;s.connect(bp);bp.connect(wg);wg.connect(g);s.start();ambNodes.push(s);
    const lfo=ctx.createOscillator();lfo.frequency.value=.07;const lg=ctx.createGain();lg.gain.value=260;lfo.connect(lg);lg.connect(bp.frequency);lfo.start();ambNodes.push(lfo);
    amb=g}
  const ok=()=>ctx&&on;
  return {
    get on(){return on},
    start(){if(!init())return;if(ctx.state==='suspended')ctx.resume().catch(()=>{});if(!started){started=true;ambient()}},
    toggle(){on=!on;try{localStorage.setItem('horror_snd',on?'on':'off')}catch(e){}if(!init())return;this.start();master.gain.setTargetAtTime(on?0.8:0,ctx.currentTime,.05)},
    creak(){if(!ok())return;const t=ctx.currentTime,o=ctx.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(90,t);o.frequency.linearRampToValueAtTime(145,t+.5);o.frequency.linearRampToValueAtTime(68,t+1.1);
      const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=900;bp.Q.value=8;const l=ctx.createOscillator();l.frequency.value=23;const lg=ctx.createGain();lg.gain.value=420;l.connect(lg);lg.connect(bp.frequency);
      const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.35,t+.1);g.gain.exponentialRampToValueAtTime(.0001,t+1.2);
      o.connect(bp);bp.connect(g);g.connect(master);o.start(t);l.start(t);o.stop(t+1.3);l.stop(t+1.3)},
    chime(){if(!ok())return;const t=ctx.currentTime+.9;[659.3,523.3,440,493.9].forEach((f,i)=>tone(f,1.4,'sine',.12,t+i*.28))},   // 음이 어긋난 오르골
    sting(){if(!ok())return;const t=ctx.currentTime;if(GAME.kid){tone(392,.3,'triangle',.16,t,330);tone(330,.3,'triangle',.16,t+.3,277);tone(277,.6,'triangle',.16,t+.6,196);return}[196,207.7,277.2].forEach(f=>tone(f,.9,'square',.06,t));noise(.35,1800,.8,.35,t);tone(110,1.2,'sawtooth',.1,t,55)},
    beat(){if(!ok())return;const t=ctx.currentTime;tone(62,.18,'sine',.5,t,40);tone(56,.18,'sine',.35,t+.22,38)},
    whisper(){if(!ok())return;const t=ctx.currentTime;for(let i=0;i<5;i++)noise(.25+Math.random()*.2,1200+Math.random()*2500,6,.05,t+i*.18)},
    steps(){if(!ok())return;const t=ctx.currentTime;for(let i=0;i<4;i++){noise(.12,180,1.2,.4,t+i*.55);tone(70,.12,'sine',.25,t+i*.55)}},
    escape(){if(!ok())return;const t=ctx.currentTime;if(amb)amb.gain.setTargetAtTime(0,t,.5);[261.6,329.6,392,523.3].forEach((f,i)=>tone(f,2.2,'triangle',.1,t+i*.15))},
    stopAmb(){if(!ctx||!amb)return;amb.gain.setTargetAtTime(0,ctx.currentTime,.3);const ns=ambNodes;amb=null;ambNodes=[];started=false;
      setTimeout(()=>ns.forEach(n=>{try{n.stop()}catch(e){}}),1200)}
  };
})();

/* ---- 화면 효과: 붉은 번쩍임, 흔들림, 정전 깜빡임. '동작 줄이기' 설정이면 끔 ---- */
const FX=(()=>{
  let scareT=null, beatT=null;
  const reduce=()=>window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  function flash(){const f=$('#fx-flash');if(!f)return;f.classList.add('on');setTimeout(()=>f.classList.remove('on'),170)}
  function shake(){if(reduce())return;const b=document.body;b.classList.remove('shake');void b.offsetWidth;b.classList.add('shake');setTimeout(()=>b.classList.remove('shake'),500)}
  function blackout(){if(reduce())return;const b=document.body;b.classList.add('blackout');setTimeout(()=>b.classList.remove('blackout'),120);
    setTimeout(()=>{b.classList.add('blackout');setTimeout(()=>b.classList.remove('blackout'),70)},230)}
  function loop(){clearTimeout(scareT);scareT=setTimeout(()=>{const r=Math.random();
    if(r<.4){if(!GAME.kid)blackout();SND.whisper()}else if(r<.75)SND.steps();else SND.whisper();loop()},25000+Math.random()*25000)}
  return {
    enter(){loop()},
    leave(){clearTimeout(scareT);clearInterval(beatT);beatT=null;SND.stopAmb();document.body.classList.remove('dawn','shake','blackout')},
    wrong(ms){if(!GAME.kid)flash();shake();SND.sting();clearInterval(beatT);let n=0;const k=Math.max(1,Math.floor(ms/900));
      beatT=setInterval(()=>{SND.beat();if(++n>=k){clearInterval(beatT);beatT=null}},900)},
    unlock(){clearInterval(beatT);beatT=null;SND.creak();SND.chime()},
    escape(){clearTimeout(scareT);document.body.classList.add('dawn');SND.escape()}
  };
})();

/* 필름 잡음: 작은 무늬를 한 번만 만들어 배경으로 깔고 CSS로 흔듦 (휴대폰 부담이 적음) */
(function grain(){try{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');const im=x.createImageData(128,128);
  for(let i=0;i<im.data.length;i+=4){const v=Math.random()*255|0;im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=255}
  x.putImageData(im,0,0);const g=document.getElementById('fx-grain');if(g)g.style.backgroundImage='url('+c.toDataURL()+')'}catch(e){}})();

/* ============================================================
   4. 첫 화면
   ============================================================ */
function viewHome(){
  clearView();
  const qs=new URLSearchParams(location.search);
  if(qs.get('code'))return viewJoin(qs.get('code'));
  app.innerHTML=`${modeBanner()}
  <div class="hero">
    ${SCENES.hero}${GAME.subtitle?`<div class="dim" style="letter-spacing:.2em;margin-bottom:4px">${GAME.subtitle}</div>`:''}<h1>${GAME.title}</h1>
    <p class="dim">${GAME.intro}</p>
    <div class="choose">
      <button class="btn primary" id="goJoin">학생으로 입장<span style="color:#f0d2c9">수업 코드를 입력합니다</span></button>
      <button class="btn" id="goTeach">교사 관제실<span>수업을 만들거나 다시 들어갑니다</span></button>
    </div>
    <button class="btn block" id="goPr" style="margin-top:12px">테스트 모드 (교사용)<span class="small dim" style="font-weight:400;margin-left:6px">비밀번호가 필요합니다</span></button>
  </div>`;
  $('#goPr').onclick=viewPracticeGate;
  $('#goJoin').onclick=()=>viewJoin('');
  $('#goTeach').onclick=viewTeacherEntry;
}

/* ============================================================
   5. 교사 — 수업 만들기 / 다시 들어가기  (개인전)
   ============================================================ */
function viewTeacherEntry(){
  clearView();
  let tab='new';
  const render=()=>{
    app.innerHTML=`${modeBanner()}
    <div class="row" style="justify-content:space-between"><h2>교사 관제실</h2><button class="btn" id="back">처음으로</button></div>
    <div class="seg" style="margin-top:14px">
      <button data-t="new" aria-pressed="${tab==='new'}">새 수업 만들기</button>
      <button data-t="re" aria-pressed="${tab==='re'}">관제실 다시 들어가기</button>
    </div>
    <div class="sheet"><div class="in stack">
    ${tab==='new'?`
      <div><label class="f" for="nm">수업 이름</label><input class="t" id="nm" placeholder="예: ${GAME.roomExample||'2학년 3반'}" maxlength="30"></div>
      <div><label class="f" for="pw">교사 비밀번호</label><input class="t" id="pw" type="password" placeholder="관제실에 다시 들어올 때 씁니다" maxlength="30"></div>
      <p class="dim small">학생 한 명 한 명이 각자 도전하는 개인전입니다.</p>
      <div class="err" id="er"></div>
      <button class="btn primary block" id="mk">수업 대기실 만들기</button>`:`
      <div><label class="f" for="cd">수업 코드</label><input class="t num" id="cd" inputmode="numeric" maxlength="4" placeholder="4자리"></div>
      <div><label class="f" for="pw2">교사 비밀번호</label><input class="t" id="pw2" type="password"></div>
      <div class="err" id="er"></div>
      <button class="btn primary block" id="re">관제실 들어가기</button>`}
    </div></div>`;
    $('#back').onclick=viewHome;
    app.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;render()});
    if(tab==='new'){
      $('#mk').onclick=async()=>{
        const nm=$('#nm').value.trim(), pw=$('#pw').value;
        if(!nm)return $('#er').textContent='수업 이름을 적어 주세요.';
        if(pw.length<4)return $('#er').textContent='비밀번호는 4자 이상으로 정해 주세요.';
        $('#mk').disabled=true;
        let code;for(let i=0;i<20;i++){code=String(1000+Math.floor(Math.random()*9000));if(!(await S.once('rooms/'+code+'/meta')))break}
        await S.set('rooms/'+code,{meta:{name:nm,game:GAME_ID,mode:'solo',pw:await hash(pw),state:'lobby',createdAt:S.now()}});
        sessionStorage.setItem('teach_'+code,'1');
        viewDash(code);
      };
    }else{
      $('#re').onclick=async()=>{
        const cd=$('#cd').value.trim(), pw=$('#pw2').value;
        const meta=await S.once('rooms/'+cd+'/meta');
        if(!meta||(meta.game||'dameum')!==GAME_ID)return $('#er').textContent='이 게임에서 만든 수업 코드가 아닙니다. 숫자 4자리를 다시 확인하세요.';
        if(meta.pw!==await hash(pw))return $('#er').textContent='비밀번호가 맞지 않습니다.';
        sessionStorage.setItem('teach_'+cd,'1');viewDash(cd);
      };
    }
  };
  render();
}

/* ============================================================
   6. 교사 — 관제실  (문별 분포 + 학생 표)
   ============================================================ */
function viewDash(code){
  clearView();
  if(!sessionStorage.getItem('teach_'+code))return viewTeacherEntry();
  let room=null;
  const joinUrl=location.origin+location.pathname+'?code='+code;
  const R='rooms/'+code;
  function render(){
    if(!room)return;
    const m=room.meta, now=S.now(), ps=Object.entries(room.players||{});
    const total=ps.length, rh=m.hints||{};
    const dist=Array.from({length:MAIN+1},()=>0);ps.forEach(([,p])=>{dist[Math.min(p.stage||0,MAIN)]++});
    const rows=ps.slice().sort((a,b)=>((b[1].stage||0)-(a[1].stage||0))||((a[1].escaped??1e15)-(b[1].escaped??1e15))||((a[1].wrong||0)-(b[1].wrong||0))||(a[1].joinedAt-b[1].joinedAt));
    const esc_=ps.filter(([,p])=>p.escaped!=null).sort((a,b)=>a[1].escaped-b[1].escaped).slice(0,10);
    const running=m.state==='running';
    app.innerHTML=`${modeBanner()}
    <div class="dash-head">
      <div>
        <div class="dim small">${esc(m.name)} · 개인전</div>
        <div class="code num">${code}</div>
        <p class="dim small" style="margin-top:6px">학생은 첫 화면에서 이 코드를 입력하거나 QR로 들어옵니다.</p>
        <div class="row" style="margin-top:12px">
          <span class="num" style="font-size:1.6rem;font-weight:700" id="clock">${fmt(elapsedOf(m,now))}</span>
          <span class="dim">접속 ${total}명 · ${m.state==='lobby'?'대기 중':running?'진행 중':m.state==='paused'?'일시정지':'종료'}</span>
        </div>
      </div>
      <div class="qr" id="qr" aria-label="입장 QR"></div>
    </div>
    <div class="row" style="margin-top:14px">
      ${m.state==='lobby'?`<button class="btn primary" id="start" ${total?'':'disabled'}>전체 동시 시작</button>`:''}
      ${running?`<button class="btn" id="pause">일시정지</button>`:''}
      ${m.state==='paused'?`<button class="btn primary" id="resume">다시 시작</button>`:''}
      ${m.state!=='ended'&&m.state!=='lobby'?`<button class="btn danger" id="end">활동 종료</button>`:''}
      <button class="btn" id="out">관제실 나가기</button>
    </div>
    ${m.state!=='lobby'?`<div class="sheet"><div class="in">
      <h3>문별 인원</h3>
      <p class="dim small" style="margin-top:4px">많이 몰린 문에 전체 힌트를 보내면, 그 문에 있는 학생 모두에게 힌트가 뜹니다.</p>
      <div class="dist">${Array.from({length:MAIN},(_,i)=>`<div class="dcol">
          <div class="dn num">${dist[i]}<span>명</span></div><div class="dl">${i<DOORS?(i+1)+'번째 문':'마지막 금고'}</div>
          ${running?`<div class="dh"><button data-rs="${i}" data-l="1" ${(rh[i]||0)>=1?'disabled':''}>전체 힌트 1</button>
          <button data-rs="${i}" data-l="2" ${(rh[i]||0)!==1?'disabled':''}>전체 힌트 2</button></div>`:''}
        </div>`).join('')}
        <div class="dcol done"><div class="dn num">${dist[MAIN]}<span>명</span></div><div class="dl">탈출</div></div>
      </div></div></div>`:''}
    <div class="sheet"><div class="in">
      <h3>학생 ${total}명</h3>
      ${total?`<div class="tw"><table class="ptable"><thead><tr><th>이름</th><th>진행</th><th>틀림</th><th>탈출</th>${running?'<th>개별 힌트</th>':''}</tr></thead><tbody>
      ${rows.map(([id,p])=>{
        const st=p.stage||0, cur=Math.min(st,STAGES.length-1), own=(p.hints||{})[cur]||0, lv=Math.max(own,st<MAIN?(rh[cur]||0):0);
        const locked=p.lockUntil&&p.lockUntil>now, done=st>=STAGES.length;
        return `<tr class="${p.escaped!=null?'esc':''}">
          <td>${esc(p.name)}${p.online===false?' <span class="dim small">(끊김)</span>':''}</td>
          <td><span class="dots sm">${Array.from({length:MAIN},(_,i)=>`<i class="${i<st?'done':i===st?'now':''}"></i>`).join('')}</span>${st>MAIN?' <span class="small" style="color:var(--mint)">도전✓</span>':''}</td>
          <td class="num">${p.wrong||0}${locked?' <span class="small" style="color:var(--coral)">잠김</span>':''}</td>
          <td class="num">${p.escaped!=null?fmt(p.escaped):'<span class="dim">–</span>'}</td>
          ${running?`<td>${done?'':`<span class="ph"><button data-p="${id}" data-l="1" ${lv>=1?'disabled':''} aria-label="${esc(p.name)} 힌트 1">1</button><button data-p="${id}" data-l="2" ${lv!==1?'disabled':''} aria-label="${esc(p.name)} 힌트 2">2</button></span>`}</td>`:''}
        </tr>`}).join('')}
      </tbody></table></div>`:'<p class="dim" style="margin-top:8px">아직 아무도 들어오지 않았습니다.</p>'}
    </div></div>
    ${m.state!=='lobby'?reportHtml(room):''}
    ${esc_.length?`<div class="sheet"><div class="in"><h3>탈출 순위</h3><ol class="rank" style="margin-top:8px">${esc_.map(([,p])=>`<li><span>${esc(p.name)}</span><span class="num">${fmt(p.escaped)}</span></li>`).join('')}</ol></div></div>`:''}`;
    const cv=$('#csv');if(cv)cv.onclick=()=>downloadCsv(room,code);
    const qr=$('#qr');if(window.QRCode&&qr){new QRCode(qr,{text:joinUrl,width:116,height:116,correctLevel:QRCode.CorrectLevel.M})}
    const st=$('#start');if(st)st.onclick=()=>S.update(R+'/meta',{state:'running',startedAt:S.now(),pausedTotal:0});
    const pa=$('#pause');if(pa)pa.onclick=()=>S.update(R+'/meta',{state:'paused',pausedAt:S.now()});
    const rs=$('#resume');if(rs)rs.onclick=()=>S.update(R+'/meta',{state:'running',pausedTotal:(m.pausedTotal||0)+(S.now()-m.pausedAt),pausedAt:null});
    const en=$('#end');if(en)en.onclick=()=>{if(confirm('활동을 끝낼까요? 학생 화면이 모두 종료 화면으로 바뀝니다.'))S.update(R+'/meta',{state:'ended',endedAt:S.now()})};
    $('#out').onclick=()=>{sessionStorage.removeItem('teach_'+code);viewHome()};
    app.querySelectorAll('[data-rs]').forEach(b=>b.onclick=()=>S.set(R+'/meta/hints/'+b.dataset.rs,+b.dataset.l));
    app.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{
      const p=(room.players||{})[b.dataset.p]||{}, cur=Math.min(p.stage||0,STAGES.length-1);
      S.set(R+'/players/'+b.dataset.p+'/hints/'+cur,+b.dataset.l);
    });
  }
  unsubs.push(S.on(R,v=>{room=v;if(!v){app.innerHTML='<p>수업이 사라졌습니다.</p>';return}render()}));
  ticker=setInterval(()=>{const c=$('#clock');if(c&&room)c.textContent=fmt(elapsedOf(room.meta,S.now()))},500);
}

/* ============================================================
   7. 학생 — 입장  (코드 + 이름)
   ============================================================ */
function viewJoin(pre){
  clearView();
  app.innerHTML=`${modeBanner()}
  <div class="row" style="justify-content:space-between"><h2>학생 입장</h2><button class="btn" id="back">처음으로</button></div>
  <div class="sheet"><div class="in stack">
    <div><label class="f" for="cd">수업 코드</label><input class="t num" id="cd" inputmode="numeric" maxlength="4" placeholder="선생님 화면의 숫자 4자리" value="${esc(pre||'')}"></div>
    <div><label class="f" for="nm">이름</label><input class="t" id="nm" maxlength="10" placeholder="예: 김민지"></div>
    <div class="err" id="er"></div>
    <button class="btn primary block" id="go">입장하기</button>
  </div></div>`;
  $('#back').onclick=()=>{history.replaceState(null,'',location.pathname);viewHome()};
  $('#go').onclick=async()=>{
    const cd=$('#cd').value.trim(), nm=$('#nm').value.trim();
    if(cd.length!==4)return $('#er').textContent='수업 코드 4자리를 입력하세요.';
    if(!nm)return $('#er').textContent='이름을 적어 주세요.';
    const meta=await S.once('rooms/'+cd+'/meta');
    if(!meta)return $('#er').textContent='그런 수업이 없습니다. 코드를 다시 확인하세요.';
    if((meta.game||'dameum')!==GAME_ID)return $('#er').textContent='다른 게임의 수업 코드입니다. 선생님이 알려 준 주소로 들어왔는지 확인하세요.';
    if(meta.state==='ended')return $('#er').textContent='이미 끝난 수업입니다.';
    let pid=sessionStorage.getItem('pid_'+cd);
    if(!pid){pid='p'+Math.random().toString(36).slice(2,10);sessionStorage.setItem('pid_'+cd,pid)}
    const P='rooms/'+cd+'/players/'+pid;
    if(await S.once(P))await S.update(P,{name:nm,online:true});   // 새로고침해도 진행 상황 유지
    else await S.set(P,{name:nm,joinedAt:S.now(),online:true,stage:0,wrong:0,seed:Math.floor(Math.random()*1e9)});
    viewPlay(cd,pid);
  };
}

/* ============================================================
   8. 학생 — 플레이  (단서 5장을 모두 봄)
   ============================================================ */
function viewPlay(code,pid){
  clearView();
  let room=null, lastStage=null, showBonus=false, lastWrong=null;
  const P='rooms/'+code+'/players/'+pid;
  const mySeed=()=>((((room&&room.players)||{})[pid])||{}).seed||0;
  FX.enter(); document.addEventListener('pointerdown',()=>SND.start(),{once:true});
  S.presence(P);
  function unlockFx(stageIdx){
    const s=stageOf(stageIdx,mySeed());
    layer.innerHTML=`<div class="unlock" role="status"><div class="ring">✓</div><h2>${s.bonus?'도전 방 해결!':s.vault?'금고가 열렸다':'문이 열렸다'}</h2>${s.letter?`<p class="got">글자 획득<b>${s.letter}</b></p>`:''}<p>${s.explain}</p></div>`;
    FX.unlock();
    setTimeout(()=>{layer.innerHTML=''},s.letter||s.vault?4200:3200);
  }
  function render(){
    if(!room)return;
    const m=room.meta, me=(room.players||{})[pid];
    if(!me){app.innerHTML='<p>입장 정보가 없습니다.</p>';return}
    const now=S.now(), stage=me.stage||0, total=Object.keys(room.players||{}).length;
    if(m.state==='lobby'){
      app.innerHTML=`${modeBanner()}<div class="hero"><div class="dim">${esc(m.name)}</div>
        <h1 style="margin-top:6px">잠시 기다리세요</h1><p class="dim">선생님이 신호를 주면 폐교의 불이 꺼집니다. 이어폰이 있다면 소리를 켜고 들어가세요.</p>
        <div class="sheet"><div class="in"><h3>${esc(me.name)}</h3><p class="dim small" style="margin-top:6px">지금 ${total}명이 들어와 있습니다. 문 네 개를 열어 글자를 모으고, 마지막 금고까지 가장 먼저 여는 사람이 1등입니다.</p></div></div></div>`;
      return;
    }
    if(m.state==='ended'){
      app.innerHTML=`<div class="hero"><h1>활동이 끝났습니다</h1><p class="dim" style="margin-top:10px">${me.escaped!=null?esc(me.name)+' 학생은 '+fmt(me.escaped)+' 만에 탈출했습니다.':'마지막으로 도착한 곳: '+(stage>=DOORS?'마지막 금고':(stage+1)+'번째 문')}</p></div>`;
      return;
    }
    if(stage>=MAIN&&(!showBonus||stage>MAIN)){
      const rk=Object.entries(room.players||{}).filter(([,x])=>x.escaped!=null).sort((a,b)=>a[1].escaped-b[1].escaped).findIndex(([id])=>id===pid)+1;
      const bonusDone=stage>MAIN;
      app.innerHTML=`<div class="hero"><div class="dim">${esc(me.name)}</div><h1 style="margin-top:6px">탈출 성공</h1>
        <p class="dim" style="margin-top:8px">정문 자물쇠가 풀리고, 새벽빛이 복도로 쏟아진다.</p>
        <p class="num" style="font-size:2rem;font-weight:700;margin-top:10px">${fmt(me.escaped)}</p>
        <p class="dim">${total}명 중 ${rk}번째로 탈출했습니다.</p>
        ${bonusDone?'<p style="margin-top:14px;color:var(--mint);font-weight:700">도전 방까지 해결했습니다.</p>':
          `<button class="btn primary" style="margin-top:20px" id="bn">도전 방 들어가기</button>`}</div>`;
      const bn=$('#bn');if(bn)bn.onclick=()=>{showBonus=true;render()};
      return;
    }
    const cur=Math.min(stage,STAGES.length-1), s=stageOf(cur,me.seed||0);
    if(location.protocol==='file:')window.__cur=s;   // 내 컴퓨터에서 점검할 때만
    const locked=me.lockUntil&&me.lockUntil>now;
    const hintLv=Math.max((me.hints||{})[cur]||0, s.bonus?0:((m.hints||{})[cur]||0));
    const prev=cur>0&&!s.bonus?stageOf(cur-1,me.seed||0):null;
    app.innerHTML=`${modeBanner()}
    <div class="topbar">
      <span><b>${esc(me.name)}</b></span>
      <span class="dots" aria-label="진행">${Array.from({length:MAIN},(_,i)=>`<i class="${i<stage?'done':i===stage?'now':''}"></i>`).join('')}</span>
      <span class="row" style="gap:8px"><button class="snd" id="snd" aria-label="소리 켜기/끄기">${SND.on?'🔊':'🔇'}</button><span class="num" id="clock">${fmt(elapsedOf(m,now))}</span></span>
    </div>
    ${s.bonus?'':lettersBar(stage)}
    ${s.scene?`<div class="scene" aria-hidden="true">${SCENES[s.scene]}</div>`:''}
    <h2 class="roomtitle">${s.title}</h2>
    <p class="story">${s.story}</p>
    <div class="cards">${s.vault?vaultCards(stage,me.seed||0):s.cards.map(c=>`<div class="clue"><div class="tag">${c.tag}</div><div class="body">${c.body}</div>${c.fig?F[c.fig]:''}</div>`).join('')}</div>
    <div class="lock"><div class="in">
      <div class="q">${s.q}</div>
      ${s.cond?`<label class="f">${s.condLabel}</label><div class="seg" id="cond" style="margin-bottom:12px">${s.condOpts.map(x=>`<button data-c="${x}" aria-pressed="false">${x}</button>`).join('')}</div><label class="f" for="an">${s.numLabel}</label>`:''}
      <div class="ans"><input class="t ${s.vault?'':'num'}" id="an" inputmode="${s.vault?'text':'decimal'}" placeholder="${s.vault?'네 글자':'숫자'+(s.unit?' ('+s.unit+')':'')}" ${locked||m.state!=='running'?'disabled':''}>
      <button class="btn primary" id="ok" ${locked||m.state!=='running'?'disabled':''}>열기</button></div>
      <div class="lockmsg" id="lm">${locked?'틀렸습니다. <span class="num" id="lt"></span>초 뒤에 다시 시도할 수 있어요.':''}</div>
      ${hintLv>=1?`<div class="hint"><b>힌트 1</b> ${s.hints[0]}</div>`:''}
      ${hintLv>=2?`<div class="hint"><b>힌트 2</b> ${s.hints[1]}</div>`:''}
      ${PRACTICE?`<div class="row" style="margin-top:12px;align-items:stretch">${hintLv<2?`<button class="btn" id="selfHint">힌트 ${hintLv+1} 보기</button>`:''}<details class="explain" style="flex:1;margin:0"><summary>정답 확인 (테스트용)</summary><b>${s.vault?s.word:(s.ans.cond?s.ans.cond+', ':'')+s.ans.n+(s.unit||'')}</b></details></div>`:''}
    </div></div>
    ${prev?`<div class="explain">앞 문 ${prev.explain}</div>`:''}`;
    if(m.state==='paused')layer.innerHTML=`<div class="overlay"><div><h2>잠시 멈춤</h2><p class="dim" style="margin-top:8px">선생님 설명을 들어 주세요.</p></div></div>`;
    else if(!layer.querySelector('.unlock'))layer.innerHTML='';
    let cond=null;
    app.querySelectorAll('#cond [data-c]').forEach(b=>b.onclick=()=>{cond=b.dataset.c;app.querySelectorAll('#cond [data-c]').forEach(x=>x.setAttribute('aria-pressed',x===b))});
    const submit=async()=>{
      const raw=$('#an').value, v=parseNum(raw);
      if(s.vault){if(!raw.trim()){$('#lm').textContent='글자를 입력하세요.';return}}
      else if(isNaN(v)){$('#lm').textContent='숫자를 입력하세요.';return}
      if(s.cond&&!cond){$('#lm').textContent=s.condLabel+'을 먼저 고르세요.';return}
      const right=s.vault?raw.replace(/\s/g,'')===s.word:(Math.abs(v-s.ans.n)<1e-9&&(!s.cond||cond===s.ans.cond));
      const t=S.now(), el=elapsedOf(room.meta,t);
      let tk='';   // 어떤 함정에 걸렸는지
      if(!right){const nv=raw.replace(/\s/g,'');
        if(s.cond&&cond!==s.ans.cond&&!isNaN(v)&&Math.abs(v-s.ans.n)<1e-9)tk='cond';
        else{const hit=(s.traps||[]).find(tp=>s.vault?nv===tp.v:Math.abs(v-tp.v)<1e-9);if(hit)tk=hit.id}}
      await S.tx(P,c=>{
        if(!c)return undefined;
        if((c.stage||0)!==cur)return undefined;
        if(c.lockUntil&&c.lockUntil>t)return undefined;
        if(right){c.stage=cur+1;c.solved=c.solved||{};c.solved[cur]=el;if(cur===MAIN-1)c.escaped=el}
        else{c.wrong=(c.wrong||0)+1;c.lockUntil=t+(PRACTICE?3000:LOCK_MS);const w=Array.isArray(c.wlog)?c.wlog:(c.wlog?Object.values(c.wlog):[]);if(w.length<60)w.push({s:cur,v:String(raw).slice(0,20),k:tk,t:el});c.wlog=w}
        return c;
      });
    };
    const ok=$('#ok');if(ok)ok.onclick=submit;
    const an=$('#an');if(an)an.onkeydown=e=>{if(e.key==='Enter')submit()};
    const sh=$('#selfHint');if(sh)sh.onclick=()=>S.set(P+'/hints/'+cur,hintLv+1);
    const sb=$('#snd');if(sb)sb.onclick=e=>{e.stopPropagation();SND.toggle();sb.textContent=SND.on?'🔊':'🔇'};
  }
  unsubs.push(S.on('rooms/'+code,v=>{
    room=v; if(!v){app.innerHTML='<p>수업이 사라졌습니다.</p>';return}
    const me_=((v.players||{})[pid])||{}, st=me_.stage||0, wr=me_.wrong||0;
    if(lastWrong!==null&&wr>lastWrong)FX.wrong(PRACTICE?3000:LOCK_MS);
    lastWrong=wr;
    if(lastStage!==null&&st>lastStage)unlockFx(lastStage);
    if(lastStage!==null&&lastStage<MAIN&&st>=MAIN)FX.escape();
    lastStage=st; render();
  }));
  ticker=setInterval(()=>{
    if(!room)return;
    const c=$('#clock');if(c)c.textContent=fmt(elapsedOf(room.meta,S.now()));
    const me=(room.players||{})[pid];const lt=$('#lt');
    if(me&&me.lockUntil){const left=Math.ceil((me.lockUntil-S.now())/1000);if(lt&&left>0)lt.textContent=left;else if(left<=0&&$('#ok')&&$('#ok').disabled&&room.meta.state==='running')render()}
  },300);
}

/* ============================================================
   8-1. 테스트 모드 — 관제실 없이 학생 화면을 혼자 점검
   수업 서버(Firebase)에는 아무것도 쓰지 않습니다.
   ============================================================ */
/* ---- 오답 분석: 학생마다 숫자가 달라도 '어떤 실수'는 같은 이름으로 모임 ---- */
const wlogOf=p=>Array.isArray(p.wlog)?p.wlog:(p.wlog?Object.values(p.wlog):[]);
function trapName(i,k){if(k==='cond')return '조건 선택 오류';if(!k||k==='etc')return '그 밖의 오답';return ((STAGES[i]||{}).trapNames||{})[k]||k}
function reportHtml(room){
  const per=STAGES.map(()=>({n:0,ppl:new Set(),tr:{}}));
  Object.entries(room.players||{}).forEach(([id,p])=>wlogOf(p).forEach(e=>{const o=per[e.s];if(!o)return;o.n++;o.ppl.add(id);const k=e.k||'etc';o.tr[k]=(o.tr[k]||0)+1}));
  const rows=per.map((o,i)=>!o.n?'':`<tr><td>${esc(STAGES[i].title)}</td><td class="num">${o.n}회 · ${o.ppl.size}명</td><td>${Object.entries(o.tr).sort((a,b)=>b[1]-a[1]).map(([k,c])=>`<span class="trap${k==='etc'?' etc':''}">${esc(trapName(i,k))} ${c}</span>`).join(' ')}</td></tr>`).join('');
  return `<div class="sheet"><div class="in"><div class="row" style="justify-content:space-between"><h3>오답 분석</h3><button class="btn" id="csv" style="min-height:38px;padding:6px 12px">결과 내려받기 (엑셀·구글 시트)</button></div>
    <p class="dim small" style="margin-top:4px">학생마다 숫자가 달라도, 어떤 실수를 했는지는 같은 이름으로 모입니다.</p>
    ${rows?`<div class="tw"><table class="ptable rtable"><thead><tr><th>문</th><th>오답</th><th>걸린 함정</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="dim" style="margin-top:8px">아직 오답이 없습니다.</p>'}</div></div>`;
}
function downloadCsv(room,code){
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const head=['이름','도착한 곳','탈출 시간','도전 방','총 오답'].concat(STAGES.map((s,i)=>(i+1)+'. '+s.title.split('·')[0].trim()+' 오답'),['걸린 함정']);
  const lines=[head.map(q).join(',')];
  Object.values(room.players||{}).sort((a,b)=>((b.stage||0)-(a.stage||0))||((a.escaped??1e15)-(b.escaped??1e15))).forEach(p=>{
    const w=wlogOf(p), st=p.stage||0;
    const where=st>MAIN?'도전 방 완료':st>=MAIN?'탈출':st>=DOORS?'마지막 금고':(st+1)+'번째 문';
    lines.push([p.name,where,p.escaped!=null?fmt(p.escaped):'',st>MAIN?'O':'',p.wrong||0].concat(STAGES.map((_,i)=>w.filter(e=>e.s===i).length),[w.filter(e=>e.k).map(e=>(e.s+1)+'번 '+trapName(e.s,e.k)).join(' / ')]).map(q).join(','));
  });
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(room.meta.name||'수업')+'_'+code+'_결과.csv';
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},800);
}
function lettersBar(stage){
  return `<div class="lbar" aria-label="모은 글자">${STAGES.slice(0,DOORS).map((d,i)=>`<i class="${stage>i?'got':''}">${stage>i?d.letter:''}</i>`).join('')}<span class="small dim">모은 글자</span></div>`;
}
function vaultCards(stage,seed){
  const tiles=STAGES.slice(0,DOORS).map((_,i)=>stageOf(i,seed)).map((d,i)=>`<div class="tile"><b>${stage>i?d.letter:'?'}</b><span>${i+1}번째 문<br>열쇠 ${d.ans.n}</span></div>`).join('');
  return `<div class="clue"><div class="tag">모은 글자 (얻은 순서)</div><div class="tiles">${tiles}</div></div>`+
         `<div class="clue"><div class="tag">${GAME.vaultNote||'경비 아저씨의 마지막 쪽지'}</div><div class="body">${STAGES[DOORS].clue}</div></div>`;
}
const PRACTICE_PW='7abc5c2e49190f6b9e1a9c6248dc6e482be784f62a73d05cc8d4641350553db2';   // 테스트 비밀번호의 지문 (원문은 코드에 없음)
function viewPracticeGate(){
  clearView();
  app.innerHTML=`<div class="row" style="justify-content:space-between"><h2>테스트 모드</h2><button class="btn" id="back">처음으로</button></div>
  <div class="sheet"><div class="in stack">
    <p class="dim">교사용 점검 화면입니다. 관제실 없이 학생 화면을 혼자 풀어 볼 수 있고, 기록은 남지 않습니다.</p>
    <div><label class="f" for="tp">테스트 비밀번호</label><input class="t num" id="tp" type="password" inputmode="numeric" maxlength="10"></div>
    <div class="err" id="er"></div>
    <button class="btn primary block" id="go">테스트 시작</button>
  </div></div>`;
  $('#back').onclick=viewHome;
  const go=async()=>{if(await hash($('#tp').value)===PRACTICE_PW)startPractice();else{$('#er').textContent='비밀번호가 맞지 않습니다.';$('#tp').value='';$('#tp').focus()}};
  $('#go').onclick=go;$('#tp').onkeydown=e=>{if(e.key==='Enter')go()};$('#tp').focus();
}
let PRACTICE=false, S_MAIN=null;
async function startPractice(){
  clearView();
  S_MAIN=S; PRACTICE=true;
  const key='escape_practice_'+GAME_ID;
  localStorage.removeItem(key);
  S=makeLocalStore(key);
  const code='0000', pid='tester';
  await S.set('rooms/'+code,{meta:{name:'테스트 모드',game:GAME_ID,mode:'solo',state:'running',startedAt:S.now(),pausedTotal:0},
    players:{[pid]:{name:'테스트',joinedAt:S.now(),online:true,stage:0,wrong:0,seed:Math.floor(Math.random()*1e9)}}});
  viewPlay(code,pid);
}
function exitPractice(){
  clearView(); PRACTICE=false;
  localStorage.removeItem('escape_practice_'+GAME_ID);
  if(S_MAIN)S=S_MAIN;
  viewHome();
}

/* ============================================================
   9. 시작
   ============================================================ */
(async()=>{
  try{ S=FIREBASE_CONFIG?await makeFirebaseStore(FIREBASE_CONFIG):makeLocalStore(); }
  catch(e){ app.innerHTML='<div class="banner">Firebase에 연결하지 못했습니다. 인터넷 연결과 설정값을 확인하세요. 로컬 테스트 모드로 전환합니다.</div>'; S=makeLocalStore(); }
  viewHome();
})();
