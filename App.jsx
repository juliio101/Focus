import { useState, useRef, useEffect, useCallback } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase.js";

const DAYS      = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DAY_KEYS  = ["mon","tue","wed","thu","fri","sat","sun"];
const COLORS    = ["#c8ff57","#60a5fa","#fb923c","#c084fc","#f472b6","#34d399","#fbbf24"];
const ICONS     = ["🏠","💼","🎯","🛒","📚","🏋️","🎮","🧘","🌿","✈️"];
const TIME_OPTS = [15,30,60,90,120,180];
const TIME_LBL  = ["15m","30m","1h","1.5h","2h","3h"];
const HR_PRESET = [4,6,7,8,9,10,12];

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
  const set=new Set(dates),t=dStr(),y=dStr(new Date(Date.now()-864e5));
  if(!set.has(t)&&!set.has(y)) return 0;
  let s=0,cur=new Date(set.has(t)?t:y);
  while(set.has(dStr(cur))){ s++; cur.setDate(cur.getDate()-1); }
  return s;
};
const fmtH = h => h===Math.floor(h)?`${h}h`:`${h.toFixed(1)}h`;

let _ac=null;
const getAC=()=>{ if(!_ac) _ac=new(window.AudioContext||window.webkitAudioContext)(); if(_ac.state==="suspended") _ac.resume(); return _ac; };
const tone=(freq,vol=0.1,dur=0.08)=>{ try{ const c=getAC(),o=c.createOscillator(),g=c.createGain(); o.connect(g);g.connect(c.destination); o.frequency.value=freq;g.gain.setValueAtTime(vol,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+dur); o.start();o.stop(c.currentTime+dur); }catch(e){} };
const playCheck=()=>tone(880,0.1,0.07);
const playUncheck=()=>tone(440,0.06,0.06);
const playWin=()=>[523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,0.1,0.2),i*100));

