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

// Format seconds → "00:00" or "1:23:45"
const fmtTimer = secs => {
  const s=Math.floor(Math.max(0,secs));
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
  if(h>0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
};

// Format hours nicely — avoids the "oh" problem
const fmtHrs = h => {
  if(h<=0) return "—";
  if(h<1/60) return "—";
  if(h<1) return `${Math.round(h*60)} min`;
  return h===Math.floor(h)?`${h} hrs`:`${h.toFixed(1)} hrs`;
};
const fmtHrsBudget = h => h===Math.floor(h)?`${h} hrs`:`${h.toFixed(1)} hrs`;

// Get live seconds for a task (including running time)
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
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#080808;font-family:'Montserrat',sans-serif !important;color:#e0e0e0;-webkit-font-smoothing:antialiased;min-height:100vh;font-size:15px}
input,button,select,textarea{font-family:'Montserrat',sans-serif !important}
:root{--bg:#080808;--s:#0f0f0f;--b:#1e1e1e;--b2:#2c2c2c;--mu:#565656;--tx:#e0e0e0;--tx2:#888;--ac:#c8ff57;--r:14px}

/* ── Login ── */
.login{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:20px}
.login-card{background:var(--s);border:1px solid var(--b2);border-radius:24px;padding:48px 40px;max-width:400px;width:100%;text-align:center}
.login-logo{font-family:'Syne',sans-serif;font-weight:800;font-size:2.6rem;color:var(--tx);letter-spacing:-1px;margin-bottom:10px}
.login-logo span{color:var(--ac)}
.login-tagline{font-size:.9rem;color:var(--mu);margin-bottom:40px;line-height:1.7;font-weight:500}
.google-btn{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;background:#fff;color:#111;border:none;border-radius:14px;padding:15px 20px;font-family:'Montserrat',sans-serif;font-weight:700;font-size:1rem;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 2px 8px #0004}
.google-btn:hover{transform:translateY(-2px);box-shadow:0 8px 24px #0006}
.google-btn svg{width:20px;height:20px;flex-shrink:0}
.login-note{font-size:.78rem;color:var(--mu);margin-top:20px;line-height:1.7}

/* ── App shell ── */
.app{min-height:100vh;background:var(--bg)}
.nav{display:flex;align-items:center;justify-content:space-between;padding:20px 28px 0;max-width:1120px;margin:0 auto}
.logo{font-family:'Syne',sans-serif;font-weight:800;font-size:1.3rem;color:var(--tx);letter-spacing:-.3px}
.logo em{color:var(--ac);font-style:normal}
.nav-right{display:flex;align-items:center;gap:12px}
.back-btn{background:none;border:1px solid var(--b2);color:var(--tx2);border-radius:99px;padding:7px 16px;cursor:pointer;font-family:'Montserrat',sans-serif;font-size:.8rem;font-weight:600;transition:all .15s}
.back-btn:hover{color:var(--tx);border-color:var(--mu)}
.signout-btn{background:none;border:none;color:var(--mu);cursor:pointer;font-size:.8rem;font-family:'Montserrat',sans-serif;font-weight:500;transition:color .15s;padding:4px}
.signout-btn:hover{color:var(--tx2)}
.avatar{width:30px;height:30px;border-radius:50%;border:2px solid var(--b2);object-fit:cover}

/* ── Home layout ── */
.home-layout{display:grid;grid-template-columns:1fr;gap:20px;max-width:1120px;margin:0 auto;padding:28px 24px 100px}
@media(min-width:860px){.home-layout{grid-template-columns:1fr 270px;align-items:start}}
.stats-col{display:flex;flex-direction:column;gap:12px}
@media(min-width:860px){.stats-col{position:sticky;top:24px}}

/* ── Stat cards ── */
.stat-card{background:var(--s);border:1px solid var(--b);border-radius:var(--r);padding:20px}
.stat-card-title{font-size:.68rem;color:var(--mu);text-transform:uppercase;letter-spacing:.12em;font-weight:700;margin-bottom:14px}
.stat-big{font-family:'Syne',sans-serif;font-weight:800;font-size:2rem;line-height:1;margin-bottom:5px}
.stat-desc{font-size:.78rem;color:var(--mu);line-height:1.5;font-weight:500}
.stat-divider{height:1px;background:var(--b);margin:12px 0}
.stat-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0}
.stat-row-lbl{font-size:.8rem;color:var(--tx2);font-weight:500}
.stat-row-val{font-family:'Syne',sans-serif;font-weight:700;font-size:.95rem}

/* ── Page ── */
.page{max-width:720px;margin:0 auto;padding:28px 24px 100px}

/* ── Streak ── */
.streak{display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,#c8ff5714,#c8ff5706);border:1px solid #c8ff5730;border-radius:14px;padding:14px 18px;margin-bottom:22px}
.streak-num{font-family:'Syne',sans-serif;font-weight:800;font-size:1.3rem;color:var(--ac);line-height:1}
.streak-lbl{font-size:.76rem;color:var(--mu);margin-top:3px;font-weight:500}

/* ── Rings ── */
.rings-card{background:var(--s);border:1px solid var(--b);border-radius:20px;padding:24px 18px 48px;margin-bottom:22px;display:flex;align-items:center;justify-content:space-around;position:relative}
.ring-div{width:1px;height:60px;background:var(--b)}
.overload{position:absolute;bottom:-12px;left:50%;transform:translateX(-50%);background:#ef4444;color:#fff;font-size:.68rem;padding:4px 12px;border-radius:99px;white-space:nowrap;font-family:'Montserrat',sans-serif;font-weight:700}

/* ── Day grid ── */
.page-title{font-family:'Syne',sans-serif;font-size:clamp(1.7rem,4vw,2.6rem);font-weight:800;letter-spacing:-.5px;color:var(--tx);margin-bottom:5px}
.page-sub{font-size:.82rem;color:var(--mu);margin-bottom:22px;font-weight:500}
.day-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:7px;margin-bottom:30px}
.day-card{background:var(--s);border:1px solid var(--b);border-radius:11px;padding:11px 4px 9px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;transition:all .18s}
.day-card:hover{border-color:var(--b2);transform:translateY(-2px)}
.day-card.today{border-color:var(--ac);box-shadow:0 0 0 1px #c8ff5718}
.day-lbl{font-family:'Syne',sans-serif;font-size:.66rem;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:.04em}
.day-card.today .day-lbl{color:var(--ac)}
.day-bar{width:100%;height:3px;background:var(--b2);border-radius:99px;overflow:hidden}
.day-bar-f{height:100%;border-radius:99px;transition:width .4s ease}
.day-cnt{font-size:.62rem;color:var(--tx2);font-weight:600}

/* ── Sections ── */
.sec-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.sec-title{font-family:'Syne',sans-serif;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--mu)}
.ghost-btn{background:none;border:1px solid var(--b2);color:var(--tx2);border-radius:9px;padding:7px 16px;cursor:pointer;font-family:'Montserrat',sans-serif;font-size:.82rem;font-weight:600;transition:all .15s}
.ghost-btn:hover{color:var(--tx);border-color:var(--mu)}

/* ── Folder rows (compact) ── */
.folders-list{display:flex;flex-direction:column;gap:8px}
.folder-row{background:var(--s);border:1px solid var(--b);border-left:3px solid var(--fc);border-radius:11px;padding:12px 14px;display:flex;align-items:center;gap:12px;cursor:pointer;transition:all .18s}
.folder-row:hover{border-color:var(--b2);transform:translateX(3px);box-shadow:0 4px 16px #0003}
.folder-row-icon{font-size:1.2rem;flex-shrink:0;width:26px;text-align:center}
.folder-row-main{flex:1;min-width:0}
.folder-row-name{font-family:'Syne',sans-serif;font-weight:700;font-size:.88rem;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px}
.folder-row-bar-bg{width:100%;height:3px;background:var(--b2);border-radius:99px;overflow:hidden}
.folder-row-bar-f{height:100%;border-radius:99px;transition:width .4s ease}
.folder-row-stats{display:flex;gap:14px;align-items:center;flex-shrink:0}
.f-stat{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:36px}
.f-stat-val{font-family:'Syne',sans-serif;font-weight:700;font-size:.82rem;line-height:1}
.f-stat-lbl{font-size:.56rem;color:var(--mu);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
.folder-row-arrow{color:var(--mu);font-size:1rem;flex-shrink:0;transition:color .15s}
.folder-row:hover .folder-row-arrow{color:var(--tx2)}

/* ── View header ── */
.view-hdr{margin-bottom:20px}
.view-title{font-family:'Syne',sans-serif;font-size:clamp(1.5rem,4vw,2.2rem);font-weight:800;letter-spacing:-.5px;color:var(--tx);margin-bottom:4px}
.view-sub{font-size:.82rem;color:var(--mu);font-weight:500}

/* ── Hours chips ── */
.hours-row{display:flex;gap:10px;margin-bottom:20px}
.h-chip{flex:1;background:var(--s);border:1px solid var(--b);border-radius:12px;padding:13px 14px;cursor:default}
.h-chip.clickable{cursor:pointer;transition:border-color .15s}
.h-chip.clickable:hover{border-color:var(--ac)}
.h-val{font-family:'Syne',sans-serif;font-weight:800;font-size:1.05rem;color:var(--tx)}
.h-lbl{font-size:.7rem;color:var(--mu);margin-top:3px;font-weight:500}

/* ── Progress card ── */
.big-prog{background:var(--s);border:1px solid var(--b);border-radius:var(--r);padding:20px;margin-bottom:20px}
.big-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:11px}
.big-frac{font-family:'Syne',sans-serif;font-weight:800;font-size:1.8rem;color:var(--tx)}
.big-frac .d{color:var(--mu);font-size:1.1rem}
.big-pct{font-size:.85rem;font-weight:700}
.big-bar{height:8px;background:var(--b2);border-radius:99px;overflow:hidden}
.big-fill{height:100%;border-radius:99px;transition:width .5s cubic-bezier(.34,1.56,.64,1)}
.all-done{text-align:center;font-size:.76rem;color:var(--ac);text-transform:uppercase;letter-spacing:.08em;margin-top:10px;font-weight:700}

/* ── Task group ── */
.task-grp{margin-bottom:20px}
.grp-hdr{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.grp-lbl{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
.rec-badge{font-size:.65rem;background:#ffffff0a;border-radius:5px;padding:2px 7px;color:var(--tx2);font-weight:500}

/* ── Task Row (clickable card — no timer buttons) ── */
.task-row{background:var(--s);border:1px solid var(--b);border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:11px;cursor:pointer;transition:all .2s;animation:fup .22s ease;margin-bottom:8px;user-select:none}
@keyframes fup{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.task-row:hover{border-color:var(--b2);transform:translateY(-1px);box-shadow:0 4px 16px #0003}
.task-row.done{opacity:.38}
.task-row.done .task-txt{text-decoration:line-through;color:var(--mu)}
.task-row.has-timer{border-color:#c8ff5730}
.task-row.overdue{border-color:#ef444430;background:#ef44440a}

.task-status{width:20px;height:20px;border-radius:50%;border:2px solid var(--b2);flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .2s}
.task-row.done .task-status{background:var(--rc,var(--ac));border-color:var(--rc,var(--ac))}
.task-status-v{font-size:.6rem;color:#000;display:none;font-weight:900}
.task-row.done .task-status-v{display:block}

.task-txt{flex:1;font-size:.9rem;color:var(--tx);line-height:1.45;font-weight:500}
.task-row.done .task-txt{font-weight:400}

.task-timer-badge{font-family:'Syne',sans-serif;font-weight:700;font-size:.75rem;color:var(--ac);background:#c8ff5712;border:1px solid #c8ff5730;padding:3px 9px;border-radius:99px;flex-shrink:0;white-space:nowrap}
.task-running-dot{width:7px;height:7px;border-radius:50%;background:var(--ac);flex-shrink:0;animation:blink 1s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
.rec-dot{width:5px;height:5px;border-radius:50%;background:var(--rc,var(--ac));flex-shrink:0;opacity:.5}
.task-reminder-icon{font-size:.75rem;flex-shrink:0}
.task-arrow{font-size:.85rem;color:var(--mu);flex-shrink:0;transition:color .15s}
.task-row:hover .task-arrow{color:var(--tx2)}

.del-btn{background:none;border:none;color:var(--b2);cursor:pointer;font-size:1.1rem;padding:2px 5px;border-radius:6px;opacity:0;transition:all .15s;flex-shrink:0;line-height:1}
.task-row:hover .del-btn{opacity:1}
.del-btn:hover{color:#ef4444}

/* ── Task Detail (Focus View) ── */
.task-detail{max-width:560px;margin:0 auto;padding:28px 24px 100px;text-align:center}
.task-detail-folder{font-size:.72rem;color:var(--mu);text-transform:uppercase;letter-spacing:.12em;font-weight:700;margin-bottom:12px}
.task-detail-name{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(1.4rem,4vw,2rem);color:var(--tx);letter-spacing:-.3px;line-height:1.2;margin-bottom:36px}
.task-detail-name.done{text-decoration:line-through;color:var(--mu)}

/* Big timer */
.timer-card{background:var(--s);border:1px solid var(--b);border-radius:20px;padding:36px 24px;margin-bottom:24px;position:relative;overflow:hidden}
.timer-card.running{border-color:#c8ff5740;background:linear-gradient(135deg,#c8ff5706,var(--s))}
.timer-digits{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(3rem,10vw,5rem);color:var(--tx);letter-spacing:-2px;line-height:1;margin-bottom:8px;font-variant-numeric:tabular-nums;transition:color .3s}
.timer-card.running .timer-digits{color:var(--ac)}
.timer-status{font-size:.78rem;color:var(--mu);font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-bottom:28px}
.timer-card.running .timer-status{color:#c8ff5790}

/* Timer control button */
.timer-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;border:none;border-radius:16px;padding:16px 36px;font-family:'Syne',sans-serif;font-weight:800;font-size:1rem;cursor:pointer;transition:all .18s;letter-spacing:.02em}
.timer-btn.start{background:var(--ac);color:#000;box-shadow:0 4px 24px #c8ff5740}
.timer-btn.start:hover{background:#d9ff70;transform:scale(1.04);box-shadow:0 8px 32px #c8ff5760}
.timer-btn.pause{background:#1a1a1a;color:var(--tx);border:2px solid var(--b2)}
.timer-btn.pause:hover{border-color:var(--mu);background:#222}

/* Stats row under timer */
.timer-stats{display:flex;gap:10px;margin-top:20px}
.t-stat{flex:1;text-align:center;background:#0a0a0a;border-radius:10px;padding:10px}
.t-stat-val{font-family:'Syne',sans-serif;font-weight:700;font-size:.95rem;color:var(--tx);margin-bottom:2px}
.t-stat-lbl{font-size:.65rem;color:var(--mu);font-weight:600;text-transform:uppercase;letter-spacing:.08em}

/* Complete actions */
.detail-actions{display:flex;gap:10px;margin-bottom:16px}
.action-btn{flex:1;border:none;border-radius:12px;padding:14px;font-family:'Syne',sans-serif;font-weight:700;font-size:.88rem;cursor:pointer;transition:all .15s}
.action-btn.complete{background:#c8ff5720;color:var(--ac);border:1px solid #c8ff5740}
.action-btn.complete:hover{background:#c8ff5730;border-color:var(--ac)}
.action-btn.remind{background:var(--s);color:var(--tx2);border:1px solid var(--b2)}
.action-btn.remind:hover{border-color:var(--mu);color:var(--tx)}

/* Remind options */
.remind-section{background:var(--s);border:1px solid var(--b);border-radius:14px;padding:16px}
.remind-title{font-size:.72rem;color:var(--mu);font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px}
.remind-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}
.remind-opt{background:#0a0a0a;border:1px solid var(--b2);border-radius:9px;padding:10px 6px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:700;font-size:.78rem;color:var(--tx2);transition:all .15s;text-align:center}
.remind-opt:hover{border-color:var(--ac);color:var(--ac);background:#c8ff5708}
.task-done-badge{display:inline-flex;align-items:center;gap:6px;background:#34d39920;border:1px solid #34d39940;color:#34d399;border-radius:99px;padding:6px 16px;font-size:.78rem;font-weight:700;margin-bottom:20px}

/* ── Time worked progress bar ── */
.time-progress-card{background:var(--s);border:1px solid var(--b);border-radius:var(--r);padding:18px 20px;margin-bottom:20px}
.time-progress-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px}
.time-progress-worked{font-family:'Syne',sans-serif;font-weight:800;font-size:1.5rem;color:var(--ac);line-height:1}
.time-progress-goal{font-size:.78rem;color:var(--mu);font-weight:500}
.time-progress-bar-bg{width:100%;height:12px;background:var(--b2);border-radius:99px;overflow:hidden;margin-bottom:8px;position:relative}
.time-progress-bar-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#c8ff57,#a8e040);transition:width .8s cubic-bezier(.34,1.56,.64,1);position:relative}
.time-progress-bar-fill::after{content:'';position:absolute;right:0;top:50%;transform:translateY(-50%);width:16px;height:16px;background:#c8ff57;border-radius:50%;box-shadow:0 0 10px #c8ff5780}
.time-progress-bar-fill.zero::after{display:none}
.time-progress-milestones{display:flex;justify-content:space-between}
.time-milestone{font-size:.62rem;color:var(--mu);font-weight:600}
.time-milestone.hit{color:var(--ac)}
.time-win-msg{font-size:.75rem;color:var(--ac);font-weight:600;margin-top:6px;animation:fadeIn .3s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.add-area{margin-top:12px}
.add-row{display:flex;gap:8px}
.add-in{flex:1;background:var(--s);border:1px solid var(--b2);border-radius:11px;padding:13px 16px;color:var(--tx);font-family:'Montserrat',sans-serif;font-size:.9rem;outline:none;transition:border-color .15s;font-weight:500}
.add-in::placeholder{color:var(--mu)}
.add-in:focus{border-color:var(--ac)}
.add-btn{background:var(--ac);color:#000;border:none;border-radius:11px;padding:13px 20px;font-family:'Syne',sans-serif;font-weight:800;font-size:1.2rem;cursor:pointer;flex-shrink:0;transition:transform .15s,background .15s;line-height:1}
.add-btn:hover{background:#d9ff70;transform:scale(1.05)}
.add-opts{display:flex;gap:7px;margin-top:9px;flex-wrap:wrap;align-items:center}
.rec-btn{background:none;border:1px solid var(--b2);color:var(--tx2);border-radius:8px;padding:5px 12px;cursor:pointer;font-size:.82rem;font-family:'Montserrat',sans-serif;font-weight:600;transition:all .15s}
.rec-btn.on{border-color:var(--ac);color:var(--ac);background:#c8ff5710}
.day-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.dc{background:var(--s);border:1px solid var(--b2);border-radius:7px;padding:5px 11px;cursor:pointer;font-size:.72rem;font-family:'Syne',sans-serif;font-weight:700;color:var(--tx2);transition:all .15s}
.dc.sel{background:var(--ac);border-color:var(--ac);color:#000}

/* ── Modals ── */
.overlay{position:fixed;inset:0;background:#000c;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;animation:fi .15s ease}
@keyframes fi{from{opacity:0}to{opacity:1}}
.modal{background:#111;border:1px solid var(--b2);border-radius:20px;padding:28px;width:100%;max-width:400px;animation:su .2s cubic-bezier(.34,1.56,.64,1)}
@keyframes su{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.modal-title{font-family:'Syne',sans-serif;font-weight:800;font-size:1.15rem;color:var(--tx);margin-bottom:18px}
.modal-lbl{font-size:.7rem;color:var(--mu);font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em}
.modal-in{width:100%;background:var(--s);border:1px solid var(--b2);border-radius:10px;padding:12px 15px;color:var(--tx);font-family:'Montserrat',sans-serif;font-size:.92rem;font-weight:500;outline:none;margin-bottom:16px;transition:border-color .15s}
.modal-in:focus{border-color:var(--ac)}
.swatches{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:20px}
.sw{width:28px;height:28px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:all .15s}
.sw.sel{border-color:#fff;transform:scale(1.2)}
.modal-btns{display:flex;gap:9px;justify-content:flex-end}
.btn-c{background:none;border:1px solid var(--b2);color:var(--tx2);border-radius:9px;padding:10px 16px;cursor:pointer;font-family:'Montserrat',sans-serif;font-size:.82rem;font-weight:600;transition:all .15s}
.btn-c:hover{color:var(--tx);border-color:var(--mu)}
.btn-ok{background:var(--ac);color:#000;border:none;border-radius:9px;padding:10px 20px;font-family:'Syne',sans-serif;font-weight:700;font-size:.9rem;cursor:pointer;transition:background .15s}
.btn-ok:hover{background:#d9ff70}
.icon-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:6px;margin-bottom:18px;max-height:140px;overflow-y:auto}
.icon-opt{background:var(--s);border:2px solid transparent;border-radius:8px;padding:6px;cursor:pointer;font-size:1.1rem;text-align:center;transition:all .15s;line-height:1}
.icon-opt:hover{border-color:var(--b2);background:var(--b)}
.icon-opt.sel{border-color:var(--ac);background:#c8ff5715}
.hp{background:var(--s);border:1px solid var(--b2);border-radius:9px;padding:8px 16px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:700;font-size:.92rem;color:var(--tx2);transition:all .15s}
.hp.sel{background:var(--ac);border-color:var(--ac);color:#000}
.del-folder-btn{background:none;border:1px solid #ef444430;color:#ef4444;border-radius:9px;padding:8px 16px;cursor:pointer;font-family:'Montserrat',sans-serif;font-size:.8rem;font-weight:600;transition:all .15s;margin-top:20px}
.del-folder-btn:hover{background:#ef444412;border-color:#ef4444}

/* ── Empty ── */
.empty{text-align:center;padding:32px 0;color:var(--mu);font-size:.85rem;font-weight:500}

/* ── Tab bar ── */
.tab-bar{position:fixed;bottom:0;left:0;right:0;background:#0a0a0a;border-top:1px solid var(--b);display:flex;z-index:50;padding-bottom:env(safe-area-inset-bottom)}
.tab-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:11px 0 9px;cursor:pointer;background:none;border:none;gap:4px;transition:all .15s}
.tab-btn .tab-icon{font-size:1.1rem;line-height:1}
.tab-btn .tab-lbl{font-size:.64rem;font-family:'Montserrat',sans-serif;font-weight:600;color:var(--mu);letter-spacing:.03em;transition:color .15s}
.tab-btn.active .tab-lbl{color:var(--ac)}
.tab-btn .tab-dot{width:4px;height:4px;border-radius:50%;background:var(--ac);margin-top:2px;opacity:0;transition:opacity .15s}
.tab-btn.active .tab-dot{opacity:1}

/* ── All Tasks ── */
.all-hdr{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:22px;gap:12px}
.sort-tabs{display:flex;gap:6px;flex-shrink:0}
.sort-tab{background:var(--s);border:1px solid var(--b2);color:var(--tx2);border-radius:9px;padding:6px 13px;cursor:pointer;font-family:'Montserrat',sans-serif;font-size:.78rem;font-weight:600;transition:all .15s}
.sort-tab.active{background:var(--ac);border-color:var(--ac);color:#000}
.filter-tabs{display:flex;gap:7px;margin-bottom:20px}
.filter-tab{background:var(--s);border:1px solid var(--b2);color:var(--tx2);border-radius:99px;padding:5px 14px;cursor:pointer;font-family:'Montserrat',sans-serif;font-size:.78rem;font-weight:600;transition:all .15s}
.filter-tab.active{background:var(--b2);color:var(--tx)}
.day-section{margin-bottom:24px}
.day-section-hdr{display:flex;align-items:center;gap:9px;margin-bottom:11px;padding-bottom:9px;border-bottom:1px solid var(--b)}
.day-badge{font-family:'Syne',sans-serif;font-weight:700;font-size:.8rem;padding:3px 11px;border-radius:7px}
.day-badge.is-today{background:#c8ff5720;color:#c8ff57}
.day-badge.is-past{background:#ef444415;color:#ef4444}
.day-badge.is-future{background:var(--s);color:var(--mu)}

/* ── Lock Screen ── */
.lock-screen{position:fixed;inset:0;background:#060606;z-index:500;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 24px}
.lock-icon{font-size:3rem;margin-bottom:16px;animation:lockBob 3s ease-in-out infinite}
@keyframes lockBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
.lock-eyebrow{font-size:.7rem;color:var(--mu);text-transform:uppercase;letter-spacing:.2em;font-weight:700;margin-bottom:14px}
.lock-task-name{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(1.3rem,4vw,2rem);color:var(--tx);margin-bottom:36px;max-width:500px;line-height:1.3;padding:0 20px}
.lock-countdown{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(5rem,18vw,9rem);color:var(--ac);line-height:1;letter-spacing:-4px;margin-bottom:4px;font-variant-numeric:tabular-nums;transition:color .3s}
.lock-countdown.urgent{color:#ef4444;animation:urgentFlash .6s infinite}
@keyframes urgentFlash{0%,100%{opacity:1}50%{opacity:.5}}
.lock-countdown-lbl{font-size:.72rem;color:var(--mu);text-transform:uppercase;letter-spacing:.15em;font-weight:600;margin-bottom:20px}
.lock-prog-wrap{width:100%;max-width:360px;margin-bottom:16px}
.lock-prog-bg{width:100%;height:5px;background:#1a1a1a;border-radius:99px;overflow:hidden}
.lock-prog-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--ac),#a8e040);transition:width 1s linear;box-shadow:0 0 10px #c8ff5760}
.lock-prog-fill.urgent{background:linear-gradient(90deg,#ef4444,#fb923c)}
.lock-working{font-size:.8rem;color:var(--mu);font-weight:500;margin-bottom:44px}
.lock-working strong{color:var(--tx);font-weight:700}
.lock-unlock-btn{background:none;border:1px solid #ef444428;color:#ef444488;border-radius:12px;padding:11px 22px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:700;font-size:.82rem;transition:all .2s;letter-spacing:.02em}
.lock-unlock-btn:hover{background:#ef444412;border-color:#ef4444;color:#ef4444}
.lock-done-card{background:var(--s);border:1px solid #c8ff5740;border-radius:20px;padding:32px 28px;max-width:380px;width:100%}
.lock-done-title{font-family:'Syne',sans-serif;font-weight:800;font-size:1.6rem;color:var(--ac);margin-bottom:8px}
.lock-done-sub{font-size:.85rem;color:var(--mu);margin-bottom:24px;font-weight:500}
.lock-done-btns{display:flex;flex-direction:column;gap:10px}
.lock-more-btn{background:var(--ac);color:#000;border:none;border-radius:11px;padding:13px;font-family:'Syne',sans-serif;font-weight:700;font-size:.9rem;cursor:pointer;transition:background .15s}
.lock-more-btn:hover{background:#d9ff70}
.lock-back-btn{background:var(--s);border:1px solid var(--b2);color:var(--tx2);border-radius:11px;padding:13px;font-family:'Syne',sans-serif;font-weight:700;font-size:.9rem;cursor:pointer;transition:all .15s}
.lock-back-btn:hover{color:var(--tx);border-color:var(--mu)}

/* ── PIN numpad ── */
.pin-dots{display:flex;gap:14px;justify-content:center;margin-bottom:28px}
.pin-dot{width:14px;height:14px;border-radius:50%;border:2px solid var(--b2);transition:all .2s}
.pin-dot.filled{background:var(--ac);border-color:var(--ac)}
.pin-numpad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:240px;margin:0 auto 16px}
.pin-key{background:var(--s);border:1px solid var(--b2);border-radius:13px;padding:18px 10px;font-family:'Syne',sans-serif;font-weight:700;font-size:1.3rem;color:var(--tx);cursor:pointer;transition:all .12s;text-align:center;user-select:none}
.pin-key:hover{background:var(--b2)}
.pin-key:active{transform:scale(.93);background:var(--b2)}
.pin-key.del{font-size:1rem;color:var(--mu)}
.pin-error{color:#ef4444;font-size:.8rem;font-weight:600;text-align:center;margin-top:8px;animation:pinShake .3s ease}
@keyframes pinShake{0%,100%{transform:translateX(0)}25%,75%{transform:translateX(-10px)}50%{transform:translateX(10px)}}
.lock-dur-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:20px}
.lock-dur-opt{background:var(--s);border:1px solid var(--b2);border-radius:11px;padding:14px 8px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:700;font-size:1rem;color:var(--tx2);transition:all .15s;text-align:center}
.lock-dur-opt:hover{border-color:var(--mu);color:var(--tx)}
.lock-dur-opt.sel{background:var(--ac);border-color:var(--ac);color:#000}
`;

// ─── Initial data & App ───────────────────────────────────────────────────────
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
  const [activeTask,    setActiveTask]    = useState(null); // task object
  const [activeTaskDk,  setActiveTaskDk]  = useState(null); // day key for that task
  const [prevView,      setPrevView]      = useState("home");

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showHoursModal,  setShowHoursModal]  = useState(false);
  const [hoursModalDay,   setHoursModalDay]   = useState(null);
  const [showRemind,      setShowRemind]      = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renamingFolder,  setRenamingFolder]  = useState(null);
  const [renameText,      setRenameText]      = useState("");
  const [confetti,        setConfetti]        = useState(false);

  // Lock state
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
  const [pinStep,          setPinStep]          = useState(1); // 1=set, 2=confirm
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

  const [tick, setTick] = useState(0); // for live timer re-renders

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
    if(!user) return;
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
          // Restore active lock if still valid
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

  // ── Lock tick — check if lock expired ────────────────────────────────────────
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
    // Auto-start timer if not running
    if(activeTask && !activeTask.timerRunning) startTimer(activeTask.id);
    // Save to Firebase so lock persists on refresh
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

  // ── Timer controls (start/pause from task detail view) ─────────────────────
  const startTimer = (taskId) => {
    const now = Date.now();
    playStart();
    setTasks(prev=>prev.map(t=>{
      if(t.id===taskId){
        return {...t, timerRunning:true, timerStartedAt:now};
      } else if(t.timerRunning){
        // pause any other running timer
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
      // Check day complete
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
    // Pause any running timer that isn't this task
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
    return(
      <div className="rings-card">
        <Ring pct={wp} color="#a78bfa" size={82} stroke={8} label={"This\nWeek"} val={`${wp}%`}/>
        <div className="ring-div"/>
        <Ring pct={dp} color="#c8ff57" size={90} stroke={9} label="Today" val={`${dp}%`}/>
        <div className="ring-div"/>
        <Ring pct={hp} color="#fb923c" size={82} stroke={8} label={"Hours\nUsed"} val={`${Math.round(hl*10)/10}h`} sub="left" onClick={()=>openHours(dk)}/>
        {hoursFor(dk)-secsTracked(dk)/3600<0&&<div className="overload">⚠ Over budget</div>}
        {/* Hours progress bar */}
        <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"0 18px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:".6rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>{fmtTimer(secsTracked(dk))} worked</span>
            <span style={{fontSize:".6rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>{hoursFor(dk)} hrs goal</span>
          </div>
          <div style={{width:"100%",height:5,background:"#1a1a1a",borderRadius:99,overflow:"hidden"}}>
            <div style={{
              height:"100%",borderRadius:99,
              background:"linear-gradient(90deg,#fb923c,#fbbf24)",
              width:`${hp}%`,
              transition:"width .8s cubic-bezier(.34,1.56,.64,1)",
              minWidth:secsTracked(dk)>0?"6px":"0",
              boxShadow:hp>0?"0 0 8px #fb923c60":"none"
            }}/>
          </div>
        </div>
      </div>
    );
  };

  // ── Task Row ─────────────────────────────────────────────────────────────────
  const TaskRow = ({task, dk, color, from}) => {
    const done = isDone(task, dk);
    const secs = getLiveSecs(task);
    const hasTime = secs > 0;
    const isRunning = task.timerRunning;

    // Due date badge
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
        onClick={()=>!done&&goTask(task,dk,from??view)}
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

    // Generate next 8 days as start options
    const startOptions = Array.from({length:8},(_,i)=>{
      const d=new Date(); d.setDate(d.getDate()+i); d.setHours(0,0,0,0);
      const label = i===0?"Today":i===1?"Tomorrow":DAYS[(d.getDay()+6)%7]+(i>6?" +1wk":"");
      return { value:dStr(d), label };
    });

    // Due date options relative to start date
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
        day:dayKey, // backward compat
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

        {/* Options toggle row */}
        <div className="add-opts">
          <button
            className={`rec-btn${showDates?" on":""}`}
            onClick={()=>setShowDates(d=>!d)}
            style={{fontSize:".78rem"}}
          >
            📅 {showDates?"Hide dates":"Set dates"}
          </button>
          <button className={`rec-btn${taskRecur?" on":""}`} onClick={()=>setTaskRecur(r=>!r)}>🔁 Repeat</button>
        </div>

        {/* Date pickers */}
        {showDates&&!taskRecur&&(
          <div style={{background:"var(--s)",border:"1px solid var(--b2)",borderRadius:12,padding:"14px",marginTop:8,display:"flex",flexDirection:"column",gap:14}}>

            {/* Start date */}
            <div>
              <div style={{fontSize:".65rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>
                📅 Start working on
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {startOptions.map(opt=>(
                  <button key={opt.value}
                    onClick={()=>{ setTaskStartDate(opt.value); setTaskDueDate(null); }}
                    style={{
                      background:taskStartDate===opt.value?"var(--ac)":"var(--bg)",
                      color:taskStartDate===opt.value?"#000":"var(--tx2)",
                      border:`1px solid ${taskStartDate===opt.value?"var(--ac)":"var(--b2)"}`,
                      borderRadius:8,padding:"5px 11px",cursor:"pointer",
                      fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:".75rem",
                      transition:"all .15s",
                    }}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            {/* Due date */}
            <div>
              <div style={{fontSize:".65rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>
                ⏰ Due by
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {getDueOptions().map((opt,i)=>(
                  <button key={i}
                    onClick={()=>setTaskDueDate(opt.value)}
                    style={{
                      background:taskDueDate===opt.value?"#ef4444":opt.value===null&&taskDueDate===null?"var(--b2)":"var(--bg)",
                      color:taskDueDate===opt.value?"#fff":opt.value===null&&taskDueDate===null?"var(--tx2)":"var(--tx2)",
                      border:`1px solid ${taskDueDate===opt.value?"#ef4444":opt.value===null&&taskDueDate===null?"var(--mu)":"var(--b2)"}`,
                      borderRadius:8,padding:"5px 11px",cursor:"pointer",
                      fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:".75rem",
                      transition:"all .15s",
                    }}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div style={{fontSize:".72rem",color:"var(--mu)",fontWeight:500,padding:"8px 10px",background:"var(--bg)",borderRadius:8,lineHeight:1.6}}>
              {taskRecur?"Recurring task":(<>
                Starts <strong style={{color:"var(--tx)"}}>{startOptions.find(o=>o.value===taskStartDate)?.label??taskStartDate}</strong>
                {taskDueDate&&<> · Due <strong style={{color:"#fb923c"}}>{taskDueDate===taskStartDate?"same day":getDueOptions().find(o=>o.value===taskDueDate)?.label??taskDueDate}</strong></>}
                {!taskDueDate&&<> · <span style={{color:"var(--mu)"}}>No deadline</span></>}
              </>)}
            </div>
          </div>
        )}

        {/* Recurring day picker */}
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
              // Get start of current week (Monday)
              const weekStart = new Date(); weekStart.setHours(0,0,0,0);
              weekStart.setDate(weekStart.getDate() - todayIdx());
              const weekStartStr = dStr(weekStart);

              const enriched = [...folders].map(f=>{
                // Tasks due today in this folder
                const todayFolderTasks = tasksForDay(todayDk).filter(t=>t.folderId===f.id);
                const doneToday = todayFolderTasks.filter(t=>isDone(t,todayDk)).length;
                const todayCount = todayFolderTasks.length;

                // % = tasks completed this week / tasks due this week (not total ever)
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

              // Split: active (has tasks today) vs inactive (no tasks today)
              const active   = enriched.filter(e=>e.hasTasksToday).sort((a,b)=>b.todayCount-a.todayCount);
              const inactive = enriched.filter(e=>!e.hasTasksToday);

              const FolderRow = ({e, dimmed}) => {
                const {f,todayCount,doneToday,weekDue,weekDone,weekPctF,totalSecs} = e;
                return(
                  <div key={f.id}
                    className="folder-row"
                    style={{"--fc": dimmed?"#444":f.color, opacity: dimmed?0.45:1}}
                    onClick={()=>goFolder(f.id)}
                  >
                    <div className="folder-row-icon" style={{filter:dimmed?"grayscale(1)":"none"}}>{f.icon}</div>
                    <div className="folder-row-main">
                      <div className="folder-row-name" style={{color:dimmed?"var(--mu)":"var(--tx)"}}>{f.name}</div>
                      <div className="folder-row-bar-bg">
                        <div className="folder-row-bar-f" style={{width:`${weekPctF}%`,background:dimmed?"#444":f.color}}/>
                      </div>
                    </div>
                    <div className="folder-row-stats">
                      <div className="f-stat">
                        <span className="f-stat-val" style={{color:dimmed?"var(--mu)":todayCount>0?f.color:"var(--tx2)"}}>
                          {dimmed?"—":`${doneToday}/${todayCount}`}
                        </span>
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
                  {/* Active folders — have tasks due today */}
                  {active.map(e=><FolderRow key={e.f.id} e={e} dimmed={false}/>)}

                  {/* Inactive folders — nothing due today */}
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

        {/* Stats sidebar */}
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
                <div style={{
                  height:"100%",borderRadius:99,
                  background:"linear-gradient(90deg,#fb923c,#fbbf24)",
                  width:`${Math.min(100,(secsTracked(dk)/3600/hoursFor(dk))*100)}%`,
                  transition:"width .8s ease",
                  minWidth:secsTracked(dk)>0?"6px":"0"
                }}/>
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

  // ── Day View ──────────────────────────────────────────────────────────────────
  const DayView = () => {
    const dk=activeDay, idx=DAY_KEYS.indexOf(dk), label=DAYS[idx], isT=idx===todayIdx();
    const dt=tasksForDay(dk), done=dt.filter(t=>isDone(t,dk)).length, pct=donePct(dt,dk);
    const hl=hoursLeft(dk), st=secsTracked(dk);
    const grouped=folders.map(f=>({f,ts:dt.filter(t=>t.folderId===f.id)})).filter(g=>g.ts.length);
    const other=dt.filter(t=>!folders.find(f=>f.id===t.folderId));
    return(
      <div className="page">
        <div className="view-hdr">
          <div className="view-title">{label}{isT?" · Today":""}</div>
          <div className="view-sub">{dt.length} tasks · {done} completed</div>
        </div>
        <RingsCard dk={dk}/>

        {/* Time worked progress bar — shows momentum not deficit */}
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
                  <div className="time-progress-worked">
                    {workedMins < 60 ? `${workedMins} min` : fmtHrs(st/3600)} worked today
                  </div>
                  {winMsg && <div className="time-win-msg">{winMsg}</div>}
                </div>
                <div className="time-progress-goal">
                  Goal: {budgetHrs} hrs
                  <button style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".7rem",marginLeft:8,fontFamily:"'Montserrat',sans-serif",fontWeight:600,textDecoration:"underline"}} onClick={()=>openHours(dk)}>change</button>
                </div>
              </div>
              <div className="time-progress-bar-bg">
                <div className={`time-progress-bar-fill${pctWorked===0?" zero":""}`} style={{width:`${Math.max(pctWorked,pctWorked>0?1:0)}%`}}/>
              </div>
              <div className="time-progress-milestones">
                {milestones.map(m=>(
                  <span key={m.pct} className={`time-milestone${pctWorked>=m.pct?" hit":""}`}>{m.label}</span>
                ))}
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
        {[0,1,2,3].map(i=>(
          <div key={i} className={`pin-dot${(currentPin||"").length>i?" filled":""}`}/>
        ))}
      </div>
      <div className="pin-numpad">
        {[1,2,3,4,5,6,7,8,9].map(n=>(
          <div key={n} className="pin-key" onClick={()=>handlePinKey(String(n))}>{n}</div>
        ))}
        <div className="pin-key" style={{visibility:"hidden"}}/>
        <div className="pin-key" onClick={()=>handlePinKey("0")}>0</div>
        <div className="pin-key del" onClick={handlePinDel}>⌫</div>
      </div>
      {pinError&&<div className="pin-error">{pinError}</div>}
    </div>
  );

  // ── Task Detail View (Focus Mode) ─────────────────────────────────────────────
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

        {/* Date info */}
        <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap",marginBottom:20}}>
          {task.startDate&&<span style={{fontSize:".72rem",color:"var(--mu)",background:"var(--s)",border:"1px solid var(--b2)",padding:"4px 12px",borderRadius:99,fontWeight:600}}>📅 Starts {task.startDate===dStr()?"today":task.startDate}</span>}
          {task.dueDate&&(()=>{
            const diff=Math.round((new Date(task.dueDate)-new Date(dStr()))/86400000);
            const col=diff<0?"#ef4444":diff===0?"#fb923c":diff===1?"#fbbf24":"var(--mu)";
            const lbl=diff<0?`Overdue by ${Math.abs(diff)}d`:diff===0?"Due today":diff===1?"Due tomorrow":`Due in ${diff}d`;
            return <span style={{fontSize:".72rem",color:col,background:col+"15",border:`1px solid ${col}40`,padding:"4px 12px",borderRadius:99,fontWeight:700}}>⏰ {lbl}</span>;
          })()}
        </div>

        {done&&(
          <div className="task-done-badge">✓ Completed</div>
        )}

        {/* Big Timer Card */}
        <div className={`timer-card${isRunning?" running":""}`}>
          <div className="timer-digits">{fmtTimer(secs)}</div>
          <div className="timer-status">{isRunning?"Working on this task…":"Timer paused"}</div>
          {!done&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
              {isRunning
                ?<button className="timer-btn pause" onClick={()=>pauseTimer(task.id)}>⏸ Pause</button>
                :<button className="timer-btn start" onClick={()=>startTimer(task.id)}>▶ Start Working</button>
              }
              <button onClick={openLockFlow} style={{
                background:"#c8ff5718",
                border:"1px solid #c8ff57",
                color:"#c8ff57",
                borderRadius:10,
                padding:"10px 28px",
                cursor:"pointer",
                fontFamily:"'Syne',sans-serif",
                fontWeight:700,
                fontSize:".85rem",
                letterSpacing:".04em",
                transition:"all .2s",
              }}
              onMouseEnter={e=>{e.currentTarget.style.background="#c8ff5730";}}
              onMouseLeave={e=>{e.currentTarget.style.background="#c8ff5718";}}>
                🔒 Lock In
              </button>
            </div>
          )}
          <div className="timer-stats">
            <div className="t-stat">
              <div className="t-stat-val">{fmtTimer(task.timerSeconds??0)}</div>
              <div className="t-stat-lbl">This task</div>
            </div>
            <div className="t-stat">
              <div className="t-stat-val">{fmtTimer(totalSecsToday)}</div>
              <div className="t-stat-lbl">Today total</div>
            </div>
            <div className="t-stat">
              <div className="t-stat-val">{fmtHrs(hoursLeft(dk))}</div>
              <div className="t-stat-lbl">Budget left</div>
            </div>
          </div>
        </div>

        {/* Complete actions */}
        {!done&&!showRemind&&(
          <div className="detail-actions">
            <button className="action-btn complete" onClick={()=>completeTask(null)}>✓ Mark Complete</button>
            <button className="action-btn remind" onClick={()=>setShowRemind(true)}>⏰ Complete & Remind</button>
          </div>
        )}

        {/* Remind options */}
        {!done&&showRemind&&(
          <div className="remind-section">
            <div className="remind-title">Remind me in</div>
            <div className="remind-grid">
              {REMIND_OPTS.map(d=>(
                <button key={d} className="remind-opt" onClick={()=>completeTask(d)}>
                  {d===1?"Tomorrow":`${d}d`}
                </button>
              ))}
            </div>
            <div style={{textAlign:"center",marginTop:12}}>
              <button style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".8rem",fontFamily:"'Montserrat',sans-serif",fontWeight:500}} onClick={()=>setShowRemind(false)}>← Back</button>
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
            {g.items.map((item,idx)=>(
              <TaskRow key={`${item.task.id}-${item.dk}-${idx}`} task={item.task} dk={item.dk} color={item.folder?.color??"var(--ac)"} from="all"/>
            ))}
          </div>
        )):groups.map(g=>(
          <div className="day-section" key={g.key}>
            <div className="day-section-hdr">
              <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:".88rem",color:g.color}}>{g.icon} {g.label}</span>
              <span style={{marginLeft:"auto",fontSize:".72rem",color:"var(--mu)",fontWeight:600}}>{g.items.filter(i=>i.done).length}/{g.items.length}</span>
            </div>
            {g.items.map((item,idx)=>(
              <TaskRow key={`${item.task.id}-${item.dk}-${idx}`} task={item.task} dk={item.dk} color={g.color} from="all"/>
            ))}
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
        <div style={{color:"#333",fontSize:".9rem",fontFamily:"'Montserrat',sans-serif",fontWeight:600}}>Loading…</div>
      </div>
    </>
  );

  if(!user) return(
    <>
      <style>{css}</style>
      <div className="login">
        <div className="login-card">
          <div className="login-logo">focus<span>.</span></div>
          <div className="login-tagline">The ADHD task manager that makes time visible</div>
          <button className="google-btn" onClick={()=>signInWithPopup(auth,googleProvider)}>
            <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
          <div className="login-note">Your data syncs across all your devices. Free forever.</div>
        </div>
      </div>
    </>
  );

  // ── Main ───────────────────────────────────────────────────────────────────────
  const isInSubView = view==="day"||view==="folder"||view==="task";
  return(
    <>
      <style>{css}</style>
      <div className="app">
        <div className="nav">
          <div className="logo">focus<em>.</em></div>
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

        {/* Hide tab bar when in task detail */}
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

      {/* ── LOCK SCREEN ── */}
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
            <div className="lock-working">
              Working for <strong>{fmtTimer(workedSecs)}</strong>
            </div>
            <button className="lock-unlock-btn" onClick={()=>{ setPinInput(""); setPinError(""); setShowPinUnlock(true); }}>
              🔓 Unlock early
            </button>

            {/* PIN unlock overlay */}
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

      {/* ── Lock duration modal ── */}
      {showLockModal&&!isLocked&&(
        <div className="overlay" onClick={()=>setShowLockModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">🔒 Lock In</div>
            <div style={{fontSize:".82rem",color:"var(--mu)",marginBottom:18,fontWeight:500,lineHeight:1.6}}>
              Lock yourself in on <strong style={{color:"var(--tx)"}}>{activeTask?.text}</strong>.<br/>
              You'll need your PIN to exit early.
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

      {/* ── PIN setup modal ── */}
      {showPinSetModal&&(
        <div className="overlay">
          <div className="modal" style={{maxWidth:320}}>
            <div className="modal-title" style={{textAlign:"center"}}>
              {pinStep===1?"Set your PIN":"Confirm your PIN"}
            </div>
            <div style={{fontSize:".8rem",color:"var(--mu)",textAlign:"center",marginBottom:20,fontWeight:500}}>
              {pinStep===1
                ?"Choose a 4-digit PIN. You'll need this to unlock early."
                :"Enter the same PIN again to confirm."}
            </div>
            <PinNumpad
              currentPin={pinStep===1?pinInput:pinConfirm}
              label={pinStep===1?"Enter PIN":"Confirm PIN"}
            />
            <button className="btn-c" style={{width:"100%",marginTop:12,textAlign:"center"}} onClick={()=>{setShowPinSetModal(false);setPinInput("");setPinStep(1);}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Rename Folder Modal */}
      {showRenameModal&&(
        <div className="overlay" onClick={()=>setShowRenameModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Rename Folder</div>
            <div className="modal-lbl">New name</div>
            <input className="modal-in" value={renameText} autoFocus
              onChange={e=>setRenameText(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&saveRename()}
              placeholder="Folder name"/>
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
            <input className="modal-in" value={nfName} autoFocus onChange={e=>setNfName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&createFolder()} placeholder="e.g. House Chores"/>
            <div className="modal-lbl">Icon</div>
            <div className="icon-grid">
              {ICON_OPTIONS.map(icon=>(
                <div key={icon} className={`icon-opt${nfIcon===icon?" sel":""}`} onClick={()=>setNfIcon(icon)}>{icon}</div>
              ))}
            </div>
            <div className="modal-lbl">Color</div>
            <div className="swatches">{COLORS.map(c=>(<div key={c} className={`sw${nfColor===c?" sel":""}`} style={{background:c}} onClick={()=>setNfColor(c)}/>))}</div>

            {/* Preview */}
            <div style={{borderRadius:12,padding:"14px 16px",marginBottom:18,
              background:`linear-gradient(145deg, ${nfColor}ee, ${nfColor}aa)`,
              display:"flex",alignItems:"center",gap:10}}>
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
