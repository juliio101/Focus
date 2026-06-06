import { useState, useRef, useEffect } from "react";
import "./App.css";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase.js";

const DAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DAY_KEYS=["mon","tue","wed","thu","fri","sat","sun"];
const COLORS=["#c8ff57","#60a5fa","#fb923c","#c084fc","#f472b6","#34d399","#fbbf24"];
const ICON_OPTIONS=["👤","👥","🏢","💼","🤝","🏆","⭐","💡","🎯","🔑","🏠","🛒","🍕","☕","🚗","✈️","🌍","❤️","⚡","🔥","💰","📊","📋","📱","💻","🎨","🎵","🏋️","🧘","🌿","🐶","🦁","🌈","🎪","🎮","📚","🏗️","⚕️","🌟","🎁"];
const HR_PRESET=[4,6,7,8,9,10,12];
const REMIND_OPTS=[1,3,7,14,30];
const LOCK_DURS=[5,10,15,20,25,30];import { useState, useRef, useEffect } from "react";
import "./App.css";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase.js";

const DAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DAY_KEYS=["mon","tue","wed","thu","fri","sat","sun"];
const COLORS=["#c8ff57","#60a5fa","#fb923c","#c084fc","#f472b6","#34d399","#fbbf24"];
const ICON_OPTIONS=["👤","👥","🏢","💼","🤝","🏆","⭐","💡","🎯","🔑","🏠","🛒","🍕","☕","🚗","✈️","🌍","❤️","⚡","🔥","💰","📊","📋","📱","💻","🎨","🎵","🏋️","🧘","🌿","🐶","🦁","🌈","🎪","🎮","📚","🏗️","⚕️","🌟","🎁"];
const HR_PRESET=[4,6,7,8,9,10,12];
const REMIND_OPTS=[1,3,7,14,30];
const LOCK_DURS=[5,10,15,20,25,30];

const dStr=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const todayIdx=()=>(new Date().getDay()+6)%7;
const todayKey=()=>DAY_KEYS[todayIdx()];
const dateForDK=dk=>{const n=new Date();n.setHours(0,0,0,0);const d=new Date(n);d.setDate(n.getDate()+DAY_KEYS.indexOf(dk)-todayIdx());return dStr(d);};
const calcStreak=(dates=[])=>{const s=new Set(dates),t=dStr(),y=dStr(new Date(Date.now()-864e5));if(!s.has(t)&&!s.has(y))return 0;let c=0,cur=new Date(s.has(t)?t:y);while(s.has(dStr(cur))){c++;cur.setDate(cur.getDate()-1);}return c;};
const fmtTimer=secs=>{const s=Math.floor(Math.max(0,secs)),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return h>0?`${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;};
const fmtHrs=h=>{if(h<=0||h<1/60)return"—";if(h<1)return`${Math.round(h*60)} min`;return h===Math.floor(h)?`${h} hrs`:`${h.toFixed(1)} hrs`;};
const getLiveSecs=t=>{const logTotal=Object.values(t.timeLog??{}).reduce((s,v)=>s+v,0);const legacy=t.timeLog?0:(t.timerSeconds??0);const base=logTotal+legacy;if(!t.timerRunning||!t.timerStartedAt)return base;return base+(Date.now()-t.timerStartedAt)/1000;};
const monthKey=()=>{const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`;};

let _ac=null;
const getAC=()=>{if(!_ac)_ac=new(window.AudioContext||window.webkitAudioContext)();if(_ac.state==="suspended")_ac.resume();return _ac;};
const tone=(f,v=0.1,d=0.08)=>{try{const c=getAC(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=f;g.gain.setValueAtTime(v,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+d);o.start();o.stop(c.currentTime+d);}catch(e){}};
const playCheck=()=>tone(880,0.1,0.07);
const playStart=()=>{tone(440,0.08,0.06);setTimeout(()=>tone(660,0.08,0.06),80);};
const playWin=()=>[523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,0.1,0.2),i*100));

function Confetti({onDone}){
  useEffect(()=>{const t=setTimeout(onDone,2400);return()=>clearTimeout(t);},[]);
  const ps=Array.from({length:50},(_,i)=>({id:i,left:Math.random()*100,color:COLORS[i%COLORS.length],delay:Math.random()*.5,w:Math.random()*10+5,h:Math.random()*6+4,rot:Math.random()*720*(Math.random()>.5?1:-1),drift:(Math.random()-.5)*200,dur:Math.random()*.9+1}));
  return(
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:9999,overflow:"hidden"}}>
      <style>{"@keyframes cf{from{opacity:1;transform:translateY(0) rotate(0)}to{opacity:0;transform:translateY(110vh) rotate(var(--r)) translateX(var(--d))}}"}</style>
      {ps.map(p=><div key={p.id} style={{position:"absolute",left:`${p.left}%`,top:0,width:p.w,height:p.h,background:p.color,borderRadius:2,"--r":`${p.rot}deg`,"--d":`${p.drift}px`,animation:`cf ${p.dur}s ${p.delay}s ease-in forwards`}}/>)}
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

const INIT_FOLDERS=[{id:1,name:"Work",color:"#60a5fa",icon:"💼"},{id:2,name:"Personal",color:"#c8ff57",icon:"🏠"}];
const INIT_TASKS=[
  {id:1,text:"Check emails",folderId:1,recurring:true,recurringDays:["mon","tue","wed","thu","fri"],doneOn:[],timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{}},
  {id:2,text:"Morning routine",folderId:2,recurring:true,recurringDays:["mon","tue","wed","thu","fri","sat","sun"],doneOn:[],timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{}},
];