function Confetti({ onDone }) {
  useEffect(()=>{ const t=setTimeout(onDone,2400); return()=>clearTimeout(t); },[]);
  const ps=Array.from({length:52},(_,i)=>({
    id:i,left:Math.random()*100,color:COLORS[i%COLORS.length],
    delay:Math.random()*.5,w:Math.random()*10+5,h:Math.random()*6+4,
    rot:Math.random()*720*(Math.random()>.5?1:-1),drift:(Math.random()-.5)*200,dur:Math.random()*.9+1
  }));
  return (
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

function Ring({pct=0,color="#c8ff57",size=96,stroke=9,label,val,sub,onClick}){
  const r=(size-stroke)/2,circ=2*Math.PI*r,offset=circ*(1-Math.min(pct,100)/100);
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

const INIT_FOLDERS=[
  {id:1,name:"House Chores",color:"#c8ff57",icon:"🏠"},
  {id:2,name:"Work",color:"#60a5fa",icon:"💼"},
];
const INIT_TASKS=[
  {id:1,text:"Vacuum living room",folderId:1,recurring:false,day:todayKey(),done:false,estimatedMinutes:30},
  {id:2,text:"Do the dishes",folderId:1,recurring:true,recurringDays:["mon","wed","fri"],doneOn:[],estimatedMinutes:15},
  {id:3,text:"Check emails",folderId:2,recurring:true,recurringDays:["mon","tue","wed","thu","fri"],doneOn:[],estimatedMinutes:30},
];
const INIT_DATA={folders:INIT_FOLDERS,tasks:INIT_TASKS,completedDates:[],bestStreak:0,dayHours:{}};

const css=`
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#060606;font-family:'Inter',sans-serif;color:#e2e2e2;-webkit-font-smoothing:antialiased;min-height:100vh}
:root{--bg:#060606;--s:#101010;--b:#1e1e1e;--b2:#2a2a2a;--mu:#555;--tx:#e2e2e2;--tx2:#777;--ac:#c8ff57;--r:14px}

.login{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:20px}
.login-card{background:var(--s);border:1px solid var(--b2);border-radius:24px;padding:44px 36px;max-width:380px;width:100%;text-align:center}
.login-logo{font-family:'Syne',sans-serif;font-weight:800;font-size:2.4rem;color:var(--tx);letter-spacing:-1px;margin-bottom:8px}
.login-logo span{color:var(--ac)}
.login-tagline{font-size:.82rem;color:var(--mu);margin-bottom:36px;line-height:1.7}
.google-btn{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;background:#fff;color:#1a1a1a;border:none;border-radius:12px;padding:14px 20px;font-family:'Inter',sans-serif;font-weight:600;font-size:.95rem;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 2px 8px #0004}
.google-btn:hover{transform:translateY(-2px);box-shadow:0 6px 20px #0006}
.google-btn svg{width:20px;height:20px;flex-shrink:0}
.login-note{font-size:.72rem;color:var(--mu);margin-top:20px;line-height:1.7}

.app{min-height:100vh;background:var(--bg)}
.nav{display:flex;align-items:center;justify-content:space-between;padding:18px 22px 0;max-width:700px;margin:0 auto}
.logo{font-family:'Syne',sans-serif;font-weight:800;font-size:1.2rem;color:var(--tx);letter-spacing:-.3px}
.logo em{color:var(--ac);font-style:normal}
.nav-right{display:flex;align-items:center;gap:10px}
.back-btn{background:none;border:1px solid var(--b2);color:var(--tx2);border-radius:99px;padding:6px 14px;cursor:pointer;font-family:'Inter',sans-serif;font-size:.75rem;font-weight:500;transition:all .15s}
.back-btn:hover{color:var(--tx);border-color:var(--mu)}
.signout-btn{background:none;border:none;color:var(--mu);cursor:pointer;font-size:.75rem;font-family:'Inter',sans-serif;transition:color .15s;padding:4px}
.signout-btn:hover{color:var(--tx2)}
.avatar{width:28px;height:28px;border-radius:50%;border:1.5px solid var(--b2);object-fit:cover}

.page{max-width:700px;margin:0 auto;padding:24px 20px 80px}

.streak{display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,#c8ff5712,#c8ff5706);border:1px solid #c8ff5728;border-radius:14px;padding:13px 16px;margin-bottom:20px}
.streak-num{font-family:'Syne',sans-serif;font-weight:800;font-size:1.25rem;color:var(--ac);line-height:1}
.streak-lbl{font-size:.72rem;color:var(--mu);margin-top:2px}

.rings-card{background:var(--s);border:1px solid var(--b);border-radius:20px;padding:22px 16px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-around;position:relative}
.ring-div{width:1px;height:60px;background:var(--b)}
.overload{position:absolute;bottom:-11px;left:50%;transform:translateX(-50%);background:#ef4444;color:#fff;font-size:.65rem;padding:3px 10px;border-radius:99px;white-space:nowrap;font-family:'Inter',sans-serif;font-weight:600}

.page-title{font-family:'Syne',sans-serif;font-size:clamp(1.6rem,4vw,2.4rem);font-weight:800;letter-spacing:-.5px;color:var(--tx);margin-bottom:4px}
.page-sub{font-size:.75rem;color:var(--mu);margin-bottom:22px}
.day-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:28px}
.day-card{background:var(--s);border:1px solid var(--b);border-radius:10px;padding:10px 4px 8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:5px;transition:all .18s}
.day-card:hover{border-color:var(--b2);transform:translateY(-2px)}
.day-card.today{border-color:var(--ac)}
.day-lbl{font-family:'Syne',sans-serif;font-size:.65rem;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:.04em}
.day-card.today .day-lbl{color:var(--ac)}
.day-bar{width:100%;height:3px;background:var(--b2);border-radius:99px;overflow:hidden}
.day-bar-f{height:100%;border-radius:99px;transition:width .4s ease}
.day-cnt{font-size:.62rem;color:var(--tx2)}

.sec-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:13px}
.sec-title{font-family:'Syne',sans-serif;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--mu)}
.ghost-btn{background:none;border:1px solid var(--b2);color:var(--tx2);border-radius:8px;padding:6px 14px;cursor:pointer;font-family:'Inter',sans-serif;font-size:.78rem;font-weight:500;transition:all .15s}
.ghost-btn:hover{color:var(--tx);border-color:var(--mu)}
.folders-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.folder-card{background:var(--s);border:1px solid var(--b);border-radius:var(--r);padding:15px;cursor:pointer;transition:all .18s;position:relative;overflow:hidden}
.folder-card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:var(--fc)}
.folder-card:hover{border-color:var(--b2);transform:translateY(-2px)}
.f-name{font-family:'Syne',sans-serif;font-size:.9rem;font-weight:700;color:var(--tx);margin-bottom:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.f-bar-bg{width:100%;height:3px;background:var(--b2);border-radius:99px;overflow:hidden;margin-bottom:5px}
.f-bar-f{height:100%;border-radius:99px;background:var(--fc);transition:width .4s}
.f-foot{display:flex;justify-content:space-between}

.view-hdr{margin-bottom:18px}
.view-title{font-family:'Syne',sans-serif;font-size:clamp(1.4rem,4vw,2.1rem);font-weight:800;letter-spacing:-.5px;color:var(--tx);margin-bottom:3px}
.view-sub{font-size:.75rem;color:var(--mu)}

.hours-row{display:flex;gap:8px;margin-bottom:18px}
.h-chip{flex:1;background:var(--s);border:1px solid var(--b);border-radius:11px;padding:11px 13px;cursor:default}
.h-chip.clickable{cursor:pointer;transition:border-color .15s}
.h-chip.clickable:hover{border-color:var(--ac)}
.h-val{font-family:'Syne',sans-serif;font-weight:700;font-size:1rem;color:var(--tx)}
.h-lbl{font-size:.65rem;color:var(--mu);margin-top:2px}

.big-prog{background:var(--s);border:1px solid var(--b);border-radius:var(--r);padding:18px;margin-bottom:18px}
.big-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}
.big-frac{font-family:'Syne',sans-serif;font-weight:800;font-size:1.7rem;color:var(--tx)}
.big-frac .d{color:var(--mu);font-size:1rem}
.big-pct{font-size:.8rem}
.big-bar{height:7px;background:var(--b2);border-radius:99px;overflow:hidden}
.big-fill{height:100%;border-radius:99px;transition:width .5s cubic-bezier(.34,1.56,.64,1)}
.all-done{text-align:center;font-size:.72rem;color:var(--ac);text-transform:uppercase;letter-spacing:.08em;margin-top:8px}

.task-grp{margin-bottom:18px}
.grp-hdr{display:flex;align-items:center;gap:7px;margin-bottom:8px}
.grp-lbl{font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em}
.rec-badge{font-size:.62rem;background:#ffffff0a;border-radius:4px;padding:1px 6px;color:var(--tx2)}
.task-row{background:var(--s);border:1px solid var(--b);border-radius:11px;padding:12px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:border-color .15s,opacity .2s;animation:fup .22s ease;margin-bottom:6px}
@keyframes fup{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.task-row:hover{border-color:var(--b2)}
.task-row.done{opacity:.35}
.task-row.done .task-txt{text-decoration:line-through;color:var(--mu)}
.chk{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--b2);flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .2s}
.task-row.done .chk{background:var(--rc,var(--ac));border-color:var(--rc,var(--ac))}
.chk-v{font-size:.6rem;color:#000;display:none;font-weight:900}
.task-row.done .chk-v{display:block}
.task-txt{flex:1;font-size:.88rem;color:var(--tx);line-height:1.5}
.rec-dot{width:4px;height:4px;border-radius:50%;background:var(--rc,var(--ac));flex-shrink:0;opacity:.5}
.time-pill{font-size:.65rem;color:var(--tx2);background:var(--b);border-radius:5px;padding:2px 8px;flex-shrink:0;font-weight:500}
.del-btn{background:none;border:none;color:var(--b2);cursor:pointer;font-size:1.1rem;padding:2px 4px;border-radius:5px;opacity:0;transition:all .15s;flex-shrink:0;line-height:1}
.task-row:hover .del-btn{opacity:1}
.del-btn:hover{color:#ef4444}

.add-area{margin-top:10px}
.add-row{display:flex;gap:8px}
.add-in{flex:1;background:var(--s);border:1px solid var(--b2);border-radius:10px;padding:11px 14px;color:var(--tx);font-family:'Inter',sans-serif;font-size:.88rem;outline:none;transition:border-color .15s}
.add-in::placeholder{color:var(--mu)}
.add-in:focus{border-color:var(--ac)}
.add-btn{background:var(--ac);color:#000;border:none;border-radius:10px;padding:11px 18px;font-family:'Syne',sans-serif;font-weight:800;font-size:1.2rem;cursor:pointer;flex-shrink:0;transition:transform .15s,background .15s;line-height:1}
.add-btn:hover{background:#d9ff70;transform:scale(1.05)}
.add-opts{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center}
.est-lbl{font-size:.72rem;color:var(--mu);font-weight:500}
.time-opt{background:var(--s);border:1px solid var(--b2);border-radius:7px;padding:4px 11px;cursor:pointer;font-size:.72rem;color:var(--tx2);font-weight:500;transition:all .15s;font-family:'Inter',sans-serif}
.time-opt.sel{background:var(--ac);border-color:var(--ac);color:#000;font-weight:600}
.time-opt:hover:not(.sel){border-color:var(--mu);color:var(--tx)}
.rec-btn{background:none;border:1px solid var(--b2);color:var(--tx2);border-radius:7px;padding:4px 10px;cursor:pointer;font-size:.85rem;transition:all .15s}
.rec-btn.on{border-color:var(--ac);color:var(--ac);background:#c8ff5710}
.day-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
.dc{background:var(--s);border:1px solid var(--b2);border-radius:6px;padding:4px 10px;cursor:pointer;font-size:.7rem;font-family:'Syne',sans-serif;font-weight:700;color:var(--tx2);transition:all .15s}
.dc.sel{background:var(--ac);border-color:var(--ac);color:#000}

.empty{text-align:center;padding:28px 0;color:var(--mu);font-size:.8rem}

.overlay{position:fixed;inset:0;background:#000c;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;animation:fi .15s ease}
@keyframes fi{from{opacity:0}to{opacity:1}}
.modal{background:#131313;border:1px solid var(--b2);border-radius:20px;padding:26px;width:100%;max-width:380px;animation:su .2s cubic-bezier(.34,1.56,.64,1)}
@keyframes su{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.modal-title{font-family:'Syne',sans-serif;font-weight:800;font-size:1.2rem;color:var(--tx);margin-bottom:18px}
.modal-lbl{font-size:.72rem;color:var(--mu);font-weight:500;margin-bottom:7px}
.modal-in{width:100%;background:var(--s);border:1px solid var(--b2);border-radius:9px;padding:11px 14px;color:var(--tx);font-family:'Inter',sans-serif;font-size:.9rem;outline:none;margin-bottom:15px;transition:border-color .15s}
.modal-in:focus{border-color:var(--ac)}
.swatches{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.sw{width:26px;height:26px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:all .15s}
.sw.sel{border-color:#fff;transform:scale(1.2)}
.modal-btns{display:flex;gap:8px;justify-content:flex-end}
.btn-c{background:none;border:1px solid var(--b2);color:var(--tx2);border-radius:8px;padding:9px 16px;cursor:pointer;font-family:'Inter',sans-serif;font-size:.8rem;transition:all .15s}
.btn-c:hover{color:var(--tx);border-color:var(--mu)}
.btn-ok{background:var(--ac);color:#000;border:none;border-radius:8px;padding:9px 18px;font-family:'Syne',sans-serif;font-weight:700;font-size:.88rem;cursor:pointer;transition:background .15s}
.btn-ok:hover{background:#d9ff70}
.hr-presets{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:16px}
.hp{background:var(--s);border:1px solid var(--b2);border-radius:8px;padding:7px 14px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:700;font-size:.9rem;color:var(--tx2);transition:all .15s}
.hp.sel{background:var(--ac);border-color:var(--ac);color:#000}
.del-folder-btn{background:none;border:1px solid #ef444430;color:#ef4444;border-radius:8px;padding:7px 14px;cursor:pointer;font-family:'Inter',sans-serif;font-size:.75rem;font-weight:500;transition:all .15s;margin-top:18px}
.del-folder-btn:hover{background:#ef444412;border-color:#ef4444}

/* Bottom tab bar */
.tab-bar{position:fixed;bottom:0;left:0;right:0;background:#0d0d0d;border-top:1px solid var(--b);display:flex;z-index:50;padding-bottom:env(safe-area-inset-bottom)}
.tab-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px 0 8px;cursor:pointer;background:none;border:none;gap:4px;transition:all .15s}
.tab-btn .tab-icon{font-size:1.1rem;line-height:1}
.tab-btn .tab-lbl{font-size:.62rem;font-family:'Inter',sans-serif;font-weight:500;color:var(--mu);letter-spacing:.03em;transition:color .15s}
.tab-btn.active .tab-lbl{color:var(--ac)}
.tab-btn .tab-dot{width:4px;height:4px;border-radius:50%;background:var(--ac);margin-top:2px;opacity:0;transition:opacity .15s}
.tab-btn.active .tab-dot{opacity:1}
.page{padding-bottom:90px}

/* All tasks view */
.all-tasks-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.sort-tabs{display:flex;gap:6px}
.sort-tab{background:var(--s);border:1px solid var(--b2);color:var(--tx2);border-radius:8px;padding:5px 12px;cursor:pointer;font-family:'Inter',sans-serif;font-size:.75rem;font-weight:500;transition:all .15s}
.sort-tab.active{background:var(--ac);border-color:var(--ac);color:#000;font-weight:600}
.filter-tabs{display:flex;gap:6px;margin-bottom:18px}
.filter-tab{background:var(--s);border:1px solid var(--b2);color:var(--tx2);border-radius:99px;padding:4px 12px;cursor:pointer;font-family:'Inter',sans-serif;font-size:.75rem;font-weight:500;transition:all .15s}
.filter-tab.active{background:var(--b2);color:var(--tx)}
.day-section{margin-bottom:22px}
.day-section-hdr{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--b)}
.day-badge{font-family:'Syne',sans-serif;font-weight:700;font-size:.78rem;padding:3px 10px;border-radius:6px}
.day-badge.is-today{background:#c8ff5720;color:#c8ff57}
.day-badge.is-past{background:#ef444415;color:#ef4444}
.day-badge.is-future{background:var(--s);color:var(--mu)}
.day-section-date{font-size:.7rem;color:var(--mu)}
.day-task-row{background:var(--s);border:1px solid var(--b);border-radius:11px;padding:12px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:6px;transition:border-color .15s,opacity .2s;animation:fup .22s ease}
.day-task-row:hover{border-color:var(--b2)}
.day-task-row.done{opacity:.35}
.day-task-row.done .day-task-txt{text-decoration:line-through;color:var(--mu)}
.day-task-txt{flex:1;font-size:.88rem;color:var(--tx);line-height:1.5}
.folder-badge{font-size:.62rem;padding:2px 7px;border-radius:5px;font-weight:500;flex-shrink:0}

/* Stats sidebar */
.home-layout{display:grid;grid-template-columns:1fr;gap:20px;max-width:1100px;margin:0 auto;padding:24px 20px 90px}
@media(min-width:860px){.home-layout{grid-template-columns:1fr 260px;align-items:start}}
.main-col{}
.stats-col{display:flex;flex-direction:column;gap:10px}
@media(min-width:860px){.stats-col{position:sticky;top:20px}}
.stat-card{background:var(--s);border:1px solid var(--b);border-radius:var(--r);padding:18px}
.stat-card-title{font-size:.62rem;color:var(--mu);text-transform:uppercase;letter-spacing:.1em;font-weight:600;margin-bottom:14px}
.stat-big{font-family:'Syne',sans-serif;font-weight:800;font-size:2.2rem;color:var(--tx);line-height:1;margin-bottom:4px}
.stat-desc{font-size:.7rem;color:var(--mu);line-height:1.5}
.stat-divider{height:1px;background:var(--b);margin:10px 0}
.stat-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0}
.stat-row-lbl{font-size:.75rem;color:var(--tx2)}
.stat-row-val{font-family:'Syne',sans-serif;font-weight:700;font-size:.9rem}
`;

export default function App() {
  const [user,        setUser]        = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [folders,     setFolders]     = useState(INIT_FOLDERS);
  const [tasks,       setTasks]       = useState(INIT_TASKS);
  const [complDates,  setComplDates]  = useState([]);
  const [bestStreak,  setBest]        = useState(0);
  const [dayHours,    setDayHours]    = useState({});
  const [loaded,      setLoaded]      = useState(false);
  const [view,        setView]        = useState("home");
  const [activeDay,   setActiveDay]   = useState(null);
  const [activeFolder,setActiveFolder]= useState(null);
  const [showFolderModal,setShowFolderModal]=useState(false);
  const [showHoursModal, setShowHoursModal] =useState(false);
  const [hoursModalDay,  setHoursModalDay]  =useState(null);
  const [confetti,    setConfetti]    = useState(false);
  const [nfName,      setNfName]      = useState("");
  const [nfColor,     setNfColor]     = useState(COLORS[0]);
  const [pendingHrs,  setPendingHrs]  = useState(8);
  const [taskMins,    setTaskMins]    = useState(30);
  const [taskRecur,   setTaskRecur]   = useState(false);
  const [taskRecDays, setTaskRecDays] = useState([]);

  useEffect(()=>{
    const unsub=onAuthStateChanged(auth,u=>{ setUser(u); setAuthLoading(false); });
    return unsub;
  },[]);

  useEffect(()=>{
    if(!user) return;
    (async()=>{
      const ref=doc(db,"users",user.uid);
      const snap=await getDoc(ref);
      if(snap.exists()){
        const d=snap.data();
        setFolders(d.folders??INIT_FOLDERS);
        setTasks(d.tasks??INIT_TASKS);
        setComplDates(d.completedDates??[]);
        setBest(d.bestStreak??0);
        setDayHours(d.dayHours??{});
      } else {
        await setDoc(ref,INIT_DATA);
      }
      setLoaded(true);
    })();
  },[user]);

  const saveField=useCallback(async(field,val)=>{
    if(!user||!loaded) return;
    await setDoc(doc(db,"users",user.uid),{[field]:val},{merge:true});
  },[user,loaded]);

  useEffect(()=>{ saveField("folders",folders); },[folders,loaded]);
  useEffect(()=>{ saveField("tasks",tasks); },[tasks,loaded]);
  useEffect(()=>{ saveField("dayHours",dayHours); },[dayHours,loaded]);
  useEffect(()=>{
    if(!user||!loaded) return;
    saveField("completedDates",complDates);
    const s=calcStreak(complDates);
    if(s>bestStreak){ setBest(s); saveField("bestStreak",s); }
  },[complDates,loaded]);

  const isDone      = (task,dk)=>task.recurring?(task.doneOn??[]).includes(dateForDK(dk)):task.done;
  const tasksForDay = dk=>tasks.filter(t=>(!t.recurring&&t.day===dk)||(t.recurring&&t.recurringDays?.includes(dk)));
  const folderTasks = fid=>tasks.filter(t=>t.folderId===fid);
  const donePct     = (arr,dk)=>arr.length?Math.round(arr.filter(t=>isDone(t,dk)).length/arr.length*100):0;
  const hoursFor    = dk=>dayHours[dk]??8;
  const minsUsed    = dk=>tasksForDay(dk).filter(t=>isDone(t,dk)).reduce((s,t)=>s+(t.estimatedMinutes??30),0);
  const minsTotal   = dk=>tasksForDay(dk).reduce((s,t)=>s+(t.estimatedMinutes??30),0);
  const hoursLeft   = dk=>Math.max(0,hoursFor(dk)-minsUsed(dk)/60);
  const hoursPct    = dk=>Math.min(100,Math.round(minsUsed(dk)/60/hoursFor(dk)*100));
  const isOverload  = dk=>minsTotal(dk)/60>hoursFor(dk);
  const weekPct     = ()=>{ let t=0,d=0; DAY_KEYS.forEach(dk=>{const dt=tasksForDay(dk);t+=dt.length;d+=dt.filter(x=>isDone(x,dk)).length;}); return t?Math.round(d/t*100):0; };

  const toggle=(id,dk)=>{
    const task=tasks.find(t=>t.id===id),wasDone=isDone(task,dk);
    if(!wasDone) playCheck(); else playUncheck();
    setTasks(prev=>{
      const next=prev.map(t=>{
        if(t.id!==id) return t;
        if(!t.recurring) return{...t,done:!t.done};
        const date=dateForDK(dk),doneOn=t.doneOn??[];
        return{...t,doneOn:doneOn.includes(date)?doneOn.filter(d=>d!==date):[...doneOn,date]};
      });
      if(!wasDone){
        const dayT=next.filter(t=>(!t.recurring&&t.day===dk)||(t.recurring&&t.recurringDays?.includes(dk)));
        const allDone=dayT.length>0&&dayT.every(t=>!t.recurring?t.done:(t.doneOn??[]).includes(dateForDK(dk)));
        if(allDone){ setTimeout(()=>{playWin();setConfetti(true);},80); if(dk===todayKey()) setComplDates(cd=>cd.includes(dStr())?cd:[...cd,dStr()]); }
      }
      return next;
    });
  };

  const deleteTask=(e,id)=>{e.stopPropagation();setTasks(p=>p.filter(t=>t.id!==id));};

  // ── AddRow has its own local text state to prevent scroll on every keystroke ──
  const AddRow=({ dk, fid, placeholder })=>{
    const [text,setText]=useState("");
    const inputRef=useRef(null);

    const submit=()=>{
      const t=text.trim(); if(!t) return;
      const base={id:Date.now(),text:t,folderId:fid??folders[0]?.id??null,estimatedMinutes:taskMins};
      setTasks(p=>[...p, taskRecur
        ?{...base,recurring:true,recurringDays:taskRecDays.length?taskRecDays:[dk??todayKey()],doneOn:[]}
        :{...base,recurring:false,day:dk??todayKey(),done:false}
      ]);
      setText("");
      inputRef.current?.focus();
    };

    return(
      <div className="add-area">
        <div className="add-row">
          <input
            ref={inputRef}
            className="add-in"
            value={text}
            onChange={e=>setText(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&submit()}
            placeholder={placeholder}
          />
          <button className="add-btn" onClick={submit}>+</button>
        </div>
        <div className="add-opts">
          <span className="est-lbl">Est:</span>
          {TIME_OPTS.map((m,i)=>(
            <button key={m} className={`time-opt${taskMins===m?" sel":""}`} onClick={()=>setTaskMins(m)}>{TIME_LBL[i]}</button>
          ))}
          <button className={`rec-btn${taskRecur?" on":""}`} onClick={()=>setTaskRecur(r=>!r)} title="Repeat weekly">🔁</button>
        </div>
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

  const TaskRow=({task,dk,color})=>{
    const done=isDone(task,dk);
    const tl=TIME_LBL[TIME_OPTS.indexOf(task.estimatedMinutes)]??`${task.estimatedMinutes}m`;
    return(
      <div className={`task-row${done?" done":""}`} style={{"--rc":color}} onClick={()=>toggle(task.id,dk)}>
        <div className="chk"><span className="chk-v">✓</span></div>
        {task.recurring&&<div className="rec-dot" style={{background:color}}/>}
        <span className="task-txt">{task.text}</span>
        <span className="time-pill">{tl}</span>
        <button className="del-btn" onClick={e=>deleteTask(e,task.id)}>×</button>
      </div>
    );
  };

  const createFolder=()=>{
    const name=nfName.trim(); if(!name) return;
    setFolders(p=>[...p,{id:Date.now(),name,color:nfColor,icon:ICONS[p.length%ICONS.length]}]);
    setNfName("");setNfColor(COLORS[0]);setShowFolderModal(false);
  };
  const deleteFolder=fid=>{ setFolders(p=>p.filter(f=>f.id!==fid)); setTasks(p=>p.filter(t=>t.folderId!==fid)); goHome(); };
  const openHours=dk=>{ setPendingHrs(hoursFor(dk)); setHoursModalDay(dk); setShowHoursModal(true); };
  const saveHours=()=>{ setDayHours(p=>({...p,[hoursModalDay]:pendingHrs})); setShowHoursModal(false); };
  const goHome=()=>setView("home");
  const goDay=dk=>{ setActiveDay(dk); setView("day"); };
  const goFolder=fid=>{ setActiveFolder(fid); setView("folder"); };
  const streak=calcStreak(complDates);

  // ── Stats calculations ──────────────────────────────────────────────────────
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const monthName = now.toLocaleString("default",{month:"long"});

  // Get Monday of current week
  const getWeekStart = () => {
    const d = new Date(); d.setHours(0,0,0,0);
    d.setDate(d.getDate() - todayIdx());
    return dStr(d);
  };
  const weekStart = getWeekStart();

  const tasksCompletedThisMonth = () => {
    let count = 0;
    tasks.forEach(t => {
      if(!t.recurring && t.done) count++;
      else if(t.recurring) count += (t.doneOn??[]).filter(d=>d.startsWith(monthStr)).length;
    });
    return count;
  };

  const hoursCompletedThisMonth = () => {
    let mins = 0;
    tasks.forEach(t => {
      if(!t.recurring && t.done) mins += t.estimatedMinutes??30;
      else if(t.recurring){
        const n = (t.doneOn??[]).filter(d=>d.startsWith(monthStr)).length;
        mins += n * (t.estimatedMinutes??30);
      }
    });
    return mins/60;
  };

  const hoursCompletedThisWeek = () => {
    let mins = 0;
    DAY_KEYS.forEach(dk=>{
      tasksForDay(dk).filter(t=>isDone(t,dk)).forEach(t=>{ mins += t.estimatedMinutes??30; });
    });
    return mins/60;
  };

  const fmtNum = n => n===Math.floor(n)?`${n}`:`${n.toFixed(1)}`;

  // ── All Tasks View ──────────────────────────────────────────────────────────
  const AllTasksView=()=>{
    const [sortBy,  setSortBy]  = useState("date");   // "date" | "folder"
    const [filter,  setFilter]  = useState("all");    // "all" | "pending" | "done"

    // Get date string for each day key in current week
    const dayDate = dk => dateForDK(dk);
    const today   = dStr();

    // Build flat list: { task, dk, date, folder }
    const allItems = [];
    DAY_KEYS.forEach(dk=>{
      tasksForDay(dk).forEach(task=>{
        const done = isDone(task,dk);
        if(filter==="pending"&&done) return;
        if(filter==="done"&&!done) return;
        const folder = folders.find(f=>f.id===task.folderId);
        allItems.push({ task, dk, date:dayDate(dk), done, folder });
      });
    });

    // Remove duplicates (recurring tasks appear once per day — that's intentional)
    // Sort
    if(sortBy==="date"){
      // Today first, then future days, then past days
      allItems.sort((a,b)=>{
        const aT=a.date===today?0:a.date>today?1:2;
        const bT=b.date===today?0:b.date>today?1:2;
        if(aT!==bT) return aT-bT;
        return a.date.localeCompare(b.date);
      });
    } else {
      allItems.sort((a,b)=>{
        const fa=a.folder?.name??"";
        const fb=b.folder?.name??"";
        return fa.localeCompare(fb)||a.date.localeCompare(b.date);
      });
    }

    // Group by day (for date sort) or folder (for folder sort)
    const groups = [];
    if(sortBy==="date"){
      DAY_KEYS.forEach(dk=>{
        const items=allItems.filter(i=>i.dk===dk);
        if(!items.length) return;
        const date=dayDate(dk);
        const isToday=date===today;
        const isPast=date<today;
        groups.push({ key:dk, label:DAYS[DAY_KEYS.indexOf(dk)], date, isToday, isPast, items });
      });
      // Sort groups: today first, future, past
      groups.sort((a,b)=>{
        const aT=a.isToday?0:!a.isPast?1:2;
        const bT=b.isToday?0:!b.isPast?1:2;
        if(aT!==bT) return aT-bT;
        return a.date.localeCompare(b.date);
      });
    } else {
      const folderMap={};
      allItems.forEach(i=>{
        const key=i.folder?.id??"none";
        if(!folderMap[key]) folderMap[key]={ key, label:i.folder?.name??"No folder", color:i.folder?.color??"#555", icon:i.folder?.icon??"📋", items:[] };
        folderMap[key].items.push(i);
      });
      Object.values(folderMap).forEach(g=>groups.push(g));
    }

    const totalPending = DAY_KEYS.flatMap(dk=>tasksForDay(dk).filter(t=>!isDone(t,dk))).length;
    const totalDone    = DAY_KEYS.flatMap(dk=>tasksForDay(dk).filter(t=>isDone(t,dk))).length;

    return(
      <div className="page">
        <div className="all-tasks-header">
          <div>
            <div className="page-title">All Tasks</div>
            <div className="page-sub">{totalPending} pending · {totalDone} done</div>
          </div>
          <div className="sort-tabs">
            <button className={`sort-tab${sortBy==="date"?" active":""}`} onClick={()=>setSortBy("date")}>📅 Date</button>
            <button className={`sort-tab${sortBy==="folder"?" active":""}`} onClick={()=>setSortBy("folder")}>📁 Folder</button>
          </div>
        </div>

        <div className="filter-tabs">
          {[["all","All"],["pending","Pending"],["done","Done"]].map(([val,lbl])=>(
            <button key={val} className={`filter-tab${filter===val?" active":""}`} onClick={()=>setFilter(val)}>{lbl}</button>
          ))}
        </div>

        {groups.length===0&&<div className="empty">No tasks found</div>}

        {sortBy==="date"?groups.map(g=>(
          <div className="day-section" key={g.key}>
            <div className="day-section-hdr">
              <span className={`day-badge${g.isToday?" is-today":g.isPast?" is-past":" is-future"}`}>
                {g.isToday?"Today":g.label}
              </span>
              <span className="day-section-date">{g.date}</span>
              <span style={{marginLeft:"auto",fontSize:".7rem",color:"var(--mu)"}}>{g.items.filter(i=>i.done).length}/{g.items.length}</span>
            </div>
            {g.items.map((item,idx)=>{
              const tl=TIME_LBL[TIME_OPTS.indexOf(item.task.estimatedMinutes)]??`${item.task.estimatedMinutes}m`;
              return(
                <div key={`${item.task.id}-${item.dk}-${idx}`}
                  className={`day-task-row${item.done?" done":""}`}
                  onClick={()=>toggle(item.task.id,item.dk)}>
                  <div className="chk" style={item.done?{background:item.folder?.color??"var(--ac)",borderColor:item.folder?.color??"var(--ac)"}:{}}>
                    <span className="chk-v" style={{display:item.done?"block":"none"}}>✓</span>
                  </div>
                  <span className="day-task-txt">{item.task.text}</span>
                  {item.folder&&(
                    <span className="folder-badge" style={{background:item.folder.color+"20",color:item.folder.color}}>
                      {item.folder.icon} {item.folder.name}
                    </span>
                  )}
                  <span className="time-pill">{tl}</span>
                </div>
              );
            })}
          </div>
        )):groups.map(g=>(
          <div className="day-section" key={g.key}>
            <div className="day-section-hdr">
              <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:".85rem",color:g.color}}>{g.icon} {g.label}</span>
              <span style={{marginLeft:"auto",fontSize:".7rem",color:"var(--mu)"}}>{g.items.filter(i=>i.done).length}/{g.items.length}</span>
            </div>
            {g.items.map((item,idx)=>{
              const tl=TIME_LBL[TIME_OPTS.indexOf(item.task.estimatedMinutes)]??`${item.task.estimatedMinutes}m`;
              const isT=item.date===today, isPast=item.date<today;
              return(
                <div key={`${item.task.id}-${item.dk}-${idx}`}
                  className={`day-task-row${item.done?" done":""}`}
                  onClick={()=>toggle(item.task.id,item.dk)}>
                  <div className="chk" style={item.done?{background:g.color,borderColor:g.color}:{}}>
                    <span className="chk-v" style={{display:item.done?"block":"none"}}>✓</span>
                  </div>
                  <span className="day-task-txt">{item.task.text}</span>
                  <span className={`day-badge${isT?" is-today":isPast?" is-past":" is-future"}`} style={{fontSize:".6rem",padding:"2px 7px"}}>
                    {isT?"Today":DAYS[DAY_KEYS.indexOf(item.dk)]}
                  </span>
                  <span className="time-pill">{tl}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const RingsCard=({dk})=>(
    <div className="rings-card">
      <Ring pct={weekPct()} color="#a78bfa" size={82} stroke={8} label={"This\nWeek"} val={`${weekPct()}%`}/>
      <div className="ring-div"/>
      <Ring pct={donePct(tasksForDay(dk),dk)} color="#c8ff57" size={90} stroke={9} label="Today" val={`${donePct(tasksForDay(dk),dk)}%`}/>
      <div className="ring-div"/>
      <Ring pct={hoursPct(dk)} color="#fb923c" size={82} stroke={8} label={"Hours\nUsed"} val={fmtH(hoursLeft(dk))} sub="remaining" onClick={()=>openHours(dk)}/>
      {isOverload(dk)&&<div className="overload">⚠ Day overloaded</div>}
    </div>
  );

  const HomeView=()=>{
    const dk=todayKey();
    const tMonth=tasksCompletedThisMonth();
    const hMonth=hoursCompletedThisMonth();
    const hWeek=hoursCompletedThisWeek();
    const weekDone=DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).filter(t=>isDone(t,d)).length,0);
    const weekTotal=DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).length,0);

    return(
      <div className="home-layout">
        {/* ── Main column ── */}
        <div className="main-col">
          {streak>0&&(
            <div className="streak" style={{marginBottom:16}}>
              <span style={{fontSize:"1.4rem"}}>🔥</span>
              <div>
                <div className="streak-num">{streak} day streak</div>
                <div className="streak-lbl">Keep going</div>
              </div>
              {bestStreak>streak&&<span style={{marginLeft:"auto",fontSize:".75rem",color:"var(--mu)"}}>Best: {bestStreak}</span>}
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
                  <div className="day-bar">
                    <div className="day-bar-f" style={{width:`${pct}%`,background:isT?"#c8ff57":pct===100?"#34d399":"#3a3a3a"}}/>
                  </div>
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
            :<div className="folders-grid">
              {folders.map(f=>{
                const ft=folderTasks(f.id),done=ft.filter(t=>isDone(t,todayKey())).length,pct=ft.length?Math.round(done/ft.length*100):0;
                return(
                  <div key={f.id} className="folder-card" style={{"--fc":f.color}} onClick={()=>goFolder(f.id)}>
                    <div style={{fontSize:"1.1rem",marginBottom:6}}>{f.icon}</div>
                    <div className="f-name">{f.name}</div>
                    <div className="f-bar-bg"><div className="f-bar-f" style={{width:`${pct}%`}}/></div>
                    <div className="f-foot">
                      <span style={{fontSize:".72rem",fontWeight:600,color:f.color}}>{pct}%</span>
                      <span style={{fontSize:".7rem",color:"var(--tx2)"}}>{done}/{ft.length}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          }
        </div>

        {/* ── Stats sidebar ── */}
        <div className="stats-col">

          {/* Tasks this month */}
          <div className="stat-card">
            <div className="stat-card-title">✅ Tasks Completed</div>
            <div className="stat-big" style={{color:"#c8ff57"}}>{tMonth}</div>
            <div className="stat-desc">this month · {monthName}</div>
            <div className="stat-divider"/>
            <div className="stat-row">
              <span className="stat-row-lbl">This week</span>
              <span className="stat-row-val" style={{color:"#c8ff57"}}>{weekDone}</span>
            </div>
            <div className="stat-row">
              <span className="stat-row-lbl">Total tasks</span>
              <span className="stat-row-val" style={{color:"var(--tx2)"}}>{weekTotal}</span>
            </div>
            <div className="stat-row">
              <span className="stat-row-lbl">Week progress</span>
              <span className="stat-row-val" style={{color:"#a78bfa"}}>{weekTotal?Math.round(weekDone/weekTotal*100):0}%</span>
            </div>
          </div>

          {/* Work hours */}
          <div className="stat-card">
            <div className="stat-card-title">⏱ Work Hours</div>
            <div className="stat-big" style={{color:"#fb923c"}}>{fmtNum(hMonth)}h</div>
            <div className="stat-desc">completed this month · {monthName}</div>
            <div className="stat-divider"/>
            <div className="stat-row">
              <span className="stat-row-lbl">This week</span>
              <span className="stat-row-val" style={{color:"#fb923c"}}>{fmtNum(hWeek)}h</span>
            </div>
            <div className="stat-row">
              <span className="stat-row-lbl">Today</span>
              <span className="stat-row-val" style={{color:"#fb923c"}}>{fmtNum(minsUsed(dk)/60)}h</span>
            </div>
            <div className="stat-row">
              <span className="stat-row-lbl">Today's budget</span>
              <span className="stat-row-val" style={{color:"var(--tx2)"}}>{fmtH(hoursFor(dk))}</span>
            </div>
          </div>

          {/* Streak */}
          {streak>0&&(
            <div className="stat-card">
              <div className="stat-card-title">🔥 Streak</div>
              <div className="stat-big" style={{color:"#f97316"}}>{streak}</div>
              <div className="stat-desc">days in a row</div>
              <div className="stat-divider"/>
              <div className="stat-row">
                <span className="stat-row-lbl">Best ever</span>
                <span className="stat-row-val" style={{color:"#f97316"}}>{bestStreak} days</span>
              </div>
            </div>
          )}

        </div>
      </div>
    );
  };

  const DayView=()=>{
    const dk=activeDay,idx=DAY_KEYS.indexOf(dk),label=DAYS[idx],isT=idx===todayIdx();
    const dt=tasksForDay(dk),done=dt.filter(t=>isDone(t,dk)).length,pct=donePct(dt,dk);
    const hl=hoursLeft(dk),mu=minsUsed(dk);
    const grouped=folders.map(f=>({f,ts:dt.filter(t=>t.folderId===f.id)})).filter(g=>g.ts.length);
    const other=dt.filter(t=>!folders.find(f=>f.id===t.folderId));
    return(
      <div className="page">
        <div className="view-hdr">
          <div className="view-title">{label}{isT?" · Today":""}</div>
          <div className="view-sub">{dt.length} tasks · {done} completed</div>
        </div>
        <RingsCard dk={dk}/>
        <div className="hours-row">
          {[
            {val:fmtH(hoursFor(dk)),lbl:"Allocated · tap to change",cls:"clickable",onClick:()=>openHours(dk)},
            {val:fmtH(mu/60),lbl:"Completed",color:"#fb923c"},
            {val:fmtH(hl),lbl:"Remaining",color:hl<1?"#ef4444":"var(--tx)"},
          ].map((c,i)=>(
            <div key={i} className={`h-chip${c.cls?" "+c.cls:""}`} onClick={c.onClick}>
              <div className="h-val" style={c.color?{color:c.color}:{}}>{c.val}</div>
              <div className="h-lbl">{c.lbl}</div>
            </div>
          ))}
        </div>
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
              {ts.some(t=>t.recurring)&&<span className="rec-badge">🔁 recurring</span>}
              <span style={{marginLeft:"auto",fontSize:".7rem",color:f.color}}>{donePct(ts,dk)}%</span>
            </div>
            {ts.map(t=><TaskRow key={t.id} task={t} dk={dk} color={f.color}/>)}
          </div>
        ))}
        {other.length>0&&(
          <div className="task-grp">
            <div className="grp-hdr"><span className="grp-lbl" style={{color:"var(--mu)"}}>Other</span></div>
            {other.map(t=><TaskRow key={t.id} task={t} dk={dk} color="var(--ac)"/>)}
          </div>
        )}
        {dt.length===0&&<div className="empty">Nothing for {label} — add a task below ↓</div>}
        <AddRow dk={dk} fid={folders[0]?.id} placeholder={`Add task for ${label}...`}/>
      </div>
    );
  };

  const FolderView=()=>{
    const folder=folders.find(f=>f.id===activeFolder); if(!folder) return null;
    const ft=folderTasks(activeFolder),dk=todayKey();
    const done=ft.filter(t=>isDone(t,dk)).length,pct=ft.length?Math.round(done/ft.length*100):0;
    const byDay=DAY_KEYS.map((d,i)=>({d,lbl:DAYS[i],ts:ft.filter(t=>(!t.recurring&&t.day===d)||(t.recurring&&t.recurringDays?.includes(d)))})).filter(g=>g.ts.length);
    return(
      <div className="page">
        <div className="view-hdr">
          <div style={{display:"flex",alignItems:"center",gap:10}}>
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
              <span className="grp-lbl" style={{color:DAY_KEYS.indexOf(d)===todayIdx()?folder.color:"var(--mu)"}}>
                {lbl}{DAY_KEYS.indexOf(d)===todayIdx()?" · Today":""}
              </span>
            </div>
            {ts.map(t=><TaskRow key={t.id} task={t} dk={d} color={folder.color}/>)}
          </div>
        ))}
        {ft.length===0&&<div className="empty">No tasks yet — add one below ↓</div>}
        <AddRow dk={dk} fid={activeFolder} placeholder={`Add task to ${folder.name}...`}/>
        <button className="del-folder-btn" onClick={()=>deleteFolder(activeFolder)}>Delete folder</button>
      </div>
    );
  };

  if(authLoading) return(
    <>
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:"#060606",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{color:"#333",fontSize:".85rem",letterSpacing:".1em"}}>Loading…</div>
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

  return(
    <>
      <style>{css}</style>
      <div className="app">
        <div className="nav">
          <div className="logo">focus<em>.</em></div>
          <div className="nav-right">
            {(view==="day"||view==="folder")&&<button className="back-btn" onClick={goHome}>← Home</button>}
            {user.photoURL&&<img src={user.photoURL} className="avatar" alt=""/>}
            <button className="signout-btn" onClick={()=>signOut(auth)}>Sign out</button>
          </div>
        </div>
        {view==="home"&&<HomeView/>}
        {view==="day"&&<DayView/>}
        {view==="folder"&&<FolderView/>}
        {view==="all"&&<AllTasksView/>}

        {/* Bottom tab bar */}
        <div className="tab-bar">
          <button className={`tab-btn${(view==="home"||view==="day"||view==="folder")?" active":""}`}
            onClick={goHome}>
            <span className="tab-icon">🏠</span>
            <span className="tab-lbl">Home</span>
            <div className="tab-dot"/>
          </button>
          <button className={`tab-btn${view==="all"?" active":""}`}
            onClick={()=>setView("all")}>
            <span className="tab-icon">📋</span>
            <span className="tab-lbl">All Tasks</span>
            <div className="tab-dot"/>
          </button>
        </div>
      </div>

      {confetti&&<Confetti onDone={()=>setConfetti(false)}/>}

      {showFolderModal&&(
        <div className="overlay" onClick={()=>setShowFolderModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">New Folder</div>
            <div className="modal-lbl">Name</div>
            <input className="modal-in" value={nfName} autoFocus
              onChange={e=>setNfName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&createFolder()}
              placeholder="e.g. House Chores"/>
            <div className="modal-lbl">Color</div>
            <div className="swatches">
              {COLORS.map(c=>(<div key={c} className={`sw${nfColor===c?" sel":""}`} style={{background:c}} onClick={()=>setNfColor(c)}/>))}
            </div>
            <div className="modal-btns">
              <button className="btn-c" onClick={()=>setShowFolderModal(false)}>Cancel</button>
              <button className="btn-ok" onClick={createFolder}>Create</button>
            </div>
          </div>
        </div>
      )}

      {showHoursModal&&(
        <div className="overlay" onClick={()=>setShowHoursModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Set Work Hours</div>
            <div className="modal-lbl">Hours for {DAYS[DAY_KEYS.indexOf(hoursModalDay)]}</div>
            <div className="hr-presets">
              {HR_PRESET.map(h=>(<button key={h} className={`hp${pendingHrs===h?" sel":""}`} onClick={()=>setPendingHrs(h)}>{h}h</button>))}
            </div>
            <div style={{fontSize:".75rem",color:"var(--mu)",marginBottom:16}}>
              Your tasks total {(minsTotal(hoursModalDay)/60).toFixed(1)}h of estimated work.
              {isOverload(hoursModalDay)&&<span style={{color:"#ef4444"}}> ⚠ More than your budget!</span>}
            </div>
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
