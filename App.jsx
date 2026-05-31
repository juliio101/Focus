import { useState, useRef, useEffect } from "react";
import "./App.css";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS        = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DAY_KEYS    = ["mon","tue","wed","thu","fri","sat","sun"];
const COLORS      = ["#c8ff57","#60a5fa","#fb923c","#c084fc","#f472b6","#34d399","#fbbf24"];
const ICON_OPTIONS= ["👤","👥","🏢","💼","🤝","🏆","⭐","💡","🎯","🔑","🏠","🛒","🍕","☕","🚗","✈️","🌍","❤️","⚡","🔥","💰","📊","📋","📱","💻","🎨","🎵","🏋️","🧘","🌿","🐶","🦁","🌈","🎪","🎮","📚","🏗️","⚕️","🌟","🎁"];
const HR_PRESET   = [4,6,7,8,9,10,12];
const REMIND_OPTS = [1,3,7,14,30];
const LOCK_DURS   = [5,10,15,20,25,30];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const dStr = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const todayIdx  = () => (new Date().getDay()+6)%7;
const todayKey  = () => DAY_KEYS[todayIdx()];
const dateForDK = dk => { const n=new Date(); n.setHours(0,0,0,0); const d=new Date(n); d.setDate(n.getDate()+DAY_KEYS.indexOf(dk)-todayIdx()); return dStr(d); };
const calcStreak = (dates=[]) => { const s=new Set(dates),t=dStr(),y=dStr(new Date(Date.now()-864e5)); if(!s.has(t)&&!s.has(y)) return 0; let c=0,cur=new Date(s.has(t)?t:y); while(s.has(dStr(cur))){ c++; cur.setDate(cur.getDate()-1); } return c; };
const fmtTimer = secs => { const s=Math.floor(Math.max(0,secs)),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60; return h>0?`${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`; };
const fmtHrs = h => { if(h<=0||h<1/60) return "—"; if(h<1) return `${Math.round(h*60)} min`; return h===Math.floor(h)?`${h} hrs`:`${h.toFixed(1)} hrs`; };
const getLiveSecs = t => {
  // Total across all days from timeLog, plus legacy timerSeconds, plus live if running
  const logTotal = Object.values(t.timeLog??{}).reduce((s,v)=>s+v,0);
  const legacy = t.timeLog ? 0 : (t.timerSeconds??0); // only use legacy if no timeLog yet
  const base = logTotal + legacy;
  if(!t.timerRunning||!t.timerStartedAt) return base;
  return base+(Date.now()-t.timerStartedAt)/1000;
};

// ─── Audio ────────────────────────────────────────────────────────────────────
let _ac=null;
const getAC = () => { if(!_ac) _ac=new(window.AudioContext||window.webkitAudioContext)(); if(_ac.state==="suspended") _ac.resume(); return _ac; };
const tone = (f,v=0.1,d=0.08) => { try{ const c=getAC(),o=c.createOscillator(),g=c.createGain(); o.connect(g);g.connect(c.destination);o.frequency.value=f;g.gain.setValueAtTime(v,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+d);o.start();o.stop(c.currentTime+d); }catch(e){} };
const playCheck = () => tone(880,0.1,0.07);
const playStart = () => { tone(440,0.08,0.06); setTimeout(()=>tone(660,0.08,0.06),80); };
const playWin   = () => [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,0.1,0.2),i*100));

// ─── Confetti ─────────────────────────────────────────────────────────────────
function Confetti({ onDone }) {
  useEffect(()=>{ const t=setTimeout(onDone,2400); return()=>clearTimeout(t); },[]);
  const ps=Array.from({length:50},(_,i)=>({ id:i,left:Math.random()*100,color:COLORS[i%COLORS.length],delay:Math.random()*.5,w:Math.random()*10+5,h:Math.random()*6+4,rot:Math.random()*720*(Math.random()>.5?1:-1),drift:(Math.random()-.5)*200,dur:Math.random()*.9+1 }));
  return(
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:9999,overflow:"hidden"}}>
      <style>{`@keyframes cf{from{opacity:1;transform:translateY(0) rotate(0)}to{opacity:0;transform:translateY(110vh) rotate(var(--r)) translateX(var(--d))}}`}</style>
      {ps.map(p=><div key={p.id} style={{position:"absolute",left:`${p.left}%`,top:0,width:p.w,height:p.h,background:p.color,borderRadius:2,"--r":`${p.rot}deg`,"--d":`${p.drift}px`,animation:`cf ${p.dur}s ${p.delay}s ease-in forwards`}}/>)}
    </div>
  );
}

// ─── Ring ─────────────────────────────────────────────────────────────────────
function Ring({pct=0,color="#c8ff57",size=96,stroke=9,label,val,sub,onClick}){
  const r=(size-stroke)/2,circ=2*Math.PI*r,offset=circ*(1-Math.min(pct,100)/100);
  return(
    <div onClick={onClick} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7,cursor:onClick?"pointer":"default"}}>
      <div style={{position:"relative",width:size,height:size}}>
        <svg width={size} height={size} style={{transform:"rotate(-90deg)",display:"block"}}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1c1c1c" strokeWidth={stroke}/>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} style={{transition:"stroke-dashoffset .7s cubic-bezier(.34,1.56,.64,1)"}}/>
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
const INIT_FOLDERS = [{id:1,name:"Work",color:"#60a5fa",icon:"💼"},{id:2,name:"Personal",color:"#c8ff57",icon:"🏠"}];
const INIT_TASKS   = [
  {id:1,text:"Check emails",folderId:1,recurring:true,recurringDays:["mon","tue","wed","thu","fri"],doneOn:[],timerSeconds:0,timerRunning:false,timerStartedAt:null},
  {id:2,text:"Morning routine",folderId:2,recurring:true,recurringDays:["mon","tue","wed","thu","fri","sat","sun"],doneOn:[],timerSeconds:0,timerRunning:false,timerStartedAt:null},
];