export default function App(){
  // Initialize Meta Pixel — init only, no PageView. Only StartTrial fires for new signups.
  useEffect(()=>{
    if(window.fbq)return;
    const s=document.createElement('script');
    s.innerHTML=`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','1502001727178253');`;
    document.head.appendChild(s);
  },[]);
  const [user,setUser]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [folders,setFolders]=useState(INIT_FOLDERS);
  const [tasks,setTasks]=useState(INIT_TASKS);
  const [expenses,setExpenses]=useState([]);
  const [complDates,setComplDates]=useState([]);
  const [bestStreak,setBest]=useState(0);
  const [dayHours,setDayHours]=useState({});
  const [syncStatus,setSyncStatus]=useState("idle"); // idle, loading, success, error
  const [view,setView]=useState("home");
  const [activeDay,setActiveDay]=useState(null);
  const [activeFolder,setActiveFolder]=useState(null);
  const [activeTask,setActiveTask]=useState(null);
  const [activeTaskDk,setActiveTaskDk]=useState(null);
  const [prevView,setPrevView]=useState("home");
  const [showFolderModal,setShowFolderModal]=useState(false);
  const [showHoursModal,setShowHoursModal]=useState(false);
  const [showWeekGoalModal,setShowWeekGoalModal]=useState(false);
  const [weeklyGoal,setWeeklyGoal]=useState(40);
  const [pendingWeekGoal,setPendingWeekGoal]=useState(40);
  const [folderSnooze,setFolderSnooze]=useState({});
  const [chaseThreshold,setChaseThreshold]=useState(5);
  const [showSnoozeModal,setShowSnoozeModal]=useState(false);
  const [snoozingFolder,setSnoozingFolder]=useState(null);
  const [showPaymentModal,setShowPaymentModal]=useState(false);
  const [showExpenseModal,setShowExpenseModal]=useState(false);
  const [paymentFolder,setPaymentFolder]=useState(null);
  const [paymentAmount,setPaymentAmount]=useState("");
  const [paymentNote,setPaymentNote]=useState("");
  const [expName,setExpName]=useState("");
  const [expAmount,setExpAmount]=useState("");
  const [expType,setExpType]=useState("fixed");
  const [expCategory,setExpCategory]=useState("business");
  const [editingExp,setEditingExp]=useState(null);
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
  const [nfName,setNfName]=useState("");
  const [nfColor,setNfColor]=useState(COLORS[0]);
  const [nfIcon,setNfIcon]=useState(ICON_OPTIONS[0]);
  const [nfValue,setNfValue]=useState("");
  const [nfProspect,setNfProspect]=useState(false);
  const [pendingHrs,setPendingHrs]=useState(8);
  const [taskRecur,setTaskRecur]=useState(false);
  const [taskRecDays,setTaskRecDays]=useState([]);
  const [taskStartDate,setTaskStartDate]=useState(dStr());
  const [taskDueDate,setTaskDueDate]=useState(null);
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
  const [obStep,setObStep]=useState(0);
  const [obFolderName,setObFolderName]=useState("");
  const [obFolderColor,setObFolderColor]=useState(COLORS[1]);
  const [obFolderIcon,setObFolderIcon]=useState("💼");
  const [obTaskText,setObTaskText]=useState("");
  const [obFolderId,setObFolderId]=useState(null);
  const [tick,setTick]=useState(0);
  // Calls tracker
  const [calls,setCalls]=useState({client:[],outreach:[],clientGoal:5,outreachGoal:20});
  const [showCallModal,setShowCallModal]=useState(false);
  const [callType,setCallType]=useState("client");
  const [callDuration,setCallDuration]=useState("");
  const [callFolder,setCallFolder]=useState(null);
  const [showCallGoalModal,setShowCallGoalModal]=useState(false);
  const [pendingClientGoal,setPendingClientGoal]=useState(5);
  const [pendingOutreachGoal,setPendingOutreachGoal]=useState(20);

  useEffect(()=>{const hasRunning=tasks.some(t=>t.timerRunning);if(!hasRunning&&!isLocked)return;const iv=setInterval(()=>setTick(t=>t+1),1000);return()=>clearInterval(iv);},[tasks,isLocked]);
  useEffect(()=>{if(activeTask){const u=tasks.find(t=>t.id===activeTask.id);if(u)setActiveTask(u);}},[tasks]);
  useEffect(()=>{
    const running=tasks.find(t=>t.timerRunning);
    if(running&&running.timerStartedAt){
      const secs=Math.floor((Date.now()-running.timerStartedAt)/1000);
      const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60;
      const time=h>0?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
      document.title=`${time} · effingFocus`;
    }else{
      document.title="effingFocus";
    }
  },[tick,tasks]);
  useEffect(()=>{if(!isLocked||!lockEndTime||lockDone)return;if(Date.now()>=lockEndTime){setLockDone(true);playWin();setConfetti(true);if(user)setDoc(doc(db,"users",user.uid),{activeLock:null},{merge:true}).catch(()=>{});}},[tick,isLocked,lockEndTime,lockDone]);
  useEffect(()=>{const unsub=onAuthStateChanged(auth,u=>{setUser(u);setAuthLoading(false);});return unsub;},[]);

  useEffect(()=>{
    if(!user){
      setFolders(INIT_FOLDERS);setTasks(INIT_TASKS);setExpenses([]);setComplDates([]);setBest(0);setDayHours({});
      setUserPin(null);setIsLocked(false);setLockEndTime(null);setLockedTaskId(null);
      setLockedTaskDk(null);setLockDone(false);setSyncStatus("idle");return;
    }
    const loadUserData=async()=>{
      setSyncStatus("loading");
      try{
        const ref=doc(db,"users",user.uid);
        const snap=await getDoc(ref);
        if(snap.exists()){
          const d=snap.data();
          setFolders(d.folders??INIT_FOLDERS);setTasks(d.tasks??INIT_TASKS);
          setExpenses(d.expenses??[]);
          setCalls(d.calls??{client:[],outreach:[],clientGoal:5,outreachGoal:20});
          setComplDates(d.completedDates??[]);setBest(d.bestStreak??0);setDayHours(d.dayHours??{});
          if(d.weeklyGoal)setWeeklyGoal(d.weeklyGoal);
          if(d.folderSnooze)setFolderSnooze(d.folderSnooze);
          if(d.userPin)setUserPin(d.userPin);
          if(d.activeLock&&d.activeLock.endTime>Date.now()){
            setIsLocked(true);setLockEndTime(d.activeLock.endTime);
            setLockedTaskId(d.activeLock.taskId);setLockedTaskDk(d.activeLock.taskDk);
          }
        }else{
          await setDoc(ref,{folders:INIT_FOLDERS,tasks:INIT_TASKS,expenses:[],completedDates:[],bestStreak:0,dayHours:{}},{merge:true});
          if(window.fbq)window.fbq('track','StartTrial');
          setFolders(INIT_FOLDERS);setTasks(INIT_TASKS);setExpenses([]);setComplDates([]);setBest(0);setDayHours({});
          setUserPin(null);setIsLocked(false);setObStep(1);
          setSyncStatus("success");return;
        }
        setSyncStatus("success");
      }catch(e){
        console.error("Critical load error:",e);
        setSyncStatus("error");
      }
    };
    loadUserData();
  },[user]);

  useEffect(()=>{
    if(!user?.uid||syncStatus!=="success")return;
    // Extra failsafe — never save if data looks like bare initialization
    if(folders===INIT_FOLDERS&&tasks===INIT_TASKS&&expenses.length===0&&complDates.length===0)return;
    const saveData=async()=>{
      try{
        const ref=doc(db,"users",user.uid);
        await setDoc(ref,{
          folders,tasks,calls,expenses,dayHours,weeklyGoal,folderSnooze,
          completedDates:complDates,bestStreak
        },{merge:true});
      }catch(e){console.error("Auto-save failed:",e);}
    };
    saveData();
  },[user?.uid,syncStatus,folders,tasks,calls,expenses,dayHours,weeklyGoal,folderSnooze,complDates]);

  const isDone=(task,dk)=>task.recurring?(task.doneOn??[]).includes(dateForDK(dk)):task.done;
  const sortByAlert=arr=>[...arr].sort((a,b)=>{const al={red:2,yellow:1};return(al[b.alert]??0)-(al[a.alert]??0);});
  const tasksForDay=dk=>{
    const td=dateForDK(dk);const seen=new Set();
    return tasks.filter(t=>{
      if(seen.has(t.id))return false;
      if(t.recurring){if(t.recurringDays?.includes(dk)){seen.add(t.id);return true;}return false;}
      if(t.startDate){if(t.startDate===td){seen.add(t.id);return true;}return false;}
      if(t.scheduledDate){if(t.scheduledDate===td){seen.add(t.id);return true;}return false;}
      if(t.day===dk){seen.add(t.id);return true;}
      return false;
    });
  };
  const folderTasks=fid=>tasks.filter(t=>t.folderId===fid);
  const donePct=(arr,dk)=>arr.length?Math.round(arr.filter(t=>isDone(t,dk)).length/arr.length*100):0;
  const hoursFor=dk=>dayHours[dk]??8;
  const secsTracked=dk=>{
    const date=dateForDK(dk);
    // Use ALL tasks — a task created any day can have time logged on any day
    const taskSecs=tasks.reduce((s,t)=>{
      const log=t.timeLog??{};const dayVal=log[date]??0;
      if(t.timerRunning&&t.timerStartedAt){
        const startDate=dStr(new Date(t.timerStartedAt));
        if(startDate===date)return s+dayVal+(Date.now()-t.timerStartedAt)/1000;
      }
      return s+dayVal;
    },0);
    const callSecs=(calls.client??[]).filter(c=>c.date===date).reduce((s,c)=>s+c.duration*60,0)
      +(calls.outreach??[]).filter(c=>c.date===date).reduce((s,c)=>s+c.duration*60,0);
    return taskSecs+callSecs;
  };
  const hoursLeft=dk=>Math.max(0,hoursFor(dk)-secsTracked(dk)/3600);
  const hoursPct=dk=>Math.min(100,Math.round(secsTracked(dk)/3600/hoursFor(dk)*100));
  const weekSecsTotal=()=>{ let total=DAY_KEYS.reduce((s,dk)=>s+secsTracked(dk),0); total+=todayCallsOf("client").reduce((s,c)=>s+c.duration*60,0); total+=todayCallsOf("outreach").reduce((s,c)=>s+c.duration*60,0); return total; };
  const weekGoalSecs=()=>weeklyGoal*3600;
  const weekPct=()=>{const ws=weekSecsTotal(),wg=weekGoalSecs();if(ws>0)return Math.min(100,Math.round(ws/wg*100));let t=0,d=0;DAY_KEYS.forEach(dk=>{const dt=tasksForDay(dk);t+=dt.length;d+=dt.filter(x=>isDone(x,dk)).length;});return t?Math.round(d/t*100):0;};
  const thisWeekSecs=()=>{
    let total=0;
    tasks.forEach(t=>{Object.entries(t.timeLog??{}).forEach(([date,s])=>{const d=new Date(date+"T00:00:00");const diff=Math.round((new Date()-d)/86400000);if(diff>=0&&diff<7)total+=s;});});
    total+=(calls.client??[]).filter(c=>{const diff=Math.round((new Date()-new Date(c.date+"T00:00:00"))/86400000);return diff>=0&&diff<7;}).reduce((s,c)=>s+c.duration*60,0);
    total+=(calls.outreach??[]).filter(c=>{const diff=Math.round((new Date()-new Date(c.date+"T00:00:00"))/86400000);return diff>=0&&diff<7;}).reduce((s,c)=>s+c.duration*60,0);
    return total;
  };
  const lastWeekSecs=()=>{
    let total=0;
    tasks.forEach(t=>{Object.entries(t.timeLog??{}).forEach(([date,s])=>{const d=new Date(date+"T00:00:00");const diff=Math.round((new Date()-d)/86400000);if(diff>=7&&diff<14)total+=s;});});
    total+=(calls.client??[]).filter(c=>{const diff=Math.round((new Date()-new Date(c.date+"T00:00:00"))/86400000);return diff>=7&&diff<14;}).reduce((s,c)=>s+c.duration*60,0);
    total+=(calls.outreach??[]).filter(c=>{const diff=Math.round((new Date()-new Date(c.date+"T00:00:00"))/86400000);return diff>=7&&diff<14;}).reduce((s,c)=>s+c.duration*60,0);
    return total;
  };
  const hWeek=()=>thisWeekSecs()/3600;
  const callsInPeriod=(type,filterFn)=>(calls[type]??[]).filter(filterFn);
  const callsThisWeek=type=>callsInPeriod(type,c=>{const diff=Math.round((new Date()-new Date(c.date+"T00:00:00"))/86400000);return diff>=0&&diff<7;});
  const callsThisMonth=type=>callsInPeriod(type,c=>c.date.startsWith(monthKey()));
  const callsThisYear=type=>callsInPeriod(type,c=>c.date.startsWith(String(new Date().getFullYear())));
  const callMins=arr=>arr.reduce((s,c)=>s+c.duration,0);
  const hoursThisMonth=()=>{const mk=monthKey();let t=0;tasks.forEach(task=>{Object.entries(task.timeLog??{}).forEach(([date,s])=>{if(date.startsWith(mk))t+=s;});});t+=callMins([...callsThisMonth("client"),...callsThisMonth("outreach")])*60;return t/3600;};
  const hoursThisYear=()=>{const yr=String(new Date().getFullYear());let t=0;tasks.forEach(task=>{Object.entries(task.timeLog??{}).forEach(([date,s])=>{if(date.startsWith(yr))t+=s;});});t+=callMins([...callsThisYear("client"),...callsThisYear("outreach")])*60;return t/3600;};
  const revenueThisMonth=()=>{const mk=monthKey();const active=folders.filter(f=>(f.monthlyValue||0)>0&&!f.archived);const sub=active.filter(f=>(f.subCollected??{})[mk]).reduce((s,f)=>s+(f.monthlyValue||0),0);const ot=folders.filter(f=>!f.archived).flatMap(f=>(f.payments??[]).filter(p=>p.month===mk&&p.status==="collected")).reduce((s,p)=>s+p.amount,0);return sub+ot;};
  const revenueThisYear=()=>{const yr=String(new Date().getFullYear());let t=0;folders.filter(f=>!f.archived).forEach(f=>{if((f.monthlyValue||0)>0)Object.entries(f.subCollected??{}).forEach(([m,v])=>{if(v&&m.startsWith(yr))t+=f.monthlyValue;});(f.payments??[]).forEach(p=>{if(p.status==="collected"&&(p.month??'').startsWith(yr))t+=p.amount;});});return t;};
  const expensesThisMonth=()=>{const mk=monthKey();return expenses.filter(e=>e.category==="business").reduce((s,e)=>{if((e.paid??{})[mk])return s+getExpenseAmount(e);return s;},0);};
  const expensesThisYear=()=>{const yr=String(new Date().getFullYear());let t=0;expenses.filter(e=>e.category==="business").forEach(e=>{Object.entries(e.paid??{}).forEach(([m,paid])=>{if(paid&&m.startsWith(yr))t+=e.type==="variable"?((e.variableAmounts??{})[m]??0):e.amount;});});return t;};
  const hLastWeek=()=>lastWeekSecs()/3600;

  const startTimer=taskId=>{
    const now=Date.now();playStart();
    setTasks(prev=>prev.map(t=>{
      if(t.id===taskId)return{...t,timerRunning:true,timerStartedAt:now};
      if(t.timerRunning&&t.timerStartedAt){const el=Math.floor((now-t.timerStartedAt)/1000);const date=dStr(new Date(t.timerStartedAt));const log={...(t.timeLog??{})};log[date]=(log[date]??0)+el;return{...t,timerRunning:false,timerStartedAt:null,timerSeconds:(t.timerSeconds??0)+el,timeLog:log};}
      return t;
    }));
  };
  const pauseTimer=taskId=>{
    const now=Date.now();
    setTasks(prev=>prev.map(t=>{
      if(t.id!==taskId)return t;
      if(!t.timerStartedAt)return{...t,timerRunning:false};
      const log={...(t.timeLog??{})};
      const startDateStr=dStr(new Date(t.timerStartedAt));
      const endDateStr=dStr(new Date(now));
      if(startDateStr===endDateStr){
        const el=Math.floor((now-t.timerStartedAt)/1000);
        log[startDateStr]=(log[startDateStr]??0)+el;
      }else{
        // Timer crossed midnight — split time across days
        const midnight=new Date(now);midnight.setHours(0,0,0,0);
        const yesterdaySecs=Math.floor((midnight.getTime()-t.timerStartedAt)/1000);
        const todaySecs=Math.floor((now-midnight.getTime())/1000);
        if(yesterdaySecs>0)log[startDateStr]=(log[startDateStr]??0)+yesterdaySecs;
        if(todaySecs>0)log[endDateStr]=(log[endDateStr]??0)+todaySecs;
      }
      const el=Math.floor((now-t.timerStartedAt)/1000);
      return{...t,timerRunning:false,timerStartedAt:null,timerSeconds:(t.timerSeconds??0)+el,timeLog:log};
    }));
  };
  const deleteTask=(e,id)=>{e.stopPropagation();setTasks(p=>p.filter(t=>t.id!==id));};
  const uncompleteTask=()=>{if(!activeTask)return;const dk=activeTaskDk;setTasks(prev=>prev.map(t=>{if(t.id!==activeTask.id)return t;if(!t.recurring)return{...t,done:false};return{...t,doneOn:(t.doneOn??[]).filter(d=>d!==dateForDK(dk))};}));goBack();};
  const deleteActiveTask=()=>{if(!activeTask)return;setTasks(p=>p.filter(t=>t.id!==activeTask.id));goBack();};
  const saveEditTask=()=>{const txt=editTaskText.trim();if(!txt)return;setTasks(p=>p.map(t=>t.id===activeTask.id?{...t,text:txt}:t));setShowEditTask(false);};

  const completeTask=(remindDays=null)=>{
    if(!activeTask)return;
    const dk=activeTaskDk;const now=Date.now();playCheck();
    setTasks(prev=>{
      let next=prev.map(t=>{
        if(t.id!==activeTask.id)return t;
        let ts=t.timerSeconds??0;const log={...(t.timeLog??{})};
        if(t.timerRunning&&t.timerStartedAt){const el=Math.floor((now-t.timerStartedAt)/1000);const date=dStr(new Date(t.timerStartedAt));log[date]=(log[date]??0)+el;ts+=el;}
        if(!t.recurring)return{...t,done:true,timerRunning:false,timerStartedAt:null,timerSeconds:ts,timeLog:log};
        return{...t,doneOn:[...(t.doneOn??[]),dateForDK(dk)],timerRunning:false,timerStartedAt:null,timerSeconds:ts,timeLog:log};
      });
      if(remindDays){const f=new Date();f.setDate(f.getDate()+remindDays);f.setHours(0,0,0,0);next=[...next,{id:Date.now(),text:activeTask.text,folderId:activeTask.folderId,recurring:false,day:DAY_KEYS[(f.getDay()+6)%7],startDate:dStr(f),done:false,timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{},isReminder:true}];}
      const dayT=next.filter(t=>(!t.recurring&&(t.day===dk||t.startDate===dateForDK(dk)))||(t.recurring&&t.recurringDays?.includes(dk)));
      const allDone=dayT.length>0&&dayT.every(t=>!t.recurring?t.done:(t.doneOn??[]).includes(dateForDK(dk)));
      if(allDone){
        setTimeout(()=>{playWin();setConfetti(true);},100);
        if(dk===todayKey()){
          const newDates=cd.includes(dStr())?cd:[...cd,dStr()];
          setComplDates(newDates);
          const s=calcStreak(newDates),nb=s>bestStreak?s:bestStreak;
          if(nb>bestStreak)setBest(nb);
        }
      }
      return next;
    });
    setShowRemind(false);goBack();
  };

  const openLockFlow=()=>{if(!userPin){setPinStep(1);setPinInput("");setPinConfirm("");setPinError("");setShowPinSetModal(true);}else setShowLockModal(true);};
  const activateLock=()=>{const endTime=Date.now()+lockDuration*60*1000;setIsLocked(true);setLockEndTime(endTime);setLockedTaskId(activeTask?.id);setLockedTaskDk(activeTaskDk);setLockDone(false);setShowLockModal(false);if(activeTask&&!activeTask.timerRunning)startTimer(activeTask.id);if(user)setDoc(doc(db,"users",user.uid),{activeLock:{endTime,taskId:activeTask?.id,taskDk:activeTaskDk}},{merge:true}).catch(()=>{});};
  const handlePinKey=key=>{
    if(showPinSetModal){
      if(pinStep===1){const n=(pinInput+key).slice(0,4);setPinInput(n);if(n.length===4){setPinStep(2);setPinConfirm("");}}
      else{const n=(pinConfirm+key).slice(0,4);setPinConfirm(n);if(n.length===4){if(n===pinInput){setUserPin(pinInput);if(user)setDoc(doc(db,"users",user.uid),{userPin:pinInput},{merge:true}).catch(()=>{});setShowPinSetModal(false);setPinInput("");setPinConfirm("");setPinStep(1);setShowLockModal(true);}else{setPinError("PINs don't match");setPinConfirm("");setPinInput("");setPinStep(1);setTimeout(()=>setPinError(""),2000);}}}
    }else if(showPinUnlock){
      const n=(pinInput+key).slice(0,4);setPinInput(n);
      if(n.length===4){if(n===userPin){setIsLocked(false);setLockEndTime(null);setLockedTaskId(null);setShowPinUnlock(false);setPinInput("");if(user)setDoc(doc(db,"users",user.uid),{activeLock:null},{merge:true}).catch(()=>{});}else{setPinError("Wrong PIN");setPinInput("");setTimeout(()=>setPinError(""),1500);}}
    }
  };
  const handlePinDel=()=>{if(showPinSetModal){if(pinStep===2)setPinConfirm(p=>p.slice(0,-1));else setPinInput(p=>p.slice(0,-1));}else if(showPinUnlock)setPinInput(p=>p.slice(0,-1));};
  const dismissLockDone=()=>{setIsLocked(false);setLockDone(false);setLockEndTime(null);setLockedTaskId(null);setLockedTaskDk(null);};

  const createFolder=()=>{const n=nfName.trim();if(!n)return;setFolders(p=>[...p,{id:Date.now(),name:n,color:nfColor,icon:nfIcon,monthlyValue:parseFloat(nfValue)||0,payments:[],subCollected:{},prospect:nfProspect,archived:false,paused:false}]);setNfName("");setNfColor(COLORS[0]);setNfIcon(ICON_OPTIONS[0]);setNfValue("");setNfProspect(false);setShowFolderModal(false);};
  const convertToClient=fid=>{setFolders(p=>p.map(f=>f.id===fid?{...f,prospect:false}:f));goHome();};
  const toggleSubCollected=fid=>{const mk=monthKey();setFolders(p=>p.map(f=>{if(f.id!==fid)return f;const sc={...(f.subCollected??{})};sc[mk]=!sc[mk];return{...f,subCollected:sc};}));};
  const addPayment=()=>{const amt=parseFloat(paymentAmount);if(!amt||!paymentFolder)return;setFolders(p=>p.map(f=>{if(f.id!==paymentFolder)return f;const pay={id:Date.now(),amount:amt,note:paymentNote.trim()||"One-time payment",status:"sent",month:monthKey()};return{...f,payments:[...(f.payments??[]),pay]};}));setPaymentAmount("");setPaymentNote("");setShowPaymentModal(false);};
  const togglePayment=pid=>{setFolders(p=>p.map(f=>({...f,payments:(f.payments??[]).map(p=>p.id===pid?{...p,status:p.status==="sent"?"collected":"sent"}:p)})));};
  const deletePayment=(fid,pid)=>{setFolders(p=>p.map(f=>f.id!==fid?f:{...f,payments:(f.payments??[]).filter(p=>p.id!==pid)}));};
  const openRename=(e,f)=>{e.stopPropagation();setRenamingFolder(f);setRenameText(f.name);setRenameValue(String(f.monthlyValue||""));setShowRenameModal(true);};
  const saveRename=()=>{const n=renameText.trim();if(!n)return;setFolders(p=>p.map(f=>f.id===renamingFolder.id?{...f,name:n,monthlyValue:parseFloat(renameValue)||0}:f));setShowRenameModal(false);};
  const archiveFolder=fid=>{setFolders(p=>p.map(f=>f.id===fid?{...f,archived:true,archivedDate:dStr()}:f));goHome();};
  const unarchiveFolder=fid=>setFolders(p=>p.map(f=>f.id===fid?{...f,archived:false,archivedDate:null}:f));
  const pauseFolder=fid=>{setFolders(p=>p.map(f=>f.id===fid?{...f,paused:true,pausedDate:dStr()}:f));goHome();};
  const unpauseFolder=fid=>setFolders(p=>p.map(f=>f.id===fid?{...f,paused:false,pausedDate:null}:f));
  const deleteFolder=fid=>{setFolders(p=>p.filter(f=>f.id!==fid));setTasks(p=>p.filter(t=>t.folderId!==fid));goHome();};
  const openHours=dk=>{setPendingHrs(hoursFor(dk));setHoursDay(dk);setShowHoursModal(true);};
  const saveHours=()=>{setDayHours(p=>({...p,[hoursDay]:pendingHrs}));setShowHoursModal(false);};
  const snoozeFolder=(fid,days)=>{const until=new Date();until.setDate(until.getDate()+days);setFolderSnooze(p=>({...p,[fid]:until.toISOString()}));setShowSnoozeModal(false);setSnoozingFolder(null);};
  const clearSnooze=fid=>setFolderSnooze(p=>{const n={...p};delete n[fid];return n;});
  const isSnoozed=fid=>{const until=folderSnooze[fid];if(!until)return false;return new Date(until)>new Date();};
  const lastActivityDays=fid=>{
    const ft=tasks.filter(t=>t.folderId===fid);
    let latest=null;
    ft.forEach(t=>{
      // Check timeLog entries
      Object.keys(t.timeLog??{}).forEach(d=>{if(!latest||d>latest)latest=d;});
      // Check ALL task startDates (done or not) — key fix
      if(t.startDate&&(!latest||t.startDate>latest))latest=t.startDate;
      // Check doneOn dates for recurring tasks
      (t.doneOn??[]).forEach(d=>{if(!latest||d>latest)latest=d;});
    });
    // Check calls linked to this folder
    const folderCalls=(calls.client??[]).filter(c=>c.folderId===fid);
    folderCalls.forEach(c=>{if(!latest||c.date>latest)latest=c.date;});
    // If truly no data ever — flag as 999 days (always show)
    if(!latest)return 999;
    return Math.floor((new Date()-new Date(latest+'T00:00:00'))/86400000);
  };
  const resetSnoozeOnActivity=fid=>{if(folderSnooze[fid])clearSnooze(fid);};

  // Calls functions
  const todayCallsOf=type=>(calls[type]??[]).filter(c=>c.date===dStr());
  const logCall=()=>{
    const dur=parseInt(callDuration)||0;if(!dur)return;
    const entry={id:Date.now(),date:dStr(),duration:dur,folderId:callType==="client"?callFolder:null};
    setCalls(p=>({...p,[callType]:[...(p[callType]??[]),entry]}));
    if(callFolder)resetSnoozeOnActivity(callFolder);
    setCallDuration("");setCallFolder(null);setShowCallModal(false);
  };
  const deleteCall=(type,id)=>setCalls(p=>({...p,[type]:(p[type]??[]).filter(c=>c.id!==id)}));
  const saveCallGoals=()=>{setCalls(p=>({...p,clientGoal:pendingClientGoal,outreachGoal:pendingOutreachGoal}));setShowCallGoalModal(false);};
  const openCallModal=type=>{setCallType(type);setCallDuration("");setCallFolder(null);setShowCallModal(true);};
  const openCallGoalModal=()=>{setPendingClientGoal(calls.clientGoal??5);setPendingOutreachGoal(calls.outreachGoal??20);setShowCallGoalModal(true);};
  const openAddExpense=(cat)=>{setExpName("");setExpAmount("");setExpType("fixed");setExpCategory(cat);setEditingExp(null);setShowExpenseModal(true);};
  const openEditExpense=(exp)=>{setExpName(exp.name);setExpAmount(String(exp.amount));setExpType(exp.type);setExpCategory(exp.category);setEditingExp(exp);setShowExpenseModal(true);};
  const saveExpense=()=>{
    const n=expName.trim(),amt=parseFloat(expAmount);if(!n||!amt)return;
    if(editingExp){setExpenses(p=>p.map(e=>e.id===editingExp.id?{...e,name:n,amount:amt,type:expType,category:expCategory}:e));}
    else{setExpenses(p=>[...p,{id:Date.now(),name:n,amount:amt,type:expType,category:expCategory,paid:{},variableAmounts:{}}]);}
    setShowExpenseModal(false);
  };
  const deleteExpense=id=>{setExpenses(p=>p.filter(e=>e.id!==id));};
  const toggleExpensePaid=id=>{const mk=monthKey();setExpenses(p=>p.map(e=>{if(e.id!==id)return e;const paid={...(e.paid??{})};paid[mk]=!paid[mk];return{...e,paid};}));};
  const setVariableAmount=(id,val)=>{const mk=monthKey();setExpenses(p=>p.map(e=>{if(e.id!==id)return e;const va={...(e.variableAmounts??{})};va[mk]=parseFloat(val)||0;return{...e,variableAmounts:va};}));};
  const getExpenseAmount=(exp)=>{const mk=monthKey();return exp.type==="variable"?(exp.variableAmounts??{})[mk]??0:exp.amount;};
  const isExpensePaid=(exp)=>(exp.paid??{})[monthKey()]||false;

  const goHome=()=>setView("home");
  const goDay=dk=>{setActiveDay(dk);setView("day");setTaskStartDate(dateForDK(dk));setTaskDueDate(null);};
  const goFolder=fid=>{setActiveFolder(fid);setView("folder");setTaskStartDate(dStr());setTaskDueDate(null);};
  const goTask=(task,dk,from)=>{
    const now=Date.now();
    setTasks(prev=>prev.map(t=>{if(!t.timerRunning||t.id===task.id)return t;const el=Math.floor((now-t.timerStartedAt)/1000);const date=dStr(new Date(t.timerStartedAt));const log={...(t.timeLog??{})};log[date]=(log[date]??0)+el;return{...t,timerRunning:false,timerStartedAt:null,timerSeconds:(t.timerSeconds??0)+el,timeLog:log};}));
    setActiveTask(task);setActiveTaskDk(dk);setPrevView(from??view);setShowRemind(false);setView("task");
  };
  const goBack=()=>{if(prevView==="day")setView("day");else if(prevView==="folder")setView("folder");else if(prevView==="all")setView("all");else setView("home");};
  const streak=calcStreak(complDates);

  const PinNumpad=({currentPin})=>(
    <div>
      <div className="pin-dots">{[0,1,2,3].map(i=><div key={i} className={`pin-dot${(currentPin||"").length>i?" filled":""}`}/>)}</div>
      <div className="pin-numpad">
        {[1,2,3,4,5,6,7,8,9].map(n=><div key={n} className="pin-key" onClick={()=>handlePinKey(String(n))}>{n}</div>)}
        <div className="pin-key" style={{visibility:"hidden"}}/>
        <div className="pin-key" onClick={()=>handlePinKey("0")}>0</div>
        <div className="pin-key del" onClick={handlePinDel}>⌫</div>
      </div>
      {pinError&&<div className="pin-error">{pinError}</div>}
    </div>
  );

  const AlertBtn=({task})=>{
    const nextAlert=task.alert==="red"?null:task.alert==="yellow"?"red":"yellow";
    const label=task.alert==="red"?"🔴 Red alert":task.alert==="yellow"?"🟡 Yellow alert":"⚪ Set alert";
    const btnColor=task.alert==="red"?"#ef4444":task.alert==="yellow"?"#fbbf24":"var(--b2)";
    return(<button className="detail-action-btn" style={{borderColor:btnColor,color:task.alert?btnColor:"var(--tx2)"}} onClick={()=>setTasks(p=>p.map(t=>t.id===task.id?{...t,alert:nextAlert}:t))}>{label}</button>);
  };

  const TaskRow=({task,dk,color,from})=>{
    const done=isDone(task,dk),secs=getLiveSecs(task),isRunning=task.timerRunning;
    const today=dStr();
    const alertColor=task.alert==="red"?"#ef4444":task.alert==="yellow"?"#fbbf24":null;
    let dueBadge=null;
    if(task.dueDate&&!done){const diff=Math.round((new Date(task.dueDate)-new Date(today))/86400000);let lbl,bg,col;if(diff<0){lbl=`Overdue ${Math.abs(diff)}d`;bg="#ef444420";col="#ef4444";}else if(diff===0){lbl="Due today";bg="#fb923c20";col="#fb923c";}else if(diff===1){lbl="Due tmrw";bg="#fbbf2420";col="#fbbf24";}else if(diff<=7){lbl=`Due in ${diff}d`;bg="#ffffff10";col="var(--tx2)";}else{lbl=`Due ${task.dueDate.slice(5)}`;bg="#ffffff08";col="var(--mu)";}dueBadge=<span className="due-badge" style={{background:bg,color:col}}>{lbl}</span>;}
    return(
      <div className={`task-row${done?" done":""}${task.dueDate&&!done&&today>task.dueDate?" overdue":""}`} style={{"--rc":color,borderLeftColor:alertColor||undefined,borderLeftWidth:alertColor?3:undefined,background:alertColor?`${alertColor}08`:"var(--s)"}} onClick={()=>goTask(task,dk,from??view)}>
        <div className="task-chk"><span className="task-chk-v">✓</span></div>
        {alertColor&&!done&&<span style={{fontSize:".8rem",flexShrink:0}}>{task.alert==="red"?"🔴":"🟡"}</span>}
        {isRunning&&<div className="task-running-dot"/>}
        {task.recurring&&!isRunning&&!alertColor&&<div className="rec-dot" style={{background:color}}/>}
        {task.isReminder&&<span style={{fontSize:".7rem",flexShrink:0}}>⏰</span>}
        <span className="task-txt" style={{color:alertColor&&!done?alertColor:undefined}}>{task.text}</span>
        {dueBadge}
        {secs>0&&<span className="task-timer-badge">{fmtTimer(secs)}</span>}
        {!done&&<span className="task-arr">›</span>}
        <button className="del-btn" onClick={e=>deleteTask(e,task.id)}>×</button>
      </div>
    );
  };

  const AddRow=({dk,fid,placeholder})=>{
    const [text,setText]=useState("");
    const [showDates,setShowDates]=useState(false);
    const inputRef=useRef(null);
    const startOpts=Array.from({length:8},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);d.setHours(0,0,0,0);return{value:dStr(d),label:i===0?"Today":i===1?"Tomorrow":DAYS[(d.getDay()+6)%7]};});
    const dueOpts=[{value:null,label:"No deadline"},{value:taskStartDate,label:"Same day"},...[1,3,7,14,30].map(days=>{const d=new Date(taskStartDate);d.setDate(d.getDate()+days);return{value:dStr(d),label:days===1?"+1 day":days===7?"+1 week":days===14?"+2 weeks":days===30?"+1 month":`+${days}d`};})];
    const submit=()=>{const t=text.trim();if(!t)return;const base={id:Date.now(),text:t,folderId:fid??folders[0]?.id??null,timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{},startDate:taskStartDate,dueDate:taskDueDate||null};setTasks(p=>[...p,taskRecur?{...base,recurring:true,recurringDays:taskRecDays.length?taskRecDays:[dk??todayKey()],doneOn:[],startDate:undefined,dueDate:undefined}:{...base,recurring:false,done:false}]);setText("");setShowDates(false);setTaskRecur(false);setTaskRecDays([]);inputRef.current?.focus();};
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

  const ChaseThese=()=>{
    const today=dStr();
    const mk=monthKey();

    // Build priority list for ALL non-archived folders
    const priorities=folders.filter(f=>!f.archived&&!f.paused&&!f.prospect&&!isSnoozed(f.id)).map(f=>{
      const ft=tasks.filter(t=>t.folderId===f.id);
      const days=lastActivityDays(f.id);
      const hasOverdue=ft.some(t=>!t.done&&!t.recurring&&t.dueDate&&t.dueDate<today);
      const hasTasksThisWeek=DAY_KEYS.some(dk=>tasksForDay(dk).some(t=>t.folderId===f.id));
      const hasTasksToday=tasksForDay(todayKey()).some(t=>t.folderId===f.id);
      const subPending=(f.monthlyValue||0)>0&&!(f.subCollected??{})[mk];
      let priority=0;
      let reason="";
      if(hasOverdue){priority=4;reason="Overdue tasks";}
      else if(subPending&&days>=3){priority=3;reason="Payment pending";}
      else if(!hasTasksToday&&hasTasksThisWeek){priority=2;reason="Has tasks this week";}
      else if(days>=chaseThreshold&&!hasTasksToday){priority=1;reason=`${days===999?"No activity recorded":`${days}d no activity`}`;}
      return{f,priority,reason,days,hasOverdue,subPending};
    }).filter(p=>p.priority>0).sort((a,b)=>b.priority-a.priority);

    if(priorities.length===0)return null;

    const getColor=p=>{
      if(p.priority===4)return"#ef4444";
      if(p.priority===3)return"#fbbf24";
      if(p.priority===2)return"#60a5fa";
      return"#fb923c";
    };
    const getBg=p=>{
      if(p.priority===4)return"#ef44440a";
      if(p.priority===3)return"#fbbf2408";
      if(p.priority===2)return"#60a5fa08";
      return"#fb923c08";
    };

    return(
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:".68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".14em",color:"#fb923c"}}>Focus Now</span>
            <span style={{fontSize:".65rem",background:"#fb923c20",color:"#fb923c",border:"1px solid #fb923c30",borderRadius:99,padding:"1px 8px",fontWeight:700}}>{priorities.length}</span>
          </div>
          <button onClick={()=>{const d=prompt(`Chase threshold in days (current: ${chaseThreshold})`);if(d&&!isNaN(d))setChaseThreshold(parseInt(d));}} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".72rem",fontWeight:600}}>Settings</button>
        </div>
        {priorities.slice(0,6).map(p=>{
          const color=getColor(p);
          return(
            <div key={p.f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:getBg(p),border:`1px solid ${color}25`,borderLeft:`3px solid ${color}`,borderRadius:10,cursor:"pointer",marginBottom:7}}>
              <span style={{fontSize:"1rem",flexShrink:0}} onClick={()=>goFolder(p.f.id)}>{p.f.icon}</span>
              <div style={{flex:1,minWidth:0}} onClick={()=>goFolder(p.f.id)}>
                <div style={{fontSize:".88rem",fontWeight:600,color,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.f.name}</div>
                <div style={{fontSize:".68rem",color:"var(--mu)",marginTop:2}}>{p.reason}</div>
              </div>
              {(p.f.monthlyValue||0)>0&&<span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".82rem",color:p.subPending?"#fbbf24":"#34d399",flexShrink:0}}>${p.f.monthlyValue.toLocaleString()}</span>}
              <button onClick={e=>{e.stopPropagation();setSnoozingFolder(p.f);setShowSnoozeModal(true);}} style={{background:"none",border:`1px solid ${color}30`,color,borderRadius:99,padding:"4px 10px",cursor:"pointer",fontSize:".68rem",fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>Snooze</button>
            </div>
          );
        })}
        {priorities.length>6&&<div style={{fontSize:".75rem",color:"var(--mu)",textAlign:"center",padding:"6px 0"}}>+{priorities.length-6} more clients need attention</div>}
      </div>
    );
  };

  const RingsCard=({dk})=>{
    const hp=hoursPct(dk),wp=weekPct(),st=secsTracked(dk);
    const hasTimeData=weekSecsTotal()>0;
    return(
      <div className="rings-card">
        <div className="ring-stat" style={{cursor:"pointer"}} onClick={()=>{setPendingWeekGoal(weeklyGoal);setShowWeekGoalModal(true);}}>
          <div className="ring-stat-val" style={{color:"#a78bfa"}}>{wp}%</div>
          <div className="ring-stat-lbl">This Week</div>
          <div className="ring-stat-sub">{hasTimeData?fmtHrs(weekSecsTotal()/3600)+" / "+weeklyGoal+"hrs":`${DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).filter(t=>isDone(t,d)).length,0)}/${DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).length,0)} tasks`}</div>
        </div>
        <div className="ring-div"/>
        <Ring pct={hp} color="#c8ff57" size={100} stroke={9} label="Today" val={`${hp}%`}/>
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
        {hoursFor(dk)-st/3600<0&&<div className="overload">Over budget</div>}
      </div>
    );
  };

  const DayMomentum=({dk})=>{
    if(dk!==todayKey())return null;
    const now=new Date(),hour=now.getHours()+now.getMinutes()/60;
    const ws=9,we=18;if(hour<ws)return null;
    const dayPct=Math.min(100,Math.round((hour-ws)/(we-ws)*100));
    const taskPct=donePct(tasksForDay(dk),dk);const diff=taskPct-dayPct;
    const time=now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    let status,sColor,msg,barColor;
    if(taskPct===100){status="Done";sColor="#c8ff57";msg="All tasks complete!";barColor="#c8ff57";}
    else if(diff>=15){status="Ahead";sColor="#c8ff57";msg=`${diff}% ahead`;barColor="#c8ff57";}
    else if(diff>=-5){status="On track";sColor="#60a5fa";msg="Right on pace";barColor="#60a5fa";}
    else if(diff>=-20){status="Behind";sColor="#fbbf24";msg=`${Math.abs(diff)}% behind — push now`;barColor="#fbbf24";}
    else{status="Lagging";sColor="#ef4444";msg="Focus up — time is moving fast";barColor="#ef4444";}
    return(
      <div className="momentum-card">
        <div className="momentum-hdr"><div className="momentum-title">Day Momentum · {time}</div><div className="momentum-status" style={{color:sColor}}>{status}</div></div>
        <div className="momentum-row"><span className="momentum-lbl">Tasks done</span><div className="momentum-bg"><div className="momentum-fill" style={{width:`${taskPct}%`,background:barColor}}/></div><span className="momentum-pct">{taskPct}%</span></div>
        <div className="momentum-row" style={{marginBottom:8}}><span className="momentum-lbl">Day elapsed</span><div className="momentum-bg"><div className="momentum-fill" style={{width:`${dayPct}%`,background:"var(--b3)"}}/></div><span className="momentum-pct">{dayPct}%</span></div>
        <div className="momentum-msg" style={{color:sColor+"cc"}}>{msg}</div>
      </div>
    );
  };

  const TimeProgress=({dk})=>{
    const st=secsTracked(dk),budgetSecs=hoursFor(dk)*3600,pct=Math.min(100,(st/budgetSecs)*100);
    const mins=Math.floor(st/60),hrs=st/3600,bHrs=hoursFor(dk);
    const milestones=[{pct:25,label:fmtHrs(bHrs*.25)},{pct:50,label:fmtHrs(bHrs*.5)},{pct:75,label:fmtHrs(bHrs*.75)},{pct:100,label:`${bHrs} hrs`}];
    let win=null;
    if(pct>=100)win="Full day done!";else if(pct>=75)win="75% — on fire!";else if(pct>=50)win="Halfway there!";else if(pct>=25)win="25% done!";else if(mins>=1)win=`${mins} min in — keep going!`;
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

  const WeekCompare=()=>{
    const tw=hWeek(),lw=hLastWeek();
    if(tw<=0&&lw<=0)return null;
    const diff=tw-lw,maxH=Math.max(tw,lw,1),isAhead=diff>=0;
    const twH=Math.max(4,Math.round(tw/maxH*48));const lwH=Math.max(4,Math.round(lw/maxH*48));
    return(
      <div className="stat-card">
        <div className="stat-title">📊 This Week vs Last</div>
        <div style={{display:"flex",gap:12,marginBottom:16,marginTop:4}}>
          <div style={{flex:1}}><div style={{fontSize:".65rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>This week</div><div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.3rem",color:"#c8ff57",letterSpacing:"-1px",lineHeight:1}}>{fmtHrs(tw)}</div></div>
          <div style={{flex:1}}><div style={{fontSize:".65rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>Last week</div><div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.3rem",color:"var(--tx2)",letterSpacing:"-1px",lineHeight:1}}>{fmtHrs(lw)}</div></div>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:10,alignItems:"flex-end",height:"52px"}}>
          <div style={{flex:1,display:"flex",alignItems:"flex-end"}}><div style={{height:twH+"px",background:"#c8ff57",borderRadius:"4px 4px 0 0",width:"100%"}}/></div>
          <div style={{flex:1,display:"flex",alignItems:"flex-end"}}><div style={{height:lwH+"px",background:"#333",borderRadius:"4px 4px 0 0",width:"100%"}}/></div>
        </div>
        <div style={{height:1,background:"var(--b)",marginBottom:10}}/>
        <div style={{fontSize:".78rem",fontWeight:700,color:isAhead?"#34d399":"#ef4444"}}>
          {lw===0?"No data from last week yet":isAhead?("+ "+fmtHrs(Math.abs(diff))+" ahead of last week"):("- "+fmtHrs(Math.abs(diff))+" behind last week")}
        </div>
      </div>
    );
  };

  const RunningTimerBanner=()=>{
    const running=tasks.find(t=>t.timerRunning);
    if(!running)return null;
    const folder=folders.find(f=>f.id===running.folderId);
    const secs=getLiveSecs(running);
    return(
      <div onClick={()=>goTask(running,todayKey(),"home")} style={{background:"#c8ff5710",border:"1px solid #c8ff5740",borderRadius:14,padding:"14px 16px",marginBottom:16,cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
        <style>{"@keyframes pulse-border{0%,100%{border-color:#c8ff5740}50%{border-color:#c8ff5799}}"}</style>
        <div style={{width:8,height:8,borderRadius:"50%",background:"var(--ac)",flexShrink:0,animation:"dotpulse 1.2s infinite"}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:".65rem",color:"var(--ac)",fontWeight:700,textTransform:"uppercase",letterSpacing:".12em",marginBottom:3}}>Timer running</div>
          <div style={{fontSize:".92rem",fontWeight:700,color:"var(--tx)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{running.text}</div>
          {folder&&<div style={{fontSize:".68rem",color:"var(--mu)",marginTop:2}}>{folder.icon} {folder.name}</div>}
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.3rem",color:"var(--ac)",letterSpacing:"-1px",lineHeight:1}}>{fmtTimer(secs)}</div>
          <button onClick={e=>{e.stopPropagation();pauseTimer(running.id);}} style={{marginTop:6,background:"none",border:"1px solid #c8ff5740",color:"var(--ac)",borderRadius:99,padding:"3px 12px",cursor:"pointer",fontSize:".72rem",fontWeight:700}}>Pause</button>
        </div>
      </div>
    );
  };

  const UrgentSection=()=>{
    const dk=todayKey();
    const urgent=tasks.filter(t=>t.alert&&!isDone(t,dk));
    if(urgent.length===0)return null;
    const red=sortByAlert(urgent.filter(t=>t.alert==="red"));
    const yellow=sortByAlert(urgent.filter(t=>t.alert==="yellow"));
    const UrgentRow=({task,color,bg})=>{
      const folder=folders.find(f=>f.id===task.folderId);
      return(
        <div onClick={()=>goTask(task,dk,"home")} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:bg,border:`1px solid ${color}30`,borderLeft:`3px solid ${color}`,borderRadius:10,cursor:"pointer",marginBottom:7}}>
          <span style={{fontSize:".9rem",flexShrink:0}}>{task.alert==="red"?"🔴":"🟡"}</span>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:".88rem",fontWeight:600,color,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{task.text}</div>{folder&&<div style={{fontSize:".68rem",color:"var(--mu)",marginTop:2}}>{folder.icon} {folder.name}</div>}</div>
          <span style={{fontSize:".8rem",color,opacity:.7}}>›</span>
        </div>
      );
    };
    return(
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <span style={{fontSize:".68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".14em",color:"#ef4444"}}>Urgent</span>
          <span style={{fontSize:".65rem",background:"#ef444420",color:"#ef4444",border:"1px solid #ef444430",borderRadius:99,padding:"1px 8px",fontWeight:700}}>{urgent.length}</span>
        </div>
        {red.map(t=><UrgentRow key={t.id} task={t} color="#ef4444" bg="#ef44440a"/>)}
        {yellow.map(t=><UrgentRow key={t.id} task={t} color="#fbbf24" bg="#fbbf2408"/>)}
      </div>
    );
  };

  const MoneyView=()=>{
    const mk=monthKey();
    const now=new Date();
    const monthName=now.toLocaleString("default",{month:"long",year:"numeric"});
    // Revenue
    const activeRevFolders=[...folders].filter(f=>(f.monthlyValue||0)>0&&!f.archived&&!f.prospect).sort((a,b)=>(b.monthlyValue||0)-(a.monthlyValue||0));
    const totalMRR=activeRevFolders.reduce((s,f)=>s+(f.monthlyValue||0),0);
    const collectedMRR=activeRevFolders.filter(f=>(f.subCollected??{})[mk]).reduce((s,f)=>s+(f.monthlyValue||0),0);
    const allPayments=folders.filter(f=>!f.prospect).flatMap(f=>(f.payments??[]).filter(p=>p.month===mk));
    const totalOneTime=allPayments.reduce((s,p)=>s+p.amount,0);
    const collectedOneTime=allPayments.filter(p=>p.status==="collected").reduce((s,p)=>s+p.amount,0);
    const totalRevenue=collectedMRR+collectedOneTime;
    // Pipeline (prospects)
    const prospects=folders.filter(f=>f.prospect&&!f.archived);
    const pipelineValue=prospects.reduce((s,f)=>s+(f.monthlyValue||0),0);
    // Expenses
    const bizExps=expenses.filter(e=>e.category==="business");
    const perExps=expenses.filter(e=>e.category==="personal");
    const totalBizExp=bizExps.reduce((s,e)=>s+getExpenseAmount(e),0);
    const paidBizExp=bizExps.filter(e=>isExpensePaid(e)).reduce((s,e)=>s+getExpenseAmount(e),0);
    const totalPerExp=perExps.reduce((s,e)=>s+getExpenseAmount(e),0);
    const paidPerExp=perExps.filter(e=>isExpensePaid(e)).reduce((s,e)=>s+getExpenseAmount(e),0);
    const netProfit=totalRevenue-totalBizExp;

    const ExpRow=({exp})=>{
      const amt=getExpenseAmount(exp);
      const paid=isExpensePaid(exp);
      return(
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid var(--b)"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:".85rem",fontWeight:600,color:"var(--tx)"}}>{exp.name}</div>
            <div style={{fontSize:".65rem",color:"var(--mu)",marginTop:2}}>{exp.type==="fixed"?"Fixed":"Variable"}</div>
          </div>
          {exp.type==="variable"?(
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{color:"var(--mu)",fontSize:".85rem",fontWeight:600}}>$</span>
              <input
                style={{width:70,background:"var(--bg)",border:"1px solid var(--b2)",borderRadius:7,padding:"4px 8px",color:"var(--tx)",fontSize:".85rem",fontFamily:"'DM Mono',monospace",fontWeight:700,textAlign:"right"}}
                value={amt||""}
                onChange={e=>setVariableAmount(exp.id,e.target.value)}
                placeholder="0"
                type="text"
                inputMode="decimal"
              />
            </div>
          ):(
            <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".9rem",color:"var(--tx)"}}>${amt.toLocaleString()}</span>
          )}
          <button onClick={()=>toggleExpensePaid(exp.id)} style={{background:paid?"#34d39918":"#ef444415",border:`1px solid ${paid?"#34d39940":"#ef444430"}`,color:paid?"#34d399":"#ef4444",borderRadius:99,padding:"4px 12px",cursor:"pointer",fontSize:".72rem",fontWeight:700,whiteSpace:"nowrap"}}>
            {paid?"Paid":"Unpaid"}
          </button>
          <button onClick={()=>openEditExpense(exp)} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".75rem",padding:"2px 4px"}}>✏️</button>
          <button onClick={()=>deleteExpense(exp.id)} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:"1rem",padding:"2px 4px"}}>×</button>
        </div>
      );
    };

    return(
      <div className="page">
        <div className="view-hdr"><div className="view-title">Money</div><div className="view-sub">{monthName}</div></div>

        {/* Net snapshot */}
        <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r)",padding:"20px",marginBottom:16,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,textAlign:"center"}}>
          <div>
            <div style={{fontSize:".6rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>Collected</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.4rem",color:"#34d399",letterSpacing:"-1px"}}>${totalRevenue.toLocaleString()}</div>
          </div>
          <div>
            <div style={{fontSize:".6rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>Expenses</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.4rem",color:"#ef4444",letterSpacing:"-1px"}}>${totalBizExp.toLocaleString()}</div>
          </div>
          <div>
            <div style={{fontSize:".6rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>Net Profit</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.4rem",color:netProfit>=0?"#c8ff57":"#ef4444",letterSpacing:"-1px"}}>${netProfit.toLocaleString()}</div>
          </div>
        </div>

        {/* Revenue section */}
        {totalMRR>0&&(
          <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r)",padding:"16px 18px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <span style={{fontSize:".68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".14em",color:"var(--mu)"}}>Subscriptions</span>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".85rem",color:"#34d399"}}>${collectedMRR.toLocaleString()} collected</div>
                {(totalMRR-collectedMRR)>0&&<div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".82rem",color:"#fbbf24",marginTop:2}}>${(totalMRR-collectedMRR).toLocaleString()} pending</div>}
              </div>
            </div>
            {/* Pending first — these need chasing */}
            {activeRevFolders.filter(f=>!(f.subCollected??{})[mk]).length>0&&(
              <div style={{marginBottom:10}}>
                <div style={{fontSize:".6rem",color:"#fbbf24",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>Pending — follow up</div>
                {activeRevFolders.filter(f=>!(f.subCollected??{})[mk]).map(f=>(
                  <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"#fbbf2408",border:"1px solid #fbbf2425",borderLeft:"3px solid #fbbf24",borderRadius:10,marginBottom:6}}>
                    <span style={{fontSize:"1rem",flexShrink:0}}>{f.icon}</span>
                    <span style={{flex:1,fontSize:".88rem",color:"var(--tx)",fontWeight:600}}>{f.name}</span>
                    <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".95rem",color:"#fbbf24"}}>${(f.monthlyValue||0).toLocaleString()}</span>
                    <button onClick={()=>toggleSubCollected(f.id)} style={{background:"#fbbf2415",border:"1px solid #fbbf2440",color:"#fbbf24",borderRadius:99,padding:"5px 14px",cursor:"pointer",fontSize:".72rem",fontWeight:700,whiteSpace:"nowrap"}}>Pending</button>
                  </div>
                ))}
              </div>
            )}
            {/* Collected */}
            {activeRevFolders.filter(f=>(f.subCollected??{})[mk]).length>0&&(
              <div>
                <div style={{fontSize:".6rem",color:"#34d399",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>Collected</div>
                {activeRevFolders.filter(f=>(f.subCollected??{})[mk]).map(f=>(
                  <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#34d39908",border:"1px solid #34d39925",borderRadius:10,marginBottom:6}}>
                    <span style={{fontSize:"1rem",flexShrink:0}}>{f.icon}</span>
                    <span style={{flex:1,fontSize:".85rem",color:"var(--mu)",fontWeight:500}}>{f.name}</span>
                    <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".88rem",color:"#34d399"}}>${(f.monthlyValue||0).toLocaleString()}</span>
                    <button onClick={()=>toggleSubCollected(f.id)} style={{background:"#34d39918",border:"1px solid #34d39940",color:"#34d399",borderRadius:99,padding:"5px 14px",cursor:"pointer",fontSize:".72rem",fontWeight:700,whiteSpace:"nowrap"}}>Collected ✓</button>
                  </div>
                ))}
              </div>
            )}
            {/* One-time payments pending */}
            {allPayments.filter(p=>p.status==="sent").length>0&&(
              <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--b)"}}>
                <div style={{fontSize:".6rem",color:"#60a5fa",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>One-time — Pending</div>
                {allPayments.filter(p=>p.status==="sent").map(p=>{
                  const folder=folders.find(f=>(f.payments??[]).some(fp=>fp.id===p.id));
                  return(
                    <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#60a5fa08",border:"1px solid #60a5fa25",borderLeft:"3px solid #60a5fa",borderRadius:10,marginBottom:6}}>
                      {folder&&<span style={{fontSize:".9rem",flexShrink:0}}>{folder.icon}</span>}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:".85rem",fontWeight:600,color:"var(--tx)"}}>{p.note}</div>
                        {folder&&<div style={{fontSize:".68rem",color:"var(--mu)",marginTop:1}}>{folder.name}</div>}
                      </div>
                      <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".9rem",color:"#60a5fa"}}>${p.amount.toLocaleString()}</span>
                      <button onClick={()=>togglePayment(p.id)} style={{background:"#60a5fa15",border:"1px solid #60a5fa40",color:"#60a5fa",borderRadius:99,padding:"5px 14px",cursor:"pointer",fontSize:".72rem",fontWeight:700,whiteSpace:"nowrap"}}>Pending</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Business Expenses */}
        <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r)",padding:"16px 18px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <span style={{fontSize:".68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".14em",color:"var(--mu)"}}>Business Expenses</span>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".82rem",color:"#ef4444"}}>${paidBizExp.toLocaleString()} / ${totalBizExp.toLocaleString()}</span>
              <button className="ghost-btn" style={{padding:"4px 10px",fontSize:".75rem"}} onClick={()=>openAddExpense("business")}>+ Add</button>
            </div>
          </div>
          {bizExps.length===0&&<div style={{fontSize:".82rem",color:"var(--mu)",padding:"10px 0"}}>No business expenses yet</div>}
          {bizExps.map(e=><ExpRow key={e.id} exp={e}/>)}
        </div>

        {/* Personal Expenses */}
        <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r)",padding:"16px 18px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <span style={{fontSize:".68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".14em",color:"var(--mu)"}}>Personal Expenses</span>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".82rem",color:"#fb923c"}}>${paidPerExp.toLocaleString()} / ${totalPerExp.toLocaleString()}</span>
              <button className="ghost-btn" style={{padding:"4px 10px",fontSize:".75rem"}} onClick={()=>openAddExpense("personal")}>+ Add</button>
            </div>
          </div>
          {perExps.length===0&&<div style={{fontSize:".82rem",color:"var(--mu)",padding:"10px 0"}}>No personal expenses yet</div>}
          {perExps.map(e=><ExpRow key={e.id} exp={e}/>)}
          {perExps.length>0&&(
            <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--b)",display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:".82rem",color:"var(--mu)"}}>Total personal</span>
              <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".85rem",color:"#fb923c"}}>${totalPerExp.toLocaleString()}/mo</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const SessionStats=({task})=>{
    if(!task)return null;
    // Account-wide session stats across ALL tasks
    const allSessions=[];
    tasks.forEach(t=>{
      Object.values(t.timeLog??{}).forEach(secs=>{if(secs>30)allSessions.push(secs);}); // ignore sessions under 30s
    });
    const accountAvg=allSessions.length?Math.round(allSessions.reduce((s,v)=>s+v,0)/allSessions.length):0;
    const accountLongest=allSessions.length?Math.max(...allSessions):0;
    const totalSessions=allSessions.length;
    // Current live session on THIS task
    const liveSecs=task.timerRunning&&task.timerStartedAt?(Date.now()-task.timerStartedAt)/1000:0;
    const isBelow=task.timerRunning&&accountAvg>0&&liveSecs<accountAvg*.7;
    const isBeat=task.timerRunning&&accountAvg>0&&liveSecs>accountLongest;
    if(totalSessions===0&&!task.timerRunning)return null;
    return(
      <div style={{background:"var(--bg)",border:"1px solid var(--b)",borderRadius:12,padding:"14px 16px",marginTop:16}}>
        <div style={{fontSize:".65rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".1em",marginBottom:12}}>Your Session Benchmarks</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:(isBelow||isBeat)?10:0}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.1rem",color:"var(--tx)",lineHeight:1,marginBottom:3}}>{totalSessions}</div>
            <div style={{fontSize:".6rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".08em"}}>Total Sessions</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.1rem",color:"#60a5fa",lineHeight:1,marginBottom:3}}>{accountAvg>0?fmtTimer(accountAvg):"—"}</div>
            <div style={{fontSize:".6rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".08em"}}>Avg Session</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.1rem",color:"#a78bfa",lineHeight:1,marginBottom:3}}>{accountLongest>0?fmtTimer(accountLongest):"—"}</div>
            <div style={{fontSize:".6rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".08em"}}>Longest Ever</div>
          </div>
        </div>
        {isBelow&&(
          <div style={{fontSize:".78rem",color:"#fbbf24",fontWeight:600,textAlign:"center",padding:"8px 12px",background:"rgba(251,191,36,.08)",borderRadius:8,border:"1px solid rgba(251,191,36,.2)"}}>
            {fmtTimer(liveSecs)} in · your avg is {fmtTimer(accountAvg)} — keep going!
          </div>
        )}
        {isBeat&&(
          <div style={{fontSize:".78rem",color:"var(--ac)",fontWeight:600,textAlign:"center",padding:"8px 12px",background:"rgba(200,255,87,.08)",borderRadius:8,border:"1px solid rgba(200,255,87,.2)"}}>
            New longest session — you're in the zone!
          </div>
        )}
      </div>
    );
  };

  const CallsTracker=()=>{
    const clientToday=todayCallsOf("client");
    const outreachToday=todayCallsOf("outreach");
    const clientGoal=calls.clientGoal??5;
    const outreachGoal=calls.outreachGoal??20;
    const weeklyClientGoal=clientGoal*5;
    const weeklyOutreachGoal=outreachGoal*5;
    const monthlyClientGoal=clientGoal*22;
    const monthlyOutreachGoal=outreachGoal*22;
    const clientWeek=callsThisWeek("client");
    const outreachWeek=callsThisWeek("outreach");
    const clientMonth=callsThisMonth("client");
    const outreachMonth=callsThisMonth("outreach");
    const clientPct=Math.min(100,Math.round(clientToday.length/clientGoal*100));
    const outreachPct=Math.min(100,Math.round(outreachToday.length/outreachGoal*100));
    const clientWeekPct=Math.min(100,Math.round(clientWeek.length/weeklyClientGoal*100));
    const outreachWeekPct=Math.min(100,Math.round(outreachWeek.length/weeklyOutreachGoal*100));
    const clientMonthPct=Math.min(100,Math.round(clientMonth.length/monthlyClientGoal*100));
    const outreachMonthPct=Math.min(100,Math.round(outreachMonth.length/monthlyOutreachGoal*100));
    const PBar=({done,goal,pct,color})=>(
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{flex:1,height:5,background:"var(--b2)",borderRadius:99,overflow:"hidden"}}>
          <div style={{height:"100%",borderRadius:99,background:pct>=100?"#34d399":color,width:`${pct}%`,transition:"width .5s ease"}}/>
        </div>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:".72rem",fontWeight:700,color:pct>=100?"#34d399":color,minWidth:44,textAlign:"right"}}>{done}/{goal}</span>
      </div>
    );
    return(
      <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r2)",padding:"16px 18px",marginTop:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <span style={{fontSize:".7rem",fontWeight:600,textTransform:"uppercase",letterSpacing:".12em",color:"var(--mu)"}}>📞 Daily Calls</span>
          <button onClick={openCallGoalModal} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".75rem",fontWeight:600,padding:"2px 6px"}}>Edit goals</button>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
            <span style={{fontSize:".85rem",fontWeight:600,color:"var(--tx)"}}>Client Calls</span>
            <button onClick={()=>openCallModal("client")} style={{background:"var(--ac)",border:"none",color:"#000",borderRadius:99,width:26,height:26,cursor:"pointer",fontSize:"1rem",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
          </div>
          <PBar done={clientToday.length} goal={clientGoal} pct={clientPct} color="var(--ac)"/>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
            <span style={{fontSize:".85rem",fontWeight:600,color:"var(--tx)"}}>Outreach Calls</span>
            <button onClick={()=>openCallModal("outreach")} style={{background:"#60a5fa",border:"none",color:"#000",borderRadius:99,width:26,height:26,cursor:"pointer",fontSize:"1rem",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
          </div>
          <PBar done={outreachToday.length} goal={outreachGoal} pct={outreachPct} color="#60a5fa"/>
        </div>
        <div style={{borderTop:"1px solid var(--b)",paddingTop:12,marginBottom:12}}>
          <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>This Week</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:".75rem",color:"var(--tx2)",width:60,flexShrink:0,minWidth:0}}>Client</span>
              <PBar done={clientWeek.length} goal={weeklyClientGoal} pct={clientWeekPct} color="var(--ac)"/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:".75rem",color:"var(--tx2)",width:60,flexShrink:0,minWidth:0}}>Outreach</span>
              <PBar done={outreachWeek.length} goal={weeklyOutreachGoal} pct={outreachWeekPct} color="#60a5fa"/>
            </div>
          </div>
        </div>
        <div style={{borderTop:"1px solid var(--b)",paddingTop:12,marginBottom:clientToday.length+outreachToday.length>0?12:0}}>
          <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>This Month</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:".75rem",color:"var(--tx2)",width:60,flexShrink:0,minWidth:0}}>Client</span>
              <PBar done={clientMonth.length} goal={monthlyClientGoal} pct={clientMonthPct} color="var(--ac)"/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:".75rem",color:"var(--tx2)",width:60,flexShrink:0,minWidth:0}}>Outreach</span>
              <PBar done={outreachMonth.length} goal={monthlyOutreachGoal} pct={outreachMonthPct} color="#60a5fa"/>
            </div>
          </div>
        </div>
        {(clientToday.length>0||outreachToday.length>0)&&(
          <div style={{borderTop:"1px solid var(--b)",paddingTop:12}}>
            <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>Today's log</div>
            {clientToday.map(c=>{const f=folders.find(f=>f.id===c.folderId);return(
              <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid var(--b)"}}>
                <span style={{fontSize:".75rem"}}>📞</span>
                <span style={{flex:1,fontSize:".82rem",color:"var(--tx2)",fontWeight:500}}>{f?f.name:"Client call"}</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:".78rem",color:"var(--ac)",fontWeight:700}}>{c.duration} min</span>
                <button onClick={()=>deleteCall("client",c.id)} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".9rem",padding:"0 2px"}}>×</button>
              </div>
            );})}
            {outreachToday.map(c=>(
              <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid var(--b)"}}>
                <span style={{fontSize:".75rem"}}>📲</span>
                <span style={{flex:1,fontSize:".82rem",color:"var(--tx2)",fontWeight:500}}>Outreach call</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:".78rem",color:"#60a5fa",fontWeight:700}}>{c.duration} min</span>
                <button onClick={()=>deleteCall("outreach",c.id)} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".9rem",padding:"0 2px"}}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const ReportsView=()=>{
    const [period,setPeriod]=useState("month");
    const yr=String(new Date().getFullYear());
    const cW=callsThisWeek("client"),oW=callsThisWeek("outreach");
    const cM=callsThisMonth("client"),oM=callsThisMonth("outreach");
    const cY=callsThisYear("client"),oY=callsThisYear("outreach");
    const hW=hWeek();
    const hM=hoursThisMonth();
    const hY=hoursThisYear();
    const revM=revenueThisMonth(),revY=revenueThisYear();
    const expM=expensesThisMonth(),expY=expensesThisYear();
    const d=period==="week"?{hours:hW,rev:null,exp:null,cc:cW,oc:oW}
      :period==="month"?{hours:hM,rev:revM,exp:expM,cc:cM,oc:oM}
      :{hours:hY,rev:revY,exp:expY,cc:cY,oc:oY};
    const rate=d.rev&&d.hours>0?d.rev/d.hours:null;
    const net=d.rev!=null&&d.exp!=null?d.rev-d.exp:null;
    const SCard=({label,val,color,sub})=>(
      <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:12,padding:"16px"}}>
        <div style={{fontSize:".6rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>{label}</div>
        <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.5rem",color:color||"var(--tx)",letterSpacing:"-1px",lineHeight:1}}>{val}</div>
        {sub&&<div style={{fontSize:".7rem",color:"var(--mu)",marginTop:5}}>{sub}</div>}
      </div>
    );
    return(
      <div className="page">
        <div className="view-hdr"><div className="view-title">Reports</div><div className="view-sub">Your business at a glance</div></div>
        <div style={{display:"flex",gap:6,marginBottom:22,background:"var(--s)",borderRadius:12,padding:5}}>
          {[["week","This Week"],["month","This Month"],["year","This Year"]].map(([p,l])=>(
            <button key={p} onClick={()=>setPeriod(p)} style={{flex:1,padding:"9px 6px",borderRadius:9,border:"none",background:period===p?"var(--bg)":"transparent",color:period===p?"var(--tx)":"var(--mu)",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:".82rem",cursor:"pointer",transition:"all .15s"}}>{l}</button>
          ))}
        </div>
        {rate&&(
          <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r2)",padding:"22px 20px",marginBottom:14,textAlign:"center"}}>
            <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".14em",marginBottom:8}}>Effective Hourly Rate</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"3.2rem",color:"#c8ff57",letterSpacing:"-2px",lineHeight:1}}>${Math.round(rate)}<span style={{fontSize:"1.1rem",color:"var(--mu)",fontWeight:500}}>/hr</span></div>
            <div style={{fontSize:".75rem",color:"var(--mu)",marginTop:8}}>${d.rev.toLocaleString()} revenue / {fmtHrs(d.hours)} worked</div>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <SCard label="Hours Worked" val={fmtHrs(d.hours)} color="#fb923c"/>
          {d.rev!=null&&<SCard label="Revenue" val={"$"+d.rev.toLocaleString()} color="#34d399"/>}
          {d.exp!=null&&<SCard label="Business Expenses" val={"$"+d.exp.toLocaleString()} color="#ef4444"/>}
          {net!=null&&<SCard label="Net Profit" val={"$"+net.toLocaleString()} color={net>=0?"#c8ff57":"#ef4444"}/>}
        </div>
          <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r2)",padding:"16px 18px",marginBottom:10}}>
          <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".12em",marginBottom:14}}>Clients</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
            <div style={{textAlign:"center",padding:"12px 6px",background:"var(--bg)",borderRadius:10,border:"1px solid var(--b)"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.6rem",color:"#34d399",lineHeight:1,marginBottom:4}}>{folders.filter(f=>!f.archived&&!f.paused).length}</div>
              <div style={{fontSize:".58rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>Active</div>
            </div>
            <div style={{textAlign:"center",padding:"12px 6px",background:"var(--bg)",borderRadius:10,border:"1px solid var(--b)"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.6rem",color:"#a78bfa",lineHeight:1,marginBottom:4}}>{folders.filter(f=>f.paused).length}</div>
              <div style={{fontSize:".58rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>Paused</div>
            </div>
            <div style={{textAlign:"center",padding:"12px 6px",background:"var(--bg)",borderRadius:10,border:"1px solid var(--b)"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.6rem",color:"#fbbf24",lineHeight:1,marginBottom:4}}>{folders.filter(f=>f.archived).length}</div>
              <div style={{fontSize:".58rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>Archived</div>
            </div>
            <div style={{textAlign:"center",padding:"12px 6px",background:"var(--bg)",borderRadius:10,border:"1px solid var(--b)"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.6rem",color:"var(--tx2)",lineHeight:1,marginBottom:4}}>{folders.length}</div>
              <div style={{fontSize:".58rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>Total</div>
            </div>
          </div>
        </div>
        <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r2)",padding:"16px 18px"}}>
          <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".12em",marginBottom:14}}>Phone Calls</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{textAlign:"center",padding:"14px",background:"var(--bg)",borderRadius:10,border:"1px solid var(--b)"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"2rem",color:"var(--ac)",lineHeight:1,marginBottom:5}}>{d.cc.length}</div>
              <div style={{fontSize:".65rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".08em",marginBottom:3}}>Client Calls</div>
              <div style={{fontSize:".7rem",color:"var(--mu)"}}>{callMins(d.cc)} min</div>
            </div>
            <div style={{textAlign:"center",padding:"14px",background:"var(--bg)",borderRadius:10,border:"1px solid var(--b)"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"2rem",color:"#60a5fa",lineHeight:1,marginBottom:5}}>{d.oc.length}</div>
              <div style={{fontSize:".65rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".08em",marginBottom:3}}>Outreach Calls</div>
              <div style={{fontSize:".7rem",color:"var(--mu)"}}>{callMins(d.oc)} min</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const HomeView=()=>{
    const dk=todayKey();
    const nowDate=new Date(),monthStr=`${nowDate.getFullYear()}-${String(nowDate.getMonth()+1).padStart(2,"0")}`,monthName=nowDate.toLocaleString("default",{month:"long"});
    const tMonth=()=>{let c=0;tasks.forEach(t=>{if(!t.recurring&&t.done)c++;else if(t.recurring)c+=(t.doneOn??[]).filter(d=>d.startsWith(monthStr)).length;});return c;};
    const weekDone=DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).filter(t=>isDone(t,d)).length,0);
    const weekTotal=DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).length,0);
    const enriched=[...folders].filter(f=>!f.archived&&!f.paused&&!f.prospect).map(f=>{const td=todayKey(),ft=folderTasks(f.id),tdTasks=tasksForDay(td).filter(t=>t.folderId===f.id);const doneToday=tdTasks.filter(t=>isDone(t,td)).length,todayCount=tdTasks.length;let wDue=0,wDone=0;DAY_KEYS.forEach(d=>{const df=tasksForDay(d).filter(t=>t.folderId===f.id);wDue+=df.length;wDone+=df.filter(t=>isDone(t,d)).length;});const totalSecs=ft.reduce((s,t)=>s+(t.timerSeconds??0),0);return{f,todayCount,doneToday,wDue,wDone,wPct:wDue>0?Math.round(wDone/wDue*100):0,totalSecs,hasToday:todayCount>0};});
    const active=enriched.filter(e=>e.hasToday).sort((a,b)=>b.todayCount-a.todayCount);
    const inactive=enriched.filter(e=>!e.hasToday);
    const FRow=({e,dim})=>{const{f,todayCount,doneToday,wDue,wDone,wPct,totalSecs}=e;return(
      <div className={`folder-row${dim?" dimmed":""}`} style={{"--fc":dim?"#555":f.color}} onClick={()=>goFolder(f.id)}>
        <div className="folder-row-icon" style={{filter:dim?"grayscale(1)":"none"}}>{f.icon}</div>
        <div className="folder-row-main"><div className="folder-row-name" style={{color:dim?"var(--mu)":"var(--tx)"}}>{f.name}</div><div className="folder-row-bar"><div className="folder-row-bar-f" style={{width:`${wPct}%`,background:dim?"#444":f.color}}/></div></div>
        <div className="folder-row-stats">
          <div className="f-stat"><span className="f-stat-val" style={{color:dim?"var(--mu)":todayCount>0?f.color:"var(--tx2)"}}>{dim?"—":`${doneToday}/${todayCount}`}</span><span className="f-stat-lbl">Today</span></div>
          <div className="f-stat f-stat-week"><span className="f-stat-val" style={{color:dim?"var(--mu)":"var(--tx2)"}}>{wDone}/{wDue}</span><span className="f-stat-lbl">Week</span></div>
          <div className="f-stat"><span className="f-stat-val" style={{color:dim?"var(--mu)":"var(--tx2)"}}>{totalSecs>0?fmtTimer(totalSecs):"—"}</span><span className="f-stat-lbl">Time</span></div>
          {(f.monthlyValue||0)>0&&<div className="f-stat f-stat-week"><span className="f-stat-val" style={{color:"#34d399"}}>${(f.monthlyValue).toLocaleString()}</span><span className="f-stat-lbl">/mo</span></div>}
        </div>
        <button onClick={ev=>openRename(ev,f)} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".85rem",padding:"3px 6px",borderRadius:6,flexShrink:0}}>✏️</button>
        <span className="folder-arr">›</span>
      </div>
    );};
    return(
      <div className="home-layout">
        <div>
          <RunningTimerBanner/>
          {streak>0&&<div className="streak"><span style={{fontSize:"1.4rem"}}>🔥</span><div><div className="streak-num">{streak} day streak</div><div className="streak-lbl">Keep going</div></div>{bestStreak>streak&&<span style={{marginLeft:"auto",fontSize:".75rem",color:"var(--mu)"}}>Best: {bestStreak}</span>}</div>}
          <RingsCard dk={dk}/>
          <UrgentSection/>
          <ChaseThese/>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:"clamp(1.3rem,4vw,2rem)",fontWeight:800,letterSpacing:"-.4px",color:"var(--tx)",marginBottom:4,lineHeight:1.1}}>My Week</div>
          <div style={{fontSize:".85rem",color:"var(--mu)",marginBottom:20,fontWeight:400}}>Tap a day to manage tasks</div>
          <div className="day-grid">
            {DAY_KEYS.map((d,i)=>{const dt=tasksForDay(d),pct=donePct(dt,d),isT=i===todayIdx();return(
              <div key={d} className={`day-card${isT?" today":""}`} onClick={()=>goDay(d)}>
                <div className="day-lbl">{DAYS[i]}</div>
                <div className="day-bar"><div className="day-bar-f" style={{width:`${pct}%`,background:isT?"#c8ff57":pct===100?"#34d399":"#2a2a2a"}}/></div>
                <div className="day-cnt">{dt.filter(t=>isDone(t,d)).length}/{dt.length}</div>
              </div>
            );})}
          </div>
          <div className="sec-hdr"><span className="sec-title">Folders</span><button className="ghost-btn" onClick={()=>setShowFolderModal(true)}>+ New Folder</button></div>
          {folders.length===0?<div className="empty">No folders yet</div>:(
            <div className="folders-list">
              {active.map(e=><FRow key={e.f.id} e={e} dim={false}/>)}
              {inactive.length>0&&<>{active.length>0&&<div className="no-tasks-divider"><span className="no-tasks-lbl">No tasks today</span></div>}{inactive.map(e=><FRow key={e.f.id} e={e} dim={true}/>)}</>}
            </div>
          )}
          <CallsTracker/>
          {folders.some(f=>f.paused)&&(
            <div style={{marginTop:20}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <span style={{fontSize:".7rem",fontWeight:600,textTransform:"uppercase",letterSpacing:".12em",color:"#a78bfa"}}>Paused</span>
                <span style={{fontSize:".65rem",background:"#a78bfa20",color:"#a78bfa",border:"1px solid #a78bfa30",borderRadius:99,padding:"1px 8px",fontWeight:700}}>{folders.filter(f=>f.paused).length}</span>
              </div>
              {folders.filter(f=>f.paused).map(f=>(
                <div key={f.id} style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r2)",padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10,opacity:.5}}>
                  <span style={{fontSize:"1.2rem",flexShrink:0,filter:"grayscale(1)"}}>{f.icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:".9rem",fontWeight:600,color:"var(--mu)",marginBottom:2}}>{f.name}</div>
                    <div style={{fontSize:".68rem",color:"var(--mu)"}}>Paused {f.pausedDate} — relationship on hold</div>
                  </div>
                  <button onClick={()=>unpauseFolder(f.id)} style={{background:"none",border:"1px solid #a78bfa40",color:"#a78bfa",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:".72rem",fontWeight:600,whiteSpace:"nowrap",flexShrink:0}}>Reactivate</button>
                </div>
              ))}
            </div>
          )}
          {folders.some(f=>f.archived)&&(
            <div style={{marginTop:24}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <span style={{fontSize:".7rem",fontWeight:600,textTransform:"uppercase",letterSpacing:".12em",color:"var(--mu)"}}>Archived Clients</span>
                <span style={{fontSize:".65rem",background:"var(--s)",color:"var(--mu)",border:"1px solid var(--b)",borderRadius:99,padding:"1px 8px",fontWeight:700}}>{folders.filter(f=>f.archived).length}</span>
              </div>
              {folders.filter(f=>f.archived).map(f=>{
                const ft=folderTasks(f.id);
                const totalSecs=ft.reduce((s,t)=>s+Object.values(t.timeLog??{}).reduce((a,b)=>a+b,0),0);
                const totalRev=Object.entries(f.subCollected??{}).filter(([,v])=>v).length*(f.monthlyValue||0)+(f.payments??[]).filter(p=>p.status==="collected").reduce((s,p)=>s+p.amount,0);
                return(
                  <div key={f.id} style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r2)",padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10,opacity:.6}}>
                    <span style={{fontSize:"1.2rem",flexShrink:0,filter:"grayscale(1)"}}>{f.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:".9rem",fontWeight:600,color:"var(--mu)",marginBottom:2}}>{f.name}</div>
                      <div style={{fontSize:".68rem",color:"var(--mu)"}}>Archived {f.archivedDate} · {ft.length} tasks · {fmtHrs(totalSecs/3600)} tracked{totalRev>0?` · $${totalRev.toLocaleString()} earned`:""}</div>
                    </div>
                    <button onClick={()=>unarchiveFolder(f.id)} style={{background:"none",border:"1px solid var(--b2)",color:"var(--mu)",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:".72rem",fontWeight:600,whiteSpace:"nowrap",flexShrink:0}}>Restore</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="stats-col">
          <div className="stat-card">
            <div className="stat-title">Tasks Completed</div>
            <div className="stat-big" style={{color:"#c8ff57"}}>{tMonth()}</div>
            <div className="stat-desc">this month · {monthName}</div>
            <div className="stat-div"/>
            <div className="stat-row"><span className="stat-row-l">This week</span><span className="stat-row-v" style={{color:"#c8ff57"}}>{weekDone}</span></div>
            <div className="stat-row"><span className="stat-row-l">Total tasks</span><span className="stat-row-v" style={{color:"var(--tx2)"}}>{weekTotal}</span></div>
            <div className="stat-row"><span className="stat-row-l">Week progress</span><span className="stat-row-v" style={{color:"#a78bfa"}}>{weekTotal?Math.round(weekDone/weekTotal*100):0}%</span></div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Time Tracked Today</div>
            <div className="stat-big" style={{color:"#fb923c",fontFamily:"'DM Mono',monospace",fontSize:"2.2rem",letterSpacing:"-1px"}}>{fmtTimer(secsTracked(dk))}</div>
            <div style={{marginTop:8,marginBottom:6}}><div style={{width:"100%",height:5,background:"var(--b2)",borderRadius:99,overflow:"hidden"}}><div style={{height:"100%",borderRadius:99,background:"linear-gradient(90deg,#fb923c,#fbbf24)",width:`${Math.min(100,(secsTracked(dk)/3600/hoursFor(dk))*100)}%`,transition:"width .6s ease",minWidth:secsTracked(dk)>0?"4px":"0"}}/></div></div>
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
          <WeekCompare/>
        </div>
      </div>
    );
  };

  const DayView=()=>{
    const dk=activeDay,idx=DAY_KEYS.indexOf(dk),label=DAYS[idx],isT=idx===todayIdx();
    const dt=tasksForDay(dk),done=dt.filter(t=>isDone(t,dk)).length;
    const st=secsTracked(dk),goal=hoursFor(dk)*3600,timePct=Math.min(100,Math.round(st/goal*100));
    const hasTime=st>0;const displayPct=hasTime?timePct:donePct(dt,dk);
    const grouped=folders.map(f=>({f,ts:dt.filter(t=>t.folderId===f.id)})).filter(g=>g.ts.length);
    const other=dt.filter(t=>!folders.find(f=>f.id===t.folderId));
    return(
      <div className="page">
        <div className="view-hdr"><div className="view-title">{label}{isT?" · Today":""}</div><div className="view-sub">{dt.length} tasks · {done} completed</div></div>
        <RingsCard dk={dk}/>
        {isT&&<DayMomentum dk={dk}/>}
        <TimeProgress dk={dk}/>
        <div className="big-prog">
          <div className="big-top">
            <span className="big-frac">{hasTime?fmtHrs(st/3600):<span style={{fontSize:"1.1rem",color:"var(--mu)"}}>No time yet</span>}{hasTime&&<span className="d"> of {hoursFor(dk)} hrs</span>}</span>
            <span className="big-pct" style={{color:"#c8ff57"}}>{displayPct}%</span>
          </div>
          <div className="big-bar"><div className="big-fill" style={{width:`${displayPct}%`,background:"#c8ff57"}}/></div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
            <span style={{fontSize:".72rem",color:"var(--mu)"}}>Tasks: {done}/{dt.length} completed</span>
            {dt.length>0&&done===dt.length&&<span style={{fontSize:".72rem",color:"var(--ac)",fontWeight:700}}>All done!</span>}
          </div>
        </div>
        {grouped.map(({f,ts})=>(<div className="task-grp" key={f.id}><div className="grp-hdr"><span className="grp-lbl" style={{color:f.color}}>{f.icon} {f.name}</span><span style={{marginLeft:"auto",fontSize:".72rem",color:f.color,fontWeight:700}}>{donePct(ts,dk)}%</span></div>{sortByAlert(ts).map(t=><TaskRow key={t.id} task={t} dk={dk} color={f.color} from="day"/>)}</div>))}
        {other.length>0&&<div className="task-grp"><div className="grp-hdr"><span className="grp-lbl" style={{color:"var(--mu)"}}>Other</span></div>{sortByAlert(other).map(t=><TaskRow key={t.id} task={t} dk={dk} color="var(--ac)" from="day"/>)}</div>}
        {dt.length===0&&<div className="empty">Nothing for {label} — add a task below</div>}
        <AddRow dk={dk} fid={folders[0]?.id} placeholder={`Add task for ${label}...`}/>
      </div>
    );
  };

  const FolderView=()=>{
    const folder=folders.find(f=>f.id===activeFolder);if(!folder)return null;
    const ft=folderTasks(activeFolder),dk=todayKey();
    const done=ft.filter(t=>isDone(t,dk)).length,pct=ft.length?Math.round(done/ft.length*100):0;
    const byDay=DAY_KEYS.map((d,i)=>({d,lbl:DAYS[i],ts:ft.filter(t=>(!t.recurring&&(t.day===d||t.startDate===dateForDK(d)))||(t.recurring&&t.recurringDays?.includes(d)))})).filter(g=>g.ts.length);
    const mk=monthKey();
    const subCollected=(folder.subCollected??{})[mk]||false;
    const monthPayments=(folder.payments??[]).filter(p=>p.month===mk);
    return(
      <div className="page">
        <div className="view-hdr"><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:10,height:10,borderRadius:"50%",background:folder.color,flexShrink:0}}/><div className="view-title">{folder.name}</div></div><div className="view-sub">{ft.length} tasks total</div></div>
        <div className="big-prog">
          <div className="big-top"><span className="big-frac">{done}<span className="d">/{ft.length}</span></span><span className="big-pct" style={{color:folder.color}}>{pct}% today</span></div>
          <div className="big-bar"><div className="big-fill" style={{width:`${pct}%`,background:folder.color}}/></div>
        </div>
        {(folder.monthlyValue||0)>0&&(
          <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r)",padding:"16px 18px",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div><div style={{fontSize:".63rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>Monthly Retainer</div><div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.3rem",color:"#34d399",letterSpacing:"-1px"}}>${(folder.monthlyValue).toLocaleString()}<span style={{fontSize:".75rem",color:"var(--mu)",fontWeight:500}}>/mo</span></div></div>
              <button onClick={()=>toggleSubCollected(folder.id)} style={{background:subCollected?"#34d39918":"var(--bg)",border:`1px solid ${subCollected?"#34d39940":"var(--b2)"}`,color:subCollected?"#34d399":"var(--mu)",borderRadius:99,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:".8rem",transition:"all .2s"}}>{subCollected?"Collected ✓":"Mark Collected"}</button>
            </div>
          </div>
        )}
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <span className="sec-title">One-time Payments</span>
            <button className="ghost-btn" onClick={()=>{setPaymentFolder(folder.id);setPaymentAmount("");setPaymentNote("");setShowPaymentModal(true);}}>+ Add</button>
          </div>
          {monthPayments.length===0&&<div style={{fontSize:".82rem",color:"var(--mu)",padding:"6px 0"}}>No payments this month</div>}
          {monthPayments.map(p=>(
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"var(--s)",border:"1px solid var(--b)",borderRadius:10,marginBottom:7}}>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:".85rem",fontWeight:600,color:"var(--tx)"}}>{p.note}</div><div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".9rem",color:p.status==="collected"?"#34d399":"#fbbf24",marginTop:2}}>${p.amount.toLocaleString()}</div></div>
              <button onClick={()=>togglePayment(p.id)} style={{background:p.status==="collected"?"#34d39918":"#fbbf2415",border:`1px solid ${p.status==="collected"?"#34d39940":"#fbbf2440"}`,color:p.status==="collected"?"#34d399":"#fbbf24",borderRadius:99,padding:"5px 14px",cursor:"pointer",fontSize:".75rem",fontWeight:700,whiteSpace:"nowrap"}}>{p.status==="collected"?"Collected":"Pending"}</button>
              <button onClick={()=>deletePayment(folder.id,p.id)} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:"1rem",padding:"2px 4px"}}>×</button>
            </div>
          ))}
        </div>
        {byDay.map(({d,lbl,ts})=>(<div className="task-grp" key={d}><div className="grp-hdr"><span className="grp-lbl" style={{color:DAY_KEYS.indexOf(d)===todayIdx()?folder.color:"var(--mu)"}}>{lbl}{DAY_KEYS.indexOf(d)===todayIdx()?" · Today":""}</span></div>{sortByAlert(ts).map(t=><TaskRow key={t.id} task={t} dk={d} color={folder.color} from="folder"/>)}</div>))}
        {ft.length===0&&<div className="empty">No tasks yet — add one below</div>}
        <AddRow dk={dk} fid={activeFolder} placeholder={`Add task to ${folder.name}...`}/>
        <div style={{display:"flex",gap:8,marginTop:20,flexWrap:"wrap"}}>
          <button className="del-folder-btn" style={{flex:1,background:"none",border:"1px solid rgba(167,139,250,.2)",color:"#a78bfa",minWidth:80}} onClick={()=>pauseFolder(activeFolder)}>Pause client</button>
          <button className="del-folder-btn" style={{flex:1,background:"none",border:"1px solid rgba(251,191,36,.2)",color:"#fbbf24",minWidth:80}} onClick={()=>archiveFolder(activeFolder)}>Archive client</button>
          <button className="del-folder-btn" style={{flex:1,minWidth:80}} onClick={()=>{if(window.confirm("Delete permanently? All data will be lost."))deleteFolder(activeFolder);}}>Delete</button>
        </div>
      </div>
    );
  };

  const TaskDetailView=()=>{
    if(!activeTask)return null;
    const task=tasks.find(t=>t.id===activeTask.id)??activeTask;
    const dk=activeTaskDk,done=isDone(task,dk),secs=getLiveSecs(task),isRunning=task.timerRunning;
    const folder=folders.find(f=>f.id===task.folderId);
    const totalSecsToday=secsTracked(dk);const todayStr=dStr();
    let dueInfo=null;
    if(task.dueDate){const diff=Math.round((new Date(task.dueDate)-new Date(todayStr))/86400000);const col=diff<0?"#ef4444":diff===0?"#fb923c":diff===1?"#fbbf24":"var(--mu)";const lbl=diff<0?`Overdue ${Math.abs(diff)}d`:diff===0?"Due today":diff===1?"Due tomorrow":`Due in ${diff}d`;dueInfo=<span className="date-pill" style={{color:col,borderColor:col+"40"}}>⏰ {lbl}</span>;}
    return(
      <div className="task-detail">
        {folder&&<div className="detail-folder" style={{color:folder.color}}>{folder.icon} {folder.name}</div>}
        <div className={`detail-name${done?" done":""}`}>{task.text}</div>
        <div className="detail-date-pills">
          {task.startDate&&<span className="date-pill">📅 {task.startDate===todayStr?"Starts today":task.startDate}</span>}
          {dueInfo}
        </div>
        <div className="detail-actions-row">
          <button className="detail-action-btn" onClick={()=>{setEditTaskText(task.text);setShowEditTask(true);}}>✏️ Edit</button>
          {done&&<button className="detail-action-btn warn" onClick={uncompleteTask}>↩ Uncomplete</button>}
          {!done&&<AlertBtn task={task}/>}
          <button className="detail-action-btn danger" onClick={deleteActiveTask}>🗑 Delete</button>
        </div>
        {done&&<div className="done-badge">✓ Completed</div>}
        <div className={`timer-card${isRunning?" running":""}`}>
          <div className="timer-digits">{fmtTimer(secs)}</div>
          <div className="timer-status-lbl">{isRunning?"Working on this task…":"Timer paused"}</div>
          {!done&&(<div className="timer-btn-wrap">{isRunning?<button className="timer-btn pause" onClick={()=>pauseTimer(task.id)}>Pause</button>:<button className="timer-btn start" onClick={()=>startTimer(task.id)}>▶ Start Working</button>}<button className="lock-btn" onClick={openLockFlow}>🔒 Lock In</button></div>)}
          <div className="timer-stats">
            <div className="t-stat"><div className="t-stat-val">{fmtTimer(task.timerSeconds??0)}</div><div className="t-stat-lbl">This task</div></div>
            <div className="t-stat"><div className="t-stat-val">{fmtTimer(totalSecsToday)}</div><div className="t-stat-lbl">Today total</div></div>
            <div className="t-stat"><div className="t-stat-val">{fmtHrs(hoursLeft(dk))}</div><div className="t-stat-lbl">Budget left</div></div>
          </div>
        </div>
        <SessionStats task={task}/>
        {!done&&!showRemind&&(<div className="complete-actions"><button className="action-btn complete" onClick={()=>completeTask(null)}>✓ Mark Complete</button><button className="action-btn remind" onClick={()=>setShowRemind(true)}>⏰ Complete & Remind</button></div>)}
        {!done&&showRemind&&(<div className="remind-section"><div className="remind-title">Remind me in</div><div className="remind-grid">{REMIND_OPTS.map(d=><button key={d} className="remind-opt" onClick={()=>completeTask(d)}>{d===1?"Tomorrow":`${d}d`}</button>)}</div><div style={{textAlign:"center"}}><button style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".8rem"}} onClick={()=>setShowRemind(false)}>Back</button></div></div>)}
      </div>
    );
  };

  const AllTasksView=()=>{
    const [sortBy,setSortBy]=useState("date");const [filter,setFilter]=useState("all");const today=dStr();
    const allItems=[];
    DAY_KEYS.forEach(dk=>{tasksForDay(dk).forEach(task=>{const done=isDone(task,dk);if(filter==="pending"&&done)return;if(filter==="done"&&!done)return;allItems.push({task,dk,date:dateForDK(dk),done,folder:folders.find(f=>f.id===task.folderId)});});});
    if(sortBy==="date")allItems.sort((a,b)=>{const aT=a.date===today?0:a.date>today?1:2,bT=b.date===today?0:b.date>today?1:2;return aT!==bT?aT-bT:a.date.localeCompare(b.date);});
    else allItems.sort((a,b)=>(a.folder?.name??"").localeCompare(b.folder?.name??"")||a.date.localeCompare(b.date));
    const groups=[];
    if(sortBy==="date"){DAY_KEYS.forEach(dk=>{const items=allItems.filter(i=>i.dk===dk);if(!items.length)return;const date=dateForDK(dk),isToday=date===today,isPast=date<today;groups.push({key:dk,label:DAYS[DAY_KEYS.indexOf(dk)],date,isToday,isPast,items});});groups.sort((a,b)=>{const aT=a.isToday?0:!a.isPast?1:2,bT=b.isToday?0:!b.isPast?1:2;return aT!==bT?aT-bT:a.date.localeCompare(b.date);});}
    else{const fm={};allItems.forEach(i=>{const k=i.folder?.id??"none";if(!fm[k])fm[k]={key:k,label:i.folder?.name??"No folder",color:i.folder?.color??"#555",icon:i.folder?.icon??"📋",items:[]};fm[k].items.push(i);});Object.values(fm).forEach(g=>groups.push(g));}
    const totalPending=DAY_KEYS.flatMap(dk=>tasksForDay(dk).filter(t=>!isDone(t,dk))).length;
    const totalDone=DAY_KEYS.flatMap(dk=>tasksForDay(dk).filter(t=>isDone(t,dk))).length;
    return(
      <div className="page">
        <div className="all-hdr"><div><div className="page-title">All Tasks</div><div className="page-sub">{totalPending} pending · {totalDone} done</div></div><div className="sort-tabs"><button className={`sort-tab${sortBy==="date"?" active":""}`} onClick={()=>setSortBy("date")}>📅 Date</button><button className={`sort-tab${sortBy==="folder"?" active":""}`} onClick={()=>setSortBy("folder")}>📁 Folder</button></div></div>
        <div className="filter-tabs">{[["all","All"],["pending","Pending"],["done","Done"]].map(([v,l])=><button key={v} className={`filter-tab${filter===v?" active":""}`} onClick={()=>setFilter(v)}>{l}</button>)}</div>
        {groups.length===0&&<div className="empty">No tasks found</div>}
        {sortBy==="date"?groups.map(g=>(<div className="day-section" key={g.key}><div className="day-section-hdr"><span className={`day-badge${g.isToday?" today":g.isPast?" past":" future"}`}>{g.isToday?"Today":g.label}</span><span style={{fontSize:".7rem",color:"var(--mu)"}}>{g.date}</span><span style={{marginLeft:"auto",fontSize:".72rem",color:"var(--mu)",fontWeight:600}}>{g.items.filter(i=>i.done).length}/{g.items.length}</span></div>{g.items.map((item,idx)=><TaskRow key={`${item.task.id}-${item.dk}-${idx}`} task={item.task} dk={item.dk} color={item.folder?.color??"var(--ac)"} from="all"/>)}</div>)):groups.map(g=>(<div className="day-section" key={g.key}><div className="day-section-hdr"><span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:".88rem",color:g.color}}>{g.icon} {g.label}</span><span style={{marginLeft:"auto",fontSize:".72rem",color:"var(--mu)",fontWeight:600}}>{g.items.filter(i=>i.done).length}/{g.items.length}</span></div>{g.items.map((item,idx)=><TaskRow key={`${item.task.id}-${item.dk}-${idx}`} task={item.task} dk={item.dk} color={g.color} from="all"/>)}</div>))}
      </div>
    );
  };

  if(authLoading)return(<div style={{minHeight:"100vh",background:"#080808",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#333",fontSize:".9rem"}}>Loading…</div></div>);
  if(!user)return(
    <div className="login"><div className="login-card">
      <div className="login-logo">effingFocus<span>.</span></div>
      <div className="login-tag">Track Tasks. See Your Real Productive Time.</div>
      <button className="google-btn" onClick={()=>signInWithPopup(auth,googleProvider)}>
        <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continue with Google
      </button>
      <div className="login-note">Your data syncs across all your devices.</div>
    </div></div>
  );

  const LockScreen=()=>{
    const lockedTask=tasks.find(t=>t.id===lockedTaskId);
    const secsLeft=lockEndTime?Math.max(0,(lockEndTime-Date.now())/1000):0;
    const totalSecs=lockDuration*60,pctLeft=totalSecs?(secsLeft/totalSecs)*100:0;
    const isUrgent=secsLeft<60,workedSecs=lockedTask?getLiveSecs(lockedTask):0;
    if(lockDone)return(<div className="lock-screen"><div style={{fontSize:"3rem",marginBottom:16}}>🎉</div><div className="lock-done-card"><div className="lock-done-title">Time's up!</div><div className="lock-done-sub">You stayed locked in on<br/><strong style={{color:"var(--tx)"}}>{lockedTask?.text}</strong></div><div className="lock-done-btns"><button className="lock-more-btn" onClick={()=>{setLockDone(false);setShowLockModal(true);}}>🔒 Lock in for more</button><button className="lock-back-btn" onClick={dismissLockDone}>Go back</button></div></div></div>);
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
        {showPinUnlock&&(<div style={{position:"fixed",inset:0,background:"#000d",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><div className="modal" style={{maxWidth:300}}><div className="modal-title" style={{textAlign:"center"}}>Enter PIN to unlock</div><PinNumpad currentPin={pinInput}/><button className="btn-c" style={{width:"100%",marginTop:8,textAlign:"center"}} onClick={()=>{setShowPinUnlock(false);setPinInput("");}}>Cancel</button></div></div>)}
      </div>
    );
  };

  const OnboardingFlow=()=>{
    const skipOnboarding=()=>setObStep(0);
    const completeObFolder=()=>{const name=obFolderName.trim();if(!name)return;const id=Date.now();setFolders(p=>[...p,{id,name,color:obFolderColor,icon:obFolderIcon,monthlyValue:0,payments:[],subCollected:{}}]);setObFolderId(id);setObStep(3);};
    const completeObTask=()=>{const text=obTaskText.trim();if(!text)return;setTasks(p=>[...p,{id:Date.now(),text,folderId:obFolderId,recurring:false,startDate:dStr(),done:false,timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{}}]);setObStep(4);};
    const finishOnboarding=()=>{setObStep(0);setView("home");};
    const Dots=()=>(<div className="ob-steps">{[1,2,3,4,5].map(s=><div key={s} className={`ob-step-dot${obStep===s?" active":obStep>s?" done":""}`}/>)}</div>);
    if(obStep===1)return(<div className="ob-overlay"><Dots/><div className="ob-emoji">👋</div><div className="ob-title">Welcome to effingFocus<span style={{color:"var(--ac)"}}>.</span></div><div className="ob-sub">The task manager that shows you exactly how productive you actually were. Let's set you up in 2 minutes.</div><button className="ob-primary" onClick={()=>setObStep(2)}>Let's go</button><button className="ob-skip" onClick={skipOnboarding}>Skip setup</button></div>);
    if(obStep===2)return(<div className="ob-overlay"><Dots/><div className="ob-emoji">📁</div><div className="ob-title">Create your first folder</div><div className="ob-sub">Folders are your clients or life areas. Start with one.</div><div className="ob-card"><div className="ob-card-label">Folder name</div><input className="ob-input" value={obFolderName} autoFocus onChange={e=>setObFolderName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&completeObFolder()} placeholder="e.g. Work, Ajay Sharma..."/><div className="ob-card-label">Colour</div><div className="ob-color-row" style={{marginBottom:14}}>{COLORS.map(c=><div key={c} className={`ob-color${obFolderColor===c?" sel":""}`} style={{background:c}} onClick={()=>setObFolderColor(c)}/>)}</div><div className="ob-card-label">Icon</div><div className="ob-icon-row">{["💼","🏠","👤","🎯","📊","🤝","⭐","💡","🌿","❤️"].map(ic=><div key={ic} className={`ob-icon${obFolderIcon===ic?" sel":""}`} onClick={()=>setObFolderIcon(ic)}>{ic}</div>)}</div></div><button className="ob-primary" onClick={completeObFolder} disabled={!obFolderName.trim()}>Create folder</button><button className="ob-skip" onClick={skipOnboarding}>Skip setup</button></div>);
    if(obStep===3)return(<div className="ob-overlay"><Dots/><div className="ob-emoji">✏️</div><div className="ob-title">Add your first task</div><div className="ob-sub">What's one thing you need to get done today?</div><div className="ob-card"><div className="ob-card-label">Task name</div><input className="ob-input" value={obTaskText} autoFocus onChange={e=>setObTaskText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&completeObTask()} placeholder="e.g. Reply to client emails..."/></div><button className="ob-primary" onClick={completeObTask} disabled={!obTaskText.trim()}>Add task</button><button className="ob-skip" onClick={skipOnboarding}>Skip setup</button></div>);
    if(obStep===4)return(<div className="ob-overlay"><Dots/><div className="ob-emoji">⏱</div><div className="ob-title">Start the timer when you work</div><div className="ob-sub">Tap a task, hit Start Working. This is how effingFocus makes time visible.</div><div className="ob-card"><div className="ob-card-label">How it works</div><div className="ob-task-row"><div className="ob-chk"/><span className="ob-task-txt">{obTaskText||"Your task"}</span><span className="ob-badge">Start</span></div><div style={{marginTop:12,fontSize:".82rem",color:"var(--mu)",lineHeight:1.7}}>Use Lock In to commit to a task for 10-30 min without getting pulled away.</div></div><button className="ob-primary" onClick={()=>setObStep(5)}>Got it</button><button className="ob-skip" onClick={skipOnboarding}>Skip</button></div>);
    if(obStep===5)return(<div className="ob-overlay"><Dots/><div className="ob-emoji">🚀</div><div className="ob-title">You're all set.</div><div className="ob-sub">You're ready to start tracking tasks and seeing your real productive time.</div><div className="ob-card"><div className="ob-card-label">Quick reference</div><div style={{display:"flex",flexDirection:"column",gap:10}}>{[["📁","Folders = your clients or life areas"],["✓","Tap a task, Start Working, track time"],["⚡","Day Momentum shows if you're on pace"],["🔒","Lock In when you need to go deep"],["💰","Money tab tracks income and expenses"]].map(([ic,txt])=>(<div key={txt} style={{display:"flex",alignItems:"flex-start",gap:10,fontSize:".85rem",color:"var(--tx)",lineHeight:1.5}}><span style={{flexShrink:0}}>{ic}</span><span>{txt}</span></div>))}</div></div><button className="ob-primary" onClick={finishOnboarding}>Start focusing</button></div>);
    return null;
  };

  return(
    <div className="app">
      <div className="nav">
        <div className="logo">effingFocus<em>.</em></div>
        <div className="nav-right">
          {view==="task"&&<button className="back-btn" onClick={goBack}>Back</button>}
          {(view==="day"||view==="folder")&&<button className="back-btn" onClick={goHome}>Home</button>}
          {user.photoURL&&<img src={user.photoURL} className="avatar" alt=""/>}
          <button className="signout-btn" onClick={()=>signOut(auth)}>Sign out</button>
        </div>
      </div>
      {view==="home"&&<HomeView/>}
      {view==="day"&&<DayView/>}
      {view==="folder"&&<FolderView/>}
      {view==="task"&&<TaskDetailView/>}
      {view==="all"&&<AllTasksView/>}
      {view==="money"&&<MoneyView/>}
      {view==="reports"&&<ReportsView/>}
      {view!=="task"&&(
        <div className="tab-bar">
          <button className={`tab-btn${(view==="home"||view==="day"||view==="folder")?" active":""}`} onClick={goHome}><span className="tab-icon">🏠</span><span className="tab-lbl">Home</span><div className="tab-dot"/></button>
          <button className={`tab-btn${view==="all"?" active":""}`} onClick={()=>setView("all")}><span className="tab-icon">📋</span><span className="tab-lbl">Tasks</span><div className="tab-dot"/></button>
          <button className={`tab-btn${view==="money"?" active":""}`} onClick={()=>setView("money")}><span className="tab-icon">💰</span><span className="tab-lbl">Money</span><div className="tab-dot"/></button>
          <button className={`tab-btn${view==="reports"?" active":""}`} onClick={()=>setView("reports")}><span className="tab-icon">📈</span><span className="tab-lbl">Reports</span><div className="tab-dot"/></button>
        </div>
      )}
      {confetti&&<Confetti onDone={()=>setConfetti(false)}/>}
      {obStep>0&&<OnboardingFlow/>}
      {isLocked&&<LockScreen/>}
      {showLockModal&&!isLocked&&(<div className="overlay" onClick={()=>setShowLockModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title">🔒 Lock In</div><div style={{fontSize:".82rem",color:"var(--mu)",marginBottom:18,lineHeight:1.6}}>Lock yourself in on <strong style={{color:"var(--tx)"}}>{activeTask?.text}</strong>. You'll need your PIN to exit early.</div><div className="modal-lbl">How long?</div><div className="lock-dur-grid">{LOCK_DURS.map(d=><div key={d} className={`lock-dur-opt${lockDuration===d?" sel":""}`} onClick={()=>setLockDuration(d)}>{d}<span style={{fontSize:".6rem",display:"block",fontWeight:500,marginTop:2}}>min</span></div>)}</div><div className="modal-btns"><button className="btn-c" onClick={()=>setShowLockModal(false)}>Cancel</button><button className="btn-ok" onClick={activateLock}>Lock In</button></div></div></div>)}
      {showPinSetModal&&(<div className="overlay"><div className="modal" style={{maxWidth:320}}><div className="modal-title" style={{textAlign:"center"}}>{pinStep===1?"Set your PIN":"Confirm your PIN"}</div><div style={{fontSize:".8rem",color:"var(--mu)",textAlign:"center",marginBottom:20}}>{pinStep===1?"Choose a 4-digit PIN to unlock early.":"Enter the same PIN again."}</div><PinNumpad currentPin={pinStep===1?pinInput:pinConfirm}/><button className="btn-c" style={{width:"100%",marginTop:12,textAlign:"center"}} onClick={()=>{setShowPinSetModal(false);setPinInput("");setPinStep(1);}}>Cancel</button></div></div>)}
      {showEditTask&&(<div className="overlay" onClick={()=>setShowEditTask(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title">Edit Task</div><div className="modal-lbl">Task name</div><input className="modal-in" value={editTaskText} autoFocus onChange={e=>setEditTaskText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveEditTask()} placeholder="Task name"/><div className="modal-btns"><button className="btn-c" onClick={()=>setShowEditTask(false)}>Cancel</button><button className="btn-ok" onClick={saveEditTask}>Save</button></div></div></div>)}
      {showRenameModal&&(<div className="overlay" onClick={()=>setShowRenameModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title">Edit Folder</div><div className="modal-lbl">Name</div><input className="modal-in" value={renameText} autoFocus onChange={e=>setRenameText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveRename()} placeholder="Folder name"/><div className="modal-lbl">Monthly value (optional)</div><div style={{position:"relative",marginBottom:16}}><span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"var(--mu)",fontSize:".9rem",fontWeight:600}}>$</span><input className="modal-in" style={{paddingLeft:28,marginBottom:0}} value={renameValue} onChange={e=>setRenameValue(e.target.value.replace(/[^0-9.]/g,""))} placeholder="0" type="text" inputMode="decimal"/></div><div className="modal-btns"><button className="btn-c" onClick={()=>setShowRenameModal(false)}>Cancel</button><button className="btn-ok" onClick={saveRename}>Save</button></div></div></div>)}
      {showFolderModal&&(<div className="overlay" onClick={()=>setShowFolderModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title">New Folder</div><div className="modal-lbl">Name</div><input className="modal-in" value={nfName} autoFocus onChange={e=>setNfName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createFolder()} placeholder="e.g. Ajay Sharma"/><div className="modal-lbl">Monthly value (optional)</div><div style={{position:"relative",marginBottom:16}}><span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"var(--mu)",fontSize:".9rem",fontWeight:600}}>$</span><input className="modal-in" style={{paddingLeft:28,marginBottom:0}} value={nfValue} onChange={e=>setNfValue(e.target.value.replace(/[^0-9.]/g,""))} placeholder="0" type="text" inputMode="decimal"/></div><div className="modal-lbl">Icon</div><div className="icon-grid">{ICON_OPTIONS.map(icon=><div key={icon} className={`icon-opt${nfIcon===icon?" sel":""}`} onClick={()=>setNfIcon(icon)}>{icon}</div>)}</div><div className="modal-lbl">Color</div><div className="swatches">{COLORS.map(c=><div key={c} className={`sw${nfColor===c?" sel":""}`} style={{background:c}} onClick={()=>setNfColor(c)}/>)}</div><div className="folder-preview" style={{background:`linear-gradient(135deg,${nfColor}dd,${nfColor}99)`}}><span style={{fontSize:"1.3rem"}}>{nfIcon}</span><span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:".9rem",color:"#fff"}}>{nfName||"Folder name"}</span></div><div className="modal-btns"><button className="btn-c" onClick={()=>setShowFolderModal(false)}>Cancel</button><button className="btn-ok" onClick={createFolder}>Create</button></div></div></div>)}
      {showHoursModal&&(<div className="overlay" onClick={()=>setShowHoursModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title">Set Work Hours</div><div className="modal-lbl">Daily goal for {hoursDay?DAYS[DAY_KEYS.indexOf(hoursDay)]:""}</div><div className="hr-presets">{HR_PRESET.map(h=><button key={h} className={`hp${pendingHrs===h?" sel":""}`} onClick={()=>setPendingHrs(h)}>{h} hrs</button>)}</div><div style={{fontSize:".8rem",color:"var(--mu)",marginBottom:18}}>Tracks against actual time worked on tasks.</div><div className="modal-btns"><button className="btn-c" onClick={()=>setShowHoursModal(false)}>Cancel</button><button className="btn-ok" onClick={saveHours}>Save</button></div></div></div>)}
      {showPaymentModal&&(<div className="overlay" onClick={()=>setShowPaymentModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title">Add One-time Payment</div><div className="modal-lbl">Amount</div><div style={{position:"relative",marginBottom:16}}><span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"var(--mu)",fontSize:".9rem",fontWeight:600}}>$</span><input className="modal-in" style={{paddingLeft:28,marginBottom:0}} value={paymentAmount} autoFocus onChange={e=>setPaymentAmount(e.target.value.replace(/[^0-9.]/g,""))} placeholder="0" type="text" inputMode="decimal"/></div><div className="modal-lbl">Note (optional)</div><input className="modal-in" value={paymentNote} onChange={e=>setPaymentNote(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addPayment()} placeholder="e.g. Website redesign"/><div className="modal-btns"><button className="btn-c" onClick={()=>setShowPaymentModal(false)}>Cancel</button><button className="btn-ok" onClick={addPayment} disabled={!paymentAmount}>Add</button></div></div></div>)}
      {showExpenseModal&&(<div className="overlay" onClick={()=>setShowExpenseModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title">{editingExp?"Edit":"Add"} Expense</div><div className="modal-lbl">Name</div><input className="modal-in" value={expName} autoFocus onChange={e=>setExpName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveExpense()} placeholder="e.g. Mortgage, Slack, Ads..."/><div className="modal-lbl">Amount ($)</div><div style={{position:"relative",marginBottom:16}}><span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"var(--mu)",fontSize:".9rem",fontWeight:600}}>$</span><input className="modal-in" style={{paddingLeft:28,marginBottom:0}} value={expAmount} onChange={e=>setExpAmount(e.target.value.replace(/[^0-9.]/g,""))} placeholder="0" type="text" inputMode="decimal"/></div><div className="modal-lbl">Type</div><div style={{display:"flex",gap:8,marginBottom:16}}><button onClick={()=>setExpType("fixed")} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${expType==="fixed"?"var(--ac)":"var(--b2)"}`,background:expType==="fixed"?"#c8ff5715":"var(--s)",color:expType==="fixed"?"var(--ac)":"var(--mu)",cursor:"pointer",fontWeight:600,fontSize:".85rem"}}>Fixed</button><button onClick={()=>setExpType("variable")} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${expType==="variable"?"var(--ac)":"var(--b2)"}`,background:expType==="variable"?"#c8ff5715":"var(--s)",color:expType==="variable"?"var(--ac)":"var(--mu)",cursor:"pointer",fontWeight:600,fontSize:".85rem"}}>Variable</button></div><div className="modal-lbl">Category</div><div style={{display:"flex",gap:8,marginBottom:20}}><button onClick={()=>setExpCategory("business")} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${expCategory==="business"?"#ef4444":"var(--b2)"}`,background:expCategory==="business"?"#ef444415":"var(--s)",color:expCategory==="business"?"#ef4444":"var(--mu)",cursor:"pointer",fontWeight:600,fontSize:".85rem"}}>Business</button><button onClick={()=>setExpCategory("personal")} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${expCategory==="personal"?"#fb923c":"var(--b2)"}`,background:expCategory==="personal"?"#fb923c15":"var(--s)",color:expCategory==="personal"?"#fb923c":"var(--mu)",cursor:"pointer",fontWeight:600,fontSize:".85rem"}}>Personal</button></div><div style={{fontSize:".78rem",color:"var(--mu)",marginBottom:16,lineHeight:1.6}}>{expType==="fixed"?"Fixed expenses repeat every month automatically.":"Variable expenses let you enter the actual amount each month."}</div><div className="modal-btns"><button className="btn-c" onClick={()=>setShowExpenseModal(false)}>Cancel</button><button className="btn-ok" onClick={saveExpense} disabled={!expName.trim()||!expAmount}>Save</button></div></div></div>)}
      {showCallModal&&(
        <div className="overlay" onClick={()=>setShowCallModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Log {callType==="client"?"Client":"Outreach"} Call</div>
            <div className="modal-lbl">Duration (minutes)</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
              {[5,10,15,20,30,45,60].map(m=>(
                <button key={m} onClick={()=>setCallDuration(String(m))} style={{background:callDuration===String(m)?"var(--ac)":"var(--s)",border:`1px solid ${callDuration===String(m)?"var(--ac)":"var(--b2)"}`,color:callDuration===String(m)?"#000":"var(--tx2)",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".85rem",transition:"all .15s"}}>{m}</button>
              ))}
            </div>
            <input className="modal-in" value={callDuration} onChange={e=>setCallDuration(e.target.value.replace(/[^0-9]/g,""))} placeholder="Or type custom minutes" type="text" inputMode="numeric"/>
            {callType==="client"&&(
              <>
                <div className="modal-lbl">Client (optional)</div>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16,maxHeight:160,overflowY:"auto"}}>
                  <button onClick={()=>setCallFolder(null)} style={{background:callFolder===null?"rgba(200,255,87,.12)":"var(--s)",border:`1px solid ${callFolder===null?"var(--ac)":"var(--b2)"}`,color:callFolder===null?"var(--ac)":"var(--tx2)",borderRadius:9,padding:"9px 14px",cursor:"pointer",fontWeight:600,fontSize:".82rem",textAlign:"left",transition:"all .15s"}}>No specific client</button>
                  {folders.map(f=>(
                    <button key={f.id} onClick={()=>setCallFolder(f.id)} style={{background:callFolder===f.id?"rgba(200,255,87,.12)":"var(--s)",border:`1px solid ${callFolder===f.id?"var(--ac)":"var(--b2)"}`,color:callFolder===f.id?"var(--ac)":"var(--tx2)",borderRadius:9,padding:"9px 14px",cursor:"pointer",fontWeight:600,fontSize:".82rem",textAlign:"left",display:"flex",alignItems:"center",gap:8,transition:"all .15s"}}>
                      <span>{f.icon}</span><span>{f.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="modal-btns">
              <button className="btn-c" onClick={()=>setShowCallModal(false)}>Cancel</button>
              <button className="btn-ok" onClick={logCall} disabled={!callDuration}>Log Call</button>
            </div>
          </div>
        </div>
      )}
      {showCallGoalModal&&(
        <div className="overlay" onClick={()=>setShowCallGoalModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Daily Call Goals</div>
            <div className="modal-lbl">Client calls goal</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
              {[3,5,8,10,15,20].map(n=>(
                <button key={n} onClick={()=>setPendingClientGoal(n)} style={{background:pendingClientGoal===n?"var(--ac)":"var(--s)",border:`1px solid ${pendingClientGoal===n?"var(--ac)":"var(--b2)"}`,color:pendingClientGoal===n?"#000":"var(--tx2)",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".85rem",transition:"all .15s"}}>{n}</button>
              ))}
            </div>
            <div className="modal-lbl">Outreach calls goal</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
              {[5,10,15,20,25,30].map(n=>(
                <button key={n} onClick={()=>setPendingOutreachGoal(n)} style={{background:pendingOutreachGoal===n?"var(--ac)":"var(--s)",border:`1px solid ${pendingOutreachGoal===n?"var(--ac)":"var(--b2)"}`,color:pendingOutreachGoal===n?"#000":"var(--tx2)",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".85rem",transition:"all .15s"}}>{n}</button>
              ))}
            </div>
            <div className="modal-btns">
              <button className="btn-c" onClick={()=>setShowCallGoalModal(false)}>Cancel</button>
              <button className="btn-ok" onClick={saveCallGoals}>Save</button>
            </div>
          </div>
        </div>
      )}
      {showWeekGoalModal&&(
        <div className="overlay" onClick={()=>setShowWeekGoalModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Weekly Hour Goal</div>
            <div className="modal-lbl">Hours per week</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
              {[20,25,30,35,40,45,50,55,60].map(h=>(
                <button key={h} onClick={()=>setPendingWeekGoal(h)} style={{background:pendingWeekGoal===h?"var(--ac)":"var(--s)",border:`1px solid ${pendingWeekGoal===h?"var(--ac)":"var(--b2)"}`,color:pendingWeekGoal===h?"#000":"var(--tx2)",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".85rem",transition:"all .15s"}}>{h}</button>
              ))}
            </div>
            <div style={{fontSize:".78rem",color:"var(--mu)",marginBottom:18,lineHeight:1.6}}>Your weekly progress and This Week vs Last Week both use this goal.</div>
            <div className="modal-btns">
              <button className="btn-c" onClick={()=>setShowWeekGoalModal(false)}>Cancel</button>
              <button className="btn-ok" onClick={()=>{setWeeklyGoal(pendingWeekGoal);setShowWeekGoalModal(false);}}>Save</button>
            </div>
          </div>
        </div>
      )}
      {showSnoozeModal&&snoozingFolder&&(
        <div className="overlay" onClick={()=>setShowSnoozeModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Snooze {snoozingFolder.name}</div>
            <div style={{fontSize:".82rem",color:"var(--mu)",marginBottom:18,lineHeight:1.6}}>Hide from Chase These for how long? Resets automatically when you work on this client.</div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
              {[[3,"3 days"],[7,"1 week"],[14,"2 weeks"],[30,"1 month"],[90,"3 months"]].map(([days,label])=>(
                <button key={days} onClick={()=>snoozeFolder(snoozingFolder.id,days)} style={{background:"var(--s)",border:"1px solid var(--b2)",color:"var(--tx)",borderRadius:10,padding:"12px 16px",cursor:"pointer",fontSize:".9rem",fontWeight:600,textAlign:"left",transition:"all .15s",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>{label}</span><span style={{color:"var(--mu)",fontSize:".8rem"}}>›</span>
                </button>
              ))}
            </div>
            <button className="btn-c" style={{width:"100%",textAlign:"center"}} onClick={()=>setShowSnoozeModal(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

const dStr=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const todayIdx=()=>(new Date().getDay()+6)%7;
const todayKey=()=>DAY_KEYS[todayIdx()];
const dateForDK=dk=>{const n=new Date();n.setHours(0,0,0,0);const d=new Date(n);d.setDate(n.getDate()+DAY_KEYS.indexOf(dk)-todayIdx());return dStr(d);};
const calcStreak=(dates=[])=>{const s=new Set(dates),t=dStr(),y=dStr(new Date(Date.now()-864e5));if(!s.has(t)&&!s.has(y))return 0;let c=0,cur=new Date(s.has(t)?t:y);while(s.has(dStr(cur))){c++;cur.setDate(cur.getDate()-1);}return c;};
const fmtTimer=secs=>{const s=Math.floor(Math.max(0,secs)),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return h>0?`${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;};
const fmtHrs=h=>{if(h<=0||h<1/60)return"—";if(h<1)return`${Math.round(h*60)} min`;return h===Math.floor(h)?`${h} hrs`:`${h.toFixed(1)} hrs`;};
const getLiveSecs=t=>{const logTotal=Object.values(t.timeLog??{}).reduce((s,v)=>s+v,0);const legacy=t.timeLog?0:(t.timerSeconds??0);const base=logTotal+legacy;if(!t.timerRunning||!t.timerStartedAt)return base;return base+(Date.now()-t.timerStartedAt)/1000;};
const monthKey=()=>{const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`;};

let _ac=null;
const getAC=()=>{if(!_ac)_ac=new(window.AudioContext||window.webkitAudioContext)();if(_ac.state==="suspended")_ac.resume();return _ac;};
const tone=(f,v=0.1,d=0.08)=>{try{const c=getAC(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=f;g.gain.setValueAtTime(v,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+d);o.start();o.stop(c.currentTime+d);}catch(e){}};
const playCheck=()=>tone(880,0.1,0.07);
const playStart=()=>{tone(440,0.08,0.06);setTimeout(()=>tone(660,0.08,0.06),80);};
const playWin=()=>[523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,0.1,0.2),i*100));

function Confetti({onDone}){
  useEffect(()=>{const t=setTimeout(onDone,2400);return()=>clearTimeout(t);},[]);
  const ps=Array.from({length:50},(_,i)=>({id:i,left:Math.random()*100,color:COLORS[i%COLORS.length],delay:Math.random()*.5,w:Math.random()*10+5,h:Math.random()*6+4,rot:Math.random()*720*(Math.random()>.5?1:-1),drift:(Math.random()-.5)*200,dur:Math.random()*.9+1}));
  return(
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:9999,overflow:"hidden"}}>
      <style>{"@keyframes cf{from{opacity:1;transform:translateY(0) rotate(0)}to{opacity:0;transform:translateY(110vh) rotate(var(--r)) translateX(var(--d))}}"}</style>
      {ps.map(p=><div key={p.id} style={{position:"absolute",left:`${p.left}%`,top:0,width:p.w,height:p.h,background:p.color,borderRadius:2,"--r":`${p.rot}deg`,"--d":`${p.drift}px`,animation:`cf ${p.dur}s ${p.delay}s ease-in forwards`}}/>)}
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

const INIT_FOLDERS=[{id:1,name:"Work",color:"#60a5fa",icon:"💼"},{id:2,name:"Personal",color:"#c8ff57",icon:"🏠"}];
const INIT_TASKS=[
  {id:1,text:"Check emails",folderId:1,recurring:true,recurringDays:["mon","tue","wed","thu","fri"],doneOn:[],timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{}},
  {id:2,text:"Morning routine",folderId:2,recurring:true,recurringDays:["mon","tue","wed","thu","fri","sat","sun"],doneOn:[],timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{}},
];

export default function App(){
  // Initialize Meta Pixel — init only, no PageView. Only StartTrial fires for new signups.
  useEffect(()=>{
    if(window.fbq)return;
    const s=document.createElement('script');
    s.innerHTML=`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','1502001727178253');`;
    document.head.appendChild(s);
  },[]);
  const [user,setUser]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [folders,setFolders]=useState(INIT_FOLDERS);
  const [tasks,setTasks]=useState(INIT_TASKS);
  const [expenses,setExpenses]=useState([]);
  const [complDates,setComplDates]=useState([]);
  const [bestStreak,setBest]=useState(0);
  const [dayHours,setDayHours]=useState({});
  const [loaded,setLoaded]=useState(false);
  const [view,setView]=useState("home");
  const [activeDay,setActiveDay]=useState(null);
  const [activeFolder,setActiveFolder]=useState(null);
  const [activeTask,setActiveTask]=useState(null);
  const [activeTaskDk,setActiveTaskDk]=useState(null);
  const [prevView,setPrevView]=useState("home");
  const [showFolderModal,setShowFolderModal]=useState(false);
  const [showHoursModal,setShowHoursModal]=useState(false);
  const [showWeekGoalModal,setShowWeekGoalModal]=useState(false);
  const [weeklyGoal,setWeeklyGoal]=useState(40);
  const [pendingWeekGoal,setPendingWeekGoal]=useState(40);
  const [folderSnooze,setFolderSnooze]=useState({});
  const [chaseThreshold,setChaseThreshold]=useState(5);
  const [showSnoozeModal,setShowSnoozeModal]=useState(false);
  const [snoozingFolder,setSnoozingFolder]=useState(null);
  const [showPaymentModal,setShowPaymentModal]=useState(false);
  const [showExpenseModal,setShowExpenseModal]=useState(false);
  const [paymentFolder,setPaymentFolder]=useState(null);
  const [paymentAmount,setPaymentAmount]=useState("");
  const [paymentNote,setPaymentNote]=useState("");
  const [expName,setExpName]=useState("");
  const [expAmount,setExpAmount]=useState("");
  const [expType,setExpType]=useState("fixed");
  const [expCategory,setExpCategory]=useState("business");
  const [editingExp,setEditingExp]=useState(null);
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
  const [nfName,setNfName]=useState("");
  const [nfColor,setNfColor]=useState(COLORS[0]);
  const [nfIcon,setNfIcon]=useState(ICON_OPTIONS[0]);
  const [nfValue,setNfValue]=useState("");
  const [nfProspect,setNfProspect]=useState(false);
  const [pendingHrs,setPendingHrs]=useState(8);
  const [taskRecur,setTaskRecur]=useState(false);
  const [taskRecDays,setTaskRecDays]=useState([]);
  const [taskStartDate,setTaskStartDate]=useState(dStr());
  const [taskDueDate,setTaskDueDate]=useState(null);
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
  const [obStep,setObStep]=useState(0);
  const [obFolderName,setObFolderName]=useState("");
  const [obFolderColor,setObFolderColor]=useState(COLORS[1]);
  const [obFolderIcon,setObFolderIcon]=useState("💼");
  const [obTaskText,setObTaskText]=useState("");
  const [obFolderId,setObFolderId]=useState(null);
  const [tick,setTick]=useState(0);
  // Calls tracker
  const [calls,setCalls]=useState({client:[],outreach:[],clientGoal:5,outreachGoal:20});
  const [showCallModal,setShowCallModal]=useState(false);
  const [callType,setCallType]=useState("client");
  const [callDuration,setCallDuration]=useState("");
  const [callFolder,setCallFolder]=useState(null);
  const [showCallGoalModal,setShowCallGoalModal]=useState(false);
  const [pendingClientGoal,setPendingClientGoal]=useState(5);
  const [pendingOutreachGoal,setPendingOutreachGoal]=useState(20);

  useEffect(()=>{const hasRunning=tasks.some(t=>t.timerRunning);if(!hasRunning&&!isLocked)return;const iv=setInterval(()=>setTick(t=>t+1),1000);return()=>clearInterval(iv);},[tasks,isLocked]);
  useEffect(()=>{if(activeTask){const u=tasks.find(t=>t.id===activeTask.id);if(u)setActiveTask(u);}},[tasks]);
  useEffect(()=>{
    const running=tasks.find(t=>t.timerRunning);
    if(running&&running.timerStartedAt){
      const secs=Math.floor((Date.now()-running.timerStartedAt)/1000);
      const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60;
      const time=h>0?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
      document.title=`${time} · effingFocus`;
    }else{
      document.title="effingFocus";
    }
  },[tick,tasks]);
  useEffect(()=>{if(!isLocked||!lockEndTime||lockDone)return;if(Date.now()>=lockEndTime){setLockDone(true);playWin();setConfetti(true);if(user)setDoc(doc(db,"users",user.uid),{activeLock:null},{merge:true}).catch(()=>{});}},[tick,isLocked,lockEndTime,lockDone]);
  useEffect(()=>{const unsub=onAuthStateChanged(auth,u=>{setUser(u);setAuthLoading(false);});return unsub;},[]);

  useEffect(()=>{
    if(!user){
      setFolders(INIT_FOLDERS);setTasks(INIT_TASKS);setExpenses([]);setComplDates([]);setBest(0);setDayHours({});
      setUserPin(null);setIsLocked(false);setLockEndTime(null);setLockedTaskId(null);
      setLockedTaskDk(null);setLockDone(false);setLoaded(false);return;
    }
    (async()=>{
      try{
        const ref=doc(db,"users",user.uid);
        const snap=await getDoc(ref);
        if(snap.exists()){
          const d=snap.data();
          setFolders(d.folders??INIT_FOLDERS);setTasks(d.tasks??INIT_TASKS);
          setExpenses(d.expenses??[]);
          setCalls(d.calls??{client:[],outreach:[],clientGoal:5,outreachGoal:20});
          setComplDates(d.completedDates??[]);setBest(d.bestStreak??0);setDayHours(d.dayHours??{});
          if(d.weeklyGoal)setWeeklyGoal(d.weeklyGoal);
          if(d.folderSnooze)setFolderSnooze(d.folderSnooze);
          if(d.userPin)setUserPin(d.userPin);
          if(d.activeLock&&d.activeLock.endTime>Date.now()){
            setIsLocked(true);setLockEndTime(d.activeLock.endTime);
            setLockedTaskId(d.activeLock.taskId);setLockedTaskDk(d.activeLock.taskDk);
          }
        }else{
          await setDoc(ref,{folders:INIT_FOLDERS,tasks:INIT_TASKS,expenses:[],completedDates:[],bestStreak:0,dayHours:{}},{merge:true});
          if(window.fbq)window.fbq('track','StartTrial');
          setFolders(INIT_FOLDERS);setTasks(INIT_TASKS);setExpenses([]);setComplDates([]);setBest(0);setDayHours({});
          setUserPin(null);setIsLocked(false);setObStep(1);
        }
      }catch(e){console.error("Load error:",e);setLoaded(false);return;}
      setLoaded(true);
    })();
  },[user]);

  useEffect(()=>{if(!user||!loaded)return;if(folders===INIT_FOLDERS)return;setDoc(doc(db,"users",user.uid),{folders},{merge:true}).catch(console.error);},[user,loaded,folders]);
  useEffect(()=>{if(!user||!loaded)return;if(tasks===INIT_TASKS)return;setDoc(doc(db,"users",user.uid),{tasks},{merge:true}).catch(console.error);},[user,loaded,tasks]);
  useEffect(()=>{if(!user||!loaded)return;setDoc(doc(db,"users",user.uid),{calls},{merge:true}).catch(console.error);},[user,loaded,calls]);
  useEffect(()=>{if(!user||!loaded)return;setDoc(doc(db,"users",user.uid),{expenses},{merge:true}).catch(console.error);},[user,loaded,expenses]);
  useEffect(()=>{if(!user||!loaded)return;setDoc(doc(db,"users",user.uid),{dayHours},{merge:true}).catch(console.error);},[user,loaded,dayHours]);
  useEffect(()=>{if(!user||!loaded)return;setDoc(doc(db,"users",user.uid),{weeklyGoal},{merge:true}).catch(console.error);},[user,loaded,weeklyGoal]);
  useEffect(()=>{if(!user||!loaded)return;setDoc(doc(db,"users",user.uid),{folderSnooze},{merge:true}).catch(console.error);},[user,loaded,folderSnooze]);
  useEffect(()=>{
    if(!user||!loaded)return;
    const s=calcStreak(complDates),nb=s>bestStreak?s:bestStreak;
    setDoc(doc(db,"users",user.uid),{completedDates:complDates,bestStreak:nb},{merge:true}).catch(console.error);
    if(s>bestStreak)setBest(s);
  },[user,loaded,complDates]);

  const isDone=(task,dk)=>task.recurring?(task.doneOn??[]).includes(dateForDK(dk)):task.done;
  const sortByAlert=arr=>[...arr].sort((a,b)=>{const al={red:2,yellow:1};return(al[b.alert]??0)-(al[a.alert]??0);});
  const tasksForDay=dk=>{
    const td=dateForDK(dk);const seen=new Set();
    return tasks.filter(t=>{
      if(seen.has(t.id))return false;
      if(t.recurring){if(t.recurringDays?.includes(dk)){seen.add(t.id);return true;}return false;}
      if(t.startDate){if(t.startDate===td){seen.add(t.id);return true;}return false;}
      if(t.scheduledDate){if(t.scheduledDate===td){seen.add(t.id);return true;}return false;}
      if(t.day===dk){seen.add(t.id);return true;}
      return false;
    });
  };
  const folderTasks=fid=>tasks.filter(t=>t.folderId===fid);
  const donePct=(arr,dk)=>arr.length?Math.round(arr.filter(t=>isDone(t,dk)).length/arr.length*100):0;
  const hoursFor=dk=>dayHours[dk]??8;
  const secsTracked=dk=>{
    const date=dateForDK(dk);
    // Use ALL tasks — a task created any day can have time logged on any day
    const taskSecs=tasks.reduce((s,t)=>{
      const log=t.timeLog??{};const dayVal=log[date]??0;
      if(t.timerRunning&&t.timerStartedAt){
        const startDate=dStr(new Date(t.timerStartedAt));
        if(startDate===date)return s+dayVal+(Date.now()-t.timerStartedAt)/1000;
      }
      return s+dayVal;
    },0);
    const callSecs=(calls.client??[]).filter(c=>c.date===date).reduce((s,c)=>s+c.duration*60,0)
      +(calls.outreach??[]).filter(c=>c.date===date).reduce((s,c)=>s+c.duration*60,0);
    return taskSecs+callSecs;
  };
  const hoursLeft=dk=>Math.max(0,hoursFor(dk)-secsTracked(dk)/3600);
  const hoursPct=dk=>Math.min(100,Math.round(secsTracked(dk)/3600/hoursFor(dk)*100));
  const weekSecsTotal=()=>{ let total=DAY_KEYS.reduce((s,dk)=>s+secsTracked(dk),0); total+=todayCallsOf("client").reduce((s,c)=>s+c.duration*60,0); total+=todayCallsOf("outreach").reduce((s,c)=>s+c.duration*60,0); return total; };
  const weekGoalSecs=()=>weeklyGoal*3600;
  const weekPct=()=>{const ws=weekSecsTotal(),wg=weekGoalSecs();if(ws>0)return Math.min(100,Math.round(ws/wg*100));let t=0,d=0;DAY_KEYS.forEach(dk=>{const dt=tasksForDay(dk);t+=dt.length;d+=dt.filter(x=>isDone(x,dk)).length;});return t?Math.round(d/t*100):0;};
  const thisWeekSecs=()=>{
    let total=0;
    tasks.forEach(t=>{Object.entries(t.timeLog??{}).forEach(([date,s])=>{const d=new Date(date+"T00:00:00");const diff=Math.round((new Date()-d)/86400000);if(diff>=0&&diff<7)total+=s;});});
    total+=(calls.client??[]).filter(c=>{const diff=Math.round((new Date()-new Date(c.date+"T00:00:00"))/86400000);return diff>=0&&diff<7;}).reduce((s,c)=>s+c.duration*60,0);
    total+=(calls.outreach??[]).filter(c=>{const diff=Math.round((new Date()-new Date(c.date+"T00:00:00"))/86400000);return diff>=0&&diff<7;}).reduce((s,c)=>s+c.duration*60,0);
    return total;
  };
  const lastWeekSecs=()=>{
    let total=0;
    tasks.forEach(t=>{Object.entries(t.timeLog??{}).forEach(([date,s])=>{const d=new Date(date+"T00:00:00");const diff=Math.round((new Date()-d)/86400000);if(diff>=7&&diff<14)total+=s;});});
    total+=(calls.client??[]).filter(c=>{const diff=Math.round((new Date()-new Date(c.date+"T00:00:00"))/86400000);return diff>=7&&diff<14;}).reduce((s,c)=>s+c.duration*60,0);
    total+=(calls.outreach??[]).filter(c=>{const diff=Math.round((new Date()-new Date(c.date+"T00:00:00"))/86400000);return diff>=7&&diff<14;}).reduce((s,c)=>s+c.duration*60,0);
    return total;
  };
  const hWeek=()=>thisWeekSecs()/3600;
  const callsInPeriod=(type,filterFn)=>(calls[type]??[]).filter(filterFn);
  const callsThisWeek=type=>callsInPeriod(type,c=>{const diff=Math.round((new Date()-new Date(c.date+"T00:00:00"))/86400000);return diff>=0&&diff<7;});
  const callsThisMonth=type=>callsInPeriod(type,c=>c.date.startsWith(monthKey()));
  const callsThisYear=type=>callsInPeriod(type,c=>c.date.startsWith(String(new Date().getFullYear())));
  const callMins=arr=>arr.reduce((s,c)=>s+c.duration,0);
  const hoursThisMonth=()=>{const mk=monthKey();let t=0;tasks.forEach(task=>{Object.entries(task.timeLog??{}).forEach(([date,s])=>{if(date.startsWith(mk))t+=s;});});t+=callMins([...callsThisMonth("client"),...callsThisMonth("outreach")])*60;return t/3600;};
  const hoursThisYear=()=>{const yr=String(new Date().getFullYear());let t=0;tasks.forEach(task=>{Object.entries(task.timeLog??{}).forEach(([date,s])=>{if(date.startsWith(yr))t+=s;});});t+=callMins([...callsThisYear("client"),...callsThisYear("outreach")])*60;return t/3600;};
  const revenueThisMonth=()=>{const mk=monthKey();const active=folders.filter(f=>(f.monthlyValue||0)>0&&!f.archived);const sub=active.filter(f=>(f.subCollected??{})[mk]).reduce((s,f)=>s+(f.monthlyValue||0),0);const ot=folders.filter(f=>!f.archived).flatMap(f=>(f.payments??[]).filter(p=>p.month===mk&&p.status==="collected")).reduce((s,p)=>s+p.amount,0);return sub+ot;};
  const revenueThisYear=()=>{const yr=String(new Date().getFullYear());let t=0;folders.filter(f=>!f.archived).forEach(f=>{if((f.monthlyValue||0)>0)Object.entries(f.subCollected??{}).forEach(([m,v])=>{if(v&&m.startsWith(yr))t+=f.monthlyValue;});(f.payments??[]).forEach(p=>{if(p.status==="collected"&&(p.month??'').startsWith(yr))t+=p.amount;});});return t;};
  const expensesThisMonth=()=>{const mk=monthKey();return expenses.filter(e=>e.category==="business").reduce((s,e)=>{if((e.paid??{})[mk])return s+getExpenseAmount(e);return s;},0);};
  const expensesThisYear=()=>{const yr=String(new Date().getFullYear());let t=0;expenses.filter(e=>e.category==="business").forEach(e=>{Object.entries(e.paid??{}).forEach(([m,paid])=>{if(paid&&m.startsWith(yr))t+=e.type==="variable"?((e.variableAmounts??{})[m]??0):e.amount;});});return t;};
  const hLastWeek=()=>lastWeekSecs()/3600;

  const startTimer=taskId=>{
    const now=Date.now();playStart();
    setTasks(prev=>prev.map(t=>{
      if(t.id===taskId)return{...t,timerRunning:true,timerStartedAt:now};
      if(t.timerRunning&&t.timerStartedAt){const el=Math.floor((now-t.timerStartedAt)/1000);const date=dStr(new Date(t.timerStartedAt));const log={...(t.timeLog??{})};log[date]=(log[date]??0)+el;return{...t,timerRunning:false,timerStartedAt:null,timerSeconds:(t.timerSeconds??0)+el,timeLog:log};}
      return t;
    }));
  };
  const pauseTimer=taskId=>{
    const now=Date.now();
    setTasks(prev=>prev.map(t=>{
      if(t.id!==taskId)return t;
      if(!t.timerStartedAt)return{...t,timerRunning:false};
      const log={...(t.timeLog??{})};
      const startDateStr=dStr(new Date(t.timerStartedAt));
      const endDateStr=dStr(new Date(now));
      if(startDateStr===endDateStr){
        const el=Math.floor((now-t.timerStartedAt)/1000);
        log[startDateStr]=(log[startDateStr]??0)+el;
      }else{
        // Timer crossed midnight — split time across days
        const midnight=new Date(now);midnight.setHours(0,0,0,0);
        const yesterdaySecs=Math.floor((midnight.getTime()-t.timerStartedAt)/1000);
        const todaySecs=Math.floor((now-midnight.getTime())/1000);
        if(yesterdaySecs>0)log[startDateStr]=(log[startDateStr]??0)+yesterdaySecs;
        if(todaySecs>0)log[endDateStr]=(log[endDateStr]??0)+todaySecs;
      }
      const el=Math.floor((now-t.timerStartedAt)/1000);
      return{...t,timerRunning:false,timerStartedAt:null,timerSeconds:(t.timerSeconds??0)+el,timeLog:log};
    }));
  };
  const deleteTask=(e,id)=>{e.stopPropagation();setTasks(p=>p.filter(t=>t.id!==id));};
  const uncompleteTask=()=>{if(!activeTask)return;const dk=activeTaskDk;setTasks(prev=>prev.map(t=>{if(t.id!==activeTask.id)return t;if(!t.recurring)return{...t,done:false};return{...t,doneOn:(t.doneOn??[]).filter(d=>d!==dateForDK(dk))};}));goBack();};
  const deleteActiveTask=()=>{if(!activeTask)return;setTasks(p=>p.filter(t=>t.id!==activeTask.id));goBack();};
  const saveEditTask=()=>{const txt=editTaskText.trim();if(!txt)return;setTasks(p=>p.map(t=>t.id===activeTask.id?{...t,text:txt}:t));setShowEditTask(false);};

  const completeTask=(remindDays=null)=>{
    if(!activeTask)return;
    const dk=activeTaskDk;const now=Date.now();playCheck();
    setTasks(prev=>{
      let next=prev.map(t=>{
        if(t.id!==activeTask.id)return t;
        let ts=t.timerSeconds??0;const log={...(t.timeLog??{})};
        if(t.timerRunning&&t.timerStartedAt){const el=Math.floor((now-t.timerStartedAt)/1000);const date=dStr(new Date(t.timerStartedAt));log[date]=(log[date]??0)+el;ts+=el;}
        if(!t.recurring)return{...t,done:true,timerRunning:false,timerStartedAt:null,timerSeconds:ts,timeLog:log};
        return{...t,doneOn:[...(t.doneOn??[]),dateForDK(dk)],timerRunning:false,timerStartedAt:null,timerSeconds:ts,timeLog:log};
      });
      if(remindDays){const f=new Date();f.setDate(f.getDate()+remindDays);f.setHours(0,0,0,0);next=[...next,{id:Date.now(),text:activeTask.text,folderId:activeTask.folderId,recurring:false,day:DAY_KEYS[(f.getDay()+6)%7],startDate:dStr(f),done:false,timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{},isReminder:true}];}
      const dayT=next.filter(t=>(!t.recurring&&(t.day===dk||t.startDate===dateForDK(dk)))||(t.recurring&&t.recurringDays?.includes(dk)));
      const allDone=dayT.length>0&&dayT.every(t=>!t.recurring?t.done:(t.doneOn??[]).includes(dateForDK(dk)));
      if(allDone){setTimeout(()=>{playWin();setConfetti(true);},100);if(dk===todayKey())setComplDates(cd=>cd.includes(dStr())?cd:[...cd,dStr()]);}
      return next;
    });
    setShowRemind(false);goBack();
  };

  const openLockFlow=()=>{if(!userPin){setPinStep(1);setPinInput("");setPinConfirm("");setPinError("");setShowPinSetModal(true);}else setShowLockModal(true);};
  const activateLock=()=>{const endTime=Date.now()+lockDuration*60*1000;setIsLocked(true);setLockEndTime(endTime);setLockedTaskId(activeTask?.id);setLockedTaskDk(activeTaskDk);setLockDone(false);setShowLockModal(false);if(activeTask&&!activeTask.timerRunning)startTimer(activeTask.id);if(user)setDoc(doc(db,"users",user.uid),{activeLock:{endTime,taskId:activeTask?.id,taskDk:activeTaskDk}},{merge:true}).catch(()=>{});};
  const handlePinKey=key=>{
    if(showPinSetModal){
      if(pinStep===1){const n=(pinInput+key).slice(0,4);setPinInput(n);if(n.length===4){setPinStep(2);setPinConfirm("");}}
      else{const n=(pinConfirm+key).slice(0,4);setPinConfirm(n);if(n.length===4){if(n===pinInput){setUserPin(pinInput);if(user)setDoc(doc(db,"users",user.uid),{userPin:pinInput},{merge:true}).catch(()=>{});setShowPinSetModal(false);setPinInput("");setPinConfirm("");setPinStep(1);setShowLockModal(true);}else{setPinError("PINs don't match");setPinConfirm("");setPinInput("");setPinStep(1);setTimeout(()=>setPinError(""),2000);}}}
    }else if(showPinUnlock){
      const n=(pinInput+key).slice(0,4);setPinInput(n);
      if(n.length===4){if(n===userPin){setIsLocked(false);setLockEndTime(null);setLockedTaskId(null);setShowPinUnlock(false);setPinInput("");if(user)setDoc(doc(db,"users",user.uid),{activeLock:null},{merge:true}).catch(()=>{});}else{setPinError("Wrong PIN");setPinInput("");setTimeout(()=>setPinError(""),1500);}}
    }
  };
  const handlePinDel=()=>{if(showPinSetModal){if(pinStep===2)setPinConfirm(p=>p.slice(0,-1));else setPinInput(p=>p.slice(0,-1));}else if(showPinUnlock)setPinInput(p=>p.slice(0,-1));};
  const dismissLockDone=()=>{setIsLocked(false);setLockDone(false);setLockEndTime(null);setLockedTaskId(null);setLockedTaskDk(null);};

  const createFolder=()=>{const n=nfName.trim();if(!n)return;setFolders(p=>[...p,{id:Date.now(),name:n,color:nfColor,icon:nfIcon,monthlyValue:parseFloat(nfValue)||0,payments:[],subCollected:{},prospect:nfProspect}]);setNfName("");setNfColor(COLORS[0]);setNfIcon(ICON_OPTIONS[0]);setNfValue("");setNfProspect(false);setShowFolderModal(false);};
  const convertToClient=fid=>{setFolders(p=>p.map(f=>f.id===fid?{...f,prospect:false}:f));goHome();};
  const toggleSubCollected=fid=>{const mk=monthKey();setFolders(p=>p.map(f=>{if(f.id!==fid)return f;const sc={...(f.subCollected??{})};sc[mk]=!sc[mk];return{...f,subCollected:sc};}));};
  const addPayment=()=>{const amt=parseFloat(paymentAmount);if(!amt||!paymentFolder)return;setFolders(p=>p.map(f=>{if(f.id!==paymentFolder)return f;const pay={id:Date.now(),amount:amt,note:paymentNote.trim()||"One-time payment",status:"sent",month:monthKey()};return{...f,payments:[...(f.payments??[]),pay]};}));setPaymentAmount("");setPaymentNote("");setShowPaymentModal(false);};
  const togglePayment=pid=>{setFolders(p=>p.map(f=>({...f,payments:(f.payments??[]).map(p=>p.id===pid?{...p,status:p.status==="sent"?"collected":"sent"}:p)})));};
  const deletePayment=(fid,pid)=>{setFolders(p=>p.map(f=>f.id!==fid?f:{...f,payments:(f.payments??[]).filter(p=>p.id!==pid)}));};
  const openRename=(e,f)=>{e.stopPropagation();setRenamingFolder(f);setRenameText(f.name);setRenameValue(String(f.monthlyValue||""));setShowRenameModal(true);};
  const saveRename=()=>{const n=renameText.trim();if(!n)return;setFolders(p=>p.map(f=>f.id===renamingFolder.id?{...f,name:n,monthlyValue:parseFloat(renameValue)||0}:f));setShowRenameModal(false);};
  const archiveFolder=fid=>{setFolders(p=>p.map(f=>f.id===fid?{...f,archived:true,archivedDate:dStr()}:f));goHome();};
  const unarchiveFolder=fid=>setFolders(p=>p.map(f=>f.id===fid?{...f,archived:false,archivedDate:null}:f));
  const pauseFolder=fid=>{setFolders(p=>p.map(f=>f.id===fid?{...f,paused:true,pausedDate:dStr()}:f));goHome();};
  const unpauseFolder=fid=>setFolders(p=>p.map(f=>f.id===fid?{...f,paused:false,pausedDate:null}:f));
  const deleteFolder=fid=>{setFolders(p=>p.filter(f=>f.id!==fid));setTasks(p=>p.filter(t=>t.folderId!==fid));goHome();};
  const openHours=dk=>{setPendingHrs(hoursFor(dk));setHoursDay(dk);setShowHoursModal(true);};
  const saveHours=()=>{setDayHours(p=>({...p,[hoursDay]:pendingHrs}));setShowHoursModal(false);};
  const snoozeFolder=(fid,days)=>{const until=new Date();until.setDate(until.getDate()+days);setFolderSnooze(p=>({...p,[fid]:until.toISOString()}));setShowSnoozeModal(false);setSnoozingFolder(null);};
  const clearSnooze=fid=>setFolderSnooze(p=>{const n={...p};delete n[fid];return n;});
  const isSnoozed=fid=>{const until=folderSnooze[fid];if(!until)return false;return new Date(until)>new Date();};
  const lastActivityDays=fid=>{
    const ft=tasks.filter(t=>t.folderId===fid);
    let latest=null;
    ft.forEach(t=>{
      // Check timeLog entries
      Object.keys(t.timeLog??{}).forEach(d=>{if(!latest||d>latest)latest=d;});
      // Check ALL task startDates (done or not) — key fix
      if(t.startDate&&(!latest||t.startDate>latest))latest=t.startDate;
      // Check doneOn dates for recurring tasks
      (t.doneOn??[]).forEach(d=>{if(!latest||d>latest)latest=d;});
    });
    // Check calls linked to this folder
    const folderCalls=(calls.client??[]).filter(c=>c.folderId===fid);
    folderCalls.forEach(c=>{if(!latest||c.date>latest)latest=c.date;});
    // If truly no data ever — flag as 999 days (always show)
    if(!latest)return 999;
    return Math.floor((new Date()-new Date(latest+'T00:00:00'))/86400000);
  };
  const resetSnoozeOnActivity=fid=>{if(folderSnooze[fid])clearSnooze(fid);};

  // Calls functions
  const todayCallsOf=type=>(calls[type]??[]).filter(c=>c.date===dStr());
  const logCall=()=>{
    const dur=parseInt(callDuration)||0;if(!dur)return;
    const entry={id:Date.now(),date:dStr(),duration:dur,folderId:callType==="client"?callFolder:null};
    setCalls(p=>({...p,[callType]:[...(p[callType]??[]),entry]}));
    if(callFolder)resetSnoozeOnActivity(callFolder);
    setCallDuration("");setCallFolder(null);setShowCallModal(false);
  };
  const deleteCall=(type,id)=>setCalls(p=>({...p,[type]:(p[type]??[]).filter(c=>c.id!==id)}));
  const saveCallGoals=()=>{setCalls(p=>({...p,clientGoal:pendingClientGoal,outreachGoal:pendingOutreachGoal}));setShowCallGoalModal(false);};
  const openCallModal=type=>{setCallType(type);setCallDuration("");setCallFolder(null);setShowCallModal(true);};
  const openCallGoalModal=()=>{setPendingClientGoal(calls.clientGoal??5);setPendingOutreachGoal(calls.outreachGoal??20);setShowCallGoalModal(true);};
  const openAddExpense=(cat)=>{setExpName("");setExpAmount("");setExpType("fixed");setExpCategory(cat);setEditingExp(null);setShowExpenseModal(true);};
  const openEditExpense=(exp)=>{setExpName(exp.name);setExpAmount(String(exp.amount));setExpType(exp.type);setExpCategory(exp.category);setEditingExp(exp);setShowExpenseModal(true);};
  const saveExpense=()=>{
    const n=expName.trim(),amt=parseFloat(expAmount);if(!n||!amt)return;
    if(editingExp){setExpenses(p=>p.map(e=>e.id===editingExp.id?{...e,name:n,amount:amt,type:expType,category:expCategory}:e));}
    else{setExpenses(p=>[...p,{id:Date.now(),name:n,amount:amt,type:expType,category:expCategory,paid:{},variableAmounts:{}}]);}
    setShowExpenseModal(false);
  };
  const deleteExpense=id=>{setExpenses(p=>p.filter(e=>e.id!==id));};
  const toggleExpensePaid=id=>{const mk=monthKey();setExpenses(p=>p.map(e=>{if(e.id!==id)return e;const paid={...(e.paid??{})};paid[mk]=!paid[mk];return{...e,paid};}));};
  const setVariableAmount=(id,val)=>{const mk=monthKey();setExpenses(p=>p.map(e=>{if(e.id!==id)return e;const va={...(e.variableAmounts??{})};va[mk]=parseFloat(val)||0;return{...e,variableAmounts:va};}));};
  const getExpenseAmount=(exp)=>{const mk=monthKey();return exp.type==="variable"?(exp.variableAmounts??{})[mk]??0:exp.amount;};
  const isExpensePaid=(exp)=>(exp.paid??{})[monthKey()]||false;

  const goHome=()=>setView("home");
  const goDay=dk=>{setActiveDay(dk);setView("day");setTaskStartDate(dateForDK(dk));setTaskDueDate(null);};
  const goFolder=fid=>{setActiveFolder(fid);setView("folder");setTaskStartDate(dStr());setTaskDueDate(null);};
  const goTask=(task,dk,from)=>{
    const now=Date.now();
    setTasks(prev=>prev.map(t=>{if(!t.timerRunning||t.id===task.id)return t;const el=Math.floor((now-t.timerStartedAt)/1000);const date=dStr(new Date(t.timerStartedAt));const log={...(t.timeLog??{})};log[date]=(log[date]??0)+el;return{...t,timerRunning:false,timerStartedAt:null,timerSeconds:(t.timerSeconds??0)+el,timeLog:log};}));
    setActiveTask(task);setActiveTaskDk(dk);setPrevView(from??view);setShowRemind(false);setView("task");
  };
  const goBack=()=>{if(prevView==="day")setView("day");else if(prevView==="folder")setView("folder");else if(prevView==="all")setView("all");else setView("home");};
  const streak=calcStreak(complDates);

  const PinNumpad=({currentPin})=>(
    <div>
      <div className="pin-dots">{[0,1,2,3].map(i=><div key={i} className={`pin-dot${(currentPin||"").length>i?" filled":""}`}/>)}</div>
      <div className="pin-numpad">
        {[1,2,3,4,5,6,7,8,9].map(n=><div key={n} className="pin-key" onClick={()=>handlePinKey(String(n))}>{n}</div>)}
        <div className="pin-key" style={{visibility:"hidden"}}/>
        <div className="pin-key" onClick={()=>handlePinKey("0")}>0</div>
        <div className="pin-key del" onClick={handlePinDel}>⌫</div>
      </div>
      {pinError&&<div className="pin-error">{pinError}</div>}
    </div>
  );

  const AlertBtn=({task})=>{
    const nextAlert=task.alert==="red"?null:task.alert==="yellow"?"red":"yellow";
    const label=task.alert==="red"?"🔴 Red alert":task.alert==="yellow"?"🟡 Yellow alert":"⚪ Set alert";
    const btnColor=task.alert==="red"?"#ef4444":task.alert==="yellow"?"#fbbf24":"var(--b2)";
    return(<button className="detail-action-btn" style={{borderColor:btnColor,color:task.alert?btnColor:"var(--tx2)"}} onClick={()=>setTasks(p=>p.map(t=>t.id===task.id?{...t,alert:nextAlert}:t))}>{label}</button>);
  };

  const TaskRow=({task,dk,color,from})=>{
    const done=isDone(task,dk),secs=getLiveSecs(task),isRunning=task.timerRunning;
    const today=dStr();
    const alertColor=task.alert==="red"?"#ef4444":task.alert==="yellow"?"#fbbf24":null;
    let dueBadge=null;
    if(task.dueDate&&!done){const diff=Math.round((new Date(task.dueDate)-new Date(today))/86400000);let lbl,bg,col;if(diff<0){lbl=`Overdue ${Math.abs(diff)}d`;bg="#ef444420";col="#ef4444";}else if(diff===0){lbl="Due today";bg="#fb923c20";col="#fb923c";}else if(diff===1){lbl="Due tmrw";bg="#fbbf2420";col="#fbbf24";}else if(diff<=7){lbl=`Due in ${diff}d`;bg="#ffffff10";col="var(--tx2)";}else{lbl=`Due ${task.dueDate.slice(5)}`;bg="#ffffff08";col="var(--mu)";}dueBadge=<span className="due-badge" style={{background:bg,color:col}}>{lbl}</span>;}
    return(
      <div className={`task-row${done?" done":""}${task.dueDate&&!done&&today>task.dueDate?" overdue":""}`} style={{"--rc":color,borderLeftColor:alertColor||undefined,borderLeftWidth:alertColor?3:undefined,background:alertColor?`${alertColor}08`:"var(--s)"}} onClick={()=>goTask(task,dk,from??view)}>
        <div className="task-chk"><span className="task-chk-v">✓</span></div>
        {alertColor&&!done&&<span style={{fontSize:".8rem",flexShrink:0}}>{task.alert==="red"?"🔴":"🟡"}</span>}
        {isRunning&&<div className="task-running-dot"/>}
        {task.recurring&&!isRunning&&!alertColor&&<div className="rec-dot" style={{background:color}}/>}
        {task.isReminder&&<span style={{fontSize:".7rem",flexShrink:0}}>⏰</span>}
        <span className="task-txt" style={{color:alertColor&&!done?alertColor:undefined}}>{task.text}</span>
        {dueBadge}
        {secs>0&&<span className="task-timer-badge">{fmtTimer(secs)}</span>}
        {!done&&<span className="task-arr">›</span>}
        <button className="del-btn" onClick={e=>deleteTask(e,task.id)}>×</button>
      </div>
    );
  };

  const AddRow=({dk,fid,placeholder})=>{
    const [text,setText]=useState("");
    const [showDates,setShowDates]=useState(false);
    const inputRef=useRef(null);
    const startOpts=Array.from({length:8},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);d.setHours(0,0,0,0);return{value:dStr(d),label:i===0?"Today":i===1?"Tomorrow":DAYS[(d.getDay()+6)%7]};});
    const dueOpts=[{value:null,label:"No deadline"},{value:taskStartDate,label:"Same day"},...[1,3,7,14,30].map(days=>{const d=new Date(taskStartDate);d.setDate(d.getDate()+days);return{value:dStr(d),label:days===1?"+1 day":days===7?"+1 week":days===14?"+2 weeks":days===30?"+1 month":`+${days}d`};})];
    const submit=()=>{const t=text.trim();if(!t)return;const base={id:Date.now(),text:t,folderId:fid??folders[0]?.id??null,timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{},startDate:taskStartDate,dueDate:taskDueDate||null};setTasks(p=>[...p,taskRecur?{...base,recurring:true,recurringDays:taskRecDays.length?taskRecDays:[dk??todayKey()],doneOn:[],startDate:undefined,dueDate:undefined}:{...base,recurring:false,done:false}]);setText("");setShowDates(false);setTaskRecur(false);setTaskRecDays([]);inputRef.current?.focus();};
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

  const ChaseThese=()=>{
    const today=dStr();
    const mk=monthKey();

    // Build priority list for ALL non-archived folders
    const priorities=folders.filter(f=>!f.archived&&!f.paused&&!f.prospect&&!isSnoozed(f.id)).map(f=>{
      const ft=tasks.filter(t=>t.folderId===f.id);
      const days=lastActivityDays(f.id);
      const hasOverdue=ft.some(t=>!t.done&&!t.recurring&&t.dueDate&&t.dueDate<today);
      const hasTasksThisWeek=DAY_KEYS.some(dk=>tasksForDay(dk).some(t=>t.folderId===f.id));
      const hasTasksToday=tasksForDay(todayKey()).some(t=>t.folderId===f.id);
      const subPending=(f.monthlyValue||0)>0&&!(f.subCollected??{})[mk];
      let priority=0;
      let reason="";
      if(hasOverdue){priority=4;reason="Overdue tasks";}
      else if(subPending&&days>=3){priority=3;reason="Payment pending";}
      else if(!hasTasksToday&&hasTasksThisWeek){priority=2;reason="Has tasks this week";}
      else if(days>=chaseThreshold&&!hasTasksToday){priority=1;reason=`${days===999?"No activity recorded":`${days}d no activity`}`;}
      return{f,priority,reason,days,hasOverdue,subPending};
    }).filter(p=>p.priority>0).sort((a,b)=>b.priority-a.priority);

    if(priorities.length===0)return null;

    const getColor=p=>{
      if(p.priority===4)return"#ef4444";
      if(p.priority===3)return"#fbbf24";
      if(p.priority===2)return"#60a5fa";
      return"#fb923c";
    };
    const getBg=p=>{
      if(p.priority===4)return"#ef44440a";
      if(p.priority===3)return"#fbbf2408";
      if(p.priority===2)return"#60a5fa08";
      return"#fb923c08";
    };

    return(
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:".68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".14em",color:"#fb923c"}}>Focus Now</span>
            <span style={{fontSize:".65rem",background:"#fb923c20",color:"#fb923c",border:"1px solid #fb923c30",borderRadius:99,padding:"1px 8px",fontWeight:700}}>{priorities.length}</span>
          </div>
          <button onClick={()=>{const d=prompt(`Chase threshold in days (current: ${chaseThreshold})`);if(d&&!isNaN(d))setChaseThreshold(parseInt(d));}} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".72rem",fontWeight:600}}>Settings</button>
        </div>
        {priorities.slice(0,6).map(p=>{
          const color=getColor(p);
          return(
            <div key={p.f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:getBg(p),border:`1px solid ${color}25`,borderLeft:`3px solid ${color}`,borderRadius:10,cursor:"pointer",marginBottom:7}}>
              <span style={{fontSize:"1rem",flexShrink:0}} onClick={()=>goFolder(p.f.id)}>{p.f.icon}</span>
              <div style={{flex:1,minWidth:0}} onClick={()=>goFolder(p.f.id)}>
                <div style={{fontSize:".88rem",fontWeight:600,color,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.f.name}</div>
                <div style={{fontSize:".68rem",color:"var(--mu)",marginTop:2}}>{p.reason}</div>
              </div>
              {(p.f.monthlyValue||0)>0&&<span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".82rem",color:p.subPending?"#fbbf24":"#34d399",flexShrink:0}}>${p.f.monthlyValue.toLocaleString()}</span>}
              <button onClick={e=>{e.stopPropagation();setSnoozingFolder(p.f);setShowSnoozeModal(true);}} style={{background:"none",border:`1px solid ${color}30`,color,borderRadius:99,padding:"4px 10px",cursor:"pointer",fontSize:".68rem",fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>Snooze</button>
            </div>
          );
        })}
        {priorities.length>6&&<div style={{fontSize:".75rem",color:"var(--mu)",textAlign:"center",padding:"6px 0"}}>+{priorities.length-6} more clients need attention</div>}
      </div>
    );
  };

  const RingsCard=({dk})=>{
    const hp=hoursPct(dk),wp=weekPct(),st=secsTracked(dk);
    const hasTimeData=weekSecsTotal()>0;
    return(
      <div className="rings-card">
        <div className="ring-stat" style={{cursor:"pointer"}} onClick={()=>{setPendingWeekGoal(weeklyGoal);setShowWeekGoalModal(true);}}>
          <div className="ring-stat-val" style={{color:"#a78bfa"}}>{wp}%</div>
          <div className="ring-stat-lbl">This Week</div>
          <div className="ring-stat-sub">{hasTimeData?fmtHrs(weekSecsTotal()/3600)+" / "+weeklyGoal+"hrs":`${DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).filter(t=>isDone(t,d)).length,0)}/${DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).length,0)} tasks`}</div>
        </div>
        <div className="ring-div"/>
        <Ring pct={hp} color="#c8ff57" size={100} stroke={9} label="Today" val={`${hp}%`}/>
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
        {hoursFor(dk)-st/3600<0&&<div className="overload">Over budget</div>}
      </div>
    );
  };

  const DayMomentum=({dk})=>{
    if(dk!==todayKey())return null;
    const now=new Date(),hour=now.getHours()+now.getMinutes()/60;
    const ws=9,we=18;if(hour<ws)return null;
    const dayPct=Math.min(100,Math.round((hour-ws)/(we-ws)*100));
    const taskPct=donePct(tasksForDay(dk),dk);const diff=taskPct-dayPct;
    const time=now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    let status,sColor,msg,barColor;
    if(taskPct===100){status="Done";sColor="#c8ff57";msg="All tasks complete!";barColor="#c8ff57";}
    else if(diff>=15){status="Ahead";sColor="#c8ff57";msg=`${diff}% ahead`;barColor="#c8ff57";}
    else if(diff>=-5){status="On track";sColor="#60a5fa";msg="Right on pace";barColor="#60a5fa";}
    else if(diff>=-20){status="Behind";sColor="#fbbf24";msg=`${Math.abs(diff)}% behind — push now`;barColor="#fbbf24";}
    else{status="Lagging";sColor="#ef4444";msg="Focus up — time is moving fast";barColor="#ef4444";}
    return(
      <div className="momentum-card">
        <div className="momentum-hdr"><div className="momentum-title">Day Momentum · {time}</div><div className="momentum-status" style={{color:sColor}}>{status}</div></div>
        <div className="momentum-row"><span className="momentum-lbl">Tasks done</span><div className="momentum-bg"><div className="momentum-fill" style={{width:`${taskPct}%`,background:barColor}}/></div><span className="momentum-pct">{taskPct}%</span></div>
        <div className="momentum-row" style={{marginBottom:8}}><span className="momentum-lbl">Day elapsed</span><div className="momentum-bg"><div className="momentum-fill" style={{width:`${dayPct}%`,background:"var(--b3)"}}/></div><span className="momentum-pct">{dayPct}%</span></div>
        <div className="momentum-msg" style={{color:sColor+"cc"}}>{msg}</div>
      </div>
    );
  };

  const TimeProgress=({dk})=>{
    const st=secsTracked(dk),budgetSecs=hoursFor(dk)*3600,pct=Math.min(100,(st/budgetSecs)*100);
    const mins=Math.floor(st/60),hrs=st/3600,bHrs=hoursFor(dk);
    const milestones=[{pct:25,label:fmtHrs(bHrs*.25)},{pct:50,label:fmtHrs(bHrs*.5)},{pct:75,label:fmtHrs(bHrs*.75)},{pct:100,label:`${bHrs} hrs`}];
    let win=null;
    if(pct>=100)win="Full day done!";else if(pct>=75)win="75% — on fire!";else if(pct>=50)win="Halfway there!";else if(pct>=25)win="25% done!";else if(mins>=1)win=`${mins} min in — keep going!`;
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

  const WeekCompare=()=>{
    const tw=hWeek(),lw=hLastWeek();
    if(tw<=0&&lw<=0)return null;
    const diff=tw-lw,maxH=Math.max(tw,lw,1),isAhead=diff>=0;
    const twH=Math.max(4,Math.round(tw/maxH*48));const lwH=Math.max(4,Math.round(lw/maxH*48));
    return(
      <div className="stat-card">
        <div className="stat-title">📊 This Week vs Last</div>
        <div style={{display:"flex",gap:12,marginBottom:16,marginTop:4}}>
          <div style={{flex:1}}><div style={{fontSize:".65rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>This week</div><div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.3rem",color:"#c8ff57",letterSpacing:"-1px",lineHeight:1}}>{fmtHrs(tw)}</div></div>
          <div style={{flex:1}}><div style={{fontSize:".65rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>Last week</div><div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.3rem",color:"var(--tx2)",letterSpacing:"-1px",lineHeight:1}}>{fmtHrs(lw)}</div></div>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:10,alignItems:"flex-end",height:"52px"}}>
          <div style={{flex:1,display:"flex",alignItems:"flex-end"}}><div style={{height:twH+"px",background:"#c8ff57",borderRadius:"4px 4px 0 0",width:"100%"}}/></div>
          <div style={{flex:1,display:"flex",alignItems:"flex-end"}}><div style={{height:lwH+"px",background:"#333",borderRadius:"4px 4px 0 0",width:"100%"}}/></div>
        </div>
        <div style={{height:1,background:"var(--b)",marginBottom:10}}/>
        <div style={{fontSize:".78rem",fontWeight:700,color:isAhead?"#34d399":"#ef4444"}}>
          {lw===0?"No data from last week yet":isAhead?("+ "+fmtHrs(Math.abs(diff))+" ahead of last week"):("- "+fmtHrs(Math.abs(diff))+" behind last week")}
        </div>
      </div>
    );
  };

  const RunningTimerBanner=()=>{
    const running=tasks.find(t=>t.timerRunning);
    if(!running)return null;
    const folder=folders.find(f=>f.id===running.folderId);
    const secs=getLiveSecs(running);
    return(
      <div onClick={()=>goTask(running,todayKey(),"home")} style={{background:"#c8ff5710",border:"1px solid #c8ff5740",borderRadius:14,padding:"14px 16px",marginBottom:16,cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
        <style>{"@keyframes pulse-border{0%,100%{border-color:#c8ff5740}50%{border-color:#c8ff5799}}"}</style>
        <div style={{width:8,height:8,borderRadius:"50%",background:"var(--ac)",flexShrink:0,animation:"dotpulse 1.2s infinite"}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:".65rem",color:"var(--ac)",fontWeight:700,textTransform:"uppercase",letterSpacing:".12em",marginBottom:3}}>Timer running</div>
          <div style={{fontSize:".92rem",fontWeight:700,color:"var(--tx)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{running.text}</div>
          {folder&&<div style={{fontSize:".68rem",color:"var(--mu)",marginTop:2}}>{folder.icon} {folder.name}</div>}
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.3rem",color:"var(--ac)",letterSpacing:"-1px",lineHeight:1}}>{fmtTimer(secs)}</div>
          <button onClick={e=>{e.stopPropagation();pauseTimer(running.id);}} style={{marginTop:6,background:"none",border:"1px solid #c8ff5740",color:"var(--ac)",borderRadius:99,padding:"3px 12px",cursor:"pointer",fontSize:".72rem",fontWeight:700}}>Pause</button>
        </div>
      </div>
    );
  };

  const UrgentSection=()=>{
    const dk=todayKey();
    const urgent=tasks.filter(t=>t.alert&&!isDone(t,dk));
    if(urgent.length===0)return null;
    const red=sortByAlert(urgent.filter(t=>t.alert==="red"));
    const yellow=sortByAlert(urgent.filter(t=>t.alert==="yellow"));
    const UrgentRow=({task,color,bg})=>{
      const folder=folders.find(f=>f.id===task.folderId);
      return(
        <div onClick={()=>goTask(task,dk,"home")} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:bg,border:`1px solid ${color}30`,borderLeft:`3px solid ${color}`,borderRadius:10,cursor:"pointer",marginBottom:7}}>
          <span style={{fontSize:".9rem",flexShrink:0}}>{task.alert==="red"?"🔴":"🟡"}</span>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:".88rem",fontWeight:600,color,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{task.text}</div>{folder&&<div style={{fontSize:".68rem",color:"var(--mu)",marginTop:2}}>{folder.icon} {folder.name}</div>}</div>
          <span style={{fontSize:".8rem",color,opacity:.7}}>›</span>
        </div>
      );
    };
    return(
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <span style={{fontSize:".68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".14em",color:"#ef4444"}}>Urgent</span>
          <span style={{fontSize:".65rem",background:"#ef444420",color:"#ef4444",border:"1px solid #ef444430",borderRadius:99,padding:"1px 8px",fontWeight:700}}>{urgent.length}</span>
        </div>
        {red.map(t=><UrgentRow key={t.id} task={t} color="#ef4444" bg="#ef44440a"/>)}
        {yellow.map(t=><UrgentRow key={t.id} task={t} color="#fbbf24" bg="#fbbf2408"/>)}
      </div>
    );
  };

  const MoneyView=()=>{
    const mk=monthKey();
    const now=new Date();
    const monthName=now.toLocaleString("default",{month:"long",year:"numeric"});
    // Revenue
    const activeRevFolders=[...folders].filter(f=>(f.monthlyValue||0)>0&&!f.archived&&!f.prospect).sort((a,b)=>(b.monthlyValue||0)-(a.monthlyValue||0));
    const totalMRR=activeRevFolders.reduce((s,f)=>s+(f.monthlyValue||0),0);
    const collectedMRR=activeRevFolders.filter(f=>(f.subCollected??{})[mk]).reduce((s,f)=>s+(f.monthlyValue||0),0);
    const allPayments=folders.filter(f=>!f.prospect).flatMap(f=>(f.payments??[]).filter(p=>p.month===mk));
    const totalOneTime=allPayments.reduce((s,p)=>s+p.amount,0);
    const collectedOneTime=allPayments.filter(p=>p.status==="collected").reduce((s,p)=>s+p.amount,0);
    const totalRevenue=collectedMRR+collectedOneTime;
    // Pipeline (prospects)
    const prospects=folders.filter(f=>f.prospect&&!f.archived);
    const pipelineValue=prospects.reduce((s,f)=>s+(f.monthlyValue||0),0);
    // Expenses
    const bizExps=expenses.filter(e=>e.category==="business");
    const perExps=expenses.filter(e=>e.category==="personal");
    const totalBizExp=bizExps.reduce((s,e)=>s+getExpenseAmount(e),0);
    const paidBizExp=bizExps.filter(e=>isExpensePaid(e)).reduce((s,e)=>s+getExpenseAmount(e),0);
    const totalPerExp=perExps.reduce((s,e)=>s+getExpenseAmount(e),0);
    const paidPerExp=perExps.filter(e=>isExpensePaid(e)).reduce((s,e)=>s+getExpenseAmount(e),0);
    const netProfit=totalRevenue-totalBizExp;

    const ExpRow=({exp})=>{
      const amt=getExpenseAmount(exp);
      const paid=isExpensePaid(exp);
      return(
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid var(--b)"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:".85rem",fontWeight:600,color:"var(--tx)"}}>{exp.name}</div>
            <div style={{fontSize:".65rem",color:"var(--mu)",marginTop:2}}>{exp.type==="fixed"?"Fixed":"Variable"}</div>
          </div>
          {exp.type==="variable"?(
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{color:"var(--mu)",fontSize:".85rem",fontWeight:600}}>$</span>
              <input
                style={{width:70,background:"var(--bg)",border:"1px solid var(--b2)",borderRadius:7,padding:"4px 8px",color:"var(--tx)",fontSize:".85rem",fontFamily:"'DM Mono',monospace",fontWeight:700,textAlign:"right"}}
                value={amt||""}
                onChange={e=>setVariableAmount(exp.id,e.target.value)}
                placeholder="0"
                type="text"
                inputMode="decimal"
              />
            </div>
          ):(
            <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".9rem",color:"var(--tx)"}}>${amt.toLocaleString()}</span>
          )}
          <button onClick={()=>toggleExpensePaid(exp.id)} style={{background:paid?"#34d39918":"#ef444415",border:`1px solid ${paid?"#34d39940":"#ef444430"}`,color:paid?"#34d399":"#ef4444",borderRadius:99,padding:"4px 12px",cursor:"pointer",fontSize:".72rem",fontWeight:700,whiteSpace:"nowrap"}}>
            {paid?"Paid":"Unpaid"}
          </button>
          <button onClick={()=>openEditExpense(exp)} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".75rem",padding:"2px 4px"}}>✏️</button>
          <button onClick={()=>deleteExpense(exp.id)} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:"1rem",padding:"2px 4px"}}>×</button>
        </div>
      );
    };

    return(
      <div className="page">
        <div className="view-hdr"><div className="view-title">Money</div><div className="view-sub">{monthName}</div></div>

        {/* Net snapshot */}
        <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r)",padding:"20px",marginBottom:16,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,textAlign:"center"}}>
          <div>
            <div style={{fontSize:".6rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>Collected</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.4rem",color:"#34d399",letterSpacing:"-1px"}}>${totalRevenue.toLocaleString()}</div>
          </div>
          <div>
            <div style={{fontSize:".6rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>Expenses</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.4rem",color:"#ef4444",letterSpacing:"-1px"}}>${totalBizExp.toLocaleString()}</div>
          </div>
          <div>
            <div style={{fontSize:".6rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>Net Profit</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.4rem",color:netProfit>=0?"#c8ff57":"#ef4444",letterSpacing:"-1px"}}>${netProfit.toLocaleString()}</div>
          </div>
        </div>

        {/* Revenue section */}
        {totalMRR>0&&(
          <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r)",padding:"16px 18px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <span style={{fontSize:".68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".14em",color:"var(--mu)"}}>Subscriptions</span>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".85rem",color:"#34d399"}}>${collectedMRR.toLocaleString()} collected</div>
                {(totalMRR-collectedMRR)>0&&<div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".82rem",color:"#fbbf24",marginTop:2}}>${(totalMRR-collectedMRR).toLocaleString()} pending</div>}
              </div>
            </div>
            {/* Pending first — these need chasing */}
            {activeRevFolders.filter(f=>!(f.subCollected??{})[mk]).length>0&&(
              <div style={{marginBottom:10}}>
                <div style={{fontSize:".6rem",color:"#fbbf24",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>Pending — follow up</div>
                {activeRevFolders.filter(f=>!(f.subCollected??{})[mk]).map(f=>(
                  <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"#fbbf2408",border:"1px solid #fbbf2425",borderLeft:"3px solid #fbbf24",borderRadius:10,marginBottom:6}}>
                    <span style={{fontSize:"1rem",flexShrink:0}}>{f.icon}</span>
                    <span style={{flex:1,fontSize:".88rem",color:"var(--tx)",fontWeight:600}}>{f.name}</span>
                    <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".95rem",color:"#fbbf24"}}>${(f.monthlyValue||0).toLocaleString()}</span>
                    <button onClick={()=>toggleSubCollected(f.id)} style={{background:"#fbbf2415",border:"1px solid #fbbf2440",color:"#fbbf24",borderRadius:99,padding:"5px 14px",cursor:"pointer",fontSize:".72rem",fontWeight:700,whiteSpace:"nowrap"}}>Pending</button>
                  </div>
                ))}
              </div>
            )}
            {/* Collected */}
            {activeRevFolders.filter(f=>(f.subCollected??{})[mk]).length>0&&(
              <div>
                <div style={{fontSize:".6rem",color:"#34d399",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>Collected</div>
                {activeRevFolders.filter(f=>(f.subCollected??{})[mk]).map(f=>(
                  <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#34d39908",border:"1px solid #34d39925",borderRadius:10,marginBottom:6}}>
                    <span style={{fontSize:"1rem",flexShrink:0}}>{f.icon}</span>
                    <span style={{flex:1,fontSize:".85rem",color:"var(--mu)",fontWeight:500}}>{f.name}</span>
                    <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".88rem",color:"#34d399"}}>${(f.monthlyValue||0).toLocaleString()}</span>
                    <button onClick={()=>toggleSubCollected(f.id)} style={{background:"#34d39918",border:"1px solid #34d39940",color:"#34d399",borderRadius:99,padding:"5px 14px",cursor:"pointer",fontSize:".72rem",fontWeight:700,whiteSpace:"nowrap"}}>Collected ✓</button>
                  </div>
                ))}
              </div>
            )}
            {/* One-time payments pending */}
            {allPayments.filter(p=>p.status==="sent").length>0&&(
              <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--b)"}}>
                <div style={{fontSize:".6rem",color:"#60a5fa",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>One-time — Pending</div>
                {allPayments.filter(p=>p.status==="sent").map(p=>{
                  const folder=folders.find(f=>(f.payments??[]).some(fp=>fp.id===p.id));
                  return(
                    <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#60a5fa08",border:"1px solid #60a5fa25",borderLeft:"3px solid #60a5fa",borderRadius:10,marginBottom:6}}>
                      {folder&&<span style={{fontSize:".9rem",flexShrink:0}}>{folder.icon}</span>}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:".85rem",fontWeight:600,color:"var(--tx)"}}>{p.note}</div>
                        {folder&&<div style={{fontSize:".68rem",color:"var(--mu)",marginTop:1}}>{folder.name}</div>}
                      </div>
                      <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".9rem",color:"#60a5fa"}}>${p.amount.toLocaleString()}</span>
                      <button onClick={()=>togglePayment(p.id)} style={{background:"#60a5fa15",border:"1px solid #60a5fa40",color:"#60a5fa",borderRadius:99,padding:"5px 14px",cursor:"pointer",fontSize:".72rem",fontWeight:700,whiteSpace:"nowrap"}}>Pending</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Business Expenses */}
        <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r)",padding:"16px 18px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <span style={{fontSize:".68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".14em",color:"var(--mu)"}}>Business Expenses</span>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".82rem",color:"#ef4444"}}>${paidBizExp.toLocaleString()} / ${totalBizExp.toLocaleString()}</span>
              <button className="ghost-btn" style={{padding:"4px 10px",fontSize:".75rem"}} onClick={()=>openAddExpense("business")}>+ Add</button>
            </div>
          </div>
          {bizExps.length===0&&<div style={{fontSize:".82rem",color:"var(--mu)",padding:"10px 0"}}>No business expenses yet</div>}
          {bizExps.map(e=><ExpRow key={e.id} exp={e}/>)}
        </div>

        {/* Personal Expenses */}
        <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r)",padding:"16px 18px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <span style={{fontSize:".68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".14em",color:"var(--mu)"}}>Personal Expenses</span>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".82rem",color:"#fb923c"}}>${paidPerExp.toLocaleString()} / ${totalPerExp.toLocaleString()}</span>
              <button className="ghost-btn" style={{padding:"4px 10px",fontSize:".75rem"}} onClick={()=>openAddExpense("personal")}>+ Add</button>
            </div>
          </div>
          {perExps.length===0&&<div style={{fontSize:".82rem",color:"var(--mu)",padding:"10px 0"}}>No personal expenses yet</div>}
          {perExps.map(e=><ExpRow key={e.id} exp={e}/>)}
          {perExps.length>0&&(
            <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--b)",display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:".82rem",color:"var(--mu)"}}>Total personal</span>
              <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".85rem",color:"#fb923c"}}>${totalPerExp.toLocaleString()}/mo</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const SessionStats=({task})=>{
    if(!task)return null;
    // Account-wide session stats across ALL tasks
    const allSessions=[];
    tasks.forEach(t=>{
      Object.values(t.timeLog??{}).forEach(secs=>{if(secs>30)allSessions.push(secs);}); // ignore sessions under 30s
    });
    const accountAvg=allSessions.length?Math.round(allSessions.reduce((s,v)=>s+v,0)/allSessions.length):0;
    const accountLongest=allSessions.length?Math.max(...allSessions):0;
    const totalSessions=allSessions.length;
    // Current live session on THIS task
    const liveSecs=task.timerRunning&&task.timerStartedAt?(Date.now()-task.timerStartedAt)/1000:0;
    const isBelow=task.timerRunning&&accountAvg>0&&liveSecs<accountAvg*.7;
    const isBeat=task.timerRunning&&accountAvg>0&&liveSecs>accountLongest;
    if(totalSessions===0&&!task.timerRunning)return null;
    return(
      <div style={{background:"var(--bg)",border:"1px solid var(--b)",borderRadius:12,padding:"14px 16px",marginTop:16}}>
        <div style={{fontSize:".65rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".1em",marginBottom:12}}>Your Session Benchmarks</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:(isBelow||isBeat)?10:0}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.1rem",color:"var(--tx)",lineHeight:1,marginBottom:3}}>{totalSessions}</div>
            <div style={{fontSize:".6rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".08em"}}>Total Sessions</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.1rem",color:"#60a5fa",lineHeight:1,marginBottom:3}}>{accountAvg>0?fmtTimer(accountAvg):"—"}</div>
            <div style={{fontSize:".6rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".08em"}}>Avg Session</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.1rem",color:"#a78bfa",lineHeight:1,marginBottom:3}}>{accountLongest>0?fmtTimer(accountLongest):"—"}</div>
            <div style={{fontSize:".6rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".08em"}}>Longest Ever</div>
          </div>
        </div>
        {isBelow&&(
          <div style={{fontSize:".78rem",color:"#fbbf24",fontWeight:600,textAlign:"center",padding:"8px 12px",background:"rgba(251,191,36,.08)",borderRadius:8,border:"1px solid rgba(251,191,36,.2)"}}>
            {fmtTimer(liveSecs)} in · your avg is {fmtTimer(accountAvg)} — keep going!
          </div>
        )}
        {isBeat&&(
          <div style={{fontSize:".78rem",color:"var(--ac)",fontWeight:600,textAlign:"center",padding:"8px 12px",background:"rgba(200,255,87,.08)",borderRadius:8,border:"1px solid rgba(200,255,87,.2)"}}>
            New longest session — you're in the zone!
          </div>
        )}
      </div>
    );
  };

  const CallsTracker=()=>{
    const clientToday=todayCallsOf("client");
    const outreachToday=todayCallsOf("outreach");
    const clientGoal=calls.clientGoal??5;
    const outreachGoal=calls.outreachGoal??20;
    const weeklyClientGoal=clientGoal*5;
    const weeklyOutreachGoal=outreachGoal*5;
    const monthlyClientGoal=clientGoal*22;
    const monthlyOutreachGoal=outreachGoal*22;
    const clientWeek=callsThisWeek("client");
    const outreachWeek=callsThisWeek("outreach");
    const clientMonth=callsThisMonth("client");
    const outreachMonth=callsThisMonth("outreach");
    const clientPct=Math.min(100,Math.round(clientToday.length/clientGoal*100));
    const outreachPct=Math.min(100,Math.round(outreachToday.length/outreachGoal*100));
    const clientWeekPct=Math.min(100,Math.round(clientWeek.length/weeklyClientGoal*100));
    const outreachWeekPct=Math.min(100,Math.round(outreachWeek.length/weeklyOutreachGoal*100));
    const clientMonthPct=Math.min(100,Math.round(clientMonth.length/monthlyClientGoal*100));
    const outreachMonthPct=Math.min(100,Math.round(outreachMonth.length/monthlyOutreachGoal*100));
    const PBar=({done,goal,pct,color})=>(
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{flex:1,height:5,background:"var(--b2)",borderRadius:99,overflow:"hidden"}}>
          <div style={{height:"100%",borderRadius:99,background:pct>=100?"#34d399":color,width:`${pct}%`,transition:"width .5s ease"}}/>
        </div>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:".72rem",fontWeight:700,color:pct>=100?"#34d399":color,minWidth:44,textAlign:"right"}}>{done}/{goal}</span>
      </div>
    );
    return(
      <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r2)",padding:"16px 18px",marginTop:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <span style={{fontSize:".7rem",fontWeight:600,textTransform:"uppercase",letterSpacing:".12em",color:"var(--mu)"}}>📞 Daily Calls</span>
          <button onClick={openCallGoalModal} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".75rem",fontWeight:600,padding:"2px 6px"}}>Edit goals</button>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
            <span style={{fontSize:".85rem",fontWeight:600,color:"var(--tx)"}}>Client Calls</span>
            <button onClick={()=>openCallModal("client")} style={{background:"var(--ac)",border:"none",color:"#000",borderRadius:99,width:26,height:26,cursor:"pointer",fontSize:"1rem",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
          </div>
          <PBar done={clientToday.length} goal={clientGoal} pct={clientPct} color="var(--ac)"/>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
            <span style={{fontSize:".85rem",fontWeight:600,color:"var(--tx)"}}>Outreach Calls</span>
            <button onClick={()=>openCallModal("outreach")} style={{background:"#60a5fa",border:"none",color:"#000",borderRadius:99,width:26,height:26,cursor:"pointer",fontSize:"1rem",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
          </div>
          <PBar done={outreachToday.length} goal={outreachGoal} pct={outreachPct} color="#60a5fa"/>
        </div>
        <div style={{borderTop:"1px solid var(--b)",paddingTop:12,marginBottom:12}}>
          <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>This Week</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:".75rem",color:"var(--tx2)",width:60,flexShrink:0,minWidth:0}}>Client</span>
              <PBar done={clientWeek.length} goal={weeklyClientGoal} pct={clientWeekPct} color="var(--ac)"/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:".75rem",color:"var(--tx2)",width:60,flexShrink:0,minWidth:0}}>Outreach</span>
              <PBar done={outreachWeek.length} goal={weeklyOutreachGoal} pct={outreachWeekPct} color="#60a5fa"/>
            </div>
          </div>
        </div>
        <div style={{borderTop:"1px solid var(--b)",paddingTop:12,marginBottom:clientToday.length+outreachToday.length>0?12:0}}>
          <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>This Month</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:".75rem",color:"var(--tx2)",width:60,flexShrink:0,minWidth:0}}>Client</span>
              <PBar done={clientMonth.length} goal={monthlyClientGoal} pct={clientMonthPct} color="var(--ac)"/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:".75rem",color:"var(--tx2)",width:60,flexShrink:0,minWidth:0}}>Outreach</span>
              <PBar done={outreachMonth.length} goal={monthlyOutreachGoal} pct={outreachMonthPct} color="#60a5fa"/>
            </div>
          </div>
        </div>
        {(clientToday.length>0||outreachToday.length>0)&&(
          <div style={{borderTop:"1px solid var(--b)",paddingTop:12}}>
            <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>Today's log</div>
            {clientToday.map(c=>{const f=folders.find(f=>f.id===c.folderId);return(
              <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid var(--b)"}}>
                <span style={{fontSize:".75rem"}}>📞</span>
                <span style={{flex:1,fontSize:".82rem",color:"var(--tx2)",fontWeight:500}}>{f?f.name:"Client call"}</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:".78rem",color:"var(--ac)",fontWeight:700}}>{c.duration} min</span>
                <button onClick={()=>deleteCall("client",c.id)} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".9rem",padding:"0 2px"}}>×</button>
              </div>
            );})}
            {outreachToday.map(c=>(
              <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid var(--b)"}}>
                <span style={{fontSize:".75rem"}}>📲</span>
                <span style={{flex:1,fontSize:".82rem",color:"var(--tx2)",fontWeight:500}}>Outreach call</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:".78rem",color:"#60a5fa",fontWeight:700}}>{c.duration} min</span>
                <button onClick={()=>deleteCall("outreach",c.id)} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".9rem",padding:"0 2px"}}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const ReportsView=()=>{
    const [period,setPeriod]=useState("month");
    const yr=String(new Date().getFullYear());
    const cW=callsThisWeek("client"),oW=callsThisWeek("outreach");
    const cM=callsThisMonth("client"),oM=callsThisMonth("outreach");
    const cY=callsThisYear("client"),oY=callsThisYear("outreach");
    const hW=hWeek();
    const hM=hoursThisMonth();
    const hY=hoursThisYear();
    const revM=revenueThisMonth(),revY=revenueThisYear();
    const expM=expensesThisMonth(),expY=expensesThisYear();
    const d=period==="week"?{hours:hW,rev:null,exp:null,cc:cW,oc:oW}
      :period==="month"?{hours:hM,rev:revM,exp:expM,cc:cM,oc:oM}
      :{hours:hY,rev:revY,exp:expY,cc:cY,oc:oY};
    const rate=d.rev&&d.hours>0?d.rev/d.hours:null;
    const net=d.rev!=null&&d.exp!=null?d.rev-d.exp:null;
    const SCard=({label,val,color,sub})=>(
      <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:12,padding:"16px"}}>
        <div style={{fontSize:".6rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>{label}</div>
        <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.5rem",color:color||"var(--tx)",letterSpacing:"-1px",lineHeight:1}}>{val}</div>
        {sub&&<div style={{fontSize:".7rem",color:"var(--mu)",marginTop:5}}>{sub}</div>}
      </div>
    );
    return(
      <div className="page">
        <div className="view-hdr"><div className="view-title">Reports</div><div className="view-sub">Your business at a glance</div></div>
        <div style={{display:"flex",gap:6,marginBottom:22,background:"var(--s)",borderRadius:12,padding:5}}>
          {[["week","This Week"],["month","This Month"],["year","This Year"]].map(([p,l])=>(
            <button key={p} onClick={()=>setPeriod(p)} style={{flex:1,padding:"9px 6px",borderRadius:9,border:"none",background:period===p?"var(--bg)":"transparent",color:period===p?"var(--tx)":"var(--mu)",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:".82rem",cursor:"pointer",transition:"all .15s"}}>{l}</button>
          ))}
        </div>
        {rate&&(
          <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r2)",padding:"22px 20px",marginBottom:14,textAlign:"center"}}>
            <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".14em",marginBottom:8}}>Effective Hourly Rate</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"3.2rem",color:"#c8ff57",letterSpacing:"-2px",lineHeight:1}}>${Math.round(rate)}<span style={{fontSize:"1.1rem",color:"var(--mu)",fontWeight:500}}>/hr</span></div>
            <div style={{fontSize:".75rem",color:"var(--mu)",marginTop:8}}>${d.rev.toLocaleString()} revenue / {fmtHrs(d.hours)} worked</div>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <SCard label="Hours Worked" val={fmtHrs(d.hours)} color="#fb923c"/>
          {d.rev!=null&&<SCard label="Revenue" val={"$"+d.rev.toLocaleString()} color="#34d399"/>}
          {d.exp!=null&&<SCard label="Business Expenses" val={"$"+d.exp.toLocaleString()} color="#ef4444"/>}
          {net!=null&&<SCard label="Net Profit" val={"$"+net.toLocaleString()} color={net>=0?"#c8ff57":"#ef4444"}/>}
        </div>
          <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r2)",padding:"16px 18px",marginBottom:10}}>
          <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".12em",marginBottom:14}}>Clients</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
            <div style={{textAlign:"center",padding:"12px 6px",background:"var(--bg)",borderRadius:10,border:"1px solid var(--b)"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.6rem",color:"#34d399",lineHeight:1,marginBottom:4}}>{folders.filter(f=>!f.archived&&!f.paused).length}</div>
              <div style={{fontSize:".58rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>Active</div>
            </div>
            <div style={{textAlign:"center",padding:"12px 6px",background:"var(--bg)",borderRadius:10,border:"1px solid var(--b)"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.6rem",color:"#a78bfa",lineHeight:1,marginBottom:4}}>{folders.filter(f=>f.paused).length}</div>
              <div style={{fontSize:".58rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>Paused</div>
            </div>
            <div style={{textAlign:"center",padding:"12px 6px",background:"var(--bg)",borderRadius:10,border:"1px solid var(--b)"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.6rem",color:"#fbbf24",lineHeight:1,marginBottom:4}}>{folders.filter(f=>f.archived).length}</div>
              <div style={{fontSize:".58rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>Archived</div>
            </div>
            <div style={{textAlign:"center",padding:"12px 6px",background:"var(--bg)",borderRadius:10,border:"1px solid var(--b)"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.6rem",color:"var(--tx2)",lineHeight:1,marginBottom:4}}>{folders.length}</div>
              <div style={{fontSize:".58rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>Total</div>
            </div>
          </div>
        </div>
        <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r2)",padding:"16px 18px"}}>
          <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".12em",marginBottom:14}}>Phone Calls</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{textAlign:"center",padding:"14px",background:"var(--bg)",borderRadius:10,border:"1px solid var(--b)"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"2rem",color:"var(--ac)",lineHeight:1,marginBottom:5}}>{d.cc.length}</div>
              <div style={{fontSize:".65rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".08em",marginBottom:3}}>Client Calls</div>
              <div style={{fontSize:".7rem",color:"var(--mu)"}}>{callMins(d.cc)} min</div>
            </div>
            <div style={{textAlign:"center",padding:"14px",background:"var(--bg)",borderRadius:10,border:"1px solid var(--b)"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"2rem",color:"#60a5fa",lineHeight:1,marginBottom:5}}>{d.oc.length}</div>
              <div style={{fontSize:".65rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".08em",marginBottom:3}}>Outreach Calls</div>
              <div style={{fontSize:".7rem",color:"var(--mu)"}}>{callMins(d.oc)} min</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const HomeView=()=>{
    const dk=todayKey();
    const nowDate=new Date(),monthStr=`${nowDate.getFullYear()}-${String(nowDate.getMonth()+1).padStart(2,"0")}`,monthName=nowDate.toLocaleString("default",{month:"long"});
    const tMonth=()=>{let c=0;tasks.forEach(t=>{if(!t.recurring&&t.done)c++;else if(t.recurring)c+=(t.doneOn??[]).filter(d=>d.startsWith(monthStr)).length;});return c;};
    const weekDone=DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).filter(t=>isDone(t,d)).length,0);
    const weekTotal=DAY_KEYS.reduce((s,d)=>s+tasksForDay(d).length,0);
    const enriched=[...folders].filter(f=>!f.archived&&!f.paused&&!f.prospect).map(f=>{const td=todayKey(),ft=folderTasks(f.id),tdTasks=tasksForDay(td).filter(t=>t.folderId===f.id);const doneToday=tdTasks.filter(t=>isDone(t,td)).length,todayCount=tdTasks.length;let wDue=0,wDone=0;DAY_KEYS.forEach(d=>{const df=tasksForDay(d).filter(t=>t.folderId===f.id);wDue+=df.length;wDone+=df.filter(t=>isDone(t,d)).length;});const totalSecs=ft.reduce((s,t)=>s+(t.timerSeconds??0),0);return{f,todayCount,doneToday,wDue,wDone,wPct:wDue>0?Math.round(wDone/wDue*100):0,totalSecs,hasToday:todayCount>0};});
    const active=enriched.filter(e=>e.hasToday).sort((a,b)=>b.todayCount-a.todayCount);
    const inactive=enriched.filter(e=>!e.hasToday);
    const FRow=({e,dim})=>{const{f,todayCount,doneToday,wDue,wDone,wPct,totalSecs}=e;return(
      <div className={`folder-row${dim?" dimmed":""}`} style={{"--fc":dim?"#555":f.color}} onClick={()=>goFolder(f.id)}>
        <div className="folder-row-icon" style={{filter:dim?"grayscale(1)":"none"}}>{f.icon}</div>
        <div className="folder-row-main"><div className="folder-row-name" style={{color:dim?"var(--mu)":"var(--tx)"}}>{f.name}</div><div className="folder-row-bar"><div className="folder-row-bar-f" style={{width:`${wPct}%`,background:dim?"#444":f.color}}/></div></div>
        <div className="folder-row-stats">
          <div className="f-stat"><span className="f-stat-val" style={{color:dim?"var(--mu)":todayCount>0?f.color:"var(--tx2)"}}>{dim?"—":`${doneToday}/${todayCount}`}</span><span className="f-stat-lbl">Today</span></div>
          <div className="f-stat f-stat-week"><span className="f-stat-val" style={{color:dim?"var(--mu)":"var(--tx2)"}}>{wDone}/{wDue}</span><span className="f-stat-lbl">Week</span></div>
          <div className="f-stat"><span className="f-stat-val" style={{color:dim?"var(--mu)":"var(--tx2)"}}>{totalSecs>0?fmtTimer(totalSecs):"—"}</span><span className="f-stat-lbl">Time</span></div>
          {(f.monthlyValue||0)>0&&<div className="f-stat f-stat-week"><span className="f-stat-val" style={{color:"#34d399"}}>${(f.monthlyValue).toLocaleString()}</span><span className="f-stat-lbl">/mo</span></div>}
        </div>
        <button onClick={ev=>openRename(ev,f)} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".85rem",padding:"3px 6px",borderRadius:6,flexShrink:0}}>✏️</button>
        <span className="folder-arr">›</span>
      </div>
    );};
    return(
      <div className="home-layout">
        <div>
          <RunningTimerBanner/>
          {streak>0&&<div className="streak"><span style={{fontSize:"1.4rem"}}>🔥</span><div><div className="streak-num">{streak} day streak</div><div className="streak-lbl">Keep going</div></div>{bestStreak>streak&&<span style={{marginLeft:"auto",fontSize:".75rem",color:"var(--mu)"}}>Best: {bestStreak}</span>}</div>}
          <RingsCard dk={dk}/>
          <UrgentSection/>
          <ChaseThese/>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:"clamp(1.3rem,4vw,2rem)",fontWeight:800,letterSpacing:"-.4px",color:"var(--tx)",marginBottom:4,lineHeight:1.1}}>My Week</div>
          <div style={{fontSize:".85rem",color:"var(--mu)",marginBottom:20,fontWeight:400}}>Tap a day to manage tasks</div>
          <div className="day-grid">
            {DAY_KEYS.map((d,i)=>{const dt=tasksForDay(d),pct=donePct(dt,d),isT=i===todayIdx();return(
              <div key={d} className={`day-card${isT?" today":""}`} onClick={()=>goDay(d)}>
                <div className="day-lbl">{DAYS[i]}</div>
                <div className="day-bar"><div className="day-bar-f" style={{width:`${pct}%`,background:isT?"#c8ff57":pct===100?"#34d399":"#2a2a2a"}}/></div>
                <div className="day-cnt">{dt.filter(t=>isDone(t,d)).length}/{dt.length}</div>
              </div>
            );})}
          </div>
          <div className="sec-hdr"><span className="sec-title">Folders</span><button className="ghost-btn" onClick={()=>setShowFolderModal(true)}>+ New Folder</button></div>
          {folders.length===0?<div className="empty">No folders yet</div>:(
            <div className="folders-list">
              {active.map(e=><FRow key={e.f.id} e={e} dim={false}/>)}
              {inactive.length>0&&<>{active.length>0&&<div className="no-tasks-divider"><span className="no-tasks-lbl">No tasks today</span></div>}{inactive.map(e=><FRow key={e.f.id} e={e} dim={true}/>)}</>}
            </div>
          )}
          <CallsTracker/>
          {folders.some(f=>f.paused)&&(
            <div style={{marginTop:20}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <span style={{fontSize:".7rem",fontWeight:600,textTransform:"uppercase",letterSpacing:".12em",color:"#a78bfa"}}>Paused</span>
                <span style={{fontSize:".65rem",background:"#a78bfa20",color:"#a78bfa",border:"1px solid #a78bfa30",borderRadius:99,padding:"1px 8px",fontWeight:700}}>{folders.filter(f=>f.paused).length}</span>
              </div>
              {folders.filter(f=>f.paused).map(f=>(
                <div key={f.id} style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r2)",padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10,opacity:.5}}>
                  <span style={{fontSize:"1.2rem",flexShrink:0,filter:"grayscale(1)"}}>{f.icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:".9rem",fontWeight:600,color:"var(--mu)",marginBottom:2}}>{f.name}</div>
                    <div style={{fontSize:".68rem",color:"var(--mu)"}}>Paused {f.pausedDate} — relationship on hold</div>
                  </div>
                  <button onClick={()=>unpauseFolder(f.id)} style={{background:"none",border:"1px solid #a78bfa40",color:"#a78bfa",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:".72rem",fontWeight:600,whiteSpace:"nowrap",flexShrink:0}}>Reactivate</button>
                </div>
              ))}
            </div>
          )}
          {folders.some(f=>f.archived)&&(
            <div style={{marginTop:24}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <span style={{fontSize:".7rem",fontWeight:600,textTransform:"uppercase",letterSpacing:".12em",color:"var(--mu)"}}>Archived Clients</span>
                <span style={{fontSize:".65rem",background:"var(--s)",color:"var(--mu)",border:"1px solid var(--b)",borderRadius:99,padding:"1px 8px",fontWeight:700}}>{folders.filter(f=>f.archived).length}</span>
              </div>
              {folders.filter(f=>f.archived).map(f=>{
                const ft=folderTasks(f.id);
                const totalSecs=ft.reduce((s,t)=>s+Object.values(t.timeLog??{}).reduce((a,b)=>a+b,0),0);
                const totalRev=Object.entries(f.subCollected??{}).filter(([,v])=>v).length*(f.monthlyValue||0)+(f.payments??[]).filter(p=>p.status==="collected").reduce((s,p)=>s+p.amount,0);
                return(
                  <div key={f.id} style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r2)",padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10,opacity:.6}}>
                    <span style={{fontSize:"1.2rem",flexShrink:0,filter:"grayscale(1)"}}>{f.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:".9rem",fontWeight:600,color:"var(--mu)",marginBottom:2}}>{f.name}</div>
                      <div style={{fontSize:".68rem",color:"var(--mu)"}}>Archived {f.archivedDate} · {ft.length} tasks · {fmtHrs(totalSecs/3600)} tracked{totalRev>0?` · $${totalRev.toLocaleString()} earned`:""}</div>
                    </div>
                    <button onClick={()=>unarchiveFolder(f.id)} style={{background:"none",border:"1px solid var(--b2)",color:"var(--mu)",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:".72rem",fontWeight:600,whiteSpace:"nowrap",flexShrink:0}}>Restore</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="stats-col">
          <div className="stat-card">
            <div className="stat-title">Tasks Completed</div>
            <div className="stat-big" style={{color:"#c8ff57"}}>{tMonth()}</div>
            <div className="stat-desc">this month · {monthName}</div>
            <div className="stat-div"/>
            <div className="stat-row"><span className="stat-row-l">This week</span><span className="stat-row-v" style={{color:"#c8ff57"}}>{weekDone}</span></div>
            <div className="stat-row"><span className="stat-row-l">Total tasks</span><span className="stat-row-v" style={{color:"var(--tx2)"}}>{weekTotal}</span></div>
            <div className="stat-row"><span className="stat-row-l">Week progress</span><span className="stat-row-v" style={{color:"#a78bfa"}}>{weekTotal?Math.round(weekDone/weekTotal*100):0}%</span></div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Time Tracked Today</div>
            <div className="stat-big" style={{color:"#fb923c",fontFamily:"'DM Mono',monospace",fontSize:"2.2rem",letterSpacing:"-1px"}}>{fmtTimer(secsTracked(dk))}</div>
            <div style={{marginTop:8,marginBottom:6}}><div style={{width:"100%",height:5,background:"var(--b2)",borderRadius:99,overflow:"hidden"}}><div style={{height:"100%",borderRadius:99,background:"linear-gradient(90deg,#fb923c,#fbbf24)",width:`${Math.min(100,(secsTracked(dk)/3600/hoursFor(dk))*100)}%`,transition:"width .6s ease",minWidth:secsTracked(dk)>0?"4px":"0"}}/></div></div>
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
          <WeekCompare/>
        </div>
      </div>
    );
  };

  const DayView=()=>{
    const dk=activeDay,idx=DAY_KEYS.indexOf(dk),label=DAYS[idx],isT=idx===todayIdx();
    const dt=tasksForDay(dk),done=dt.filter(t=>isDone(t,dk)).length;
    const st=secsTracked(dk),goal=hoursFor(dk)*3600,timePct=Math.min(100,Math.round(st/goal*100));
    const hasTime=st>0;const displayPct=hasTime?timePct:donePct(dt,dk);
    const grouped=folders.map(f=>({f,ts:dt.filter(t=>t.folderId===f.id)})).filter(g=>g.ts.length);
    const other=dt.filter(t=>!folders.find(f=>f.id===t.folderId));
    return(
      <div className="page">
        <div className="view-hdr"><div className="view-title">{label}{isT?" · Today":""}</div><div className="view-sub">{dt.length} tasks · {done} completed</div></div>
        <RingsCard dk={dk}/>
        {isT&&<DayMomentum dk={dk}/>}
        <TimeProgress dk={dk}/>
        <div className="big-prog">
          <div className="big-top">
            <span className="big-frac">{hasTime?fmtHrs(st/3600):<span style={{fontSize:"1.1rem",color:"var(--mu)"}}>No time yet</span>}{hasTime&&<span className="d"> of {hoursFor(dk)} hrs</span>}</span>
            <span className="big-pct" style={{color:"#c8ff57"}}>{displayPct}%</span>
          </div>
          <div className="big-bar"><div className="big-fill" style={{width:`${displayPct}%`,background:"#c8ff57"}}/></div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
            <span style={{fontSize:".72rem",color:"var(--mu)"}}>Tasks: {done}/{dt.length} completed</span>
            {dt.length>0&&done===dt.length&&<span style={{fontSize:".72rem",color:"var(--ac)",fontWeight:700}}>All done!</span>}
          </div>
        </div>
        {grouped.map(({f,ts})=>(<div className="task-grp" key={f.id}><div className="grp-hdr"><span className="grp-lbl" style={{color:f.color}}>{f.icon} {f.name}</span><span style={{marginLeft:"auto",fontSize:".72rem",color:f.color,fontWeight:700}}>{donePct(ts,dk)}%</span></div>{sortByAlert(ts).map(t=><TaskRow key={t.id} task={t} dk={dk} color={f.color} from="day"/>)}</div>))}
        {other.length>0&&<div className="task-grp"><div className="grp-hdr"><span className="grp-lbl" style={{color:"var(--mu)"}}>Other</span></div>{sortByAlert(other).map(t=><TaskRow key={t.id} task={t} dk={dk} color="var(--ac)" from="day"/>)}</div>}
        {dt.length===0&&<div className="empty">Nothing for {label} — add a task below</div>}
        <AddRow dk={dk} fid={folders[0]?.id} placeholder={`Add task for ${label}...`}/>
      </div>
    );
  };

  const FolderView=()=>{
    const folder=folders.find(f=>f.id===activeFolder);if(!folder)return null;
    const ft=folderTasks(activeFolder),dk=todayKey();
    const done=ft.filter(t=>isDone(t,dk)).length,pct=ft.length?Math.round(done/ft.length*100):0;
    const byDay=DAY_KEYS.map((d,i)=>({d,lbl:DAYS[i],ts:ft.filter(t=>(!t.recurring&&(t.day===d||t.startDate===dateForDK(d)))||(t.recurring&&t.recurringDays?.includes(d)))})).filter(g=>g.ts.length);
    const mk=monthKey();
    const subCollected=(folder.subCollected??{})[mk]||false;
    const monthPayments=(folder.payments??[]).filter(p=>p.month===mk);
    return(
      <div className="page">
        <div className="view-hdr"><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:10,height:10,borderRadius:"50%",background:folder.color,flexShrink:0}}/><div className="view-title">{folder.name}</div></div><div className="view-sub">{ft.length} tasks total</div></div>
        <div className="big-prog">
          <div className="big-top"><span className="big-frac">{done}<span className="d">/{ft.length}</span></span><span className="big-pct" style={{color:folder.color}}>{pct}% today</span></div>
          <div className="big-bar"><div className="big-fill" style={{width:`${pct}%`,background:folder.color}}/></div>
        </div>
        {(folder.monthlyValue||0)>0&&(
          <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r)",padding:"16px 18px",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div><div style={{fontSize:".63rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>Monthly Retainer</div><div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.3rem",color:"#34d399",letterSpacing:"-1px"}}>${(folder.monthlyValue).toLocaleString()}<span style={{fontSize:".75rem",color:"var(--mu)",fontWeight:500}}>/mo</span></div></div>
              <button onClick={()=>toggleSubCollected(folder.id)} style={{background:subCollected?"#34d39918":"var(--bg)",border:`1px solid ${subCollected?"#34d39940":"var(--b2)"}`,color:subCollected?"#34d399":"var(--mu)",borderRadius:99,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:".8rem",transition:"all .2s"}}>{subCollected?"Collected ✓":"Mark Collected"}</button>
            </div>
          </div>
        )}
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <span className="sec-title">One-time Payments</span>
            <button className="ghost-btn" onClick={()=>{setPaymentFolder(folder.id);setPaymentAmount("");setPaymentNote("");setShowPaymentModal(true);}}>+ Add</button>
          </div>
          {monthPayments.length===0&&<div style={{fontSize:".82rem",color:"var(--mu)",padding:"6px 0"}}>No payments this month</div>}
          {monthPayments.map(p=>(
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"var(--s)",border:"1px solid var(--b)",borderRadius:10,marginBottom:7}}>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:".85rem",fontWeight:600,color:"var(--tx)"}}>{p.note}</div><div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".9rem",color:p.status==="collected"?"#34d399":"#fbbf24",marginTop:2}}>${p.amount.toLocaleString()}</div></div>
              <button onClick={()=>togglePayment(p.id)} style={{background:p.status==="collected"?"#34d39918":"#fbbf2415",border:`1px solid ${p.status==="collected"?"#34d39940":"#fbbf2440"}`,color:p.status==="collected"?"#34d399":"#fbbf24",borderRadius:99,padding:"5px 14px",cursor:"pointer",fontSize:".75rem",fontWeight:700,whiteSpace:"nowrap"}}>{p.status==="collected"?"Collected":"Pending"}</button>
              <button onClick={()=>deletePayment(folder.id,p.id)} style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:"1rem",padding:"2px 4px"}}>×</button>
            </div>
          ))}
        </div>
        {byDay.map(({d,lbl,ts})=>(<div className="task-grp" key={d}><div className="grp-hdr"><span className="grp-lbl" style={{color:DAY_KEYS.indexOf(d)===todayIdx()?folder.color:"var(--mu)"}}>{lbl}{DAY_KEYS.indexOf(d)===todayIdx()?" · Today":""}</span></div>{sortByAlert(ts).map(t=><TaskRow key={t.id} task={t} dk={d} color={folder.color} from="folder"/>)}</div>))}
        {ft.length===0&&<div className="empty">No tasks yet — add one below</div>}
        <AddRow dk={dk} fid={activeFolder} placeholder={`Add task to ${folder.name}...`}/>
        <div style={{display:"flex",gap:8,marginTop:20,flexWrap:"wrap"}}>
          <button className="del-folder-btn" style={{flex:1,background:"none",border:"1px solid rgba(167,139,250,.2)",color:"#a78bfa",minWidth:80}} onClick={()=>pauseFolder(activeFolder)}>Pause client</button>
          <button className="del-folder-btn" style={{flex:1,background:"none",border:"1px solid rgba(251,191,36,.2)",color:"#fbbf24",minWidth:80}} onClick={()=>archiveFolder(activeFolder)}>Archive client</button>
          <button className="del-folder-btn" style={{flex:1,minWidth:80}} onClick={()=>{if(window.confirm("Delete permanently? All data will be lost."))deleteFolder(activeFolder);}}>Delete</button>
        </div>
      </div>
    );
  };

  const TaskDetailView=()=>{
    if(!activeTask)return null;
    const task=tasks.find(t=>t.id===activeTask.id)??activeTask;
    const dk=activeTaskDk,done=isDone(task,dk),secs=getLiveSecs(task),isRunning=task.timerRunning;
    const folder=folders.find(f=>f.id===task.folderId);
    const totalSecsToday=secsTracked(dk);const todayStr=dStr();
    let dueInfo=null;
    if(task.dueDate){const diff=Math.round((new Date(task.dueDate)-new Date(todayStr))/86400000);const col=diff<0?"#ef4444":diff===0?"#fb923c":diff===1?"#fbbf24":"var(--mu)";const lbl=diff<0?`Overdue ${Math.abs(diff)}d`:diff===0?"Due today":diff===1?"Due tomorrow":`Due in ${diff}d`;dueInfo=<span className="date-pill" style={{color:col,borderColor:col+"40"}}>⏰ {lbl}</span>;}
    return(
      <div className="task-detail">
        {folder&&<div className="detail-folder" style={{color:folder.color}}>{folder.icon} {folder.name}</div>}
        <div className={`detail-name${done?" done":""}`}>{task.text}</div>
        <div className="detail-date-pills">
          {task.startDate&&<span className="date-pill">📅 {task.startDate===todayStr?"Starts today":task.startDate}</span>}
          {dueInfo}
        </div>
        <div className="detail-actions-row">
          <button className="detail-action-btn" onClick={()=>{setEditTaskText(task.text);setShowEditTask(true);}}>✏️ Edit</button>
          {done&&<button className="detail-action-btn warn" onClick={uncompleteTask}>↩ Uncomplete</button>}
          {!done&&<AlertBtn task={task}/>}
          <button className="detail-action-btn danger" onClick={deleteActiveTask}>🗑 Delete</button>
        </div>
        {done&&<div className="done-badge">✓ Completed</div>}
        <div className={`timer-card${isRunning?" running":""}`}>
          <div className="timer-digits">{fmtTimer(secs)}</div>
          <div className="timer-status-lbl">{isRunning?"Working on this task…":"Timer paused"}</div>
          {!done&&(<div className="timer-btn-wrap">{isRunning?<button className="timer-btn pause" onClick={()=>pauseTimer(task.id)}>Pause</button>:<button className="timer-btn start" onClick={()=>startTimer(task.id)}>▶ Start Working</button>}<button className="lock-btn" onClick={openLockFlow}>🔒 Lock In</button></div>)}
          <div className="timer-stats">
            <div className="t-stat"><div className="t-stat-val">{fmtTimer(task.timerSeconds??0)}</div><div className="t-stat-lbl">This task</div></div>
            <div className="t-stat"><div className="t-stat-val">{fmtTimer(totalSecsToday)}</div><div className="t-stat-lbl">Today total</div></div>
            <div className="t-stat"><div className="t-stat-val">{fmtHrs(hoursLeft(dk))}</div><div className="t-stat-lbl">Budget left</div></div>
          </div>
        </div>
        <SessionStats task={task}/>
        {!done&&!showRemind&&(<div className="complete-actions"><button className="action-btn complete" onClick={()=>completeTask(null)}>✓ Mark Complete</button><button className="action-btn remind" onClick={()=>setShowRemind(true)}>⏰ Complete & Remind</button></div>)}
        {!done&&showRemind&&(<div className="remind-section"><div className="remind-title">Remind me in</div><div className="remind-grid">{REMIND_OPTS.map(d=><button key={d} className="remind-opt" onClick={()=>completeTask(d)}>{d===1?"Tomorrow":`${d}d`}</button>)}</div><div style={{textAlign:"center"}}><button style={{background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:".8rem"}} onClick={()=>setShowRemind(false)}>Back</button></div></div>)}
      </div>
    );
  };

  const AllTasksView=()=>{
    const [sortBy,setSortBy]=useState("date");const [filter,setFilter]=useState("all");const today=dStr();
    const allItems=[];
    DAY_KEYS.forEach(dk=>{tasksForDay(dk).forEach(task=>{const done=isDone(task,dk);if(filter==="pending"&&done)return;if(filter==="done"&&!done)return;allItems.push({task,dk,date:dateForDK(dk),done,folder:folders.find(f=>f.id===task.folderId)});});});
    if(sortBy==="date")allItems.sort((a,b)=>{const aT=a.date===today?0:a.date>today?1:2,bT=b.date===today?0:b.date>today?1:2;return aT!==bT?aT-bT:a.date.localeCompare(b.date);});
    else allItems.sort((a,b)=>(a.folder?.name??"").localeCompare(b.folder?.name??"")||a.date.localeCompare(b.date));
    const groups=[];
    if(sortBy==="date"){DAY_KEYS.forEach(dk=>{const items=allItems.filter(i=>i.dk===dk);if(!items.length)return;const date=dateForDK(dk),isToday=date===today,isPast=date<today;groups.push({key:dk,label:DAYS[DAY_KEYS.indexOf(dk)],date,isToday,isPast,items});});groups.sort((a,b)=>{const aT=a.isToday?0:!a.isPast?1:2,bT=b.isToday?0:!b.isPast?1:2;return aT!==bT?aT-bT:a.date.localeCompare(b.date);});}
    else{const fm={};allItems.forEach(i=>{const k=i.folder?.id??"none";if(!fm[k])fm[k]={key:k,label:i.folder?.name??"No folder",color:i.folder?.color??"#555",icon:i.folder?.icon??"📋",items:[]};fm[k].items.push(i);});Object.values(fm).forEach(g=>groups.push(g));}
    const totalPending=DAY_KEYS.flatMap(dk=>tasksForDay(dk).filter(t=>!isDone(t,dk))).length;
    const totalDone=DAY_KEYS.flatMap(dk=>tasksForDay(dk).filter(t=>isDone(t,dk))).length;
    return(
      <div className="page">
        <div className="all-hdr"><div><div className="page-title">All Tasks</div><div className="page-sub">{totalPending} pending · {totalDone} done</div></div><div className="sort-tabs"><button className={`sort-tab${sortBy==="date"?" active":""}`} onClick={()=>setSortBy("date")}>📅 Date</button><button className={`sort-tab${sortBy==="folder"?" active":""}`} onClick={()=>setSortBy("folder")}>📁 Folder</button></div></div>
        <div className="filter-tabs">{[["all","All"],["pending","Pending"],["done","Done"]].map(([v,l])=><button key={v} className={`filter-tab${filter===v?" active":""}`} onClick={()=>setFilter(v)}>{l}</button>)}</div>
        {groups.length===0&&<div className="empty">No tasks found</div>}
        {sortBy==="date"?groups.map(g=>(<div className="day-section" key={g.key}><div className="day-section-hdr"><span className={`day-badge${g.isToday?" today":g.isPast?" past":" future"}`}>{g.isToday?"Today":g.label}</span><span style={{fontSize:".7rem",color:"var(--mu)"}}>{g.date}</span><span style={{marginLeft:"auto",fontSize:".72rem",color:"var(--mu)",fontWeight:600}}>{g.items.filter(i=>i.done).length}/{g.items.length}</span></div>{g.items.map((item,idx)=><TaskRow key={`${item.task.id}-${item.dk}-${idx}`} task={item.task} dk={item.dk} color={item.folder?.color??"var(--ac)"} from="all"/>)}</div>)):groups.map(g=>(<div className="day-section" key={g.key}><div className="day-section-hdr"><span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:".88rem",color:g.color}}>{g.icon} {g.label}</span><span style={{marginLeft:"auto",fontSize:".72rem",color:"var(--mu)",fontWeight:600}}>{g.items.filter(i=>i.done).length}/{g.items.length}</span></div>{g.items.map((item,idx)=><TaskRow key={`${item.task.id}-${item.dk}-${idx}`} task={item.task} dk={item.dk} color={g.color} from="all"/>)}</div>))}
      </div>
    );
  };

  if(authLoading)return(<div style={{minHeight:"100vh",background:"#080808",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#333",fontSize:".9rem"}}>Loading…</div></div>);
  if(!user)return(
    <div className="login"><div className="login-card">
      <div className="login-logo">effingFocus<span>.</span></div>
      <div className="login-tag">Track Tasks. See Your Real Productive Time.</div>
      <button className="google-btn" onClick={()=>signInWithPopup(auth,googleProvider)}>
        <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continue with Google
      </button>
      <div className="login-note">Your data syncs across all your devices.</div>
    </div></div>
  );

  const LockScreen=()=>{
    const lockedTask=tasks.find(t=>t.id===lockedTaskId);
    const secsLeft=lockEndTime?Math.max(0,(lockEndTime-Date.now())/1000):0;
    const totalSecs=lockDuration*60,pctLeft=totalSecs?(secsLeft/totalSecs)*100:0;
    const isUrgent=secsLeft<60,workedSecs=lockedTask?getLiveSecs(lockedTask):0;
    if(lockDone)return(<div className="lock-screen"><div style={{fontSize:"3rem",marginBottom:16}}>🎉</div><div className="lock-done-card"><div className="lock-done-title">Time's up!</div><div className="lock-done-sub">You stayed locked in on<br/><strong style={{color:"var(--tx)"}}>{lockedTask?.text}</strong></div><div className="lock-done-btns"><button className="lock-more-btn" onClick={()=>{setLockDone(false);setShowLockModal(true);}}>🔒 Lock in for more</button><button className="lock-back-btn" onClick={dismissLockDone}>Go back</button></div></div></div>);
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
        {showPinUnlock&&(<div style={{position:"fixed",inset:0,background:"#000d",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><div className="modal" style={{maxWidth:300}}><div className="modal-title" style={{textAlign:"center"}}>Enter PIN to unlock</div><PinNumpad currentPin={pinInput}/><button className="btn-c" style={{width:"100%",marginTop:8,textAlign:"center"}} onClick={()=>{setShowPinUnlock(false);setPinInput("");}}>Cancel</button></div></div>)}
      </div>
    );
  };

  const OnboardingFlow=()=>{
    const skipOnboarding=()=>setObStep(0);
    const completeObFolder=()=>{const name=obFolderName.trim();if(!name)return;const id=Date.now();setFolders(p=>[...p,{id,name,color:obFolderColor,icon:obFolderIcon,monthlyValue:0,payments:[],subCollected:{}}]);setObFolderId(id);setObStep(3);};
    const completeObTask=()=>{const text=obTaskText.trim();if(!text)return;setTasks(p=>[...p,{id:Date.now(),text,folderId:obFolderId,recurring:false,startDate:dStr(),done:false,timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{}}]);setObStep(4);};
    const finishOnboarding=()=>{setObStep(0);setView("home");};
    const Dots=()=>(<div className="ob-steps">{[1,2,3,4,5].map(s=><div key={s} className={`ob-step-dot${obStep===s?" active":obStep>s?" done":""}`}/>)}</div>);
    if(obStep===1)return(<div className="ob-overlay"><Dots/><div className="ob-emoji">👋</div><div className="ob-title">Welcome to effingFocus<span style={{color:"var(--ac)"}}>.</span></div><div className="ob-sub">The task manager that shows you exactly how productive you actually were. Let's set you up in 2 minutes.</div><button className="ob-primary" onClick={()=>setObStep(2)}>Let's go</button><button className="ob-skip" onClick={skipOnboarding}>Skip setup</button></div>);
    if(obStep===2)return(<div className="ob-overlay"><Dots/><div className="ob-emoji">📁</div><div className="ob-title">Create your first folder</div><div className="ob-sub">Folders are your clients or life areas. Start with one.</div><div className="ob-card"><div className="ob-card-label">Folder name</div><input className="ob-input" value={obFolderName} autoFocus onChange={e=>setObFolderName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&completeObFolder()} placeholder="e.g. Work, Ajay Sharma..."/><div className="ob-card-label">Colour</div><div className="ob-color-row" style={{marginBottom:14}}>{COLORS.map(c=><div key={c} className={`ob-color${obFolderColor===c?" sel":""}`} style={{background:c}} onClick={()=>setObFolderColor(c)}/>)}</div><div className="ob-card-label">Icon</div><div className="ob-icon-row">{["💼","🏠","👤","🎯","📊","🤝","⭐","💡","🌿","❤️"].map(ic=><div key={ic} className={`ob-icon${obFolderIcon===ic?" sel":""}`} onClick={()=>setObFolderIcon(ic)}>{ic}</div>)}</div></div><button className="ob-primary" onClick={completeObFolder} disabled={!obFolderName.trim()}>Create folder</button><button className="ob-skip" onClick={skipOnboarding}>Skip setup</button></div>);
    if(obStep===3)return(<div className="ob-overlay"><Dots/><div className="ob-emoji">✏️</div><div className="ob-title">Add your first task</div><div className="ob-sub">What's one thing you need to get done today?</div><div className="ob-card"><div className="ob-card-label">Task name</div><input className="ob-input" value={obTaskText} autoFocus onChange={e=>setObTaskText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&completeObTask()} placeholder="e.g. Reply to client emails..."/></div><button className="ob-primary" onClick={completeObTask} disabled={!obTaskText.trim()}>Add task</button><button className="ob-skip" onClick={skipOnboarding}>Skip setup</button></div>);
    if(obStep===4)return(<div className="ob-overlay"><Dots/><div className="ob-emoji">⏱</div><div className="ob-title">Start the timer when you work</div><div className="ob-sub">Tap a task, hit Start Working. This is how effingFocus makes time visible.</div><div className="ob-card"><div className="ob-card-label">How it works</div><div className="ob-task-row"><div className="ob-chk"/><span className="ob-task-txt">{obTaskText||"Your task"}</span><span className="ob-badge">Start</span></div><div style={{marginTop:12,fontSize:".82rem",color:"var(--mu)",lineHeight:1.7}}>Use Lock In to commit to a task for 10-30 min without getting pulled away.</div></div><button className="ob-primary" onClick={()=>setObStep(5)}>Got it</button><button className="ob-skip" onClick={skipOnboarding}>Skip</button></div>);
    if(obStep===5)return(<div className="ob-overlay"><Dots/><div className="ob-emoji">🚀</div><div className="ob-title">You're all set.</div><div className="ob-sub">You're ready to start tracking tasks and seeing your real productive time.</div><div className="ob-card"><div className="ob-card-label">Quick reference</div><div style={{display:"flex",flexDirection:"column",gap:10}}>{[["📁","Folders = your clients or life areas"],["✓","Tap a task, Start Working, track time"],["⚡","Day Momentum shows if you're on pace"],["🔒","Lock In when you need to go deep"],["💰","Money tab tracks income and expenses"]].map(([ic,txt])=>(<div key={txt} style={{display:"flex",alignItems:"flex-start",gap:10,fontSize:".85rem",color:"var(--tx)",lineHeight:1.5}}><span style={{flexShrink:0}}>{ic}</span><span>{txt}</span></div>))}</div></div><button className="ob-primary" onClick={finishOnboarding}>Start focusing</button></div>);
    return null;
  };

  return(
    <div className="app">
      <div className="nav">
        <div className="logo">effingFocus<em>.</em></div>
        <div className="nav-right">
          {view==="task"&&<button className="back-btn" onClick={goBack}>Back</button>}
          {(view==="day"||view==="folder")&&<button className="back-btn" onClick={goHome}>Home</button>}
          {user.photoURL&&<img src={user.photoURL} className="avatar" alt=""/>}
          <button className="signout-btn" onClick={()=>signOut(auth)}>Sign out</button>
        </div>
      </div>
      {view==="home"&&<HomeView/>}
      {view==="day"&&<DayView/>}
      {view==="folder"&&<FolderView/>}
      {view==="task"&&<TaskDetailView/>}
      {view==="all"&&<AllTasksView/>}
      {view==="money"&&<MoneyView/>}
      {view==="reports"&&<ReportsView/>}
      {view!=="task"&&(
        <div className="tab-bar">
          <button className={`tab-btn${(view==="home"||view==="day"||view==="folder")?" active":""}`} onClick={goHome}><span className="tab-icon">🏠</span><span className="tab-lbl">Home</span><div className="tab-dot"/></button>
          <button className={`tab-btn${view==="all"?" active":""}`} onClick={()=>setView("all")}><span className="tab-icon">📋</span><span className="tab-lbl">Tasks</span><div className="tab-dot"/></button>
          <button className={`tab-btn${view==="money"?" active":""}`} onClick={()=>setView("money")}><span className="tab-icon">💰</span><span className="tab-lbl">Money</span><div className="tab-dot"/></button>
          <button className={`tab-btn${view==="reports"?" active":""}`} onClick={()=>setView("reports")}><span className="tab-icon">📈</span><span className="tab-lbl">Reports</span><div className="tab-dot"/></button>
        </div>
      )}
      {confetti&&<Confetti onDone={()=>setConfetti(false)}/>}
      {obStep>0&&<OnboardingFlow/>}
      {isLocked&&<LockScreen/>}
      {showLockModal&&!isLocked&&(<div className="overlay" onClick={()=>setShowLockModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title">🔒 Lock In</div><div style={{fontSize:".82rem",color:"var(--mu)",marginBottom:18,lineHeight:1.6}}>Lock yourself in on <strong style={{color:"var(--tx)"}}>{activeTask?.text}</strong>. You'll need your PIN to exit early.</div><div className="modal-lbl">How long?</div><div className="lock-dur-grid">{LOCK_DURS.map(d=><div key={d} className={`lock-dur-opt${lockDuration===d?" sel":""}`} onClick={()=>setLockDuration(d)}>{d}<span style={{fontSize:".6rem",display:"block",fontWeight:500,marginTop:2}}>min</span></div>)}</div><div className="modal-btns"><button className="btn-c" onClick={()=>setShowLockModal(false)}>Cancel</button><button className="btn-ok" onClick={activateLock}>Lock In</button></div></div></div>)}
      {showPinSetModal&&(<div className="overlay"><div className="modal" style={{maxWidth:320}}><div className="modal-title" style={{textAlign:"center"}}>{pinStep===1?"Set your PIN":"Confirm your PIN"}</div><div style={{fontSize:".8rem",color:"var(--mu)",textAlign:"center",marginBottom:20}}>{pinStep===1?"Choose a 4-digit PIN to unlock early.":"Enter the same PIN again."}</div><PinNumpad currentPin={pinStep===1?pinInput:pinConfirm}/><button className="btn-c" style={{width:"100%",marginTop:12,textAlign:"center"}} onClick={()=>{setShowPinSetModal(false);setPinInput("");setPinStep(1);}}>Cancel</button></div></div>)}
      {showEditTask&&(<div className="overlay" onClick={()=>setShowEditTask(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title">Edit Task</div><div className="modal-lbl">Task name</div><input className="modal-in" value={editTaskText} autoFocus onChange={e=>setEditTaskText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveEditTask()} placeholder="Task name"/><div className="modal-btns"><button className="btn-c" onClick={()=>setShowEditTask(false)}>Cancel</button><button className="btn-ok" onClick={saveEditTask}>Save</button></div></div></div>)}
      {showRenameModal&&(<div className="overlay" onClick={()=>setShowRenameModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title">Edit Folder</div><div className="modal-lbl">Name</div><input className="modal-in" value={renameText} autoFocus onChange={e=>setRenameText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveRename()} placeholder="Folder name"/><div className="modal-lbl">Monthly value (optional)</div><div style={{position:"relative",marginBottom:16}}><span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"var(--mu)",fontSize:".9rem",fontWeight:600}}>$</span><input className="modal-in" style={{paddingLeft:28,marginBottom:0}} value={renameValue} onChange={e=>setRenameValue(e.target.value.replace(/[^0-9.]/g,""))} placeholder="0" type="text" inputMode="decimal"/></div><div className="modal-btns"><button className="btn-c" onClick={()=>setShowRenameModal(false)}>Cancel</button><button className="btn-ok" onClick={saveRename}>Save</button></div></div></div>)}
      {showFolderModal&&(<div className="overlay" onClick={()=>setShowFolderModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title">New Folder</div><div className="modal-lbl">Name</div><input className="modal-in" value={nfName} autoFocus onChange={e=>setNfName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createFolder()} placeholder="e.g. Ajay Sharma"/><div className="modal-lbl">Monthly value (optional)</div><div style={{position:"relative",marginBottom:16}}><span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"var(--mu)",fontSize:".9rem",fontWeight:600}}>$</span><input className="modal-in" style={{paddingLeft:28,marginBottom:0}} value={nfValue} onChange={e=>setNfValue(e.target.value.replace(/[^0-9.]/g,""))} placeholder="0" type="text" inputMode="decimal"/></div><div className="modal-lbl">Icon</div><div className="icon-grid">{ICON_OPTIONS.map(icon=><div key={icon} className={`icon-opt${nfIcon===icon?" sel":""}`} onClick={()=>setNfIcon(icon)}>{icon}</div>)}</div><div className="modal-lbl">Color</div><div className="swatches">{COLORS.map(c=><div key={c} className={`sw${nfColor===c?" sel":""}`} style={{background:c}} onClick={()=>setNfColor(c)}/>)}</div><div className="folder-preview" style={{background:`linear-gradient(135deg,${nfColor}dd,${nfColor}99)`}}><span style={{fontSize:"1.3rem"}}>{nfIcon}</span><span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:".9rem",color:"#fff"}}>{nfName||"Folder name"}</span></div><div className="modal-btns"><button className="btn-c" onClick={()=>setShowFolderModal(false)}>Cancel</button><button className="btn-ok" onClick={createFolder}>Create</button></div></div></div>)}
      {showHoursModal&&(<div className="overlay" onClick={()=>setShowHoursModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title">Set Work Hours</div><div className="modal-lbl">Daily goal for {hoursDay?DAYS[DAY_KEYS.indexOf(hoursDay)]:""}</div><div className="hr-presets">{HR_PRESET.map(h=><button key={h} className={`hp${pendingHrs===h?" sel":""}`} onClick={()=>setPendingHrs(h)}>{h} hrs</button>)}</div><div style={{fontSize:".8rem",color:"var(--mu)",marginBottom:18}}>Tracks against actual time worked on tasks.</div><div className="modal-btns"><button className="btn-c" onClick={()=>setShowHoursModal(false)}>Cancel</button><button className="btn-ok" onClick={saveHours}>Save</button></div></div></div>)}
      {showPaymentModal&&(<div className="overlay" onClick={()=>setShowPaymentModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title">Add One-time Payment</div><div className="modal-lbl">Amount</div><div style={{position:"relative",marginBottom:16}}><span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"var(--mu)",fontSize:".9rem",fontWeight:600}}>$</span><input className="modal-in" style={{paddingLeft:28,marginBottom:0}} value={paymentAmount} autoFocus onChange={e=>setPaymentAmount(e.target.value.replace(/[^0-9.]/g,""))} placeholder="0" type="text" inputMode="decimal"/></div><div className="modal-lbl">Note (optional)</div><input className="modal-in" value={paymentNote} onChange={e=>setPaymentNote(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addPayment()} placeholder="e.g. Website redesign"/><div className="modal-btns"><button className="btn-c" onClick={()=>setShowPaymentModal(false)}>Cancel</button><button className="btn-ok" onClick={addPayment} disabled={!paymentAmount}>Add</button></div></div></div>)}
      {showExpenseModal&&(<div className="overlay" onClick={()=>setShowExpenseModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title">{editingExp?"Edit":"Add"} Expense</div><div className="modal-lbl">Name</div><input className="modal-in" value={expName} autoFocus onChange={e=>setExpName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveExpense()} placeholder="e.g. Mortgage, Slack, Ads..."/><div className="modal-lbl">Amount ($)</div><div style={{position:"relative",marginBottom:16}}><span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"var(--mu)",fontSize:".9rem",fontWeight:600}}>$</span><input className="modal-in" style={{paddingLeft:28,marginBottom:0}} value={expAmount} onChange={e=>setExpAmount(e.target.value.replace(/[^0-9.]/g,""))} placeholder="0" type="text" inputMode="decimal"/></div><div className="modal-lbl">Type</div><div style={{display:"flex",gap:8,marginBottom:16}}><button onClick={()=>setExpType("fixed")} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${expType==="fixed"?"var(--ac)":"var(--b2)"}`,background:expType==="fixed"?"#c8ff5715":"var(--s)",color:expType==="fixed"?"var(--ac)":"var(--mu)",cursor:"pointer",fontWeight:600,fontSize:".85rem"}}>Fixed</button><button onClick={()=>setExpType("variable")} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${expType==="variable"?"var(--ac)":"var(--b2)"}`,background:expType==="variable"?"#c8ff5715":"var(--s)",color:expType==="variable"?"var(--ac)":"var(--mu)",cursor:"pointer",fontWeight:600,fontSize:".85rem"}}>Variable</button></div><div className="modal-lbl">Category</div><div style={{display:"flex",gap:8,marginBottom:20}}><button onClick={()=>setExpCategory("business")} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${expCategory==="business"?"#ef4444":"var(--b2)"}`,background:expCategory==="business"?"#ef444415":"var(--s)",color:expCategory==="business"?"#ef4444":"var(--mu)",cursor:"pointer",fontWeight:600,fontSize:".85rem"}}>Business</button><button onClick={()=>setExpCategory("personal")} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${expCategory==="personal"?"#fb923c":"var(--b2)"}`,background:expCategory==="personal"?"#fb923c15":"var(--s)",color:expCategory==="personal"?"#fb923c":"var(--mu)",cursor:"pointer",fontWeight:600,fontSize:".85rem"}}>Personal</button></div><div style={{fontSize:".78rem",color:"var(--mu)",marginBottom:16,lineHeight:1.6}}>{expType==="fixed"?"Fixed expenses repeat every month automatically.":"Variable expenses let you enter the actual amount each month."}</div><div className="modal-btns"><button className="btn-c" onClick={()=>setShowExpenseModal(false)}>Cancel</button><button className="btn-ok" onClick={saveExpense} disabled={!expName.trim()||!expAmount}>Save</button></div></div></div>)}
      {showCallModal&&(
        <div className="overlay" onClick={()=>setShowCallModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Log {callType==="client"?"Client":"Outreach"} Call</div>
            <div className="modal-lbl">Duration (minutes)</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
              {[5,10,15,20,30,45,60].map(m=>(
                <button key={m} onClick={()=>setCallDuration(String(m))} style={{background:callDuration===String(m)?"var(--ac)":"var(--s)",border:`1px solid ${callDuration===String(m)?"var(--ac)":"var(--b2)"}`,color:callDuration===String(m)?"#000":"var(--tx2)",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".85rem",transition:"all .15s"}}>{m}</button>
              ))}
            </div>
            <input className="modal-in" value={callDuration} onChange={e=>setCallDuration(e.target.value.replace(/[^0-9]/g,""))} placeholder="Or type custom minutes" type="text" inputMode="numeric"/>
            {callType==="client"&&(
              <>
                <div className="modal-lbl">Client (optional)</div>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16,maxHeight:160,overflowY:"auto"}}>
                  <button onClick={()=>setCallFolder(null)} style={{background:callFolder===null?"rgba(200,255,87,.12)":"var(--s)",border:`1px solid ${callFolder===null?"var(--ac)":"var(--b2)"}`,color:callFolder===null?"var(--ac)":"var(--tx2)",borderRadius:9,padding:"9px 14px",cursor:"pointer",fontWeight:600,fontSize:".82rem",textAlign:"left",transition:"all .15s"}}>No specific client</button>
                  {folders.map(f=>(
                    <button key={f.id} onClick={()=>setCallFolder(f.id)} style={{background:callFolder===f.id?"rgba(200,255,87,.12)":"var(--s)",border:`1px solid ${callFolder===f.id?"var(--ac)":"var(--b2)"}`,color:callFolder===f.id?"var(--ac)":"var(--tx2)",borderRadius:9,padding:"9px 14px",cursor:"pointer",fontWeight:600,fontSize:".82rem",textAlign:"left",display:"flex",alignItems:"center",gap:8,transition:"all .15s"}}>
                      <span>{f.icon}</span><span>{f.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="modal-btns">
              <button className="btn-c" onClick={()=>setShowCallModal(false)}>Cancel</button>
              <button className="btn-ok" onClick={logCall} disabled={!callDuration}>Log Call</button>
            </div>
          </div>
        </div>
      )}
      {showCallGoalModal&&(
        <div className="overlay" onClick={()=>setShowCallGoalModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Daily Call Goals</div>
            <div className="modal-lbl">Client calls goal</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
              {[3,5,8,10,15,20].map(n=>(
                <button key={n} onClick={()=>setPendingClientGoal(n)} style={{background:pendingClientGoal===n?"var(--ac)":"var(--s)",border:`1px solid ${pendingClientGoal===n?"var(--ac)":"var(--b2)"}`,color:pendingClientGoal===n?"#000":"var(--tx2)",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".85rem",transition:"all .15s"}}>{n}</button>
              ))}
            </div>
            <div className="modal-lbl">Outreach calls goal</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
              {[5,10,15,20,25,30].map(n=>(
                <button key={n} onClick={()=>setPendingOutreachGoal(n)} style={{background:pendingOutreachGoal===n?"var(--ac)":"var(--s)",border:`1px solid ${pendingOutreachGoal===n?"var(--ac)":"var(--b2)"}`,color:pendingOutreachGoal===n?"#000":"var(--tx2)",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".85rem",transition:"all .15s"}}>{n}</button>
              ))}
            </div>
            <div className="modal-btns">
              <button className="btn-c" onClick={()=>setShowCallGoalModal(false)}>Cancel</button>
              <button className="btn-ok" onClick={saveCallGoals}>Save</button>
            </div>
          </div>
        </div>
      )}
      {showWeekGoalModal&&(
        <div className="overlay" onClick={()=>setShowWeekGoalModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Weekly Hour Goal</div>
            <div className="modal-lbl">Hours per week</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
              {[20,25,30,35,40,45,50,55,60].map(h=>(
                <button key={h} onClick={()=>setPendingWeekGoal(h)} style={{background:pendingWeekGoal===h?"var(--ac)":"var(--s)",border:`1px solid ${pendingWeekGoal===h?"var(--ac)":"var(--b2)"}`,color:pendingWeekGoal===h?"#000":"var(--tx2)",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".85rem",transition:"all .15s"}}>{h}</button>
              ))}
            </div>
            <div style={{fontSize:".78rem",color:"var(--mu)",marginBottom:18,lineHeight:1.6}}>Your weekly progress and This Week vs Last Week both use this goal.</div>
            <div className="modal-btns">
              <button className="btn-c" onClick={()=>setShowWeekGoalModal(false)}>Cancel</button>
              <button className="btn-ok" onClick={()=>{setWeeklyGoal(pendingWeekGoal);setShowWeekGoalModal(false);}}>Save</button>
            </div>
          </div>
        </div>
      )}
      {showSnoozeModal&&snoozingFolder&&(
        <div className="overlay" onClick={()=>setShowSnoozeModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Snooze {snoozingFolder.name}</div>
            <div style={{fontSize:".82rem",color:"var(--mu)",marginBottom:18,lineHeight:1.6}}>Hide from Chase These for how long? Resets automatically when you work on this client.</div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
              {[[3,"3 days"],[7,"1 week"],[14,"2 weeks"],[30,"1 month"],[90,"3 months"]].map(([days,label])=>(
                <button key={days} onClick={()=>snoozeFolder(snoozingFolder.id,days)} style={{background:"var(--s)",border:"1px solid var(--b2)",color:"var(--tx)",borderRadius:10,padding:"12px 16px",cursor:"pointer",fontSize:".9rem",fontWeight:600,textAlign:"left",transition:"all .15s",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>{label}</span><span style={{color:"var(--mu)",fontSize:".8rem"}}>›</span>
                </button>
              ))}
            </div>
            <button className="btn-c" style={{width:"100%",textAlign:"center"}} onClick={()=>setShowSnoozeModal(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
