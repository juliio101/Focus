import { useState, useRef, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS     = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DAY_KEYS = ["mon","tue","wed","thu","fri","sat","sun"];
const COLORS   = ["#c8ff57","#60a5fa","#fb923c","#c084fc","#f472b6","#34d399","#fbbf24"];
const ICONS    = ["🏠","💼","🎯","🛒","📚","🏋️","🎮","🧘","🌿","✈️"];
const ICON_OPTIONS = [
  "👤","👥","🏢","💼","🤝","🏆","⭐","💡","🎯","🔑",
  "🏠","🛒","🍕","☕","🚗","✈️","🌍","❤️","⚡","🔥",
  "💰","📊","📋","📱","💻","🎨","🎵","🏋️","🧘","🌿",
  "🐶","🦁","🌈","🎪","🎮","📚","🏗️","⚕️","🌟","🎁",
];
const HR_PRESET      = [4,6,7,8,9,10,12];
const REMIND_OPTS    = [1,3,7,14,30];
const LOCK_DURATIONS = [5,10,15,20,25,30];

// ─── Date helpers ─────────────────────────────────────────────────────────────
const dStr = (d=new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const todayIdx  = () => (new Date().getDay()+6)%7;
const todayKey  = () => DAY_KEYS[todayIdx()];
const dateForDK = dk => {
  const now=new Date(); now.setHours(0,0,0,0);
  const d=new Date(now); d.setDate(now.getDate()+DAY_KEYS.indexOf(dk)-todayIdx());
  return dStr(d);
};
const calcStreak = (dates=[]) => {
  const set=new Set(dates), t=dStr(), y=dStr(new Date(Date.now()-864e5));
  if(!set.has(t)&&!set.has(y)) return 0;
  let s=0, cur=new Date(set.has(t)?t:y);
  while(set.has(dStr(cur))){ s++; cur.setDate(cur.getDate()-1); }
  return s;
};

const fmtTimer = secs => {
  const s=Math.floor(Math.max(0,secs));
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
  if(h>0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
};

const fmtHrs = h => {
  if(h<=0) return "—";
  if(h<1/60) return "—";
  if(h<1) return `${Math.round(h*60)} min`;
  return h===Math.floor(h)?`${h} hrs`:`${h.toFixed(1)} hrs`;
};
const fmtHrsBudget = h => h===Math.floor(h)?`${h} hrs`:`${h.toFixed(1)} hrs`;

const getLiveSecs = task => {
  const base = task.timerSeconds ?? 0;
  if(!task.timerRunning || !task.timerStartedAt) return base;
  return base + (Date.now()-task.timerStartedAt)/1000;
};

// ─── Audio ────────────────────────────────────────────────────────────────────
let _ac=null;
const getAC=()=>{ if(!_ac) _ac=new(window.AudioContext||window.webkitAudioContext)(); if(_ac.state==="suspended") _ac.resume(); return _ac; };
const tone=(freq,vol=0.1,dur=0.08)=>{ try{ const c=getAC(),o=c.createOscillator(),g=c.createGain(); o.connect(g);g.connect(c.destination); o.frequency.value=freq;g.gain.setValueAtTime(vol,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+dur); o.start();o.stop(c.currentTime+dur); }catch(e){} };
const playCheck = () => tone(880,0.1,0.07);
const playStart = () => { tone(440,0.08,0.06); setTimeout(()=>tone(660,0.08,0.06),80); };
const playPause = () => tone(330,0.06,0.08);
const playWin   = () => [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,0.1,0.2),i*100));

// ─── Confetti ─────────────────────────────────────────────────────────────────
function Confetti({ onDone }) {
  useEffect(()=>{ const t=setTimeout(onDone,2400); return()=>clearTimeout(t); },[]);
  const ps=Array.from({length:52},(_,i)=>({
    id:i, left:Math.random()*100, color:COLORS[i%COLORS.length],
    delay:Math.random()*.5, w:Math.random()*10+5, h:Math.random()*6+4,
    rot:Math.random()*720*(Math.random()>.5?1:-1), drift:(Math.random()-.5)*200, dur:Math.random()*.9+1
  }));
  return(
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:9999,overflow:"hidden"}}>
      <style>{`@keyframes cf{from{opacity:1;transform:translateY(0) rotate(0)}to{opacity:0;transform:translateY(110vh) rotate(var(--r)) translateX(var(--d))}}`}</style>
      {ps.map(p=>(
        <div key={p.id} style={{position:"absolute",left:`${p.left}%`,top:0,width:p.w,height:p.h,
          background:p.color,borderRadius:2,"--r":`${p.rot}deg`,"--d":`${p.drift}px`,
          animation:`cf ${p.dur}s ${p.delay}s ease-in forwards`}}/>
      ))}
    </div>
  );
}

// ─── SVG Ring ─────────────────────────────────────────────────────────────────
function Ring({pct=0,color="#c8ff57",size=96,stroke=9,label,val,sub,onClick}){
  const r=(size-stroke)/2, circ=2*Math.PI*r, offset=circ*(1-Math.min(pct,100)/100);
  return(
    <div onClick={onClick} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7,cursor:onClick?"pointer":"default"}}>
      <div style={{position:"relative",width:size,height:size}}>
        <svg width={size} height={size} style={{transform:"rotate(-90deg)",display:"block"}}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1c1c1c" strokeWidth={stroke}/>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
            style={{transition:"stroke-dashoffset .7s cubic-bezier(.34,1.56,.64,1)",filter:`drop-shadow(0 0 6px ${color}50)`}}/>
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1}}>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:"1rem",color,lineHeight:1}}>{val}</span>
          {sub&&<span style={{fontSize:".55rem",color:"#4a4a4a"}}>{sub}</span>}
        </div>
      </div>
      <span style={{fontSize:".65rem",color:"#555",textTransform:"uppercase",letterSpacing:".1em",textAlign:"center",lineHeight:1.4}}>{label}</span>
    </div>
  );
}