// ─── CSS ──────────────────────────────────────────────────────────────────────
// CSS loaded via App.css import

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  // Auth
  const [user,setUser]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  // Data
  const [folders,setFolders]=useState(INIT_FOLDERS);
  const [tasks,setTasks]=useState(INIT_TASKS);
  const [complDates,setComplDates]=useState([]);
  const [bestStreak,setBest]=useState(0);
  const [dayHours,setDayHours]=useState({});
  const [loaded,setLoaded]=useState(false);
  // Nav
  const [view,setView]=useState("home");
  const [activeDay,setActiveDay]=useState(null);
  const [activeFolder,setActiveFolder]=useState(null);
  const [activeTask,setActiveTask]=useState(null);
  const [activeTaskDk,setActiveTaskDk]=useState(null);
  const [prevView,setPrevView]=useState("home");
  // Modals
  const [showFolderModal,setShowFolderModal]=useState(false);
  const [showHoursModal,setShowHoursModal]=useState(false);
  const [hoursDay,setHoursDay]=useState(null);
  const [showRemind,setShowRemind]=useState(false);
  const [showRenameModal,setShowRenameModal]=useState(false);
  const [renamingFolder,setRenamingFolder]=useState(null);
  const [renameText,setRenameText]=useState("");
  const [renameValue,setRenameValue]=useState("");
  const [showEditTask,setShowEditTask]=useState(false);
  const [editTaskText,setEditTaskText]=useState("");
  const [showLockModal,setShowLockModal]=useState(false);
  const [showPinSetModal,setShowPinSetModal]=useState(false);
  const [showPinUnlock,setShowPinUnlock]=useState(false);
  const [confetti,setConfetti]=useState(false);
  // Form state
  const [nfName,setNfName]=useState("");
  const [nfColor,setNfColor]=useState(COLORS[0]);
  const [nfIcon,setNfIcon]=useState(ICON_OPTIONS[0]);
  const [nfValue,setNfValue]=useState("");
  const [pendingHrs,setPendingHrs]=useState(8);
  const [taskRecur,setTaskRecur]=useState(false);
  const [taskRecDays,setTaskRecDays]=useState([]);
  const [taskStartDate,setTaskStartDate]=useState(dStr());
  const [taskDueDate,setTaskDueDate]=useState(null);
  // Lock state
  const [isLocked,setIsLocked]=useState(false);
  const [lockEndTime,setLockEndTime]=useState(null);
  const [lockedTaskId,setLockedTaskId]=useState(null);
  const [lockedTaskDk,setLockedTaskDk]=useState(null);
  const [lockDuration,setLockDuration]=useState(10);
  const [lockDone,setLockDone]=useState(false);
  const [userPin,setUserPin]=useState(null);
  const [pinInput,setPinInput]=useState("");
  const [pinConfirm,setPinConfirm]=useState("");
  const [pinStep,setPinStep]=useState(1);
  const [pinError,setPinError]=useState("");
  // Onboarding
  const [obStep,setObStep]=useState(0); // 0=hidden, 1-5=steps
  const [obFolderName,setObFolderName]=useState("");
  const [obFolderColor,setObFolderColor]=useState(COLORS[1]);
  const [obFolderIcon,setObFolderIcon]=useState("💼");
  const [obTaskText,setObTaskText]=useState("");
  const [obFolderId,setObFolderId]=useState(null);
  // Tick for live timers
  const [tick,setTick]=useState(0);

  // ── Tick ──────────────────────────────────────────────────────────────────
  useEffect(()=>{
    const hasRunning=tasks.some(t=>t.timerRunning);
    if(!hasRunning&&!isLocked) return;
    const iv=setInterval(()=>setTick(t=>t+1),1000);
    return()=>clearInterval(iv);
  },[tasks,isLocked]);

  // Sync activeTask with tasks array
  useEffect(()=>{
    if(activeTask){ const u=tasks.find(t=>t.id===activeTask.id); if(u) setActiveTask(u); }
  },[tasks]);

  // Check lock expiry
  useEffect(()=>{
    if(!isLocked||!lockEndTime||lockDone) return;
    if(Date.now()>=lockEndTime){ setLockDone(true); playWin(); setConfetti(true); if(user) setDoc(doc(db,"users",user.uid),{activeLock:null},{merge:true}).catch(()=>{}); }
  },[tick,isLocked,lockEndTime,lockDone]);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(()=>{
    const unsub=onAuthStateChanged(auth,u=>{ setUser(u); setAuthLoading(false); });
    return unsub;
  },[]);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!user){
      // Clear ALL state on logout to prevent data leaking between accounts
      setFolders(INIT_FOLDERS);
      setTasks(INIT_TASKS);
      setComplDates([]);
      setBest(0);
      setDayHours({});
      setUserPin(null);
      setIsLocked(false);
      setLockEndTime(null);
      setLockedTaskId(null);
      setLockedTaskDk(null);
      setLockDone(false);
      setLoaded(false);
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
          if(d.activeLock&&d.activeLock.endTime>Date.now()){
            setIsLocked(true); setLockEndTime(d.activeLock.endTime);
            setLockedTaskId(d.activeLock.taskId); setLockedTaskDk(d.activeLock.taskDk);
          }
        } else {
          // New user — write AND set local state to avoid any stale data
          await setDoc(ref,{folders:INIT_FOLDERS,tasks:INIT_TASKS,completedDates:[],bestStreak:0,dayHours:{}});
          setFolders(INIT_FOLDERS);
          setTasks(INIT_TASKS);
          setComplDates([]);
          setBest(0);
          setDayHours({});
          setUserPin(null);
          setIsLocked(false);
          setObStep(1); // 🎯 Start onboarding for new users
        }
      }catch(e){ console.error("Load error:",e); }
      setLoaded(true);
    })();
  },[user]);

  // ── Save ──────────────────────────────────────────────────────────────────
  useEffect(()=>{ if(!user||!loaded) return; setDoc(doc(db,"users",user.uid),{folders},{merge:true}).catch(console.error); },[user,loaded,folders]);
  useEffect(()=>{ if(!user||!loaded) return; setDoc(doc(db,"users",user.uid),{tasks},{merge:true}).catch(console.error); },[user,loaded,tasks]);
  useEffect(()=>{ if(!user||!loaded) return; setDoc(doc(db,"users",user.uid),{dayHours},{merge:true}).catch(console.error); },[user,loaded,dayHours]);
  useEffect(()=>{
    if(!user||!loaded) return;
    const s=calcStreak(complDates),nb=s>bestStreak?s:bestStreak;
    setDoc(doc(db,"users",user.uid),{completedDates:complDates,bestStreak:nb},{merge:true}).catch(console.error);
    if(s>bestStreak) setBest(s);
  },[user,loaded,complDates]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isDone=(task,dk)=>task.recurring?(task.doneOn??[]).includes(dateForDK(dk)):task.done;
  const sortByAlert=arr=>[...arr].sort((a,b)=>{ const al={red:2,yellow:1}; return (al[b.alert]??0)-(al[a.alert]??0); });
  const tasksForDay=dk=>{ const td=dateForDK(dk); const seen=new Set(); return tasks.filter(t=>{ if(seen.has(t.id)) return false; if(t.recurring){ if(t.recurringDays?.includes(dk)){seen.add(t.id);return true;} return false; } if(t.startDate){ if(t.startDate===td){seen.add(t.id);return true;} return false; } if(t.scheduledDate){ if(t.scheduledDate===td){seen.add(t.id);return true;} return false; } if(t.day===dk){seen.add(t.id);return true;} return false; }); };
  const folderTasks=fid=>tasks.filter(t=>t.folderId===fid);
  const donePct=(arr,dk)=>arr.length?Math.round(arr.filter(t=>isDone(t,dk)).length/arr.length*100):0;
  const hoursFor=dk=>dayHours[dk]??8;
  const secsTracked=dk=>{ const date=dateForDK(dk); return tasksForDay(dk).reduce((s,t)=>{ const log=t.timeLog??{}; const dayVal=log[date]??0; if(t.timerRunning&&t.timerStartedAt){ const startDate=dStr(new Date(t.timerStartedAt)); if(startDate===date) return s+dayVal+(Date.now()-t.timerStartedAt)/1000; } return s+dayVal; },0); };
  const hoursLeft=dk=>Math.max(0,hoursFor(dk)-secsTracked(dk)/3600);
  const hoursPct=dk=>Math.min(100,Math.round(secsTracked(dk)/3600/hoursFor(dk)*100));
  // Time-based week progress — falls back to task % if no time tracked
  const weekSecsTotal=()=>DAY_KEYS.reduce((s,dk)=>s+secsTracked(dk),0);
  const weekGoalSecs=()=>DAY_KEYS.reduce((s,dk)=>s+hoursFor(dk)*3600,0);
  const weekPct=()=>{ const ws=weekSecsTotal(),wg=weekGoalSecs(); if(ws>0) return Math.min(100,Math.round(ws/wg*100)); let t=0,d=0; DAY_KEYS.forEach(dk=>{ const dt=tasksForDay(dk); t+=dt.length; d+=dt.filter(x=>isDone(x,dk)).length; }); return t?Math.round(d/t*100):0; };
  // Last week helpers — sum timeLog entries from last 7 days
  const lastWeekSecs=()=>{ const secs={};let total=0; tasks.forEach(t=>{ Object.entries(t.timeLog??{}).forEach(([date,s])=>{ const d=new Date(date+'T00:00:00'); const diff=Math.round((new Date()-d)/86400000); if(diff>=7&&diff<14) total+=s; }); }); return total; };
  const thisWeekSecs=()=>{ let total=0; tasks.forEach(t=>{ Object.entries(t.timeLog??{}).forEach(([date,s])=>{ const d=new Date(date+'T00:00:00'); const diff=Math.round((new Date()-d)/86400000); if(diff>=0&&diff<7) total+=s; }); }); return total; };

  // ── Timer ─────────────────────────────────────────────────────────────────
  const startTimer=taskId=>{ const now=Date.now(); playStart(); setTasks(prev=>prev.map(t=>{ if(t.id===taskId) return{...t,timerRunning:true,timerStartedAt:now}; if(t.timerRunning&&t.timerStartedAt){ // pause any other running timer and save to correct day const el=Math.floor((now-t.timerStartedAt)/1000); const date=dStr(new Date(t.timerStartedAt)); const log={...(t.timeLog??{})}; log[date]=(log[date]??0)+el; return{...t,timerRunning:false,timerStartedAt:null,timerSeconds:(t.timerSeconds??0)+el,timeLog:log}; } return t; })); };
  const pauseTimer=taskId=>{ const now=Date.now(); setTasks(prev=>prev.map(t=>{ if(t.id!==taskId) return t; if(!t.timerStartedAt) return{...t,timerRunning:false}; const el=Math.floor((now-t.timerStartedAt)/1000); const date=dStr(new Date(t.timerStartedAt)); const log={...(t.timeLog??{})}; log[date]=(log[date]??0)+el; return{...t,timerRunning:false,timerStartedAt:null,timerSeconds:(t.timerSeconds??0)+el,timeLog:log}; })); };
  const deleteTask=(e,id)=>{ e.stopPropagation(); setTasks(p=>p.filter(t=>t.id!==id)); };
  const uncompleteTask=()=>{ if(!activeTask) return; const dk=activeTaskDk; setTasks(prev=>prev.map(t=>{ if(t.id!==activeTask.id) return t; if(!t.recurring) return{...t,done:false}; return{...t,doneOn:(t.doneOn??[]).filter(d=>d!==dateForDK(dk))}; })); goBack(); };
  const deleteActiveTask=()=>{ if(!activeTask) return; setTasks(p=>p.filter(t=>t.id!==activeTask.id)); goBack(); };
  const saveEditTask=()=>{ const txt=editTaskText.trim(); if(!txt) return; setTasks(p=>p.map(t=>t.id===activeTask.id?{...t,text:txt}:t)); setShowEditTask(false); };

  // ── Complete ──────────────────────────────────────────────────────────────
  const completeTask=(remindDays=null)=>{
    if(!activeTask) return;
    const dk=activeTaskDk; const now=Date.now(); playCheck();
    setTasks(prev=>{
      let next=prev.map(t=>{
        if(t.id!==activeTask.id) return t;
        let ts=t.timerSeconds??0;
        let log={...(t.timeLog??{})};
        if(t.timerRunning&&t.timerStartedAt){
          const el=Math.floor((now-t.timerStartedAt)/1000);
          const date=dStr(new Date(t.timerStartedAt));
          log[date]=(log[date]??0)+el;
          ts+=el;
        }
        if(!t.recurring) return{...t,done:true,timerRunning:false,timerStartedAt:null,timerSeconds:ts,timeLog:log};
        return{...t,doneOn:[...(t.doneOn??[]),dateForDK(dk)],timerRunning:false,timerStartedAt:null,timerSeconds:ts,timeLog:log};
      });
      if(remindDays){ const f=new Date(); f.setDate(f.getDate()+remindDays); f.setHours(0,0,0,0); next=[...next,{id:Date.now(),text:activeTask.text,folderId:activeTask.folderId,recurring:false,day:DAY_KEYS[(f.getDay()+6)%7],startDate:dStr(f),done:false,timerSeconds:0,timerRunning:false,timerStartedAt:null,isReminder:true}]; }
      const dayT=next.filter(t=>(!t.recurring&&(t.day===dk||t.startDate===dateForDK(dk)))||(t.recurring&&t.recurringDays?.includes(dk)));
      const allDone=dayT.length>0&&dayT.every(t=>!t.recurring?t.done:(t.doneOn??[]).includes(dateForDK(dk)));
      if(allDone){ setTimeout(()=>{playWin();setConfetti(true);},100); if(dk===todayKey()) setComplDates(cd=>cd.includes(dStr())?cd:[...cd,dStr()]); }
      return next;
    });
    setShowRemind(false); goBack();
  };

  // ── Lock ──────────────────────────────────────────────────────────────────
  const openLockFlow=()=>{ if(!userPin){ setPinStep(1);setPinInput("");setPinConfirm("");setPinError("");setShowPinSetModal(true); } else setShowLockModal(true); };
  const activateLock=()=>{
    const endTime=Date.now()+lockDuration*60*1000;
    setIsLocked(true); setLockEndTime(endTime); setLockedTaskId(activeTask?.id); setLockedTaskDk(activeTaskDk); setLockDone(false); setShowLockModal(false);
    if(activeTask&&!activeTask.timerRunning) startTimer(activeTask.id);
    if(user) setDoc(doc(db,"users",user.uid),{activeLock:{endTime,taskId:activeTask?.id,taskDk:activeTaskDk}},{merge:true}).catch(()=>{});
  };
  const handlePinKey=key=>{
    if(showPinSetModal){
      if(pinStep===1){ const n=(pinInput+key).slice(0,4); setPinInput(n); if(n.length===4){setPinStep(2);setPinConfirm("");} }
      else{ const n=(pinConfirm+key).slice(0,4); setPinConfirm(n); if(n.length===4){ if(n===pinInput){setUserPin(pinInput); if(user) setDoc(doc(db,"users",user.uid),{userPin:pinInput},{merge:true}).catch(()=>{}); setShowPinSetModal(false);setPinInput("");setPinConfirm("");setPinStep(1);setShowLockModal(true);} else{setPinError("PINs don't match");setPinConfirm("");setPinInput("");setPinStep(1);setTimeout(()=>setPinError(""),2000);} } }
    } else if(showPinUnlock){
      const n=(pinInput+key).slice(0,4); setPinInput(n);
      if(n.length===4){ if(n===userPin){setIsLocked(false);setLockEndTime(null);setLockedTaskId(null);setShowPinUnlock(false);setPinInput(""); if(user) setDoc(doc(db,"users",user.uid),{activeLock:null},{merge:true}).catch(()=>{});} else{setPinError("Wrong PIN");setPinInput("");setTimeout(()=>setPinError(""),1500);} }
    }
  };
  const handlePinDel=()=>{ if(showPinSetModal){if(pinStep===2)setPinConfirm(p=>p.slice(0,-1));else setPinInput(p=>p.slice(0,-1));} else if(showPinUnlock) setPinInput(p=>p.slice(0,-1)); };
  const dismissLockDone=()=>{ setIsLocked(false);setLockDone(false);setLockEndTime(null);setLockedTaskId(null);setLockedTaskDk(null); };

  // ── Folder ────────────────────────────────────────────────────────────────
  const createFolder=()=>{ const n=nfName.trim(); if(!n) return; setFolders(p=>[...p,{id:Date.now(),name:n,color:nfColor,icon:nfIcon,monthlyValue:parseFloat(nfValue)||0}]); setNfName("");setNfColor(COLORS[0]);setNfIcon(ICON_OPTIONS[0]);setNfValue("");setShowFolderModal(false); };
  const openRename=(e,f)=>{ e.stopPropagation(); setRenamingFolder(f);setRenameText(f.name);setRenameValue(String(f.monthlyValue||""));setShowRenameModal(true); };
  const saveRename=()=>{ const n=renameText.trim(); if(!n) return; setFolders(p=>p.map(f=>f.id===renamingFolder.id?{...f,name:n,monthlyValue:parseFloat(renameValue)||0}:f)); setShowRenameModal(false); };
  const deleteFolder=fid=>{ setFolders(p=>p.filter(f=>f.id!==fid)); setTasks(p=>p.filter(t=>t.folderId!==fid)); goHome(); };
  const openHours=dk=>{ setPendingHrs(hoursFor(dk));setHoursDay(dk);setShowHoursModal(true); };
  const saveHours=()=>{ setDayHours(p=>({...p,[hoursDay]:pendingHrs}));setShowHoursModal(false); };

  // ── Nav ───────────────────────────────────────────────────────────────────
  const goHome=()=>setView("home");
  const goDay=dk=>{ setActiveDay(dk);setView("day");setTaskStartDate(dateForDK(dk));setTaskDueDate(null); };
  const goFolder=fid=>{ setActiveFolder(fid);setView("folder");setTaskStartDate(dStr());setTaskDueDate(null); };
  const goTask=(task,dk,from)=>{ const now=Date.now(); setTasks(prev=>prev.map(t=>{ if(!t.timerRunning||t.id===task.id) return t; const el=Math.floor((now-t.timerStartedAt)/1000); return{...t,timerRunning:false,timerStartedAt:null,timerSeconds:(t.timerSeconds??0)+el}; })); setActiveTask(task);setActiveTaskDk(dk);setPrevView(from??view);setShowRemind(false);setView("task"); };
  const goBack=()=>{ if(prevView==="day") setView("day"); else if(prevView==="folder") setView("folder"); else if(prevView==="all") setView("all"); else setView("home"); };
  const streak=calcStreak(complDates);

  // ── PIN numpad ────────────────────────────────────────────────────────────
  const PinNumpad=({currentPin,label})=>(
    <div>
      {label&&<div style={{fontSize:".8rem",color:"var(--mu)",fontWeight:600,textAlign:"center",marginBottom:16}}>{label}</div>}
      <div className="pin-dots">
        {[0,1,2,3].map(i=><div key={i} className={`pin-dot${(currentPin||"").length>i?" filled":""}`}/>)}
      </div>
      <div className="pin-numpad">
        {[1,2,3,4,5,6,7,8,9].map(n=><div key={n} className="pin-key" onClick={()=>handlePinKey(String(n))}>{n}</div>)}
        <div className="pin-key" style={{visibility:"hidden"}}/>
        <div className="pin-key" onClick={()=>handlePinKey("0")}>0</div>
        <div className="pin-key del" onClick={handlePinDel}>⌫</div>
      </div>
      {pinError&&<div className="pin-error">{pinError}</div>}
    </div>
  );

  // ── Task Row ──────────────────────────────────────────────────────────────
  const TaskRow=({task,dk,color,from})=>{
    const done=isDone(task,dk),secs=getLiveSecs(task),isRunning=task.timerRunning;
    const today=dStr();
    const alertColor=task.alert==="red"?"#ef4444":task.alert==="yellow"?"#fbbf24":null;
    let dueBadge=null;
    if(task.dueDate&&!done){ const diff=Math.round((new Date(task.dueDate)-new Date(today))/86400000); let lbl,bg,col; if(diff<0){lbl=`Overdue ${Math.abs(diff)}d`;bg="#ef444420";col="#ef4444";}else if(diff===0){lbl="Due today";bg="#fb923c20";col="#fb923c";}else if(diff===1){lbl="Due tmrw";bg="#fbbf2420";col="#fbbf24";}else if(diff<=7){lbl=`Due in ${diff}d`;bg="#ffffff10";col="var(--tx2)";}else{lbl=`Due ${task.dueDate.slice(5)}`;bg="#ffffff08";col="var(--mu)";} dueBadge=<span className="due-badge" style={{background:bg,color:col}}>{lbl}</span>; }
    return(
      <div className={`task-row${done?" done":""}${task.dueDate&&!done&&today>task.dueDate?" overdue":""}`}
        style={{"--rc":color,borderLeftColor:alertColor?alertColor:"transparent",borderLeftWidth:alertColor?3:1,background:alertColor?`${alertColor}08`:"var(--s)"}}
        onClick={()=>goTask(task,dk,from??view)}>
        <div className="task-chk"><span className="task-chk-v">✓</span></div>
        {alertColor&&!done&&<span style={{fontSize:".8rem",flexShrink:0}}>{task.alert==="red"?"🔴":"🟡"}</span>}
        {isRunning&&<div className="task-running-dot"/>}
        {task.recurring&&!isRunning&&!alertColor&&<div className="rec-dot" style={{background:color}}/>}
        {task.isReminder&&<span style={{fontSize:".7rem",flexShrink:0}}>⏰</span>}
        <span className="task-txt" style={{color:alertColor&&!done?alertColor:"var(--tx)"}}>{task.text}</span>
        {dueBadge}
        {secs>0&&<span className="task-timer-badge">{fmtTimer(secs)}</span>}
        {!done&&<span className="task-arr">›</span>}
        <button className="del-btn" onClick={e=>deleteTask(e,task.id)}>×</button>
      </div>
    );
  };

  // ── Add Row ───────────────────────────────────────────────────────────────
  const AddRow=({dk,fid,placeholder})=>{
    const [text,setText]=useState("");
    const [showDates,setShowDates]=useState(false);
    const inputRef=useRef(null);
    const startOpts=Array.from({length:8},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()+i); d.setHours(0,0,0,0); return{value:dStr(d),label:i===0?"Today":i===1?"Tomorrow":DAYS[(d.getDay()+6)%7]}; });
    const dueOpts=[{value:null,label:"No deadline"},{value:taskStartDate,label:"Same day"},...[1,3,7,14,30].map(days=>{ const d=new Date(taskStartDate); d.setDate(d.getDate()+days); return{value:dStr(d),label:days===1?"+1 day":days===7?"+1 week":days===14?"+2 weeks":days===30?"+1 month":`+${days}d`}; })];
    const submit=()=>{ const t=text.trim(); if(!t) return; const base={id:Date.now(),text:t,folderId:fid??folders[0]?.id??null,timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{},startDate:taskStartDate,dueDate:taskDueDate||null}; setTasks(p=>[...p,taskRecur?{...base,recurring:true,recurringDays:taskRecDays.length?taskRecDays:[dk??todayKey()],doneOn:[],startDate:undefined,dueDate:undefined}:{...base,recurring:false,done:false}]); setText("");setShowDates(false);setTaskRecur(false);setTaskRecDays([]);inputRef.current?.focus(); };
    return(
      <div className="add-area">
        <div className="add-row">
          <input ref={inputRef} className="add-in" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder={placeholder}/>
          <button className="add-btn" onClick={submit}>+</button>
        </div>
        <div className="add-opts">
          <button className={`opt-btn${showDates?" on":""}`} onClick={()=>setShowDates(d=>!d)}>📅 Dates</button>
          <button className={`opt-btn${taskRecur?" on":""}`} onClick={()=>setTaskRecur(r=>!r)}>🔁 Repeat</button>
        </div>
        {showDates&&!taskRecur&&(
          <div className="date-picker-box">
            <div><div className="date-picker-lbl">Start working on</div><div className="date-chips">{startOpts.map(o=><div key={o.value} className={`date-chip${taskStartDate===o.value?" sel":""}`} onClick={()=>{setTaskStartDate(o.value);setTaskDueDate(null);}}>{o.label}</div>)}</div></div>
            <div><div className="date-picker-lbl">Due by</div><div className="date-chips">{dueOpts.map((o,i)=><div key={i} className={`date-chip${taskDueDate===o.value&&!(o.value===null&&taskDueDate!==null)?" due-sel":""}`} onClick={()=>setTaskDueDate(o.value)}>{o.label}</div>)}</div></div>
            <div className="date-summary">Starts <strong style={{color:"var(--tx)"}}>{startOpts.find(o=>o.value===taskStartDate)?.label??taskStartDate}</strong>{taskDueDate?<> · Due <strong style={{color:"#fb923c"}}>{dueOpts.find(o=>o.value===taskDueDate)?.label??taskDueDate}</strong></>:<> · <span>No deadline</span></>}</div>
          </div>
        )}
        {taskRecur&&<div className="day-chips">{DAY_KEYS.map((d,i)=><div key={d} className={`dc${taskRecDays.includes(d)?" sel":""}`} onClick={()=>setTaskRecDays(p=>p.includes(d)?p.filter(x=>x!==d):[...p,d])}>{DAYS[i]}</div>)}</div>}
      </div>
    );
  };

  // ── Rings Card ────────────────────────────────────────────────────────────
  const RingsCard=({dk})=>{
    const dp=hoursPct(dk),wp=weekPct(),hp=hoursPct(dk),st=secsTracked(dk);
    const hasTimeData=weekSecsTotal()>0;
    return(
      <div className="rings-card">
        <div className="ring-stat">
          <div className="ring-stat-val" style={{color:"#a78bfa"}}>{wp}%</div>
          <div className="ring-stat-lbl">This Week</div>
          <div className="ring-stat-sub">{hasTimeData?fmtHrs(weekSecsTotal()/3600)+" worked":`${DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).filter(t=>isDone(t,d)).length,0)}/${DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).length,0)} tasks`}</div>
        </div>
        <div className="ring-div"/>
        <Ring pct={dp} color="#c8ff57" size={100} stroke={9} label="Today" val={`${dp}%`}/>
        <div className="ring-div"/>
        <div className="ring-stat" style={{cursor:"pointer"}} onClick={()=>openHours(dk)}>
          <div className="ring-stat-val" style={{color:"#fb923c",fontFamily:"'DM Mono',monospace",fontSize:"1.3rem"}}>{fmtTimer(st)}</div>
          <div className="ring-stat-lbl">Tracked</div>
          <div className="ring-stat-sub">{hoursFor(dk)} hr goal</div>
        </div>
        <div className="hrs-bar-wrap">
          <div className="hrs-bar-lbl"><span>{fmtTimer(st)} worked</span><span>{hoursFor(dk)} hr goal</span></div>
          <div className="hrs-bar-bg"><div className="hrs-bar-fill" style={{width:`${hp}%`,minWidth:st>0?"4px":"0"}}/></div>
        </div>
        {hoursFor(dk)-st/3600<0&&<div className="overload">⚠ Over budget</div>}
      </div>
    );
  };

  // ── Day Momentum ──────────────────────────────────────────────────────────
  const DayMomentum=({dk})=>{
    if(dk!==todayKey()) return null;
    const now=new Date(),hour=now.getHours()+now.getMinutes()/60;
    const ws=9,we=18; if(hour<ws) return null;
    const dayPct=Math.min(100,Math.round((hour-ws)/(we-ws)*100));
    const taskPct=donePct(tasksForDay(dk),dk);
    const diff=taskPct-dayPct;
    const time=now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    let status,sColor,msg,barColor;
    if(taskPct===100){status="🎉 Done";sColor="#c8ff57";msg="All tasks complete!";barColor="#c8ff57";}
    else if(diff>=15){status="🚀 Ahead";sColor="#c8ff57";msg=`${diff}% ahead of schedule`;barColor="#c8ff57";}
    else if(diff>=-5){status="⚡ On track";sColor="#60a5fa";msg="Right on pace — keep it up";barColor="#60a5fa";}
    else if(diff>=-20){status="⚠ Behind";sColor="#fbbf24";msg=`${Math.abs(diff)}% behind — push now`;barColor="#fbbf24";}
    else{status="🔴 Lagging";sColor="#ef4444";msg="Focus up — time is moving fast";barColor="#ef4444";}
    return(
      <div className="momentum-card">
        <div className="momentum-hdr">
          <div className="momentum-title">⚡ Day Momentum · {time}</div>
          <div className="momentum-status" style={{color:sColor}}>{status}</div>
        </div>
        <div className="momentum-row">
          <span className="momentum-lbl">Tasks done</span>
          <div className="momentum-bg"><div className="momentum-fill" style={{width:`${taskPct}%`,background:barColor}}/></div>
          <span className="momentum-pct">{taskPct}%</span>
        </div>
        <div className="momentum-row" style={{marginBottom:8}}>
          <span className="momentum-lbl">Day elapsed</span>
          <div className="momentum-bg"><div className="momentum-fill" style={{width:`${dayPct}%`,background:"var(--b3)"}}/></div>
          <span className="momentum-pct">{dayPct}%</span>
        </div>
        <div className="momentum-msg" style={{color:sColor+"cc"}}>{msg}</div>
      </div>
    );
  };

  // ── Time Progress ─────────────────────────────────────────────────────────
  const TimeProgress=({dk})=>{
    const st=secsTracked(dk),budgetSecs=hoursFor(dk)*3600,pct=Math.min(100,(st/budgetSecs)*100);
    const mins=Math.floor(st/60),hrs=st/3600,bHrs=hoursFor(dk);
    const milestones=[{pct:25,label:fmtHrs(bHrs*.25)},{pct:50,label:fmtHrs(bHrs*.5)},{pct:75,label:fmtHrs(bHrs*.75)},{pct:100,label:`${bHrs} hrs`}];
    let win=null;
    if(pct>=100)win="🎉 Full day done!"; else if(pct>=75)win="🔥 75% — you're on fire!"; else if(pct>=50)win="⚡ Halfway there!"; else if(pct>=25)win="✨ 25% done — great start!"; else if(mins>=1)win=`✓ ${mins} min in — keep going!`;
    return(
      <div className="time-prog-card">
        <div className="time-prog-top">
          <div><div className="time-prog-worked">{mins<60?`${mins} min`:fmtHrs(hrs)} worked</div>{win&&<div className="time-win">{win}</div>}</div>
          <div className="time-prog-goal">Goal: {bHrs} hrs<button onClick={()=>openHours(dk)} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".7rem",marginLeft:8,textDecoration:"underline"}}>change</button></div>
        </div>
        <div className="time-prog-bg"><div className="time-prog-fill" style={{width:`${Math.max(pct,pct>0?1:0)}%`}}/></div>
        <div className="time-milestones">{milestones.map(m=><span key={m.pct} className={`time-ms${pct>=m.pct?" hit":""}`}>{m.label}</span>)}</div>
      </div>
    );
  };

  // ── Home View ─────────────────────────────────────────────────────────────
  const HomeView=()=>{
    const dk=todayKey();
    const nowDate=new Date(),monthStr=`${nowDate.getFullYear()}-${String(nowDate.getMonth()+1).padStart(2,"0")}`,monthName=nowDate.toLocaleString("default",{month:"long"});
    const tMonth=()=>{ let c=0; tasks.forEach(t=>{ if(!t.recurring&&t.done)c++; else if(t.recurring)c+=(t.doneOn??[]).filter(d=>d.startsWith(monthStr)).length; }); return c; };
    const hWeek=()=>thisWeekSecs()/3600;
    const hLastWeek=()=>lastWeekSecs()/3600;
    const weekDone=DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).filter(t=>isDone(t,d)).length,0);
    const weekTotal=DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).length,0);
    const enriched=[...folders].map(f=>{ const td=todayKey(),ft=folderTasks(f.id),tdTasks=tasksForDay(td).filter(t=>t.folderId===f.id),doneToday=tdTasks.filter(t=>isDone(t,td)).length,todayCount=tdTasks.length; let wDue=0,wDone=0; DAY_KEYS.forEach(d=>{ const df=tasksForDay(d).filter(t=>t.folderId===f.id); wDue+=df.length; wDone+=df.filter(t=>isDone(t,d)).length; }); const totalSecs=ft.reduce((s,t)=>s+(t.timerSeconds??0),0); return{f,todayCount,doneToday,wDue,wDone,wPct:wDue>0?Math.round(wDone/wDue*100):0,totalSecs,hasToday:todayCount>0}; });
    const active=enriched.filter(e=>e.hasToday).sort((a,b)=>b.todayCount-a.todayCount);
    // Sort each folder's tasks by alert when rendering on home
    const getAlertLevel=fid=>{ const ft=tasksForDay(todayKey()).filter(t=>t.folderId===fid); if(ft.some(t=>t.alert==="red")) return 2; if(ft.some(t=>t.alert==="yellow")) return 1; return 0; };
    const inactive=enriched.filter(e=>!e.hasToday);
    const FRow=({e,dim})=>{ const{f,todayCount,doneToday,wDue,wDone,wPct,totalSecs}=e; return(
      <div className={`folder-row${dim?" dimmed":""}`} style={{"--fc":dim?"#555":f.color}} onClick={()=>goFolder(f.id)}>
        <div className="folder-row-icon" style={{filter:dim?"grayscale(1)":"none"}}>{f.icon}</div>
        <div className="folder-row-main">
          <div className="folder-row-name" style={{color:dim?"var(--mu)":"var(--tx)"}}>{f.name}</div>
          <div className="folder-row-bar"><div className="folder-row-bar-f" style={{width:`${wPct}%`,background:dim?"#444":f.color}}/></div>
        </div>
        <div className="folder-row-stats">
          <div className="f-stat"><span className="f-stat-val" style={{color:dim?"var(--mu)":todayCount>0?f.color:"var(--tx2)"}}>{dim?"—":`${doneToday}/${todayCount}`}</span><span className="f-stat-lbl">Today</span></div>
          <div className="f-stat"><span className="f-stat-val" style={{color:dim?"var(--mu)":"var(--tx2)"}}>{wDone}/{wDue}</span><span className="f-stat-lbl">Week</span></div>
          <div className="f-stat"><span className="f-stat-val" style={{color:dim?"var(--mu)":"var(--tx2)"}}>{totalSecs>0?fmtTimer(totalSecs):"—"}</span><span className="f-stat-lbl">Time</span></div>
          {(f.monthlyValue||0)>0&&<div className="f-stat"><span className="f-stat-val" style={{color:dim?"var(--mu)":"#34d399"}}>${(f.monthlyValue).toLocaleString()}</span><span className="f-stat-lbl">/mo</span></div>}
        </div>
        <button onClick={ev=>openRename(ev,f)} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".85rem",padding:"3px 6px",borderRadius:6,flexShrink:0}}>✏️</button>
        <span className="folder-arr">›</span>
      </div>
    );};
    return(
      <div className="home-layout">
        <div>
          {streak>0&&<div className="streak"><span style={{fontSize:"1.4rem"}}>🔥</span><div><div className="streak-num">{streak} day streak</div><div className="streak-lbl">Keep going</div></div>{bestStreak>streak&&<span style={{marginLeft:"auto",fontSize:".75rem",color:"var(--mu)"}}>Best: {bestStreak}</span>}</div>}
          <RingsCard dk={dk}/>
          <div className="page-title">My Week</div>
          <div className="page-sub">Tap a day to manage tasks</div>
          <div className="day-grid">
            {DAY_KEYS.map((d,i)=>{ const dt=tasksForDay(d),pct=donePct(dt,d),isT=i===todayIdx(); return(
              <div key={d} className={`day-card${isT?" today":""}`} onClick={()=>goDay(d)}>
                <div className="day-lbl">{DAYS[i]}</div>
                <div className="day-bar"><div className="day-bar-f" style={{width:`${pct}%`,background:isT?"#c8ff57":pct===100?"#34d399":"#2a2a2a"}}/></div>
                <div className="day-cnt">{dt.filter(t=>isDone(t,d)).length}/{dt.length}</div>
              </div>
            );})}
          </div>
          <div className="sec-hdr"><span className="sec-title">Folders</span><button className="ghost-btn" onClick={()=>setShowFolderModal(true)}>+ New Folder</button></div>
          {folders.length===0?<div className="empty">No folders yet — create one above ↑</div>:(
            <div className="folders-list">
              {active.map(e=><FRow key={e.f.id} e={e} dim={false}/>)}
              {inactive.length>0&&<>{active.length>0&&<div className="no-tasks-divider"><span className="no-tasks-lbl">No tasks today</span></div>}{inactive.map(e=><FRow key={e.f.id} e={e} dim={true}/>)}</>}
            </div>
          )}

          {/* Revenue section — only shows if any folder has a value */}
          {folders.some(f=>(f.monthlyValue||0)>0)&&(()=>{
            const totalMRR=folders.reduce((s,f)=>s+(f.monthlyValue||0),0);
            const activeRevFolders=[...folders].filter(f=>(f.monthlyValue||0)>0).sort((a,b)=>(b.monthlyValue||0)-(a.monthlyValue||0));
            return(
              <div style={{marginTop:24}}>
                <div className="sec-hdr"><span className="sec-title">Monthly Revenue</span></div>
                <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r)",padding:"18px 20px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:14}}>
                    <div>
                      <div style={{fontSize:".65rem",color:"var(--mu)",textTransform:"uppercase",letterSpacing:".12em",fontWeight:700,marginBottom:4}}>Total MRR</div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"2rem",color:"#34d399",letterSpacing:"-1px",lineHeight:1}}>${totalMRR.toLocaleString()}<span style={{fontSize:"1rem",fontWeight:500,color:"var(--mu)"}}>/mo</span></div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:".7rem",color:"var(--mu)",fontWeight:500}}>{activeRevFolders.length} client{activeRevFolders.length!==1?"s":""}</div>
                      <div style={{fontSize:".7rem",color:"#34d399",fontWeight:600,marginTop:2}}>${(totalMRR*12).toLocaleString()}/yr</div>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {activeRevFolders.map(f=>(
                      <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderTop:"1px solid var(--b)"}}>
                        <span style={{fontSize:"1rem",flexShrink:0}}>{f.icon}</span>
                        <span style={{flex:1,fontSize:".85rem",color:"var(--tx)",fontWeight:500}}>{f.name}</span>
                        <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".9rem",color:"#34d399"}}>${(f.monthlyValue||0).toLocaleString()}</span>
                        <span style={{fontSize:".68rem",color:"var(--mu)",fontWeight:500}}>/mo</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
        <div className="stats-col">
          <div className="stat-card">
            <div className="stat-title">✅ Tasks Completed</div>
            <div className="stat-big" style={{color:"#c8ff57"}}>{tMonth()}</div>
            <div className="stat-desc">this month · {monthName}</div>
            <div className="stat-div"/>
            <div className="stat-row"><span className="stat-row-l">This week</span><span className="stat-row-v" style={{color:"#c8ff57"}}>{weekDone}</span></div>
            <div className="stat-row"><span className="stat-row-l">Total tasks</span><span className="stat-row-v" style={{color:"var(--tx2)"}}>{weekTotal}</span></div>
            <div className="stat-row"><span className="stat-row-l">Week progress</span><span className="stat-row-v" style={{color:"#a78bfa"}}>{weekTotal?Math.round(weekDone/weekTotal*100):0}%</span></div>
          </div>
          <div className="stat-card">
            <div className="stat-title">⏱ Time Tracked Today</div>
            <div className="stat-big" style={{color:"#fb923c",fontFamily:"'DM Mono',monospace",fontSize:"2.2rem",letterSpacing:"-1px"}}>{fmtTimer(secsTracked(dk))}</div>
            <div style={{marginTop:8,marginBottom:6}}>
              <div style={{width:"100%",height:5,background:"var(--b2)",borderRadius:99,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:99,background:"linear-gradient(90deg,#fb923c,#fbbf24)",width:`${Math.min(100,(secsTracked(dk)/3600/hoursFor(dk))*100)}%`,transition:"width .6s ease",minWidth:secsTracked(dk)>0?"4px":"0"}}/>
              </div>
            </div>
            <div className="stat-desc">of {hoursFor(dk)} hr daily goal</div>
            <div className="stat-div"/>
            <div className="stat-row"><span className="stat-row-l">This week</span><span className="stat-row-v" style={{color:"#fb923c"}}>{fmtHrs(hWeek())}</span></div>
            <div className="stat-row"><span className="stat-row-l">Daily goal</span><span className="stat-row-v" style={{color:"var(--tx2)"}}>{hoursFor(dk)} hrs</span></div>
          </div>
          {streak>0&&<div className="stat-card">
            <div className="stat-title">🔥 Streak</div>
            <div className="stat-big" style={{color:"#f97316"}}>{streak}</div>
            <div className="stat-desc">days in a row</div>
            <div className="stat-div"/>
            <div className="stat-row"><span className="stat-row-l">Best ever</span><span className="stat-row-v" style={{color:"#f97316"}}>{bestStreak} days</span></div>
          </div>}
          {(hWeek()>0||hLastWeek()>0)&&(()=>{
            const tw=hWeek(),lw=hLastWeek(),diff=tw-lw,maxH=Math.max(tw,lw,1);
            const isAhead=diff>=0;
            return(
              <div className="stat-card">
                <div className="stat-title">📊 This Week vs Last Week</div>
                <div style={{display:"flex",gap:12,marginBottom:16,marginTop:4}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:".65rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>This week</div>
                    <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.3rem",color:"#c8ff57",letterSpacing:"-1px",lineHeight:1}}>{fmtHrs(tw)}</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:".65rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>Last week</div>
                    <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.3rem",color:"var(--tx2)",letterSpacing:"-1px",lineHeight:1}}>{fmtHrs(lw)}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,marginBottom:10,alignItems:"flex-end"}}>
                  <div style={{flex:1}}>
                    <div style={{height:Math.max(4,Math.round(tw/maxH*48)),background:"#c8ff57",borderRadius:"4px 4px 0 0",transition:"height .6s ease",minWidth:"100%"}}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{height:Math.max(4,Math.round(lw/maxH*48)),background:"#333",borderRadius:"4px 4px 0 0",transition:"height .6s ease",minWidth:"100%"}}/>
                  </div>
                </div>
                <div style={{height:1,background:"var(--b)",marginBottom:10}}/>
                <div style={{fontSize:".78rem",fontWeight:700,color:isAhead?"#34d399":"#ef4444"}}>
                  {lw===0?"No data from last week yet":isAhead?`▲ ${fmtHrs(Math.abs(diff))} ahead of last week`:`▼ ${fmtHrs(Math.abs(diff))} behind last week`}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  const DayView=()=>{
    const dk=activeDay,idx=DAY_KEYS.indexOf(dk),label=DAYS[idx],isT=idx===todayIdx();
    const dt=tasksForDay(dk),done=dt.filter(t=>isDone(t,dk)).length,pct=donePct(dt,dk);
    const grouped=folders.map(f=>({f,ts:dt.filter(t=>t.folderId===f.id)})).filter(g=>g.ts.length);
    const other=dt.filter(t=>!folders.find(f=>f.id===t.folderId));
    return(
      <div className="page">
        <div className="view-hdr"><div className="view-title">{label}{isT?" · Today":""}</div><div className="view-sub">{dt.length} tasks · {done} completed</div></div>
        <RingsCard dk={dk}/>
        {isT&&<DayMomentum dk={dk}/>}
        <TimeProgress dk={dk}/>
        {(() => {
          const st=secsTracked(dk),goal=hoursFor(dk)*3600,timePct=Math.min(100,Math.round(st/goal*100));
          const hasTime=st>0;
          return(
            <div className="big-prog">
              <div className="big-top">
                <span className="big-frac">
                  {hasTime?fmtHrs(st/3600):<span style={{fontSize:"1.1rem",color:"var(--mu)"}}>No time yet</span>}
                  {hasTime&&<span className="d"> of {hoursFor(dk)} hrs</span>}
                </span>
                <span className="big-pct" style={{color:"#c8ff57"}}>{hasTime?timePct:donePct(dt,dk)}%</span>
              </div>
              <div className="big-bar"><div className="big-fill" style={{width:`${hasTime?timePct:donePct(dt,dk)}%`,background:"#c8ff57"}}/></div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
                <span style={{fontSize:".72rem",color:"var(--mu)"}}>Tasks: {done}/{dt.length} completed</span>
                {dt.length>0&&done===dt.length&&<span style={{fontSize:".72rem",color:"var(--ac)",fontWeight:700}}>✦ All done!</span>}
              </div>
            </div>
          );
        })()}
        {grouped.map(({f,ts})=>(
          <div className="task-grp" key={f.id}>
            <div className="grp-hdr"><span className="grp-lbl" style={{color:f.color}}>{f.icon} {f.name}</span><span style={{marginLeft:"auto",fontSize:".72rem",color:f.color,fontWeight:700}}>{donePct(ts,dk)}%</span></div>
            {sortByAlert(ts).map(t=><TaskRow key={t.id} task={t} dk={dk} color={f.color} from="day"/>)}
          </div>
        ))}
        {other.length>0&&<div className="task-grp"><div className="grp-hdr"><span className="grp-lbl" style={{color:"var(--mu)"}}>Other</span></div>{sortByAlert(other).map(t=><TaskRow key={t.id} task={t} dk={dk} color="var(--ac)" from="day"/>)}</div>}
        {dt.length===0&&<div className="empty">Nothing for {label} — add a task below ↓</div>}
        <AddRow dk={dk} fid={folders[0]?.id} placeholder={`Add task for ${label}...`}/>
      </div>
    );
  };

  const FolderView=()=>{
    const folder=folders.find(f=>f.id===activeFolder); if(!folder) return null;
    const ft=folderTasks(activeFolder),dk=todayKey();
    const done=ft.filter(t=>isDone(t,dk)).length,pct=ft.length?Math.round(done/ft.length*100):0;
    const byDay=DAY_KEYS.map((d,i)=>({d,lbl:DAYS[i],ts:ft.filter(t=>(!t.recurring&&(t.day===d||t.startDate===dateForDK(d)))||(t.recurring&&t.recurringDays?.includes(d)))})).filter(g=>g.ts.length);
    return(
      <div className="page">
        <div className="view-hdr"><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:10,height:10,borderRadius:"50%",background:folder.color,flexShrink:0}}/><div className="view-title">{folder.name}</div></div><div className="view-sub">{ft.length} tasks total</div></div>
        <div className="big-prog">
          <div className="big-top"><span className="big-frac">{done}<span className="d">/{ft.length}</span></span><span className="big-pct" style={{color:folder.color}}>{pct}% today</span></div>
          <div className="big-bar"><div className="big-fill" style={{width:`${pct}%`,background:folder.color}}/></div>
        </div>
        {byDay.map(({d,lbl,ts})=>(
          <div className="task-grp" key={d}>
            <div className="grp-hdr"><span className="grp-lbl" style={{color:DAY_KEYS.indexOf(d)===todayIdx()?folder.color:"var(--mu)"}}>{lbl}{DAY_KEYS.indexOf(d)===todayIdx()?" · Today":""}</span></div>
            {sortByAlert(ts).map(t=><TaskRow key={t.id} task={t} dk={d} color={folder.color} from="folder"/>)}
          </div>
        ))}
        {ft.length===0&&<div className="empty">No tasks yet — add one below ↓</div>}
        <AddRow dk={dk} fid={activeFolder} placeholder={`Add task to ${folder.name}...`}/>
        <button className="del-folder-btn" onClick={()=>deleteFolder(activeFolder)}>Delete folder</button>
      </div>
    );
  };

  const AlertBtn=({task})=>{
    const nextAlert=task.alert==="red"?null:task.alert==="yellow"?"red":"yellow";
    const label=task.alert==="red"?"🔴 Red alert":task.alert==="yellow"?"🟡 Yellow alert":"⚪ Set alert";
    const btnColor=task.alert==="red"?"#ef4444":task.alert==="yellow"?"#fbbf24":"var(--b2)";
    return(
      <button className="detail-action-btn" style={{borderColor:btnColor,color:task.alert?btnColor:"var(--tx2)"}}
        onClick={()=>setTasks(p=>p.map(t=>t.id===task.id?{...t,alert:nextAlert}:t))}>
        {label}
      </button>
    );
  };

  const TaskDetailView=()=>{
    if(!activeTask) return null;
    const task=tasks.find(t=>t.id===activeTask.id)??activeTask;
    const dk=activeTaskDk,done=isDone(task,dk),secs=getLiveSecs(task),isRunning=task.timerRunning;
    const folder=folders.find(f=>f.id===task.folderId);
    const totalSecsToday=secsTracked(dk);
    return(
      <div className="task-detail">
        {folder&&<div className="detail-folder" style={{color:folder.color}}>{folder.icon} {folder.name}</div>}
        <div className={`detail-name${done?" done":""}`}>{task.text}</div>
        <div className="detail-date-pills">
          {task.startDate&&<span className="date-pill">📅 {task.startDate===dStr()?"Starts today":task.startDate}</span>}
          {task.dueDate&&(()=>{ const diff=Math.round((new Date(task.dueDate)-new Date(dStr()))/86400000); const col=diff<0?"#ef4444":diff===0?"#fb923c":diff===1?"#fbbf24":"var(--mu)"; const lbl=diff<0?`Overdue ${Math.abs(diff)}d`:diff===0?"Due today":diff===1?"Due tomorrow":`Due in ${diff}d`; return<span className="date-pill" style={{color:col,borderColor:col+"40"}}>⏰ {lbl}</span>; })()}
        </div>
        <div className="detail-actions-row">
          <button className="detail-action-btn" onClick={()=>{ setEditTaskText(task.text);setShowEditTask(true); }}>✏️ Edit</button>
          {done&&<button className="detail-action-btn warn" onClick={uncompleteTask}>↩ Uncomplete</button>}
          {!done&&<AlertBtn task={task}/>}
          <button className="detail-action-btn danger" onClick={deleteActiveTask}>🗑 Delete</button>
        </div>
        {done&&<div className="done-badge">✓ Completed</div>}
        <div className={`timer-card${isRunning?" running":""}`}>
          <div className="timer-digits">{fmtTimer(secs)}</div>
          <div className="timer-status-lbl">{isRunning?"Working on this task…":"Timer paused"}</div>
          {!done&&(
            <div className="timer-btn-wrap">
              {isRunning
                ?<button className="timer-btn pause" onClick={()=>pauseTimer(task.id)}>⏸ Pause</button>
                :<button className="timer-btn start" onClick={()=>startTimer(task.id)}>▶ Start Working</button>
              }
              <button className="lock-btn" onClick={openLockFlow}>🔒 Lock In</button>
            </div>
          )}
          <div className="timer-stats">
            <div className="t-stat"><div className="t-stat-val">{fmtTimer(task.timerSeconds??0)}</div><div className="t-stat-lbl">This task</div></div>
            <div className="t-stat"><div className="t-stat-val">{fmtTimer(totalSecsToday)}</div><div className="t-stat-lbl">Today total</div></div>
            <div className="t-stat"><div className="t-stat-val">{fmtHrs(hoursLeft(dk))}</div><div className="t-stat-lbl">Budget left</div></div>
          </div>
        </div>
        {!done&&!showRemind&&(
          <div className="complete-actions">
            <button className="action-btn complete" onClick={()=>completeTask(null)}>✓ Mark Complete</button>
            <button className="action-btn remind" onClick={()=>setShowRemind(true)}>⏰ Complete & Remind</button>
          </div>
        )}
        {!done&&showRemind&&(
          <div className="remind-section">
            <div className="remind-title">Remind me in</div>
            <div className="remind-grid">
              {REMIND_OPTS.map(d=><button key={d} className="remind-opt" onClick={()=>completeTask(d)}>{d===1?"Tomorrow":`${d}d`}</button>)}
            </div>
            <div style={{textAlign:"center"}}><button style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".8rem"}} onClick={()=>setShowRemind(false)}>← Back</button></div>
          </div>
        )}
      </div>
    );
  };

  const MoneyView=()=>{
    const [editingFolder,setEditingFolder]=useState(null);
    const [editValue,setEditValue]=useState("");
    const totalMRR=folders.reduce((s,f)=>s+(f.monthlyValue||0),0);
    const activeClients=folders.filter(f=>(f.monthlyValue||0)>0);
    const noValue=folders.filter(f=>!(f.monthlyValue||0));
    const saveValue=()=>{
      const v=parseFloat(editValue)||0;
      setFolders(p=>p.map(f=>f.id===editingFolder.id?{...f,monthlyValue:v}:f));
      setEditingFolder(null);setEditValue("");
    };
    return(
      <div className="page">
        <div className="view-hdr"><div className="view-title">Money</div><div className="view-sub">Monthly recurring revenue</div></div>

        {/* MRR Hero */}
        <div className="money-hero">
          <div className="money-mrr-label">Total Monthly Recurring Revenue</div>
          <div className="money-mrr">${totalMRR.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})}</div>
          <div className="money-mrr-sub">/month across {activeClients.length} active client{activeClients.length!==1?"s":""}</div>
        </div>

        {/* Active clients */}
        {activeClients.length>0&&(
          <>
            <div className="sec-hdr" style={{marginBottom:10}}><span className="sec-title">Active clients</span></div>
            <div className="money-clients" style={{marginBottom:20}}>
              {[...activeClients].sort((a,b)=>(b.monthlyValue||0)-(a.monthlyValue||0)).map(f=>(
                <div key={f.id} className="money-client-row" style={{"--fc":f.color}}>
                  <div className="money-client-icon">{f.icon}</div>
                  <div style={{flex:1}}>
                    <div className="money-client-name">{f.name}</div>
                    <div className="money-client-lbl">monthly retainer</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div className="money-client-val">${(f.monthlyValue||0).toLocaleString()}</div>
                    <div className="money-client-lbl">/month</div>
                  </div>
                  <button className="money-edit-btn" onClick={(e)=>{e.stopPropagation();setEditingFolder(f);setEditValue(String(f.monthlyValue||""));}}>Edit</button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* No value clients */}
        {noValue.length>0&&(
          <>
            <div className="sec-hdr" style={{marginBottom:10}}><span className="sec-title">No value set</span></div>
            <div className="money-clients">
              {noValue.map(f=>(
                <div key={f.id} className="money-client-row">
                  <div className="money-client-icon" style={{filter:"grayscale(.7)",opacity:.5}}>{f.icon}</div>
                  <div style={{flex:1}}>
                    <div className="money-client-name" style={{color:"var(--mu)"}}>{f.name}</div>
                  </div>
                  <button className="money-edit-btn" onClick={(e)=>{e.stopPropagation();setEditingFolder(f);setEditValue("");}}>+ Add value</button>
                </div>
              ))}
            </div>
          </>
        )}

        {folders.length===0&&<div className="empty">No folders yet — create one from the Home tab</div>}

        {/* Edit modal */}
        {editingFolder&&(
          <div className="overlay" onClick={()=>setEditingFolder(null)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <div className="modal-title">Monthly value · {editingFolder.name}</div>
              <div className="modal-lbl">Monthly retainer ($)</div>
              <div style={{position:"relative",marginBottom:16}}>
                <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"var(--mu)",fontSize:".9rem",fontWeight:600}}>$</span>
                <input className="modal-in" style={{paddingLeft:28,marginBottom:0}} value={editValue} autoFocus onChange={e=>setEditValue(e.target.value.replace(/[^0-9.]/g,""))} onKeyDown={e=>e.key==="Enter"&&saveValue()} placeholder="0" type="text" inputMode="decimal"/>
              </div>
              <div style={{fontSize:".78rem",color:"var(--mu)",marginBottom:18,lineHeight:1.6}}>Set to 0 to remove from MRR total.</div>
              <div className="modal-btns">
                <button className="btn-c" onClick={()=>setEditingFolder(null)}>Cancel</button>
                <button className="btn-ok" onClick={saveValue}>Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const AllTasksView=()=>{
    const [sortBy,setSortBy]=useState("date");
    const [filter,setFilter]=useState("all");
    const today=dStr();
    const allItems=[];
    DAY_KEYS.forEach(dk=>{ tasksForDay(dk).forEach(task=>{ const done=isDone(task,dk); if(filter==="pending"&&done) return; if(filter==="done"&&!done) return; allItems.push({task,dk,date:dateForDK(dk),done,folder:folders.find(f=>f.id===task.folderId)}); }); });
    if(sortBy==="date") allItems.sort((a,b)=>{ const aT=a.date===today?0:a.date>today?1:2,bT=b.date===today?0:b.date>today?1:2; return aT!==bT?aT-bT:a.date.localeCompare(b.date); });
    else allItems.sort((a,b)=>(a.folder?.name??"").localeCompare(b.folder?.name??"")||a.date.localeCompare(b.date));
    const groups=[];
    if(sortBy==="date"){ DAY_KEYS.forEach(dk=>{ const items=allItems.filter(i=>i.dk===dk); if(!items.length) return; const date=dateForDK(dk),isToday=date===today,isPast=date<today; groups.push({key:dk,label:DAYS[DAY_KEYS.indexOf(dk)],date,isToday,isPast,items}); }); groups.sort((a,b)=>{ const aT=a.isToday?0:!a.isPast?1:2,bT=b.isToday?0:!b.isPast?1:2; return aT!==bT?aT-bT:a.date.localeCompare(b.date); }); }
    else{ const fm={}; allItems.forEach(i=>{ const k=i.folder?.id??"none"; if(!fm[k]) fm[k]={key:k,label:i.folder?.name??"No folder",color:i.folder?.color??"#555",icon:i.folder?.icon??"📋",items:[]}; fm[k].items.push(i); }); Object.values(fm).forEach(g=>groups.push(g)); }
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
          {[["all","All"],["pending","Pending"],["done","Done"]].map(([v,l])=><button key={v} className={`filter-tab${filter===v?" active":""}`} onClick={()=>setFilter(v)}>{l}</button>)}
        </div>
        {groups.length===0&&<div className="empty">No tasks found</div>}
        {sortBy==="date"?groups.map(g=>(
          <div className="day-section" key={g.key}>
            <div className="day-section-hdr">
              <span className={`day-badge${g.isToday?" today":g.isPast?" past":" future"}`}>{g.isToday?"Today":g.label}</span>
              <span style={{fontSize:".7rem",color:"var(--mu)"}}>{g.date}</span>
              <span style={{marginLeft:"auto",fontSize:".72rem",color:"var(--mu)",fontWeight:600}}>{g.items.filter(i=>i.done).length}/{g.items.length}</span>
            </div>
            {g.items.map((item,idx)=><TaskRow key={`${item.task.id}-${item.dk}-${idx}`} task={item.task} dk={item.dk} color={item.folder?.color??"var(--ac)"} from="all"/>)}
          </div>
        )):groups.map(g=>(
          <div className="day-section" key={g.key}>
            <div className="day-section-hdr">
              <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:".88rem",color:g.color}}>{g.icon} {g.label}</span>
              <span style={{marginLeft:"auto",fontSize:".72rem",color:"var(--mu)",fontWeight:600}}>{g.items.filter(i=>i.done).length}/{g.items.length}</span>
            </div>
            {g.items.map((item,idx)=><TaskRow key={`${item.task.id}-${item.dk}-${idx}`} task={item.task} dk={item.dk} color={g.color} from="all"/>)}
          </div>
        ))}
      </div>
    );
  };

  if(authLoading) return(<><div style={{minHeight:"100vh",background:"#080808",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#333",fontSize:".9rem"}}>Loading…</div></div></>);
  if(!user) return(
    <>
    <div className="login"><div className="login-card">
      <div className="login-logo">effingFocus<span>.</span></div>
      <div className="login-tag">Track Tasks. See Your Real Productive Time.</div>
      <button className="google-btn" onClick={()=>signInWithPopup(auth,googleProvider)}>
        <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continue with Google
      </button>
      <div className="login-note">Your data syncs across all your devices.</div>
    </div></div></>
  );

  return(
    <>
    <div className="app">
      <div className="nav">
        <div className="logo">effingFocus<em>.</em></div>
        <div className="nav-right">
          {view==="task"&&<button className="back-btn" onClick={goBack}>← Back</button>}
          {(view==="day"||view==="folder")&&<button className="back-btn" onClick={goHome}>← Home</button>}
          {user.photoURL&&<img src={user.photoURL} className="avatar" alt=""/>}
          <button className="signout-btn" onClick={()=>signOut(auth)}>Sign out</button>
        </div>
      </div>
      {view==="home"&&<HomeView/>}
      {view==="day"&&<DayView/>}
      {view==="folder"&&<FolderView/>}
      {view==="task"&&<TaskDetailView/>}
      {view==="all"&&<AllTasksView/>}
      {view!=="task"&&(
        <div className="tab-bar">
          <button className={`tab-btn${(view==="home"||view==="day"||view==="folder")?" active":""}`} onClick={goHome}>
            <span className="tab-icon">🏠</span><span className="tab-lbl">Home</span><div className="tab-dot"/>
          </button>
          <button className={`tab-btn${view==="all"?" active":""}`} onClick={()=>setView("all")}>
            <span className="tab-icon">📋</span><span className="tab-lbl">All Tasks</span><div className="tab-dot"/>
          </button>
        </div>
      )}
    </div>

    {confetti&&<Confetti onDone={()=>setConfetti(false)}/>}

    {/* Onboarding */}
    {obStep>0&&(()=>{
      const skipOnboarding=()=>setObStep(0);
      const completeObFolder=()=>{ const name=obFolderName.trim(); if(!name) return; const id=Date.now(); setFolders(p=>[...p,{id,name,color:obFolderColor,icon:obFolderIcon}]); setObFolderId(id); setObStep(3); };
      const completeObTask=()=>{ const text=obTaskText.trim(); if(!text) return; setTasks(p=>[...p,{id:Date.now(),text,folderId:obFolderId,recurring:false,day:todayKey(),startDate:dStr(),done:false,timerSeconds:0,timerRunning:false,timerStartedAt:null}]); setObStep(4); };
      const finishOnboarding=()=>{ setObStep(0); setView("home"); };
      const Dots=()=>(<div className="ob-steps">{[1,2,3,4,5].map(s=><div key={s} className={`ob-step-dot${obStep===s?" active":obStep>s?" done":""}`}/>)}</div>);

      if(obStep===1) return(
        <div className="ob-overlay">
          <Dots/>
          <div className="ob-emoji">👋</div>
          <div className="ob-title">Welcome to effingFocus<span style={{color:"var(--ac)"}}>.</span></div>
          <div className="ob-sub">The task manager that shows you exactly how productive you actually were. Let's set you up in 2 minutes.</div>
          <button className="ob-primary" onClick={()=>setObStep(2)}>Let's go →</button>
          <button className="ob-skip" onClick={skipOnboarding}>Skip setup</button>
        </div>
      );
      if(obStep===2) return(
        <div className="ob-overlay">
          <Dots/>
          <div className="ob-emoji">📁</div>
          <div className="ob-title">Create your first folder</div>
          <div className="ob-sub">Folders are your clients or life areas — Work, a client name, House Chores. Start with one.</div>
          <div className="ob-card">
            <div className="ob-card-label">Folder name</div>
            <input className="ob-input" value={obFolderName} autoFocus onChange={e=>setObFolderName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&completeObFolder()} placeholder="e.g. Work, Ajay Sharma..."/>
            <div className="ob-card-label">Colour</div>
            <div className="ob-color-row" style={{marginBottom:14}}>{COLORS.map(c=><div key={c} className={`ob-color${obFolderColor===c?" sel":""}`} style={{background:c}} onClick={()=>setObFolderColor(c)}/>)}</div>
            <div className="ob-card-label">Icon</div>
            <div className="ob-icon-row">{["💼","🏠","👤","🎯","📊","🤝","⭐","💡","🌿","❤️"].map(ic=><div key={ic} className={`ob-icon${obFolderIcon===ic?" sel":""}`} onClick={()=>setObFolderIcon(ic)}>{ic}</div>)}</div>
          </div>
          <button className="ob-primary" onClick={completeObFolder} disabled={!obFolderName.trim()}>Create folder →</button>
          <button className="ob-skip" onClick={skipOnboarding}>Skip setup</button>
        </div>
      );
      if(obStep===3) return(
        <div className="ob-overlay">
          <Dots/>
          <div className="ob-emoji">✏️</div>
          <div className="ob-title">Add your first task</div>
          <div className="ob-sub">What's one thing you need to get done today? Just one to start.</div>
          <div className="ob-card">
            <div className="ob-card-label">Task name</div>
            <input className="ob-input" value={obTaskText} autoFocus onChange={e=>setObTaskText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&completeObTask()} placeholder="e.g. Reply to client emails..."/>
          </div>
          <button className="ob-primary" onClick={completeObTask} disabled={!obTaskText.trim()}>Add task →</button>
          <button className="ob-skip" onClick={skipOnboarding}>Skip setup</button>
        </div>
      );
      if(obStep===4) return(
        <div className="ob-overlay">
          <Dots/>
          <div className="ob-emoji">⏱</div>
          <div className="ob-title">Start the timer when you work</div>
          <div className="ob-sub">Tap a task, hit <strong style={{color:"var(--ac)"}}>Start Working</strong>. This is how effingFocus makes time visible.</div>
          <div className="ob-card">
            <div className="ob-card-label">How it works</div>
            <div className="ob-task-row">
              <div className="ob-chk"/>
              <span className="ob-task-txt">{obTaskText||"Your task"}</span>
              <span className="ob-badge">▶ Start</span>
            </div>
            <div style={{marginTop:12,fontSize:".82rem",color:"var(--mu)",lineHeight:1.7}}>You can also <strong style={{color:"var(--tx)"}}>🔒 Lock In</strong> to commit to a task for 10–30 min without getting pulled away.</div>
          </div>
          <button className="ob-primary" onClick={()=>setObStep(5)}>Got it →</button>
          <button className="ob-skip" onClick={skipOnboarding}>Skip</button>
        </div>
      );
      if(obStep===5) return(
        <div className="ob-overlay">
          <Dots/>
          <div className="ob-emoji">🚀</div>
          <div className="ob-title">You're all set.</div>
          <div className="ob-sub">You're ready to start tracking tasks and seeing your real productive time.</div>
          <div className="ob-card">
            <div className="ob-card-label">Quick reference</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[["📁","Folders = your clients or life areas"],["✓","Tap a task → Start Working → track time"],["⚡","Day Momentum shows if you're on pace"],["🔒","Lock In when you need to go deep"]].map(([ic,txt])=>(
                <div key={txt} style={{display:"flex",alignItems:"flex-start",gap:10,fontSize:".85rem",color:"var(--tx)",lineHeight:1.5}}><span style={{flexShrink:0}}>{ic}</span><span>{txt}</span></div>
              ))}
            </div>
          </div>
          <button className="ob-primary" onClick={finishOnboarding}>Start focusing →</button>
        </div>
      );
      return null;
    })()}

    {/* Lock screen */}
    {isLocked&&(()=>{
      const lockedTask=tasks.find(t=>t.id===lockedTaskId);
      const secsLeft=lockEndTime?Math.max(0,(lockEndTime-Date.now())/1000):0;
      const totalSecs=lockDuration*60,pctLeft=totalSecs?(secsLeft/totalSecs)*100:0;
      const isUrgent=secsLeft<60,workedSecs=lockedTask?getLiveSecs(lockedTask):0;
      if(lockDone) return(
        <div className="lock-screen">
          <div style={{fontSize:"3rem",marginBottom:16}}>🎉</div>
          <div className="lock-done-card">
            <div className="lock-done-title">Time's up!</div>
            <div className="lock-done-sub">You stayed locked in on<br/><strong style={{color:"var(--tx)"}}>{lockedTask?.text}</strong></div>
            <div className="lock-done-btns">
              <button className="lock-more-btn" onClick={()=>{setLockDone(false);setShowLockModal(true);}}>🔒 Lock in for more</button>
              <button className="lock-back-btn" onClick={dismissLockDone}>← Go back</button>
            </div>
          </div>
        </div>
      );
      return(
        <div className="lock-screen">
          <div className="lock-icon-big">🔒</div>
          <div className="lock-eyebrow">Locked in · stay focused</div>
          <div className="lock-task-name">{lockedTask?.text??"Working..."}</div>
          <div className={`lock-countdown${isUrgent?" urgent":""}`}>{fmtTimer(secsLeft)}</div>
          <div className="lock-cdown-lbl">remaining</div>
          <div className="lock-prog-wrap"><div className="lock-prog-bg"><div className={`lock-prog-fill${isUrgent?" urgent":""}`} style={{width:`${pctLeft}%`}}/></div></div>
          <div className="lock-working-lbl">Working for <strong>{fmtTimer(workedSecs)}</strong></div>
          <button className="lock-unlock-btn" onClick={()=>{setPinInput("");setPinError("");setShowPinUnlock(true);}}>🔓 Unlock early</button>
          {showPinUnlock&&(
            <div style={{position:"fixed",inset:0,background:"#000d",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
              <div className="modal" style={{maxWidth:300}}>
                <div className="modal-title" style={{textAlign:"center"}}>Enter PIN to unlock</div>
                <PinNumpad currentPin={pinInput}/>
                <button className="btn-c" style={{width:"100%",marginTop:8,textAlign:"center"}} onClick={()=>{setShowPinUnlock(false);setPinInput("");}}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      );
    })()}

    {showLockModal&&!isLocked&&(
      <div className="overlay" onClick={()=>setShowLockModal(false)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-title">🔒 Lock In</div>
          <div style={{fontSize:".82rem",color:"var(--mu)",marginBottom:18,lineHeight:1.6}}>Lock yourself in on <strong style={{color:"var(--tx)"}}>{activeTask?.text}</strong>. You'll need your PIN to exit early.</div>
          <div className="modal-lbl">How long?</div>
          <div className="lock-dur-grid">{LOCK_DURS.map(d=><div key={d} className={`lock-dur-opt${lockDuration===d?" sel":""}`} onClick={()=>setLockDuration(d)}>{d}<span style={{fontSize:".6rem",display:"block",fontWeight:500,marginTop:2}}>min</span></div>)}</div>
          <div className="modal-btns">
            <button className="btn-c" onClick={()=>setShowLockModal(false)}>Cancel</button>
            <button className="btn-ok" onClick={activateLock}>Lock In 🔒</button>
          </div>
        </div>
      </div>
    )}
    {showPinSetModal&&(
      <div className="overlay">
        <div className="modal" style={{maxWidth:320}}>
          <div className="modal-title" style={{textAlign:"center"}}>{pinStep===1?"Set your PIN":"Confirm your PIN"}</div>
          <div style={{fontSize:".8rem",color:"var(--mu)",textAlign:"center",marginBottom:20}}>{pinStep===1?"Choose a 4-digit PIN to unlock early.":"Enter the same PIN again."}</div>
          <PinNumpad currentPin={pinStep===1?pinInput:pinConfirm} label=""/>
          <button className="btn-c" style={{width:"100%",marginTop:12,textAlign:"center"}} onClick={()=>{setShowPinSetModal(false);setPinInput("");setPinStep(1);}}>Cancel</button>
        </div>
      </div>
    )}
    {showEditTask&&(
      <div className="overlay" onClick={()=>setShowEditTask(false)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-title">Edit Task</div>
          <div className="modal-lbl">Task name</div>
          <input className="modal-in" value={editTaskText} autoFocus onChange={e=>setEditTaskText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveEditTask()} placeholder="Task name"/>
          <div className="modal-btns"><button className="btn-c" onClick={()=>setShowEditTask(false)}>Cancel</button><button className="btn-ok" onClick={saveEditTask}>Save</button></div>
        </div>
      </div>
    )}
    {showRenameModal&&(
      <div className="overlay" onClick={()=>setShowRenameModal(false)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-title">Edit Folder</div>
          <div className="modal-lbl">Name</div>
          <input className="modal-in" value={renameText} autoFocus onChange={e=>setRenameText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveRename()} placeholder="Folder name"/>
          <div className="modal-lbl">Monthly value (optional)</div>
          <div style={{position:"relative",marginBottom:16}}>
            <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"var(--mu)",fontSize:".9rem",fontWeight:600}}>$</span>
            <input className="modal-in" style={{paddingLeft:28,marginBottom:0}} value={renameValue} onChange={e=>setRenameValue(e.target.value.replace(/[^0-9.]/g,""))} placeholder="0" type="text" inputMode="decimal"/>
          </div>
          <div className="modal-btns"><button className="btn-c" onClick={()=>setShowRenameModal(false)}>Cancel</button><button className="btn-ok" onClick={saveRename}>Save</button></div>
        </div>
      </div>
    )}
    {showFolderModal&&(
      <div className="overlay" onClick={()=>setShowFolderModal(false)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-title">New Folder</div>
          <div className="modal-lbl">Name</div>
          <input className="modal-in" value={nfName} autoFocus onChange={e=>setNfName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createFolder()} placeholder="e.g. Ajay Sharma"/>
          <div className="modal-lbl">Monthly value (optional)</div>
          <div style={{position:"relative",marginBottom:16}}>
            <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"var(--mu)",fontSize:".9rem",fontWeight:600}}>$</span>
            <input className="modal-in" style={{paddingLeft:28,marginBottom:0}} value={nfValue} onChange={e=>setNfValue(e.target.value.replace(/[^0-9.]/g,""))} placeholder="0" type="text" inputMode="decimal"/>
          </div>
          <div className="modal-lbl">Icon</div>
          <div className="icon-grid">{ICON_OPTIONS.map(icon=><div key={icon} className={`icon-opt${nfIcon===icon?" sel":""}`} onClick={()=>setNfIcon(icon)}>{icon}</div>)}</div>
          <div className="modal-lbl">Color</div>
          <div className="swatches">{COLORS.map(c=><div key={c} className={`sw${nfColor===c?" sel":""}`} style={{background:c}} onClick={()=>setNfColor(c)}/>)}</div>
          <div className="folder-preview" style={{background:`linear-gradient(135deg,${nfColor}dd,${nfColor}99)`}}>
            <span style={{fontSize:"1.3rem"}}>{nfIcon}</span>
            <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:".9rem",color:"#fff"}}>{nfName||"Folder name"}</span>
          </div>
          <div className="modal-btns"><button className="btn-c" onClick={()=>setShowFolderModal(false)}>Cancel</button><button className="btn-ok" onClick={createFolder}>Create</button></div>
        </div>
      </div>
    )}
    {showHoursModal&&(
      <div className="overlay" onClick={()=>setShowHoursModal(false)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-title">Set Work Hours</div>
          <div className="modal-lbl">Daily goal for {hoursDay?DAYS[DAY_KEYS.indexOf(hoursDay)]:""}</div>
          <div className="hr-presets">{HR_PRESET.map(h=><button key={h} className={`hp${pendingHrs===h?" sel":""}`} onClick={()=>setPendingHrs(h)}>{h} hrs</button>)}</div>
          <div style={{fontSize:".8rem",color:"var(--mu)",marginBottom:18}}>Tracks against actual time worked on tasks.</div>
          <div className="modal-btns"><button className="btn-c" onClick={()=>setShowHoursModal(false)}>Cancel</button><button className="btn-ok" onClick={saveHours}>Save</button></div>
        </div>
      </div>
    )}
    </>
  );
}