// ─── Initial data ─────────────────────────────────────────────────────────────
const INIT_FOLDERS=[
  {id:1,name:"House Chores",color:"#c8ff57",icon:"🏠"},
  {id:2,name:"Work",color:"#60a5fa",icon:"💼"},
];
const INIT_TASKS=[
  {id:1,text:"Vacuum living room",folderId:1,recurring:false,day:todayKey(),done:false,timerSeconds:0,timerRunning:false,timerStartedAt:null},
  {id:2,text:"Do the dishes",folderId:1,recurring:true,recurringDays:["mon","wed","fri"],doneOn:[],timerSeconds:0,timerRunning:false,timerStartedAt:null},
  {id:3,text:"Check emails",folderId:2,recurring:true,recurringDays:["mon","tue","wed","thu","fri"],doneOn:[],timerSeconds:0,timerRunning:false,timerStartedAt:null},
];
const INIT_DATA={folders:INIT_FOLDERS,tasks:INIT_TASKS,completedDates:[],bestStreak:0,dayHours:{}};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const css=`
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500;700&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{height:100%}
body{background:#050505;font-family:'DM Sans',sans-serif;color:#ececec;-webkit-font-smoothing:antialiased;min-height:100vh;font-size:15px;line-height:1.5}
input,button,select,textarea{font-family:'DM Sans',sans-serif !important}
:root{
  --bg:#050505; --s:#0d0d0d; --s2:#141414; --float:#181818;
  --b:#202020; --b2:#2c2c2c; --b3:#383838;
  --mu:#606060; --mu2:#484848;
  --tx:#ececec; --tx2:#999;
  --ac:#c8ff57; --ac2:#7c6aff; --orange:#ff7043; --red:#ef4444;
  --r:14px; --r2:20px;
}

::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--b2);border-radius:99px}

.login{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
  background:radial-gradient(ellipse at 50% 0%, #c8ff5708 0%, var(--bg) 60%)}
.login-card{background:var(--s);border:1px solid var(--b2);border-radius:24px;padding:52px 44px;max-width:420px;width:100%;text-align:center;
  box-shadow:0 40px 80px #000a,0 0 0 1px #ffffff06}
.login-logo{font-family:'Syne',sans-serif;font-weight:800;font-size:2.2rem;color:var(--tx);letter-spacing:-1px;margin-bottom:10px;line-height:1}
.login-logo span{color:var(--ac)}
.login-tagline{font-size:.9rem;color:var(--mu);margin-bottom:44px;line-height:1.7;font-weight:400}
.google-btn{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;background:#fff;color:#111;border:none;border-radius:14px;padding:16px 20px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:1rem;cursor:pointer;transition:transform .15s,box-shadow .2s;box-shadow:0 2px 12px #0005}
.google-btn:hover{transform:translateY(-2px);box-shadow:0 8px 28px #0008}
.google-btn svg{width:20px;height:20px;flex-shrink:0}
.login-note{font-size:.78rem;color:var(--mu2);margin-top:22px;line-height:1.7}

.app{min-height:100vh;background:var(--bg)}
.nav{display:flex;align-items:center;justify-content:space-between;padding:20px 28px 0;max-width:1160px;margin:0 auto}
.logo{font-family:'Syne',sans-serif;font-weight:800;font-size:1rem;color:var(--tx);letter-spacing:-.5px}
.logo em{color:var(--ac);font-style:normal}
.nav-right{display:flex;align-items:center;gap:12px}
.back-btn{background:none;border:1px solid var(--b2);color:var(--tx2);border-radius:99px;padding:7px 18px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:.8rem;font-weight:600;transition:all .15s;letter-spacing:.01em}
.back-btn:hover{color:var(--tx);border-color:var(--b3);background:var(--s)}
.signout-btn{background:none;border:none;color:var(--mu);cursor:pointer;font-size:.8rem;font-family:'DM Sans',sans-serif;font-weight:500;transition:color .15s;padding:5px 8px;border-radius:8px}
.signout-btn:hover{color:var(--tx2);background:var(--s)}
.avatar{width:32px;height:32px;border-radius:50%;border:2px solid var(--b2);object-fit:cover}

.home-layout{display:grid;grid-template-columns:1fr;gap:24px;max-width:1160px;margin:0 auto;padding:28px 24px 100px}
@media(min-width:900px){.home-layout{grid-template-columns:1fr 280px;align-items:start}}
.stats-col{display:flex;flex-direction:column;gap:12px}
@media(min-width:900px){.stats-col{position:sticky;top:24px}}

.stat-card{background:var(--s);border:1px solid var(--b);border-radius:var(--r);padding:22px}
.stat-card-title{font-size:.65rem;color:var(--mu);text-transform:uppercase;letter-spacing:.14em;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px}
.stat-big{font-family:'Syne',sans-serif;font-weight:800;font-size:2.4rem;line-height:1;margin-bottom:5px;letter-spacing:-1px}
.stat-desc{font-size:.78rem;color:var(--mu);line-height:1.5;font-weight:500}
.stat-divider{height:1px;background:var(--b);margin:14px 0}
.stat-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0}
.stat-row-lbl{font-size:.82rem;color:var(--tx2);font-weight:500}
.stat-row-val{font-family:'Syne',sans-serif;font-weight:700;font-size:.95rem}

.rings-card{background:var(--s);border:1px solid var(--b);border-radius:var(--r2);padding:28px 24px 52px;margin-bottom:24px;display:flex;align-items:center;gap:0;position:relative;overflow:hidden}
.rings-card::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% -20%,#c8ff5709 0%,transparent 60%);pointer-events:none}
.ring-stat{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px}
.ring-stat-val{font-family:'Syne',sans-serif;font-weight:800;font-size:1.8rem;color:var(--tx);line-height:1;letter-spacing:-1px}
.ring-stat-lbl{font-size:.62rem;color:var(--mu);text-transform:uppercase;letter-spacing:.12em;font-weight:700;text-align:center}
.ring-stat-sub{font-size:.7rem;color:var(--mu2);font-weight:500}
.ring-hero{flex:1.4;display:flex;flex-direction:column;align-items:center;gap:8px}
.ring-div-v{width:1px;height:60px;background:var(--b);flex-shrink:0}
.overload{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);background:var(--red);color:#fff;font-size:.65rem;padding:4px 12px;border-radius:99px;white-space:nowrap;font-weight:700}

.rings-hours-bar{position:absolute;bottom:0;left:0;right:0;padding:0 24px 16px}
.rings-hours-labels{display:flex;justify-content:space-between;margin-bottom:5px}
.rings-hours-lbl{font-size:.6rem;color:var(--mu);font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.rings-hours-bg{width:100%;height:4px;background:var(--b2);border-radius:99px;overflow:hidden}
.rings-hours-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#fb923c,#fbbf24);transition:width .8s cubic-bezier(.34,1.56,.64,1)}

.page{max-width:760px;margin:0 auto;padding:28px 24px 100px}

.streak{display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,#c8ff5710,#c8ff5705);border:1px solid #c8ff5725;border-radius:16px;padding:16px 20px;margin-bottom:24px}
.streak-num{font-family:'Syne',sans-serif;font-weight:800;font-size:1.4rem;color:var(--ac);line-height:1}
.streak-lbl{font-size:.76rem;color:var(--mu);margin-top:3px;font-weight:500}

.page-title{font-family:'Syne',sans-serif;font-size:clamp(1.8rem,5vw,2.8rem);font-weight:800;letter-spacing:-1px;color:var(--tx);margin-bottom:6px;line-height:1.1}
.page-sub{font-size:.82rem;color:var(--mu);margin-bottom:24px;font-weight:500}

.day-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:32px}
.day-card{background:var(--s);border:1px solid var(--b);border-radius:12px;padding:12px 4px 10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;transition:all .2s}
.day-card:hover{border-color:var(--b2);transform:translateY(-3px);box-shadow:0 8px 20px #0003}
.day-card.today{border-color:var(--ac);background:linear-gradient(160deg,#c8ff5710,var(--s))}
.day-lbl{font-family:'Syne',sans-serif;font-size:.64rem;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:.05em}
.day-card.today .day-lbl{color:var(--ac)}
.day-bar{width:80%;height:3px;background:var(--b2);border-radius:99px;overflow:hidden}
.day-bar-f{height:100%;border-radius:99px;transition:width .5s ease}
.day-cnt{font-size:.62rem;color:var(--tx2);font-weight:600;font-family:'DM Mono',monospace}

.sec-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.sec-title{font-family:'Syne',sans-serif;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:var(--mu)}
.ghost-btn{background:none;border:1px solid var(--b2);color:var(--tx2);border-radius:10px;padding:7px 16px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:.82rem;font-weight:600;transition:all .15s}
.ghost-btn:hover{color:var(--tx);border-color:var(--b3);background:var(--s)}

.folders-list{display:flex;flex-direction:column;gap:8px}
.folder-row{background:var(--s);border:1px solid var(--b);border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:13px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden}
.folder-row::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--fc);border-radius:3px 0 0 3px}
.folder-row:hover{border-color:var(--b2);transform:translateX(4px);box-shadow:0 4px 20px #0003}
.folder-row-icon{font-size:1.3rem;flex-shrink:0;width:28px;text-align:center}
.folder-row-main{flex:1;min-width:0;padding-left:2px}
.folder-row-name{font-family:'Syne',sans-serif;font-weight:700;font-size:.9rem;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px}
.folder-row-bar-bg{width:100%;height:3px;background:var(--b2);border-radius:99px;overflow:hidden}
.folder-row-bar-f{height:100%;border-radius:99px;transition:width .6s cubic-bezier(.34,1.56,.64,1)}
.folder-row-stats{display:flex;gap:16px;align-items:center;flex-shrink:0}
.f-stat{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:40px}
.f-stat-val{font-family:'DM Mono',monospace;font-weight:700;font-size:.82rem;line-height:1;letter-spacing:.01em}
.f-stat-lbl{font-size:.56rem;color:var(--mu);text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;font-weight:600}
.folder-row-arrow{color:var(--mu);font-size:.9rem;flex-shrink:0;transition:all .2s;opacity:.5}
.folder-row:hover .folder-row-arrow{opacity:1;color:var(--tx2);transform:translateX(2px)}

.view-hdr{margin-bottom:22px}
.view-title{font-family:'Syne',sans-serif;font-size:clamp(1.5rem,4vw,2.2rem);font-weight:800;letter-spacing:-.8px;color:var(--tx);margin-bottom:4px;line-height:1.1}
.view-sub{font-size:.82rem;color:var(--mu);font-weight:500}

.hours-row{display:flex;gap:10px;margin-bottom:20px}
.h-chip{flex:1;background:var(--s);border:1px solid var(--b);border-radius:14px;padding:14px 16px;cursor:default;transition:all .15s}
.h-chip.clickable{cursor:pointer}
.h-chip.clickable:hover{border-color:var(--ac);background:linear-gradient(135deg,#c8ff5708,var(--s))}
.h-val{font-family:'DM Mono',monospace;font-weight:700;font-size:1rem;color:var(--tx);letter-spacing:.02em}
.h-lbl{font-size:.65rem;color:var(--mu);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:.06em}

.time-progress-card{background:var(--s);border:1px solid var(--b);border-radius:var(--r);padding:20px 22px;margin-bottom:20px}
.time-progress-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px}
.time-progress-worked{font-family:'Syne',sans-serif;font-weight:800;font-size:1.6rem;color:var(--ac);line-height:1;letter-spacing:-1px}
.time-progress-goal{font-size:.75rem;color:var(--mu);font-weight:500;text-align:right;margin-top:2px}
.time-win-msg{font-size:.75rem;color:var(--ac);font-weight:600;margin-top:5px;animation:fadeSlideUp .3s ease}
@keyframes fadeSlideUp{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.time-progress-bar-bg{width:100%;height:10px;background:var(--b2);border-radius:99px;overflow:hidden;margin-bottom:10px;position:relative}
.time-progress-bar-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#c8ff57,#a8e040);transition:width .9s cubic-bezier(.34,1.56,.64,1);position:relative}
.time-progress-bar-fill::after{content:'';position:absolute;right:-1px;top:50%;transform:translateY(-50%);width:14px;height:14px;background:#c8ff57;border-radius:50%;box-shadow:0 0 12px #c8ff57;opacity:1}
.time-progress-bar-fill.zero::after{display:none}
.time-progress-milestones{display:flex;justify-content:space-between}
.time-milestone{font-size:.62rem;color:var(--mu);font-weight:600;font-family:'DM Mono',monospace;transition:color .3s}
.time-milestone.hit{color:var(--ac)}

.big-prog{background:var(--s);border:1px solid var(--b);border-radius:var(--r);padding:22px;margin-bottom:20px}
.big-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}
.big-frac{font-family:'Syne',sans-serif;font-weight:800;font-size:2rem;color:var(--tx);letter-spacing:-1px}
.big-frac .d{color:var(--mu);font-size:1.2rem;font-weight:700}
.big-pct{font-size:.85rem;font-weight:700}
.big-bar{height:8px;background:var(--b2);border-radius:99px;overflow:hidden}
.big-fill{height:100%;border-radius:99px;transition:width .6s cubic-bezier(.34,1.56,.64,1)}
.all-done{text-align:center;font-size:.75rem;color:var(--ac);text-transform:uppercase;letter-spacing:.1em;margin-top:10px;font-weight:700}

.task-grp{margin-bottom:22px}
.grp-hdr{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.grp-lbl{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em}
.rec-badge{font-size:.62rem;background:#ffffff08;border:1px solid #ffffff10;border-radius:5px;padding:2px 7px;color:var(--tx2);font-weight:600}

.task-row{background:var(--s);border:1px solid var(--b);border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:11px;cursor:pointer;transition:all .2s;animation:slideIn .25s cubic-bezier(.34,1.56,.64,1);margin-bottom:8px;user-select:none}
@keyframes slideIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
.task-row:hover{border-color:var(--b2);transform:translateY(-2px);box-shadow:0 6px 20px #0004}
.task-row.done{opacity:.32}
.task-row.done .task-txt{text-decoration:line-through;color:var(--mu)}
.task-row.has-timer{border-color:#c8ff5725;background:linear-gradient(135deg,#c8ff5705,var(--s))}
.task-row.overdue{border-color:#ef444428;background:linear-gradient(135deg,#ef44440a,var(--s))}
.task-status{width:20px;height:20px;border-radius:50%;border:2px solid var(--b2);flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .25s}
.task-row.done .task-status{background:var(--rc,var(--ac));border-color:var(--rc,var(--ac));transform:scale(1.1)}
.task-status-v{font-size:.58rem;color:#000;display:none;font-weight:900}
.task-row.done .task-status-v{display:block}
.task-txt{flex:1;font-size:.9rem;color:var(--tx);line-height:1.45;font-weight:500}
.task-row.done .task-txt{font-weight:400}
.task-timer-badge{font-family:'DM Mono',monospace;font-weight:700;font-size:.75rem;color:var(--ac);background:#c8ff5712;border:1px solid #c8ff5728;padding:3px 9px;border-radius:99px;flex-shrink:0;white-space:nowrap;letter-spacing:.02em}
.task-running-dot{width:7px;height:7px;border-radius:50%;background:var(--ac);flex-shrink:0;animation:dotPulse 1.2s ease-in-out infinite}
@keyframes dotPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.5);opacity:.3}}
.rec-dot{width:5px;height:5px;border-radius:50%;background:var(--rc,var(--ac));flex-shrink:0;opacity:.5}
.task-reminder-icon{font-size:.75rem;flex-shrink:0}
.task-arrow{font-size:.85rem;color:var(--mu);flex-shrink:0;transition:all .2s;opacity:.5}
.task-row:hover .task-arrow{opacity:1;color:var(--tx2);transform:translateX(2px)}
.del-btn{background:none;border:none;color:var(--b2);cursor:pointer;font-size:1.1rem;padding:3px 5px;border-radius:7px;opacity:0;transition:all .15s;flex-shrink:0;line-height:1}
.task-row:hover .del-btn{opacity:1}
.del-btn:hover{color:var(--red);background:#ef444415}

.task-detail{max-width:600px;margin:0 auto;padding:28px 24px 100px;text-align:center}
.task-detail-folder{font-size:.7rem;color:var(--mu);text-transform:uppercase;letter-spacing:.14em;font-weight:700;margin-bottom:14px;display:flex;align-items:center;justify-content:center;gap:7px}
.task-detail-name{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(1.5rem,5vw,2.2rem);color:var(--tx);letter-spacing:-.5px;line-height:1.2;margin-bottom:28px}
.task-detail-name.done{text-decoration:line-through;color:var(--mu)}
.task-done-badge{display:inline-flex;align-items:center;gap:7px;background:#34d39918;border:1px solid #34d39935;color:#34d399;border-radius:99px;padding:7px 18px;font-size:.8rem;font-weight:700;margin-bottom:24px;letter-spacing:.03em}

.timer-card{background:var(--s);border:1px solid var(--b);border-radius:24px;padding:40px 28px 32px;margin-bottom:20px;position:relative;overflow:hidden;transition:all .4s}
.timer-card::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,#c8ff5706 0%,transparent 60%);transition:opacity .4s}
.timer-card.running{border-color:#c8ff5730;background:linear-gradient(160deg,#c8ff570a,var(--s) 60%)}
.timer-card.running::before{opacity:2}
.timer-digits{font-family:'DM Mono',monospace;font-weight:700;font-size:clamp(4.5rem,14vw,7rem);color:var(--tx);line-height:1;margin-bottom:8px;letter-spacing:-3px;transition:color .4s}
.timer-card.running .timer-digits{color:var(--ac);text-shadow:0 0 60px #c8ff5740}
.timer-status{font-size:.75rem;color:var(--mu);text-transform:uppercase;letter-spacing:.14em;font-weight:700;margin-bottom:28px;transition:color .4s}
.timer-card.running .timer-status{color:#c8ff5780}

.timer-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;border:none;border-radius:99px;padding:16px 40px;font-family:'Syne',sans-serif;font-weight:800;font-size:.95rem;cursor:pointer;transition:all .2s;letter-spacing:.03em}
.timer-btn.start{background:var(--ac);color:#000;box-shadow:0 4px 28px #c8ff5745}
.timer-btn.start:hover{background:#d9ff70;transform:scale(1.06);box-shadow:0 8px 40px #c8ff5760}
.timer-btn.pause{background:var(--s2);color:var(--tx);border:1px solid var(--b2)}
.timer-btn.pause:hover{border-color:var(--b3);background:var(--float)}

.timer-stats{display:flex;gap:10px;margin-top:24px}
.t-stat{flex:1;text-align:center;background:var(--bg);border:1px solid var(--b);border-radius:12px;padding:12px 8px}
.t-stat-val{font-family:'DM Mono',monospace;font-weight:700;font-size:.95rem;color:var(--tx);margin-bottom:4px;letter-spacing:.02em}
.t-stat-lbl{font-size:.6rem;color:var(--mu);font-weight:700;text-transform:uppercase;letter-spacing:.1em}

.detail-actions{display:flex;gap:10px;margin-bottom:14px}
.action-btn{flex:1;border:none;border-radius:14px;padding:15px;font-family:'Syne',sans-serif;font-weight:700;font-size:.88rem;cursor:pointer;transition:all .18s;letter-spacing:.02em}
.action-btn.complete{background:#c8ff5718;color:var(--ac);border:1px solid #c8ff5730}
.action-btn.complete:hover{background:#c8ff5728;border-color:var(--ac);transform:translateY(-1px)}
.action-btn.remind{background:var(--s);color:var(--tx2);border:1px solid var(--b2)}
.action-btn.remind:hover{border-color:var(--b3);color:var(--tx);transform:translateY(-1px)}

.remind-section{background:var(--s);border:1px solid var(--b);border-radius:16px;padding:18px}
.remind-title{font-size:.68rem;color:var(--mu);font-weight:700;text-transform:uppercase;letter-spacing:.12em;margin-bottom:14px}
.remind-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.remind-opt{background:var(--bg);border:1px solid var(--b2);border-radius:10px;padding:11px 6px;cursor:pointer;font-family:'DM Mono',monospace;font-weight:700;font-size:.78rem;color:var(--tx2);transition:all .15s;text-align:center}
.remind-opt:hover{border-color:var(--ac);color:var(--ac);background:#c8ff570a;transform:translateY(-1px)}

.add-area{margin-top:12px}
.add-row{display:flex;gap:8px}
.add-in{flex:1;background:var(--s);border:1px solid var(--b2);border-radius:12px;padding:13px 16px;color:var(--tx);font-family:'DM Sans',sans-serif;font-size:.9rem;outline:none;transition:all .2s;font-weight:500}
.add-in::placeholder{color:var(--mu2)}
.add-in:focus{border-color:var(--ac);background:var(--s2);box-shadow:0 0 0 3px #c8ff5715}
.add-btn{background:var(--ac);color:#000;border:none;border-radius:12px;padding:13px 20px;font-family:'Syne',sans-serif;font-weight:800;font-size:1.2rem;cursor:pointer;flex-shrink:0;transition:all .18s;line-height:1}
.add-btn:hover{background:#d9ff70;transform:scale(1.06);box-shadow:0 4px 20px #c8ff5740}
.add-opts{display:flex;gap:7px;margin-top:9px;flex-wrap:wrap;align-items:center}
.rec-btn{background:none;border:1px solid var(--b2);color:var(--tx2);border-radius:9px;padding:6px 13px;cursor:pointer;font-size:.8rem;font-family:'DM Sans',sans-serif;font-weight:600;transition:all .15s}
.rec-btn:hover{border-color:var(--b3);color:var(--tx);background:var(--s)}
.rec-btn.on{border-color:var(--ac);color:var(--ac);background:#c8ff5710}
.day-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.dc{background:var(--s);border:1px solid var(--b2);border-radius:8px;padding:5px 12px;cursor:pointer;font-size:.72rem;font-family:'Syne',sans-serif;font-weight:700;color:var(--tx2);transition:all .15s}
.dc:hover{border-color:var(--b3);color:var(--tx)}
.dc.sel{background:var(--ac);border-color:var(--ac);color:#000}

.empty{text-align:center;padding:36px 0;color:var(--mu);font-size:.85rem;font-weight:500}

.overlay{position:fixed;inset:0;background:#000d;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn .15s ease;backdrop-filter:blur(4px)}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.modal{background:var(--s2);border:1px solid var(--b2);border-radius:22px;padding:28px;width:100%;max-width:420px;animation:slideUp .2s cubic-bezier(.34,1.56,.64,1);box-shadow:0 40px 80px #000c}
@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.modal-title{font-family:'Syne',sans-serif;font-weight:800;font-size:1.2rem;color:var(--tx);margin-bottom:20px;letter-spacing:-.3px}
.modal-lbl{font-size:.67rem;color:var(--mu);font-weight:700;margin-bottom:9px;text-transform:uppercase;letter-spacing:.1em}
.modal-in{width:100%;background:var(--s);border:1px solid var(--b2);border-radius:11px;padding:13px 15px;color:var(--tx);font-family:'DM Sans',sans-serif;font-size:.92rem;font-weight:500;outline:none;margin-bottom:18px;transition:all .15s}
.modal-in:focus{border-color:var(--ac);box-shadow:0 0 0 3px #c8ff5715}
.swatches{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:20px}
.sw{width:28px;height:28px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:all .18s}
.sw.sel{border-color:#fff;transform:scale(1.25);box-shadow:0 0 12px currentColor}
.modal-btns{display:flex;gap:9px;justify-content:flex-end}
.btn-c{background:none;border:1px solid var(--b2);color:var(--tx2);border-radius:10px;padding:10px 18px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:.82rem;font-weight:600;transition:all .15s}
.btn-c:hover{color:var(--tx);border-color:var(--b3);background:var(--s)}
.btn-ok{background:var(--ac);color:#000;border:none;border-radius:10px;padding:10px 22px;font-family:'Syne',sans-serif;font-weight:700;font-size:.88rem;cursor:pointer;transition:all .15s}
.btn-ok:hover{background:#d9ff70;transform:scale(1.03)}
.hr-presets{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.hp{background:var(--s);border:1px solid var(--b2);border-radius:10px;padding:8px 18px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:700;font-size:.9rem;color:var(--tx2);transition:all .15s}
.hp:hover{border-color:var(--b3);color:var(--tx)}
.hp.sel{background:var(--ac);border-color:var(--ac);color:#000}
.del-folder-btn{background:none;border:1px solid #ef444425;color:var(--red);border-radius:10px;padding:8px 18px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:.8rem;font-weight:600;transition:all .15s;margin-top:20px}
.del-folder-btn:hover{background:#ef44440f;border-color:var(--red)}

.tab-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(5,5,5,.92);border-top:1px solid var(--b);display:flex;z-index:50;padding-bottom:env(safe-area-inset-bottom);backdrop-filter:blur(20px)}
.tab-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px 0 10px;cursor:pointer;background:none;border:none;gap:4px;transition:all .15s}
.tab-btn .tab-icon{font-size:1.1rem;line-height:1;transition:transform .2s}
.tab-btn:hover .tab-icon{transform:translateY(-2px)}
.tab-btn .tab-lbl{font-size:.62rem;font-family:'DM Sans',sans-serif;font-weight:700;color:var(--mu);letter-spacing:.04em;transition:color .15s}
.tab-btn.active .tab-lbl{color:var(--ac)}
.tab-btn .tab-dot{width:4px;height:4px;border-radius:50%;background:var(--ac);margin-top:2px;opacity:0;transition:all .2s;transform:scale(0)}
.tab-btn.active .tab-dot{opacity:1;transform:scale(1)}

.all-hdr{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;gap:14px}
.sort-tabs{display:flex;gap:6px;flex-shrink:0}
.sort-tab{background:var(--s);border:1px solid var(--b2);color:var(--tx2);border-radius:10px;padding:7px 14px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:.8rem;font-weight:600;transition:all .15s}
.sort-tab.active{background:var(--ac);border-color:var(--ac);color:#000;font-weight:700}
.filter-tabs{display:flex;gap:7px;margin-bottom:22px}
.filter-tab{background:var(--s);border:1px solid var(--b);color:var(--tx2);border-radius:99px;padding:6px 16px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:.8rem;font-weight:600;transition:all .15s}
.filter-tab:hover{border-color:var(--b2);color:var(--tx)}
.filter-tab.active{background:var(--s2);border-color:var(--b2);color:var(--tx);font-weight:700}
.day-section{margin-bottom:28px}
.day-section-hdr{display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--b)}
.day-badge{font-family:'Syne',sans-serif;font-weight:700;font-size:.78rem;padding:4px 12px;border-radius:8px;letter-spacing:.02em}
.day-badge.is-today{background:#c8ff5718;color:#c8ff57}
.day-badge.is-past{background:#ef444415;color:#ef4444}
.day-badge.is-future{background:var(--s);color:var(--mu);border:1px solid var(--b)}

.lock-screen{position:fixed;inset:0;background:#050505;z-index:500;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 24px;
  background:radial-gradient(ellipse at 50% 30%,#c8ff5708 0%,#050505 60%)}
.lock-icon{font-size:3rem;margin-bottom:16px;animation:lockFloat 3s ease-in-out infinite}
@keyframes lockFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.lock-eyebrow{font-size:.68rem;color:var(--mu);text-transform:uppercase;letter-spacing:.2em;font-weight:700;margin-bottom:16px}
.lock-task-name{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(1.3rem,4vw,2rem);color:var(--tx);margin-bottom:40px;max-width:520px;line-height:1.3;padding:0 20px;letter-spacing:-.3px}
.lock-countdown{font-family:'DM Mono',monospace;font-weight:700;font-size:clamp(6rem,20vw,10rem);color:var(--ac);line-height:1;letter-spacing:-4px;margin-bottom:6px;text-shadow:0 0 80px #c8ff5740;transition:color .3s}
.lock-countdown.urgent{color:var(--red);text-shadow:0 0 80px #ef444440;animation:urgentPulse .6s infinite}
@keyframes urgentPulse{0%,100%{opacity:1}50%{opacity:.6}}
.lock-countdown-lbl{font-size:.72rem;color:var(--mu);text-transform:uppercase;letter-spacing:.18em;font-weight:700;margin-bottom:24px}
.lock-prog-wrap{width:100%;max-width:400px;margin-bottom:18px}
.lock-prog-bg{width:100%;height:4px;background:#1a1a1a;border-radius:99px;overflow:hidden}
.lock-prog-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--ac),#a8e040);transition:width 1s linear;box-shadow:0 0 12px #c8ff5750}
.lock-prog-fill.urgent{background:linear-gradient(90deg,var(--red),var(--orange))}
.lock-working{font-size:.82rem;color:var(--mu);font-weight:500;margin-bottom:48px}
.lock-working strong{color:var(--tx);font-weight:700}
.lock-unlock-btn{background:none;border:1px solid #ef444420;color:#ef444860;border-radius:12px;padding:12px 24px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:700;font-size:.82rem;transition:all .2s;letter-spacing:.03em}
.lock-unlock-btn:hover{background:#ef44440f;border-color:var(--red);color:var(--red)}
.lock-done-card{background:var(--s);border:1px solid #c8ff5730;border-radius:22px;padding:36px 32px;max-width:400px;width:100%;box-shadow:0 40px 80px #000a}
.lock-done-title{font-family:'Syne',sans-serif;font-weight:800;font-size:1.8rem;color:var(--ac);margin-bottom:10px;letter-spacing:-.5px}
.lock-done-sub{font-size:.88rem;color:var(--mu);margin-bottom:28px;font-weight:500;line-height:1.6}
.lock-done-btns{display:flex;flex-direction:column;gap:10px}
.lock-more-btn{background:var(--ac);color:#000;border:none;border-radius:14px;padding:15px;font-family:'Syne',sans-serif;font-weight:700;font-size:.92rem;cursor:pointer;transition:all .18s;letter-spacing:.02em}
.lock-more-btn:hover{background:#d9ff70;transform:translateY(-2px)}
.lock-back-btn{background:var(--s2);border:1px solid var(--b2);color:var(--tx2);border-radius:14px;padding:15px;font-family:'Syne',sans-serif;font-weight:700;font-size:.92rem;cursor:pointer;transition:all .15s}
.lock-back-btn:hover{color:var(--tx);border-color:var(--b3)}

.pin-dots{display:flex;gap:14px;justify-content:center;margin-bottom:30px}
.pin-dot{width:14px;height:14px;border-radius:50%;border:2px solid var(--b2);transition:all .25s}
.pin-dot.filled{background:var(--ac);border-color:var(--ac);transform:scale(1.1)}
.pin-numpad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:260px;margin:0 auto 16px}
.pin-key{background:var(--s);border:1px solid var(--b2);border-radius:14px;padding:20px 10px;font-family:'DM Mono',monospace;font-weight:700;font-size:1.4rem;color:var(--tx);cursor:pointer;transition:all .12s;text-align:center;user-select:none}
.pin-key:hover{background:var(--s2);border-color:var(--b3)}
.pin-key:active{transform:scale(.92);background:var(--b)}
.pin-key.del{font-size:1rem;color:var(--mu)}
.pin-error{color:var(--red);font-size:.82rem;font-weight:700;text-align:center;margin-top:10px;animation:shake .3s ease}
@keyframes shake{0%,100%{transform:translateX(0)}25%,75%{transform:translateX(-10px)}50%{transform:translateX(10px)}}

.lock-dur-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:22px}
.lock-dur-opt{background:var(--s);border:1px solid var(--b2);border-radius:12px;padding:16px 8px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:700;font-size:1rem;color:var(--tx2);transition:all .15s;text-align:center}
.lock-dur-opt:hover{border-color:var(--b3);color:var(--tx);background:var(--s2)}
.lock-dur-opt.sel{background:var(--ac);border-color:var(--ac);color:#000}

.momentum-card{background:var(--s);border:1px solid var(--b);border-radius:var(--r);padding:18px 20px;margin-bottom:20px}
.momentum-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.momentum-title{font-size:.68rem;color:var(--mu);text-transform:uppercase;letter-spacing:.14em;font-weight:700;display:flex;align-items:center;gap:7px}
.momentum-status{font-size:.75rem;font-weight:700;letter-spacing:.03em}
.momentum-bars{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
.momentum-bar-row{display:flex;align-items:center;gap:10px}
.momentum-bar-lbl{font-size:.65rem;color:var(--mu);font-weight:600;width:72px;flex-shrink:0;text-transform:uppercase;letter-spacing:.06em}
.momentum-bar-bg{flex:1;height:7px;background:var(--b2);border-radius:99px;overflow:hidden}
.momentum-bar-fill{height:100%;border-radius:99px;transition:width .8s cubic-bezier(.34,1.56,.64,1)}
.momentum-bar-pct{font-family:'DM Mono',monospace;font-size:.68rem;color:var(--tx2);font-weight:700;width:32px;text-align:right;flex-shrink:0}
.momentum-msg{font-size:.78rem;font-weight:500;color:var(--mu);padding-top:4px}

.task-action-row{display:flex;gap:8px;margin-top:10px;justify-content:center;flex-wrap:wrap}
.task-action-btn{background:none;border:1px solid var(--b2);color:var(--tx2);border-radius:99px;padding:7px 16px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:.78rem;font-weight:600;transition:all .15s;display:flex;align-items:center;gap:6px}
.task-action-btn:hover{border-color:var(--b3);color:var(--tx);background:var(--s2)}
.task-action-btn.danger{border-color:#ef444428;color:#ef444488}
.task-action-btn.danger:hover{border-color:var(--red);color:var(--red);background:#ef44440a}
.task-action-btn.warn{border-color:#fbbf2430;color:#fbbf2490}
.task-action-btn.warn:hover{border-color:#fbbf24;color:#fbbf24;background:#fbbf2408}

.icon-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:6px;margin-bottom:20px;max-height:150px;overflow-y:auto}
.icon-opt{background:var(--s);border:2px solid transparent;border-radius:10px;padding:8px;cursor:pointer;font-size:1.1rem;text-align:center;transition:all .15s;line-height:1}
.icon-opt:hover{border-color:var(--b2);background:var(--s2)}
.icon-opt.sel{border-color:var(--ac);background:#c8ff5715}
`

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [user,          setUser]          = useState(null);
  const [authLoading,   setAuthLoading]   = useState(true);
  const [folders,       setFolders]       = useState(INIT_FOLDERS);
  const [tasks,         setTasks]         = useState(INIT_TASKS);
  const [complDates,    setComplDates]    = useState([]);
  const [bestStreak,    setBest]          = useState(0);
  const [dayHours,      setDayHours]      = useState({});
  const [loaded,        setLoaded]        = useState(false);

  const [view,          setView]          = useState("home");
  const [activeDay,     setActiveDay]     = useState(null);
  const [activeFolder,  setActiveFolder]  = useState(null);
  const [activeTask,    setActiveTask]    = useState(null);
  const [activeTaskDk,  setActiveTaskDk]  = useState(null);
  const [prevView,      setPrevView]      = useState("home");

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showHoursModal,  setShowHoursModal]  = useState(false);
  const [hoursModalDay,   setHoursModalDay]   = useState(null);
  const [showRemind,      setShowRemind]      = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renamingFolder,  setRenamingFolder]  = useState(null);
  const [renameText,      setRenameText]      = useState("");
  const [showEditTask,    setShowEditTask]    = useState(false);
  const [editTaskText,    setEditTaskText]    = useState("");
  const [confetti,        setConfetti]        = useState(false);

  const [isLocked,         setIsLocked]         = useState(false);
  const [lockEndTime,      setLockEndTime]      = useState(null);
  const [lockedTaskId,     setLockedTaskId]     = useState(null);
  const [lockedTaskDk,     setLockedTaskDk]     = useState(null);
  const [userPin,          setUserPin]          = useState(null);
  const [showLockModal,    setShowLockModal]    = useState(false);
  const [showPinSetModal,  setShowPinSetModal]  = useState(false);
  const [showPinUnlock,    setShowPinUnlock]    = useState(false);
  const [lockDuration,     setLockDuration]     = useState(10);
  const [pinInput,         setPinInput]         = useState("");
  const [pinConfirm,       setPinConfirm]       = useState("");
  const [pinStep,          setPinStep]          = useState(1);
  const [pinError,         setPinError]         = useState("");
  const [lockDone,         setLockDone]         = useState(false);

  const [nfName,    setNfName]    = useState("");
  const [nfColor,   setNfColor]   = useState(COLORS[0]);
  const [nfIcon,    setNfIcon]    = useState(ICON_OPTIONS[0]);
  const [pendingHrs,setPendingHrs]= useState(8);
  const [taskRecur, setTaskRecur] = useState(false);
  const [taskRecDays,setTaskRecDays]=useState([]);
  const [taskStartDate,setTaskStartDate]=useState(dStr());
  const [taskDueDate,  setTaskDueDate]  =useState(null);

  const [tick, setTick] = useState(0);

  // ── Timer tick ──────────────────────────────────────────────────────────────
  useEffect(()=>{
    const hasRunning = tasks.some(t=>t.timerRunning);
    if(!hasRunning) return;
    const iv = setInterval(()=>setTick(t=>t+1),1000);
    return ()=>clearInterval(iv);
  },[tasks]);

  // Keep activeTask in sync with tasks array
  useEffect(()=>{
    if(activeTask) {
      const updated = tasks.find(t=>t.id===activeTask.id);
      if(updated) setActiveTask(updated);
    }
  },[tasks]);

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(()=>{
    const unsub = onAuthStateChanged(auth,u=>{ setUser(u); setAuthLoading(false); });
    return unsub;
  },[]);

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(()=>{
    // ✅ FIX: Always reset loaded first so save effects can't fire with stale state
    setLoaded(false);

    if(!user){
      // Clear all state when signed out
      setFolders(INIT_FOLDERS);
      setTasks(INIT_TASKS);
      setComplDates([]);
      setBest(0);
      setDayHours({});
      setUserPin(null);
      return;
    }

    (async()=>{
      try{
        const ref=doc(db,"users",user.uid);
        const snap=await getDoc(ref);
        if(snap.exists()){
          const d=snap.data();
          setFolders(d.folders??INIT_FOLDERS);
          setTasks(d.tasks??INIT_TASKS);
          setComplDates(d.completedDates??[]);
          setBest(d.bestStreak??0);
          setDayHours(d.dayHours??{});
          if(d.userPin) setUserPin(d.userPin);
          if(d.activeLock && d.activeLock.endTime > Date.now()){
            setIsLocked(true);
            setLockEndTime(d.activeLock.endTime);
            setLockedTaskId(d.activeLock.taskId);
            setLockedTaskDk(d.activeLock.taskDk);
            setLockDone(false);
          }
        } else {
          await setDoc(ref,INIT_DATA);
        }
      } catch(e){ console.error("Load error:",e); }
      setLoaded(true);
    })();
  },[user]);

  // ── Save ────────────────────────────────────────────────────────────────────
  useEffect(()=>{ if(!user||!loaded) return; setDoc(doc(db,"users",user.uid),{folders},{merge:true}).catch(console.error); },[user,loaded,folders]);
  useEffect(()=>{ if(!user||!loaded) return; setDoc(doc(db,"users",user.uid),{tasks},{merge:true}).catch(console.error); },[user,loaded,tasks]);
  useEffect(()=>{ if(!user||!loaded) return; setDoc(doc(db,"users",user.uid),{dayHours},{merge:true}).catch(console.error); },[user,loaded,dayHours]);
  useEffect(()=>{
    if(!user||!loaded) return;
    const s=calcStreak(complDates), nb=s>bestStreak?s:bestStreak;
    setDoc(doc(db,"users",user.uid),{completedDates:complDates,bestStreak:nb},{merge:true}).catch(console.error);
    if(s>bestStreak) setBest(s);
  },[user,loaded,complDates]);

  // ── Lock tick ────────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!isLocked || !lockEndTime || lockDone) return;
    if(Date.now()>=lockEndTime){
      setLockDone(true);
      playWin();
      setConfetti(true);
      if(user) setDoc(doc(db,"users",user.uid),{activeLock:null},{merge:true}).catch(()=>{});
      return;
    }
  },[tick, isLocked, lockEndTime, lockDone]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const isDone      = (task,dk) => task.recurring?(task.doneOn??[]).includes(dateForDK(dk)):task.done;
  const tasksForDay = dk => {
    const targetDate = dateForDK(dk);
    return tasks.filter(t=>{
      if(t.recurring)     return t.recurringDays?.includes(dk);
      if(t.startDate)     return t.startDate === targetDate;
      if(t.scheduledDate) return t.scheduledDate === targetDate;
      return t.day === dk;
    });
  };
  const folderTasks = fid => tasks.filter(t=>t.folderId===fid);
  const donePct     = (arr,dk) => arr.length?Math.round(arr.filter(t=>isDone(t,dk)).length/arr.length*100):0;
  const hoursFor    = dk => dayHours[dk]??8;
  const secsTracked = dk => tasksForDay(dk).reduce((s,t)=>s+(t.timerSeconds??0),0);
  const hoursLeft   = dk => Math.max(0, hoursFor(dk) - secsTracked(dk)/3600);
  const hoursPct    = dk => Math.min(100, Math.round(secsTracked(dk)/3600/hoursFor(dk)*100));
  const weekPct     = () => { let t=0,d=0; DAY_KEYS.forEach(dk=>{const dt=tasksForDay(dk);t+=dt.length;d+=dt.filter(x=>isDone(x,dk)).length;}); return t?Math.round(d/t*100):0; };

  // ── Lock functions ────────────────────────────────────────────────────────────
  const activateLock = () => {
    const endTime = Date.now() + lockDuration * 60 * 1000;
    setIsLocked(true);
    setLockEndTime(endTime);
    setLockedTaskId(activeTask?.id);
    setLockedTaskDk(activeTaskDk);
    setLockDone(false);
    setShowLockModal(false);
    if(activeTask && !activeTask.timerRunning) startTimer(activeTask.id);
    if(user) setDoc(doc(db,"users",user.uid),{
      activeLock:{ endTime, taskId:activeTask?.id, taskDk:activeTaskDk }
    },{merge:true}).catch(()=>{});
  };

  const openLockFlow = () => {
    if(!userPin){ setPinStep(1); setPinInput(""); setPinConfirm(""); setPinError(""); setShowPinSetModal(true); }
    else setShowLockModal(true);
  };

  const handlePinKey = (key) => {
    if(showPinSetModal){
      if(pinStep===1){
        const next = (pinInput+key).slice(0,4);
        setPinInput(next);
        if(next.length===4){ setPinStep(2); setPinConfirm(""); }
      } else {
        const next = (pinConfirm+key).slice(0,4);
        setPinConfirm(next);
        if(next.length===4){
          if(next===pinInput){
            setUserPin(pinInput);
            if(user) setDoc(doc(db,"users",user.uid),{userPin:pinInput},{merge:true}).catch(()=>{});
            setShowPinSetModal(false);
            setPinInput(""); setPinConfirm(""); setPinStep(1);
            setShowLockModal(true);
          } else {
            setPinError("PINs don't match — try again");
            setPinConfirm(""); setPinInput(""); setPinStep(1);
            setTimeout(()=>setPinError(""),2000);
          }
        }
      }
    } else if(showPinUnlock){
      const next = (pinInput+key).slice(0,4);
      setPinInput(next);
      if(next.length===4){
        if(next===userPin){
          setIsLocked(false); setLockEndTime(null); setLockedTaskId(null);
          setShowPinUnlock(false); setPinInput("");
          if(user) setDoc(doc(db,"users",user.uid),{activeLock:null},{merge:true}).catch(()=>{});
        } else {
          setPinError("Wrong PIN");
          setPinInput("");
          setTimeout(()=>setPinError(""),1500);
        }
      }
    }
  };

  const handlePinDel = () => {
    if(showPinSetModal){
      if(pinStep===2) setPinConfirm(p=>p.slice(0,-1));
      else setPinInput(p=>p.slice(0,-1));
    } else if(showPinUnlock){
      setPinInput(p=>p.slice(0,-1));
    }
  };

  const dismissLockDone = () => {
    setIsLocked(false); setLockDone(false); setLockEndTime(null);
    setLockedTaskId(null); setLockedTaskDk(null);
  };

  const lockMoreTime = () => {
    setLockDone(false);
    setShowLockModal(true);
  };

  // ── Timer controls ──────────────────────────────────────────────────────────
  const startTimer = (taskId) => {
    const now = Date.now();
    playStart();
    setTasks(prev=>prev.map(t=>{
      if(t.id===taskId){
        return {...t, timerRunning:true, timerStartedAt:now};
      } else if(t.timerRunning){
        const elapsed = Math.floor((now-t.timerStartedAt)/1000);
        return {...t, timerRunning:false, timerStartedAt:null, timerSeconds:(t.timerSeconds??0)+elapsed};
      }
      return t;
    }));
  };

  const pauseTimer = (taskId) => {
    const now = Date.now();
    playPause();
    setTasks(prev=>prev.map(t=>{
      if(t.id!==taskId) return t;
      const elapsed = Math.floor((now-t.timerStartedAt)/1000);
      return {...t, timerRunning:false, timerStartedAt:null, timerSeconds:(t.timerSeconds??0)+elapsed};
    }));
  };

  const deleteTask = (e,id) => { e.stopPropagation(); setTasks(p=>p.filter(t=>t.id!==id)); };

  const uncompleteTask = () => {
    if(!activeTask) return;
    const dk = activeTaskDk;
    setTasks(prev=>prev.map(t=>{
      if(t.id!==activeTask.id) return t;
      if(!t.recurring) return {...t, done:false};
      const date = dateForDK(dk);
      return {...t, doneOn:(t.doneOn??[]).filter(d=>d!==date)};
    }));
    goBack();
  };

  const deleteActiveTask = () => {
    if(!activeTask) return;
    setTasks(p=>p.filter(t=>t.id!==activeTask.id));
    goBack();
  };

  const saveEditTask = () => {
    const text = editTaskText.trim(); if(!text) return;
    setTasks(prev=>prev.map(t=>t.id===activeTask.id?{...t,text}:t));
    setShowEditTask(false);
  };

  // ── Complete task ───────────────────────────────────────────────────────────
  const completeTask = (remindDays=null) => {
    if(!activeTask) return;
    const dk = activeTaskDk;
    const now = Date.now();
    playCheck();
    setTasks(prev=>{
      let next = prev.map(t=>{
        if(t.id!==activeTask.id) return t;
        let timerSeconds = t.timerSeconds??0;
        if(t.timerRunning&&t.timerStartedAt) timerSeconds += Math.floor((now-t.timerStartedAt)/1000);
        if(!t.recurring) return{...t, done:true, timerRunning:false, timerStartedAt:null, timerSeconds};
        const date=dateForDK(dk);
        return{...t, doneOn:[...(t.doneOn??[]),date], timerRunning:false, timerStartedAt:null, timerSeconds};
      });
      if(remindDays){
        const future=new Date(); future.setDate(future.getDate()+remindDays); future.setHours(0,0,0,0);
        const futureDk=DAY_KEYS[(future.getDay()+6)%7];
        next=[...next,{
          id:Date.now(), text:activeTask.text, folderId:activeTask.folderId,
          recurring:false, day:futureDk, scheduledDate:dStr(future),
          done:false, timerSeconds:0, timerRunning:false, timerStartedAt:null, isReminder:true,
        }];
      }
      const dayT=next.filter(t=>(!t.recurring&&(t.day===dk||t.scheduledDate===dateForDK(dk)))||(t.recurring&&t.recurringDays?.includes(dk)));
      const allDone=dayT.length>0&&dayT.every(t=>!t.recurring?t.done:(t.doneOn??[]).includes(dateForDK(dk)));
      if(allDone){ setTimeout(()=>{playWin();setConfetti(true);},100); if(dk===todayKey()) setComplDates(cd=>cd.includes(dStr())?cd:[...cd,dStr()]); }
      return next;
    });
    setShowRemind(false);
    goBack();
  };

  // ── Folder ──────────────────────────────────────────────────────────────────
  const createFolder = () => {
    const name=nfName.trim(); if(!name) return;
    setFolders(p=>[...p,{id:Date.now(),name,color:nfColor,icon:nfIcon}]);
    setNfName(""); setNfColor(COLORS[0]); setNfIcon(ICON_OPTIONS[0]); setShowFolderModal(false);
  };
  const openRename = (e, folder) => {
    e.stopPropagation();
    setRenamingFolder(folder); setRenameText(folder.name); setShowRenameModal(true);
  };
  const saveRename = () => {
    const name=renameText.trim(); if(!name) return;
    setFolders(p=>p.map(f=>f.id===renamingFolder.id?{...f,name}:f));
    setShowRenameModal(false); setRenamingFolder(null);
  };
  const deleteFolder = fid => { setFolders(p=>p.filter(f=>f.id!==fid)); setTasks(p=>p.filter(t=>t.folderId!==fid)); goHome(); };
  const openHours = dk => { setPendingHrs(hoursFor(dk)); setHoursModalDay(dk); setShowHoursModal(true); };
  const saveHours = () => { setDayHours(p=>({...p,[hoursModalDay]:pendingHrs})); setShowHoursModal(false); };

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goHome   = () => { setView("home"); };
  const goDay    = dk  => { setActiveDay(dk); setView("day"); setTaskStartDate(dateForDK(dk)); setTaskDueDate(null); };
  const goFolder = fid => { setActiveFolder(fid); setView("folder"); setTaskStartDate(dStr()); setTaskDueDate(null); };
  const goTask   = (task, dk, from) => {
    const now = Date.now();
    const runningOther = tasks.find(t=>t.timerRunning && t.id!==task.id);
    if(runningOther){
      const elapsed = Math.floor((now-runningOther.timerStartedAt)/1000);
      setTasks(prev=>prev.map(t=>t.id===runningOther.id?{...t,timerRunning:false,timerStartedAt:null,timerSeconds:(t.timerSeconds??0)+elapsed}:t));
    }
    setActiveTask(task); setActiveTaskDk(dk); setPrevView(from??view); setShowRemind(false); setView("task");
  };
  const goBack = () => {
    if(prevView==="day") setView("day");
    else if(prevView==="folder") setView("folder");
    else if(prevView==="all") setView("all");
    else setView("home");
  };
  const streak = calcStreak(complDates);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const nowDate   = new Date();
  const monthStr  = `${nowDate.getFullYear()}-${String(nowDate.getMonth()+1).padStart(2,"0")}`;
  const monthName = nowDate.toLocaleString("default",{month:"long"});
  const tasksCompletedThisMonth = () => { let c=0; tasks.forEach(t=>{ if(!t.recurring&&t.done) c++; else if(t.recurring) c+=(t.doneOn??[]).filter(d=>d.startsWith(monthStr)).length; }); return c; };
  const secsWorkedThisMonth = () => { let s=0; tasks.forEach(t=>{ if(!t.recurring&&t.done) s+=(t.timerSeconds??0); else if(t.recurring){ const n=(t.doneOn??[]).filter(d=>d.startsWith(monthStr)).length; if(n>0&&(t.doneOn??[]).length>0) s+=n*(t.timerSeconds??0)/t.doneOn.length; } }); return s; };
  const secsWorkedThisWeek  = () => { let s=0; DAY_KEYS.forEach(dk=>tasksForDay(dk).filter(t=>isDone(t,dk)).forEach(t=>{s+=t.timerSeconds??0;})); return s; };

  // ── Rings card ──────────────────────────────────────────────────────────────
  const RingsCard = ({dk}) => {
    const dp=donePct(tasksForDay(dk),dk), wp=weekPct(), hl=hoursLeft(dk), hp=hoursPct(dk);
    const st=secsTracked(dk);
    return(
      <div className="rings-card">
        <div className="ring-stat">
          <div className="ring-stat-val" style={{color:"#a78bfa"}}>{wp}%</div>
          <div className="ring-stat-lbl">This Week</div>
          <div className="ring-stat-sub">{DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).filter(t=>isDone(t,d)).length,0)}/{DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).length,0)} tasks</div>
        </div>
        <div className="ring-div-v"/>
        <div className="ring-hero">
          <Ring pct={dp} color="#c8ff57" size={110} stroke={10} label="Today" val={`${dp}%`}/>
        </div>
        <div className="ring-div-v"/>
        <div className="ring-stat" onClick={()=>openHours(dk)} style={{cursor:"pointer"}}>
          <div className="ring-stat-val" style={{color:"#fb923c",fontFamily:"'DM Mono',monospace",fontSize:"1.6rem"}}>{fmtTimer(st)}</div>
          <div className="ring-stat-lbl">Tracked</div>
          <div className="ring-stat-sub">{hoursFor(dk)} hr goal</div>
        </div>
        <div className="rings-hours-bar">
          <div className="rings-hours-labels">
            <span className="rings-hours-lbl">{fmtTimer(st)} worked</span>
            <span className="rings-hours-lbl">{hoursFor(dk)} hr goal</span>
          </div>
          <div className="rings-hours-bg">
            <div className="rings-hours-fill" style={{width:`${hp}%`,minWidth:st>0?"6px":"0",boxShadow:hp>0?"0 0 8px #fb923c50":"none"}}/>
          </div>
        </div>
        {hoursFor(dk)-st/3600<0&&<div className="overload">⚠ Over budget</div>}
      </div>
    );
  };

  // ── Task Row ─────────────────────────────────────────────────────────────────
  const TaskRow = ({task, dk, color, from}) => {
    const done = isDone(task, dk);
    const secs = getLiveSecs(task);
    const hasTime = secs > 0;
    const isRunning = task.timerRunning;
    const DueBadge = () => {
      if(!task.dueDate || done) return null;
      const today = dStr();
      const diff = Math.round((new Date(task.dueDate) - new Date(today)) / 86400000);
      let label, bg, col;
      if(diff < 0)      { label=`Overdue ${Math.abs(diff)}d`; bg="#ef444420"; col="#ef4444"; }
      else if(diff===0) { label="Due today";                   bg="#fb923c20"; col="#fb923c"; }
      else if(diff===1) { label="Due tomorrow";               bg="#fbbf2420"; col="#fbbf24"; }
      else if(diff<=7)  { label=`Due in ${diff}d`;            bg="#ffffff10"; col="var(--tx2)"; }
      else              { label=`Due ${task.dueDate.slice(5)}`; bg="#ffffff08"; col="var(--mu)"; }
      return <span style={{fontSize:".6rem",padding:"2px 7px",borderRadius:5,background:bg,color:col,fontWeight:700,flexShrink:0,whiteSpace:"nowrap"}}>{label}</span>;
    };
    return(
      <div
        className={`task-row${done?" done":""}${hasTime&&!done?" has-timer":""}${task.dueDate&&!done&&dStr()>task.dueDate?" overdue":""}`}
        style={{"--rc":color}}
        onClick={()=>goTask(task,dk,from??view)}
      >
        <div className="task-status"><span className="task-status-v">✓</span></div>
        {isRunning && <div className="task-running-dot"/>}
        {task.recurring && !isRunning && <div className="rec-dot" style={{background:color}}/>}
        {task.isReminder && <span className="task-reminder-icon">⏰</span>}
        <span className="task-txt">{task.text}</span>
        <DueBadge/>
        {hasTime && !isRunning && <span className="task-timer-badge">{fmtTimer(secs)}</span>}
        {isRunning && <span className="task-timer-badge" style={{background:"#c8ff5720",borderColor:"var(--ac)"}}>{fmtTimer(secs)}</span>}
        {!done && <span className="task-arrow">›</span>}
        <button className="del-btn" onClick={e=>deleteTask(e,task.id)}>×</button>
      </div>
    );
  };

  // ── Add Row ──────────────────────────────────────────────────────────────────
  const AddRow = ({dk, fid, placeholder}) => {
    const [text, setText] = useState("");
    const [showDates, setShowDates] = useState(false);
    const inputRef = useRef(null);
    const startOptions = Array.from({length:8},(_,i)=>{
      const d=new Date(); d.setDate(d.getDate()+i); d.setHours(0,0,0,0);
      const label = i===0?"Today":i===1?"Tomorrow":DAYS[(d.getDay()+6)%7]+(i>6?" +1wk":"");
      return { value:dStr(d), label };
    });
    const getDueOptions = () => {
      const start = new Date(taskStartDate);
      return [
        {value:null, label:"No deadline"},
        {value:taskStartDate, label:"Same day"},
        ...[1,3,7,14,30].map(days=>{
          const d=new Date(start); d.setDate(d.getDate()+days);
          return {value:dStr(d), label:days===1?"+1 day":days===7?"+1 week":days===14?"+2 weeks":days===30?"+1 month":`+${days} days`};
        }),
      ];
    };
    const submit = () => {
      const t=text.trim(); if(!t) return;
      const startDt = new Date(taskStartDate);
      const dayKey = DAY_KEYS[(startDt.getDay()+6)%7];
      const base={
        id:Date.now(), text:t,
        folderId:fid??folders[0]?.id??null,
        timerSeconds:0, timerRunning:false, timerStartedAt:null,
        startDate:taskStartDate,
        dueDate:taskDueDate||null,
        day:dayKey,
      };
      setTasks(p=>[...p, taskRecur
        ?{...base,recurring:true,recurringDays:taskRecDays.length?taskRecDays:[dk??todayKey()],doneOn:[],startDate:undefined,dueDate:undefined}
        :{...base,recurring:false,done:false}
      ]);
      setText("");
      setShowDates(false);
      inputRef.current?.focus();
    };
    return(
      <div className="add-area">
        <div className="add-row">
          <input ref={inputRef} className="add-in" value={text} onChange={e=>setText(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&submit()} placeholder={placeholder}/>
          <button className="add-btn" onClick={submit}>+</button>
        </div>
        <div className="add-opts">
          <button className={`rec-btn${showDates?" on":""}`} onClick={()=>setShowDates(d=>!d)} style={{fontSize:".78rem"}}>
            📅 {showDates?"Hide dates":"Set dates"}
          </button>
          <button className={`rec-btn${taskRecur?" on":""}`} onClick={()=>setTaskRecur(r=>!r)}>🔁 Repeat</button>
        </div>
        {showDates&&!taskRecur&&(
          <div style={{background:"var(--s)",border:"1px solid var(--b2)",borderRadius:12,padding:"14px",marginTop:8,display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <div style={{fontSize:".65rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>📅 Start working on</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {startOptions.map(opt=>(
                  <button key={opt.value} onClick={()=>{ setTaskStartDate(opt.value); setTaskDueDate(null); }}
                    style={{background:taskStartDate===opt.value?"var(--ac)":"var(--bg)",color:taskStartDate===opt.value?"#000":"var(--tx2)",border:`1px solid ${taskStartDate===opt.value?"var(--ac)":"var(--b2)"}`,borderRadius:8,padding:"5px 11px",cursor:"pointer",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:".75rem",transition:"all .15s"}}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{fontSize:".65rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>⏰ Due by</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {getDueOptions().map((opt,i)=>(
                  <button key={i} onClick={()=>setTaskDueDate(opt.value)}
                    style={{background:taskDueDate===opt.value?"#ef4444":opt.value===null&&taskDueDate===null?"var(--b2)":"var(--bg)",color:taskDueDate===opt.value?"#fff":"var(--tx2)",border:`1px solid ${taskDueDate===opt.value?"#ef4444":opt.value===null&&taskDueDate===null?"var(--mu)":"var(--b2)"}`,borderRadius:8,padding:"5px 11px",cursor:"pointer",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:".75rem",transition:"all .15s"}}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{fontSize:".72rem",color:"var(--mu)",fontWeight:500,padding:"8px 10px",background:"var(--bg)",borderRadius:8,lineHeight:1.6}}>
              {taskRecur?"Recurring task":(<>
                Starts <strong style={{color:"var(--tx)"}}>{startOptions.find(o=>o.value===taskStartDate)?.label??taskStartDate}</strong>
                {taskDueDate&&<> · Due <strong style={{color:"#fb923c"}}>{taskDueDate===taskStartDate?"same day":getDueOptions().find(o=>o.value===taskDueDate)?.label??taskDueDate}</strong></>}
                {!taskDueDate&&<> · <span style={{color:"var(--mu)"}}>No deadline</span></>}
              </>)}
            </div>
          </div>
        )}
        {taskRecur&&(
          <div className="day-chips">
            {DAY_KEYS.map((d,i)=>(
              <div key={d} className={`dc${taskRecDays.includes(d)?" sel":""}`}
                onClick={()=>setTaskRecDays(p=>p.includes(d)?p.filter(x=>x!==d):[...p,d])}>
                {DAYS[i]}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Home View ────────────────────────────────────────────────────────────────
  const HomeView = () => {
    const dk = todayKey();
    const tMonth = tasksCompletedThisMonth();
    const hMonth = secsWorkedThisMonth()/3600;
    const hWeek  = secsWorkedThisWeek()/3600;
    const weekDone  = DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).filter(t=>isDone(t,d)).length,0);
    const weekTotal = DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).length,0);
    return(
      <div className="home-layout">
        <div>
          {streak>0&&(
            <div className="streak">
              <span style={{fontSize:"1.4rem"}}>🔥</span>
              <div><div className="streak-num">{streak} day streak</div><div className="streak-lbl">Keep going</div></div>
              {bestStreak>streak&&<span style={{marginLeft:"auto",fontSize:".78rem",color:"var(--mu)",fontWeight:600}}>Best: {bestStreak}</span>}
            </div>
          )}
          <RingsCard dk={dk}/>
          <div className="page-title">My Week</div>
          <div className="page-sub">Tap a day to manage tasks</div>
          <div className="day-grid">
            {DAY_KEYS.map((d,i)=>{
              const dt=tasksForDay(d),pct=donePct(dt,d),isT=i===todayIdx();
              return(
                <div key={d} className={`day-card${isT?" today":""}`} onClick={()=>goDay(d)}>
                  <div className="day-lbl">{DAYS[i]}</div>
                  <div className="day-bar"><div className="day-bar-f" style={{width:`${pct}%`,background:isT?"#c8ff57":pct===100?"#34d399":"#3a3a3a"}}/></div>
                  <div className="day-cnt">{dt.filter(t=>isDone(t,d)).length}/{dt.length}</div>
                </div>
              );
            })}
          </div>
          <div className="sec-hdr">
            <span className="sec-title">Folders</span>
            <button className="ghost-btn" onClick={()=>setShowFolderModal(true)}>+ New Folder</button>
          </div>
          {folders.length===0
            ?<div className="empty">No folders yet — create one above ↑</div>
            :(()=>{
              const todayDk = todayKey();
              const enriched = [...folders].map(f=>{
                const todayFolderTasks = tasksForDay(todayDk).filter(t=>t.folderId===f.id);
                const doneToday = todayFolderTasks.filter(t=>isDone(t,todayDk)).length;
                const todayCount = todayFolderTasks.length;
                let weekDue=0, weekDone=0;
                DAY_KEYS.forEach(dk=>{
                  const dayF = tasksForDay(dk).filter(t=>t.folderId===f.id);
                  weekDue += dayF.length;
                  weekDone += dayF.filter(t=>isDone(t,dk)).length;
                });
                const weekPctF = weekDue>0 ? Math.round(weekDone/weekDue*100) : 0;
                const totalSecs = folderTasks(f.id).reduce((s,t)=>s+(t.timerSeconds??0),0);
                const hasTasksToday = todayCount > 0;
                return { f, todayCount, doneToday, weekDue, weekDone, weekPctF, totalSecs, hasTasksToday };
              });
              const active   = enriched.filter(e=>e.hasTasksToday).sort((a,b)=>b.todayCount-a.todayCount);
              const inactive = enriched.filter(e=>!e.hasTasksToday);
              const FolderRow = ({e, dimmed}) => {
                const {f,todayCount,doneToday,weekDue,weekDone,weekPctF,totalSecs} = e;
                return(
                  <div key={f.id} className="folder-row" style={{"--fc": dimmed?"#444":f.color, opacity: dimmed?0.45:1}} onClick={()=>goFolder(f.id)}>
                    <div className="folder-row-icon" style={{filter:dimmed?"grayscale(1)":"none"}}>{f.icon}</div>
                    <div className="folder-row-main">
                      <div className="folder-row-name" style={{color:dimmed?"var(--mu)":"var(--tx)"}}>{f.name}</div>
                      <div className="folder-row-bar-bg">
                        <div className="folder-row-bar-f" style={{width:`${weekPctF}%`,background:dimmed?"#444":f.color}}/>
                      </div>
                    </div>
                    <div className="folder-row-stats">
                      <div className="f-stat">
                        <span className="f-stat-val" style={{color:dimmed?"var(--mu)":todayCount>0?f.color:"var(--tx2)"}}>{dimmed?"—":`${doneToday}/${todayCount}`}</span>
                        <span className="f-stat-lbl">Today</span>
                      </div>
                      <div className="f-stat">
                        <span className="f-stat-val" style={{color:dimmed?"var(--mu)":"var(--tx2)"}}>{weekDone}/{weekDue}</span>
                        <span className="f-stat-lbl">This week</span>
                      </div>
                      <div className="f-stat">
                        <span className="f-stat-val" style={{color:dimmed?"var(--mu)":"#fb923c"}}>{totalSecs>0?fmtTimer(totalSecs):"—"}</span>
                        <span className="f-stat-lbl">Time</span>
                      </div>
                    </div>
                    <button onClick={ev=>openRename(ev,f)} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".85rem",padding:"4px 6px",borderRadius:6,flexShrink:0}} title="Rename">✏️</button>
                    <span className="folder-row-arrow">›</span>
                  </div>
                );
              };
              return(
                <div className="folders-list">
                  {active.map(e=><FolderRow key={e.f.id} e={e} dimmed={false}/>)}
                  {inactive.length>0&&(
                    <>
                      {active.length>0&&(
                        <div style={{display:"flex",alignItems:"center",gap:10,margin:"8px 0 4px"}}>
                          <div style={{flex:1,height:1,background:"var(--b)"}}/>
                          <span style={{fontSize:".62rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".1em",whiteSpace:"nowrap"}}>No tasks today</span>
                          <div style={{flex:1,height:1,background:"var(--b)"}}/>
                        </div>
                      )}
                      {inactive.map(e=><FolderRow key={e.f.id} e={e} dimmed={true}/>)}
                    </>
                  )}
                </div>
              );
            })()
          }
        </div>
        <div className="stats-col">
          <div className="stat-card">
            <div className="stat-card-title">✅ Tasks Completed</div>
            <div className="stat-big" style={{color:"#c8ff57"}}>{tMonth}</div>
            <div className="stat-desc">this month · {monthName}</div>
            <div className="stat-divider"/>
            <div className="stat-row"><span className="stat-row-lbl">This week</span><span className="stat-row-val" style={{color:"#c8ff57"}}>{weekDone}</span></div>
            <div className="stat-row"><span className="stat-row-lbl">Total tasks</span><span className="stat-row-val" style={{color:"var(--tx2)"}}>{weekTotal}</span></div>
            <div className="stat-row"><span className="stat-row-lbl">Week progress</span><span className="stat-row-val" style={{color:"#a78bfa"}}>{weekTotal?Math.round(weekDone/weekTotal*100):0}%</span></div>
          </div>
          <div className="stat-card">
            <div className="stat-card-title">⏱ Time Tracked Today</div>
            <div className="stat-big" style={{color:"#fb923c",fontVariantNumeric:"tabular-nums",letterSpacing:"-.5px",fontSize:"2.4rem"}}>{fmtTimer(secsTracked(dk))}</div>
            <div style={{marginTop:10,marginBottom:6}}>
              <div style={{width:"100%",height:6,background:"var(--b2)",borderRadius:99,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:99,background:"linear-gradient(90deg,#fb923c,#fbbf24)",width:`${Math.min(100,(secsTracked(dk)/3600/hoursFor(dk))*100)}%`,transition:"width .8s ease",minWidth:secsTracked(dk)>0?"6px":"0"}}/>
              </div>
            </div>
            <div className="stat-desc">of {hoursFor(dk)} hr daily goal</div>
            <div className="stat-divider"/>
            <div className="stat-row"><span className="stat-row-lbl">This week</span><span className="stat-row-val" style={{color:"#fb923c"}}>{fmtHrs(hWeek)}</span></div>
            <div className="stat-row"><span className="stat-row-lbl">This month</span><span className="stat-row-val" style={{color:"#fb923c"}}>{fmtHrs(hMonth)}</span></div>
            <div className="stat-row"><span className="stat-row-lbl">Daily goal</span><span className="stat-row-val" style={{color:"var(--tx2)"}}>{hoursFor(dk)} hrs</span></div>
          </div>
          {streak>0&&(
            <div className="stat-card">
              <div className="stat-card-title">🔥 Streak</div>
              <div className="stat-big" style={{color:"#f97316"}}>{streak}</div>
              <div className="stat-desc">days in a row</div>
              <div className="stat-divider"/>
              <div className="stat-row"><span className="stat-row-lbl">Best ever</span><span className="stat-row-val" style={{color:"#f97316"}}>{bestStreak} days</span></div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Day Momentum Bar ─────────────────────────────────────────────────────────
  const DayMomentum = ({dk}) => {
    if(dk !== todayKey()) return null;
    const now = new Date();
    const hour = now.getHours() + now.getMinutes()/60;
    const workStart = 9, workEnd = 18;
    if(hour < workStart) return null;
    const dayPct  = Math.min(100, Math.round((hour-workStart)/(workEnd-workStart)*100));
    const taskPct = donePct(tasksForDay(dk), dk);
    const diff    = taskPct - dayPct;
    const timeStr = now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    let statusLabel, statusColor, msg, barColor;
    if(taskPct===100)    { statusLabel="🎉 Complete";  statusColor="#c8ff57"; msg="All tasks done!";                    barColor="#c8ff57"; }
    else if(diff>=15)    { statusLabel="🚀 Ahead";     statusColor="#c8ff57"; msg=`${diff}% ahead of schedule`;         barColor="#c8ff57"; }
    else if(diff>= -5)   { statusLabel="⚡ On track";  statusColor="#60a5fa"; msg="Right on pace — keep it up";         barColor="#60a5fa"; }
    else if(diff>=-20)   { statusLabel="⚠ Behind";    statusColor="#fbbf24"; msg=`${Math.abs(diff)}% behind — push!`;  barColor="#fbbf24"; }
    else                 { statusLabel="🔴 Lagging";   statusColor="#ef4444"; msg="Focus up — time is moving fast";     barColor="#ef4444"; }
    return(
      <div className="momentum-card">
        <div className="momentum-header">
          <div className="momentum-title">⚡ Day Momentum · {timeStr}</div>
          <div className="momentum-status" style={{color:statusColor}}>{statusLabel}</div>
        </div>
        <div className="momentum-bars">
          <div className="momentum-bar-row">
            <span className="momentum-bar-lbl">Tasks done</span>
            <div className="momentum-bar-bg"><div className="momentum-bar-fill" style={{width:`${taskPct}%`,background:barColor,boxShadow:`0 0 8px ${barColor}60`}}/></div>
            <span className="momentum-bar-pct">{taskPct}%</span>
          </div>
          <div className="momentum-bar-row">
            <span className="momentum-bar-lbl">Day elapsed</span>
            <div className="momentum-bar-bg"><div className="momentum-bar-fill" style={{width:`${dayPct}%`,background:"var(--b3)"}}/></div>
            <span className="momentum-bar-pct">{dayPct}%</span>
          </div>
        </div>
        <div className="momentum-msg" style={{color:statusColor!=="var(--mu)"?statusColor+"cc":"var(--mu)"}}>{msg}</div>
      </div>
    );
  };

  // ── Day View ──────────────────────────────────────────────────────────────────
  const DayView = () => {
    const dk=activeDay, idx=DAY_KEYS.indexOf(dk), label=DAYS[idx], isT=idx===todayIdx();
    const dt=tasksForDay(dk), done=dt.filter(t=>isDone(t,dk)).length, pct=donePct(dt,dk);
    const st=secsTracked(dk);
    const grouped=folders.map(f=>({f,ts:dt.filter(t=>t.folderId===f.id)})).filter(g=>g.ts.length);
    const other=dt.filter(t=>!folders.find(f=>f.id===t.folderId));
    return(
      <div className="page">
        <div className="view-hdr">
          <div className="view-title">{label}{isT?" · Today":""}</div>
          <div className="view-sub">{dt.length} tasks · {done} completed</div>
        </div>
        <RingsCard dk={dk}/>
        <DayMomentum dk={dk}/>
        {(()=>{
          const budgetSecs = hoursFor(dk) * 3600;
          const pctWorked  = Math.min(100, (st/budgetSecs)*100);
          const workedMins = Math.floor(st/60);
          const budgetHrs  = hoursFor(dk);
          const milestones = [
            {pct:25, label:fmtHrs(budgetHrs*0.25)},
            {pct:50, label:fmtHrs(budgetHrs*0.5)},
            {pct:75, label:fmtHrs(budgetHrs*0.75)},
            {pct:100,label:`${budgetHrs} hrs`},
          ];
          let winMsg = null;
          if(pctWorked>=100)     winMsg = "🎉 Full day's work done!";
          else if(pctWorked>=75) winMsg = "🔥 75% there — you're on fire!";
          else if(pctWorked>=50) winMsg = "⚡ Halfway through your day!";
          else if(pctWorked>=25) winMsg = "✨ 25% done — great start!";
          else if(workedMins>=1) winMsg = `✓ ${workedMins} min in — keep it up!`;
          return(
            <div className="time-progress-card">
              <div className="time-progress-top">
                <div>
                  <div className="time-progress-worked">{workedMins < 60 ? `${workedMins} min` : fmtHrs(st/3600)} worked today</div>
                  {winMsg && <div className="time-win-msg">{winMsg}</div>}
                </div>
                <div className="time-progress-goal">
                  Goal: {budgetHrs} hrs
                  <button style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".7rem",marginLeft:8,fontFamily:"'DM Sans',sans-serif",fontWeight:600,textDecoration:"underline"}} onClick={()=>openHours(dk)}>change</button>
                </div>
              </div>
              <div className="time-progress-bar-bg">
                <div className={`time-progress-bar-fill${pctWorked===0?" zero":""}`} style={{width:`${Math.max(pctWorked,pctWorked>0?1:0)}%`}}/>
              </div>
              <div className="time-progress-milestones">
                {milestones.map(m=>(<span key={m.pct} className={`time-milestone${pctWorked>=m.pct?" hit":""}`}>{m.label}</span>))}
              </div>
            </div>
          );
        })()}
        <div className="big-prog">
          <div className="big-top">
            <span className="big-frac">{done}<span className="d">/{dt.length}</span></span>
            <span className="big-pct" style={{color:"#c8ff57"}}>{pct}%</span>
          </div>
          <div className="big-bar"><div className="big-fill" style={{width:`${pct}%`,background:"#c8ff57"}}/></div>
          {dt.length>0&&done===dt.length&&<div className="all-done">✦ All done — incredible!</div>}
        </div>
        {grouped.map(({f,ts})=>(
          <div className="task-grp" key={f.id}>
            <div className="grp-hdr">
              <span className="grp-lbl" style={{color:f.color}}>{f.icon} {f.name}</span>
              {ts.some(t=>t.recurring)&&<span className="rec-badge">🔁</span>}
              <span style={{marginLeft:"auto",fontSize:".72rem",color:f.color,fontWeight:700}}>{donePct(ts,dk)}%</span>
            </div>
            {ts.map(t=><TaskRow key={t.id} task={t} dk={dk} color={f.color} from="day"/>)}
          </div>
        ))}
        {other.length>0&&(
          <div className="task-grp">
            <div className="grp-hdr"><span className="grp-lbl" style={{color:"var(--mu)"}}>Other</span></div>
            {other.map(t=><TaskRow key={t.id} task={t} dk={dk} color="var(--ac)" from="day"/>)}
          </div>
        )}
        {dt.length===0&&<div className="empty">Nothing for {label} — add a task below ↓</div>}
        <AddRow dk={dk} fid={folders[0]?.id} placeholder={`Add task for ${label}...`}/>
      </div>
    );
  };

  // ── Folder View ───────────────────────────────────────────────────────────────
  const FolderView = () => {
    const folder=folders.find(f=>f.id===activeFolder); if(!folder) return null;
    const ft=folderTasks(activeFolder), dk=todayKey();
    const done=ft.filter(t=>isDone(t,dk)).length, pct=ft.length?Math.round(done/ft.length*100):0;
    const byDay=DAY_KEYS.map((d,i)=>({d,lbl:DAYS[i],ts:ft.filter(t=>(!t.recurring&&(t.day===d||t.scheduledDate===dateForDK(d)))||(t.recurring&&t.recurringDays?.includes(d)))})).filter(g=>g.ts.length);
    return(
      <div className="page">
        <div className="view-hdr">
          <div style={{display:"flex",alignItems:"center",gap:11}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:folder.color,flexShrink:0}}/>
            <div className="view-title">{folder.name}</div>
          </div>
          <div className="view-sub">{ft.length} tasks total</div>
        </div>
        <div className="big-prog">
          <div className="big-top">
            <span className="big-frac">{done}<span className="d">/{ft.length}</span></span>
            <span className="big-pct" style={{color:folder.color}}>{pct}% today</span>
          </div>
          <div className="big-bar"><div className="big-fill" style={{width:`${pct}%`,background:folder.color}}/></div>
        </div>
        {byDay.map(({d,lbl,ts})=>(
          <div className="task-grp" key={d}>
            <div className="grp-hdr">
              <span className="grp-lbl" style={{color:DAY_KEYS.indexOf(d)===todayIdx()?folder.color:"var(--mu)"}}>{lbl}{DAY_KEYS.indexOf(d)===todayIdx()?" · Today":""}</span>
            </div>
            {ts.map(t=><TaskRow key={t.id} task={t} dk={d} color={folder.color} from="folder"/>)}
          </div>
        ))}
        {ft.length===0&&<div className="empty">No tasks yet — add one below ↓</div>}
        <AddRow dk={dk} fid={activeFolder} placeholder={`Add task to ${folder.name}...`}/>
        <button className="del-folder-btn" onClick={()=>deleteFolder(activeFolder)}>Delete folder</button>
      </div>
    );
  };

  // ── PIN Numpad ────────────────────────────────────────────────────────────────
  const PinNumpad = ({currentPin, label}) => (
    <div>
      <div style={{fontSize:".8rem",color:"var(--mu)",fontWeight:600,textAlign:"center",marginBottom:16}}>{label}</div>
      <div className="pin-dots">
        {[0,1,2,3].map(i=>(<div key={i} className={`pin-dot${(currentPin||"").length>i?" filled":""}`}/>))}
      </div>
      <div className="pin-numpad">
        {[1,2,3,4,5,6,7,8,9].map(n=>(<div key={n} className="pin-key" onClick={()=>handlePinKey(String(n))}>{n}</div>))}
        <div className="pin-key" style={{visibility:"hidden"}}/>
        <div className="pin-key" onClick={()=>handlePinKey("0")}>0</div>
        <div className="pin-key del" onClick={handlePinDel}>⌫</div>
      </div>
      {pinError&&<div className="pin-error">{pinError}</div>}
    </div>
  );

  // ── Task Detail View ──────────────────────────────────────────────────────────
  const TaskDetailView = () => {
    if(!activeTask) return null;
    const task = tasks.find(t=>t.id===activeTask.id) ?? activeTask;
    const dk   = activeTaskDk;
    const done = isDone(task, dk);
    const secs = getLiveSecs(task);
    const folder = folders.find(f=>f.id===task.folderId);
    const isRunning = task.timerRunning;
    const totalSecsToday = secsTracked(dk);
    return(
      <div className="task-detail">
        {folder&&<div className="task-detail-folder" style={{color:folder.color}}>{folder.icon} {folder.name}</div>}
        <div className={`task-detail-name${done?" done":""}`}>{task.text}</div>
        <div className="task-action-row">
          <button className="task-action-btn" onClick={()=>{ setEditTaskText(task.text); setShowEditTask(true); }}>✏️ Edit name</button>
          {done && <button className="task-action-btn warn" onClick={uncompleteTask}>↩ Uncomplete</button>}
          <button className="task-action-btn danger" onClick={deleteActiveTask}>🗑 Delete</button>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap",marginBottom:20}}>
          {task.startDate&&<span style={{fontSize:".72rem",color:"var(--mu)",background:"var(--s)",border:"1px solid var(--b2)",padding:"4px 12px",borderRadius:99,fontWeight:600}}>📅 Starts {task.startDate===dStr()?"today":task.startDate}</span>}
          {task.dueDate&&(()=>{
            const diff=Math.round((new Date(task.dueDate)-new Date(dStr()))/86400000);
            const col=diff<0?"#ef4444":diff===0?"#fb923c":diff===1?"#fbbf24":"var(--mu)";
            const lbl=diff<0?`Overdue by ${Math.abs(diff)}d`:diff===0?"Due today":diff===1?"Due tomorrow":`Due in ${diff}d`;
            return <span style={{fontSize:".72rem",color:col,background:col+"15",border:`1px solid ${col}40`,padding:"4px 12px",borderRadius:99,fontWeight:700}}>⏰ {lbl}</span>;
          })()}
        </div>
        {done&&<div className="task-done-badge">✓ Completed</div>}
        <div className={`timer-card${isRunning?" running":""}`}>
          <div className="timer-digits">{fmtTimer(secs)}</div>
          <div className="timer-status">{isRunning?"Working on this task…":"Timer paused"}</div>
          {!done&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
              {isRunning
                ?<button className="timer-btn pause" onClick={()=>pauseTimer(task.id)}>⏸ Pause</button>
                :<button className="timer-btn start" onClick={()=>startTimer(task.id)}>▶ Start Working</button>
              }
              <button onClick={openLockFlow} style={{background:"#c8ff5718",border:"1px solid #c8ff57",color:"#c8ff57",borderRadius:10,padding:"10px 28px",cursor:"pointer",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:".85rem",letterSpacing:".04em",transition:"all .2s"}}
                onMouseEnter={e=>{e.currentTarget.style.background="#c8ff5730";}}
                onMouseLeave={e=>{e.currentTarget.style.background="#c8ff5718";}}>
                🔒 Lock In
              </button>
            </div>
          )}
          <div className="timer-stats">
            <div className="t-stat"><div className="t-stat-val">{fmtTimer(task.timerSeconds??0)}</div><div className="t-stat-lbl">This task</div></div>
            <div className="t-stat"><div className="t-stat-val">{fmtTimer(totalSecsToday)}</div><div className="t-stat-lbl">Today total</div></div>
            <div className="t-stat"><div className="t-stat-val">{fmtHrs(hoursLeft(dk))}</div><div className="t-stat-lbl">Budget left</div></div>
          </div>
        </div>
        {!done&&!showRemind&&(
          <div className="detail-actions">
            <button className="action-btn complete" onClick={()=>completeTask(null)}>✓ Mark Complete</button>
            <button className="action-btn remind" onClick={()=>setShowRemind(true)}>⏰ Complete & Remind</button>
          </div>
        )}
        {!done&&showRemind&&(
          <div className="remind-section">
            <div className="remind-title">Remind me in</div>
            <div className="remind-grid">
              {REMIND_OPTS.map(d=>(<button key={d} className="remind-opt" onClick={()=>completeTask(d)}>{d===1?"Tomorrow":`${d}d`}</button>))}
            </div>
            <div style={{textAlign:"center",marginTop:12}}>
              <button style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".8rem",fontFamily:"'DM Sans',sans-serif",fontWeight:500}} onClick={()=>setShowRemind(false)}>← Back</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── All Tasks View ────────────────────────────────────────────────────────────
  const AllTasksView = () => {
    const [sortBy,setSortBy] = useState("date");
    const [filter,setFilter] = useState("all");
    const today = dStr();
    const allItems = [];
    DAY_KEYS.forEach(dk=>{
      tasksForDay(dk).forEach(task=>{
        const done=isDone(task,dk);
        if(filter==="pending"&&done) return;
        if(filter==="done"&&!done) return;
        allItems.push({task,dk,date:dateForDK(dk),done,folder:folders.find(f=>f.id===task.folderId)});
      });
    });
    if(sortBy==="date") allItems.sort((a,b)=>{const aT=a.date===today?0:a.date>today?1:2,bT=b.date===today?0:b.date>today?1:2;return aT!==bT?aT-bT:a.date.localeCompare(b.date);});
    else allItems.sort((a,b)=>(a.folder?.name??"").localeCompare(b.folder?.name??"")||a.date.localeCompare(b.date));
    const groups=[];
    if(sortBy==="date"){
      DAY_KEYS.forEach(dk=>{
        const items=allItems.filter(i=>i.dk===dk); if(!items.length) return;
        const date=dateForDK(dk),isToday=date===today,isPast=date<today;
        groups.push({key:dk,label:DAYS[DAY_KEYS.indexOf(dk)],date,isToday,isPast,items});
      });
      groups.sort((a,b)=>{const aT=a.isToday?0:!a.isPast?1:2,bT=b.isToday?0:!b.isPast?1:2;return aT!==bT?aT-bT:a.date.localeCompare(b.date);});
    } else {
      const fm={};
      allItems.forEach(i=>{ const k=i.folder?.id??"none"; if(!fm[k]) fm[k]={key:k,label:i.folder?.name??"No folder",color:i.folder?.color??"#555",icon:i.folder?.icon??"📋",items:[]}; fm[k].items.push(i); });
      Object.values(fm).forEach(g=>groups.push(g));
    }
    const totalPending=DAY_KEYS.flatMap(dk=>tasksForDay(dk).filter(t=>!isDone(t,dk))).length;
    const totalDone=DAY_KEYS.flatMap(dk=>tasksForDay(dk).filter(t=>isDone(t,dk))).length;
    return(
      <div className="page">
        <div className="all-hdr">
          <div><div className="page-title">All Tasks</div><div className="page-sub">{totalPending} pending · {totalDone} done</div></div>
          <div className="sort-tabs">
            <button className={`sort-tab${sortBy==="date"?" active":""}`} onClick={()=>setSortBy("date")}>📅 Date</button>
            <button className={`sort-tab${sortBy==="folder"?" active":""}`} onClick={()=>setSortBy("folder")}>📁 Folder</button>
          </div>
        </div>
        <div className="filter-tabs">
          {[["all","All"],["pending","Pending"],["done","Done"]].map(([v,l])=>(
            <button key={v} className={`filter-tab${filter===v?" active":""}`} onClick={()=>setFilter(v)}>{l}</button>
          ))}
        </div>
        {groups.length===0&&<div className="empty">No tasks found</div>}
        {sortBy==="date"?groups.map(g=>(
          <div className="day-section" key={g.key}>
            <div className="day-section-hdr">
              <span className={`day-badge${g.isToday?" is-today":g.isPast?" is-past":" is-future"}`}>{g.isToday?"Today":g.label}</span>
              <span style={{fontSize:".72rem",color:"var(--mu)",fontWeight:500}}>{g.date}</span>
              <span style={{marginLeft:"auto",fontSize:".72rem",color:"var(--mu)",fontWeight:600}}>{g.items.filter(i=>i.done).length}/{g.items.length}</span>
            </div>
            {g.items.map((item,idx)=>(<TaskRow key={`${item.task.id}-${item.dk}-${idx}`} task={item.task} dk={item.dk} color={item.folder?.color??"var(--ac)"} from="all"/>))}
          </div>
        )):groups.map(g=>(
          <div className="day-section" key={g.key}>
            <div className="day-section-hdr">
              <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:".88rem",color:g.color}}>{g.icon} {g.label}</span>
              <span style={{marginLeft:"auto",fontSize:".72rem",color:"var(--mu)",fontWeight:600}}>{g.items.filter(i=>i.done).length}/{g.items.length}</span>
            </div>
            {g.items.map((item,idx)=>(<TaskRow key={`${item.task.id}-${item.dk}-${idx}`} task={item.task} dk={item.dk} color={g.color} from="all"/>))}
          </div>
        ))}
      </div>
    );
  };

  // ── Loading / Login ────────────────────────────────────────────────────────────
  if(authLoading) return(
    <>
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:"#080808",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{color:"#333",fontSize:".9rem",fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>Loading…</div>
      </div>
    </>
  );

  if(!user) return(
    <>
      <style>{css}</style>
      <div className="login">
        <div className="login-card">
          <div className="login-logo">effingFocus<span>.</span></div>
          <div className="login-tagline">The task manager built for ADHD brains</div>
          <button className="google-btn" onClick={()=>signInWithPopup(auth,googleProvider)}>
            <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
          <div className="login-note">Your data syncs across all your devices.</div>
        </div>
      </div>
    </>
  );

  // ── Main render ───────────────────────────────────────────────────────────────
  return(
    <>
      <style>{css}</style>
      <div className="app">
        <div className="nav">
          <div className="logo">effingFocus<em>.</em></div>
          <div className="nav-right">
            {view==="task" && <button className="back-btn" onClick={goBack}>← Back</button>}
            {(view==="day"||view==="folder") && <button className="back-btn" onClick={goHome}>← Home</button>}
            {user.photoURL&&<img src={user.photoURL} className="avatar" alt=""/>}
            <button className="signout-btn" onClick={()=>signOut(auth)}>Sign out</button>
          </div>
        </div>

        {view==="home"   && <HomeView/>}
        {view==="day"    && <DayView/>}
        {view==="folder" && <FolderView/>}
        {view==="task"   && <TaskDetailView/>}
        {view==="all"    && <AllTasksView/>}

        {view!=="task" && (
          <div className="tab-bar">
            <button className={`tab-btn${(view==="home"||view==="day"||view==="folder")?" active":""}`} onClick={goHome}>
              <span className="tab-icon">🏠</span>
              <span className="tab-lbl">Home</span>
              <div className="tab-dot"/>
            </button>
            <button className={`tab-btn${view==="all"?" active":""}`} onClick={()=>setView("all")}>
              <span className="tab-icon">📋</span>
              <span className="tab-lbl">All Tasks</span>
              <div className="tab-dot"/>
            </button>
          </div>
        )}
      </div>

      {confetti&&<Confetti onDone={()=>setConfetti(false)}/>}

      {/* ── Lock Screen ── */}
      {isLocked&&(()=>{
        const lockedTask = tasks.find(t=>t.id===lockedTaskId);
        const secsLeft = lockEndTime ? Math.max(0,(lockEndTime-Date.now())/1000) : 0;
        const totalSecs = lockDuration*60;
        const pctLeft = totalSecs ? (secsLeft/totalSecs)*100 : 0;
        const isUrgent = secsLeft < 60;
        const workedSecs = lockedTask ? getLiveSecs(lockedTask) : 0;
        if(lockDone) return(
          <div className="lock-screen">
            <div style={{fontSize:"3rem",marginBottom:16}}>🎉</div>
            <div className="lock-done-card">
              <div className="lock-done-title">Time's up!</div>
              <div className="lock-done-sub">You stayed locked in on<br/><strong style={{color:"var(--tx)"}}>{lockedTask?.text}</strong></div>
              <div className="lock-done-btns">
                <button className="lock-more-btn" onClick={lockMoreTime}>🔒 Lock in for more time</button>
                <button className="lock-back-btn" onClick={dismissLockDone}>← Go back</button>
              </div>
            </div>
          </div>
        );
        return(
          <div className="lock-screen">
            <div className="lock-icon">🔒</div>
            <div className="lock-eyebrow">Locked in · stay focused</div>
            <div className="lock-task-name">{lockedTask?.text ?? "Working..."}</div>
            <div className={`lock-countdown${isUrgent?" urgent":""}`}>{fmtTimer(secsLeft)}</div>
            <div className="lock-countdown-lbl">remaining</div>
            <div className="lock-prog-wrap">
              <div className="lock-prog-bg">
                <div className={`lock-prog-fill${isUrgent?" urgent":""}`} style={{width:`${pctLeft}%`}}/>
              </div>
            </div>
            <div className="lock-working">Working for <strong>{fmtTimer(workedSecs)}</strong></div>
            <button className="lock-unlock-btn" onClick={()=>{ setPinInput(""); setPinError(""); setShowPinUnlock(true); }}>🔓 Unlock early</button>
            {showPinUnlock&&(
              <div style={{position:"fixed",inset:0,background:"#000d",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
                <div className="modal" style={{maxWidth:300}}>
                  <div className="modal-title" style={{textAlign:"center"}}>Enter PIN to unlock</div>
                  <PinNumpad currentPin={pinInput} label=""/>
                  <button className="btn-c" style={{width:"100%",marginTop:8,textAlign:"center"}} onClick={()=>{setShowPinUnlock(false);setPinInput("");}}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Lock duration modal */}
      {showLockModal&&!isLocked&&(
        <div className="overlay" onClick={()=>setShowLockModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">🔒 Lock In</div>
            <div style={{fontSize:".82rem",color:"var(--mu)",marginBottom:18,fontWeight:500,lineHeight:1.6}}>
              Lock yourself in on <strong style={{color:"var(--tx)"}}>{activeTask?.text}</strong>.<br/>You'll need your PIN to exit early.
            </div>
            <div className="modal-lbl">How long?</div>
            <div className="lock-dur-grid">
              {LOCK_DURATIONS.map(d=>(
                <div key={d} className={`lock-dur-opt${lockDuration===d?" sel":""}`} onClick={()=>setLockDuration(d)}>
                  {d}<span style={{fontSize:".65rem",display:"block",fontWeight:500,marginTop:2}}>min</span>
                </div>
              ))}
            </div>
            <div className="modal-btns">
              <button className="btn-c" onClick={()=>setShowLockModal(false)}>Cancel</button>
              <button className="btn-ok" onClick={activateLock}>Lock In 🔒</button>
            </div>
          </div>
        </div>
      )}

      {/* PIN setup modal */}
      {showPinSetModal&&(
        <div className="overlay">
          <div className="modal" style={{maxWidth:320}}>
            <div className="modal-title" style={{textAlign:"center"}}>{pinStep===1?"Set your PIN":"Confirm your PIN"}</div>
            <div style={{fontSize:".8rem",color:"var(--mu)",textAlign:"center",marginBottom:20,fontWeight:500}}>
              {pinStep===1?"Choose a 4-digit PIN. You'll need this to unlock early.":"Enter the same PIN again to confirm."}
            </div>
            <PinNumpad currentPin={pinStep===1?pinInput:pinConfirm} label={pinStep===1?"Enter PIN":"Confirm PIN"}/>
            <button className="btn-c" style={{width:"100%",marginTop:12,textAlign:"center"}} onClick={()=>{setShowPinSetModal(false);setPinInput("");setPinStep(1);}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {showEditTask&&(
        <div className="overlay" onClick={()=>setShowEditTask(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Edit Task</div>
            <div className="modal-lbl">Task name</div>
            <input className="modal-in" value={editTaskText} autoFocus onChange={e=>setEditTaskText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveEditTask()} placeholder="Task name"/>
            <div className="modal-btns">
              <button className="btn-c" onClick={()=>setShowEditTask(false)}>Cancel</button>
              <button className="btn-ok" onClick={saveEditTask}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Folder Modal */}
      {showRenameModal&&(
        <div className="overlay" onClick={()=>setShowRenameModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Rename Folder</div>
            <div className="modal-lbl">New name</div>
            <input className="modal-in" value={renameText} autoFocus onChange={e=>setRenameText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveRename()} placeholder="Folder name"/>
            <div className="modal-btns">
              <button className="btn-c" onClick={()=>setShowRenameModal(false)}>Cancel</button>
              <button className="btn-ok" onClick={saveRename}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {showFolderModal&&(
        <div className="overlay" onClick={()=>setShowFolderModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">New Folder</div>
            <div className="modal-lbl">Name</div>
            <input className="modal-in" value={nfName} autoFocus onChange={e=>setNfName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createFolder()} placeholder="e.g. House Chores"/>
            <div className="modal-lbl">Icon</div>
            <div className="icon-grid">
              {ICON_OPTIONS.map(icon=>(<div key={icon} className={`icon-opt${nfIcon===icon?" sel":""}`} onClick={()=>setNfIcon(icon)}>{icon}</div>))}
            </div>
            <div className="modal-lbl">Color</div>
            <div className="swatches">{COLORS.map(c=>(<div key={c} className={`sw${nfColor===c?" sel":""}`} style={{background:c}} onClick={()=>setNfColor(c)}/>))}</div>
            <div style={{borderRadius:12,padding:"14px 16px",marginBottom:18,background:`linear-gradient(145deg, ${nfColor}ee, ${nfColor}aa)`,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:"1.3rem"}}>{nfIcon}</span>
              <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:".9rem",color:"#fff"}}>{nfName||"Folder name"}</span>
            </div>
            <div className="modal-btns">
              <button className="btn-c" onClick={()=>setShowFolderModal(false)}>Cancel</button>
              <button className="btn-ok" onClick={createFolder}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Hours Modal */}
      {showHoursModal&&(
        <div className="overlay" onClick={()=>setShowHoursModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Set Work Hours</div>
            <div className="modal-lbl">Hours for {DAYS[DAY_KEYS.indexOf(hoursModalDay)]}</div>
            <div className="hr-presets">{HR_PRESET.map(h=>(<button key={h} className={`hp${pendingHrs===h?" sel":""}`} onClick={()=>setPendingHrs(h)}>{h} hrs</button>))}</div>
            <div style={{fontSize:".8rem",color:"var(--mu)",marginBottom:18,fontWeight:500}}>Your daily time budget. Tracks against actual time worked.</div>
            <div className="modal-btns">
              <button className="btn-c" onClick={()=>setShowHoursModal(false)}>Cancel</button>
              <button className="btn-ok" onClick={saveHours}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
