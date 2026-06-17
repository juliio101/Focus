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
const LOCK_DURS=[5,10,15,20,25,30];

const dStr=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const todayIdx=()=>(new Date().getDay()+6)%7;
const todayKey=()=>DAY_KEYS[todayIdx()];
const dateForDK=dk=>{const n=new Date();n.setHours(0,0,0,0);const d=new Date(n);d.setDate(n.getDate()+DAY_KEYS.indexOf(dk)-todayIdx());return dStr(d);};
const calcStreak=(dates=[],dh={})=>{
  const s=new Set(dates);
  const isWorkDay=d=>(dh[DAY_KEYS[(d.getDay()+6)%7]]??8)>0;
  let cur=new Date();cur.setHours(0,0,0,0);
  let count=0,iters=0;
  // Today: if it's a workday and not done yet, don't break — just don't count it, move to yesterday
  if(isWorkDay(cur)){
    if(s.has(dStr(cur))){count++;}
  }
  cur.setDate(cur.getDate()-1);
  while(iters++<366){
    if(isWorkDay(cur)){
      if(s.has(dStr(cur))){count++;cur.setDate(cur.getDate()-1);}
      else break;
    }else{
      cur.setDate(cur.getDate()-1); // rest day — skip, doesn't break streak
    }
  }
  return count;
};
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

const INIT_FOLDERS=[
  {id:1,name:"Client A",color:"#6366f1",icon:"⭐",monthlyValue:1200,status:"active"},
  {id:2,name:"Client B",color:"#34d399",icon:"🏢",monthlyValue:800,status:"active"},
  {id:3,name:"Client C",color:"#fb923c",icon:"💼",monthlyValue:500,status:"active"},
];
const INIT_TASKS=[
  {id:1,text:"Send weekly progress report",folderId:1,recurring:true,recurringDays:["fri"],doneOn:[],timerSeconds:3240,timerRunning:false,timerStartedAt:null,timeLog:{}},
  {id:2,text:"Review campaign performance",folderId:1,recurring:false,done:false,timerSeconds:1800,timerRunning:false,timerStartedAt:null,timeLog:{}},
  {id:3,text:"Follow up on invoice",folderId:2,recurring:false,done:false,timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{},dueDate:new Date(Date.now()-86400000).toISOString().split("T")[0]},
  {id:4,text:"Prepare strategy document",folderId:2,recurring:false,done:false,timerSeconds:5400,timerRunning:false,timerStartedAt:null,timeLog:{}},
  {id:5,text:"Monthly check-in call",folderId:3,recurring:true,recurringDays:["mon"],doneOn:[],timerSeconds:2700,timerRunning:false,timerStartedAt:null,timeLog:{}},
];

// ── Generates fresh example data with today's dates baked in ────────────────
// Why: the static INIT_FOLDERS/INIT_TASKS above are used for safety-check
// identity comparisons elsewhere and must stay untouched. This function
// builds a realistic, dated COPY for actual new signups — with positive
// signals (a completed task, logged hours, a logged call, collected
// retainers) so a brand-new account's Boss Score reflects a fair "Good"
// day instead of stacking every deduction at once.
const buildFreshExampleData=()=>{
  const dAgo=n=>dStr(new Date(Date.now()-n*86400000));
  const today=dAgo(0);
  const dueSoon=dStr(new Date(Date.now()+2*86400000));
  const mk=monthKey();
  // Most recent real activity is yesterday — keeps "neglected" check happy
  // and leaves today open/empty so the new user has a clean day to start on.
  const lastActiveDate=dAgo(1);

  const folders=INIT_FOLDERS.map(f=>({
    ...f,
    payments:[],
    subCollected:{[mk]:true},
    createdDate:dAgo(6),
  }));

  // Represents "what a solid week already looks like" — today is left empty
  // on purpose so the new user has their own first real session to add to.
  const tasks=[
    {id:1,text:"Send weekly progress report",folderId:1,recurring:true,recurringDays:["fri"],doneOn:[dAgo(3)],timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{[dAgo(3)]:23400}},
    {id:2,text:"Review campaign performance",folderId:1,recurring:false,done:true,completedDate:dAgo(1),timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{[dAgo(1)]:25200}},
    {id:3,text:"Follow up on invoice",folderId:2,recurring:false,done:false,timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{},dueDate:dueSoon},
    {id:4,text:"Prepare strategy document",folderId:2,recurring:false,done:true,completedDate:dAgo(2),timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{[dAgo(2)]:28800,[dAgo(4)]:25200}},
    {id:5,text:"Monthly check-in call",folderId:3,recurring:true,recurringDays:["mon"],doneOn:[dAgo(5)],timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{[dAgo(5)]:23400}},
  ];

  const calls={
    client:[
      {id:Date.now(),folderId:1,date:dAgo(1),duration:20},
      {id:Date.now()+1,folderId:2,date:dAgo(3),duration:15},
      {id:Date.now()+2,folderId:3,date:dAgo(5),duration:25},
    ],
    outreach:[],
    clientGoal:5,
    outreachGoal:20,
  };

  return{folders,tasks,calls};
};
// ← EXAMPLE DATA ABOVE. Replace with your own clients.
const EXAMPLE_DATA_BANNER=true;
const INIT_TASKS_OLD=[
  {id:1,text:"Check emails",folderId:1,recurring:true,recurringDays:["mon","tue","wed","thu","fri","sat","sun"],doneOn:[],timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{}},
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
  const [editTaskStartDate,setEditTaskStartDate]=useState(null);
  const [editTaskDueDate,setEditTaskDueDate]=useState(null);
  const [showManualTime,setShowManualTime]=useState(false);
  const [manualHrs,setManualHrs]=useState("");
  const [manualMins,setManualMins]=useState("");
  const [manualDate,setManualDate]=useState(dStr());
  const [showEditTime,setShowEditTime]=useState(false);
  const [editTimeVal,setEditTimeVal]=useState("");
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
  const [showProfile,setShowProfile]=useState(false);
  const [subscribed,setSubscribed]=useState(false);
  const [templates,setTemplates]=useState([]);
  const [showApplyTemplate,setShowApplyTemplate]=useState(false);
  const [showSaveTemplate,setShowSaveTemplate]=useState(false);
  const [templateNameInput,setTemplateNameInput]=useState("");
  const [templateTaskInputs,setTemplateTaskInputs]=useState([""]);
  const [showPaywall,setShowPaywall]=useState(false);
  const [checkoutLoading,setCheckoutLoading]=useState(false);
  const [selectedPlan,setSelectedPlan]=useState("monthly");
  const [deleteConfirm,setDeleteConfirm]=useState(null); // {type:'folder'|'task', id, name, folderId}
  const [isExampleData,setIsExampleData]=useState(false);
  const [trialStartDate,setTrialStartDate]=useState(null);
  const [notifPermission,setNotifPermission]=useState(typeof Notification!=="undefined"?Notification.permission:"denied");
  const [deferredInstallPrompt,setDeferredInstallPrompt]=useState(null);
  const [isStandalone,setIsStandalone]=useState(false);
  const [isIOS,setIsIOS]=useState(false);
  const [pendingClientGoal,setPendingClientGoal]=useState(5);
  const [pendingOutreachGoal,setPendingOutreachGoal]=useState(20);

  // Global tick removed — title/lock effects are now self-contained (see below). Live timer displays self-tick locally via useLiveSeconds.
  useEffect(()=>{if(activeTask){const u=tasks.find(t=>t.id===activeTask.id);if(u)setActiveTask(u);}},[tasks]);
  const tasksRef=useRef(tasks);
  useEffect(()=>{tasksRef.current=tasks;},[tasks]);

  // ── PWA install detection ─────────────────────────────────────────────────
  useEffect(()=>{
    const standalone=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;
    setIsStandalone(standalone);
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream);
    const handler=e=>{e.preventDefault();setDeferredInstallPrompt(e);};
    window.addEventListener("beforeinstallprompt",handler);
    return()=>window.removeEventListener("beforeinstallprompt",handler);
  },[]);

  const triggerInstall=async()=>{
    if(deferredInstallPrompt){
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      setDeferredInstallPrompt(null);
    }
  };
  useEffect(()=>{
    const updateTitle=()=>{
      const running=tasksRef.current.find(t=>t.timerRunning);
      if(running&&running.timerStartedAt){
        const secs=Math.floor((Date.now()-running.timerStartedAt)/1000);
        const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60;
        const time=h>0?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
        document.title=`${time} · effingFocus`;
      }else{
        document.title="effingFocus";
      }
    };
    updateTitle();
    const iv=setInterval(updateTitle,1000);
    return()=>clearInterval(iv);
  },[]);
  useEffect(()=>{
    if(!isLocked||!lockEndTime||lockDone)return;
    const checkExpiry=()=>{
      if(Date.now()>=lockEndTime){
        setLockDone(true);playWin();setConfetti(true);
        if(user)setDoc(doc(db,"users",user.uid),{activeLock:null},{merge:true}).catch(()=>{});
      }
    };
    checkExpiry();
    const iv=setInterval(checkExpiry,1000);
    return()=>clearInterval(iv);
  },[isLocked,lockEndTime,lockDone,user]);
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
          if(d.trialStartDate)setTrialStartDate(d.trialStartDate);
            if(d.templates)setTemplates(d.templates??[]);
            if(d.subscribed)setSubscribed(d.subscribed??false);
          if(d.isExampleData!==undefined)setIsExampleData(d.isExampleData);
          if(d.folderSnooze)setFolderSnooze(d.folderSnooze);
          if(d.userPin)setUserPin(d.userPin);
          if(d.activeLock&&d.activeLock.endTime>Date.now()){
            setIsLocked(true);setLockEndTime(d.activeLock.endTime);
            setLockedTaskId(d.activeLock.taskId);setLockedTaskDk(d.activeLock.taskDk);
          }
        }else{
          const trialStart=new Date().toISOString();
          const fresh=buildFreshExampleData();
          await setDoc(ref,{folders:fresh.folders,tasks:fresh.tasks,calls:fresh.calls,expenses:[],completedDates:[],bestStreak:0,dayHours:{},trialStartDate:trialStart,isExampleData:true},{merge:true});
          if(window.fbq)window.fbq('track','StartTrial');
          setFolders(fresh.folders);setTasks(fresh.tasks);setCalls(fresh.calls);setExpenses([]);setComplDates([]);setBest(0);setDayHours({});
          setTrialStartDate(trialStart);setIsExampleData(true);
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
          completedDates:complDates,bestStreak,templates,
          ...(trialStartDate&&{trialStartDate}),
          isExampleData
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
  // Calendar-week version of last week (Mon-Sun of the previous week) — for the
  // "vs last week" comparison, matching weekSecsTotal()'s Monday-start logic.
  const lastCalendarWeekSecs=()=>{
    const thisMon=new Date();thisMon.setHours(0,0,0,0);thisMon.setDate(thisMon.getDate()-todayIdx());
    const lastMon=new Date(thisMon);lastMon.setDate(thisMon.getDate()-7);
    let total=0;
    tasks.forEach(t=>{Object.entries(t.timeLog??{}).forEach(([date,s])=>{
      const d=new Date(date+"T00:00:00");
      if(d>=lastMon&&d<thisMon)total+=s;
    });});
    [...(calls.client??[]),...(calls.outreach??[])].forEach(c=>{
      const d=new Date(c.date+"T00:00:00");
      if(d>=lastMon&&d<thisMon)total+=c.duration*60;
    });
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
  const deleteTask=(e,id)=>{
    e.stopPropagation();
    const t=tasks.find(x=>x.id===id);
    setDeleteConfirm({type:"task",id,name:t?.text||"this task"});
  };
  const confirmDeleteTask=id=>{setTasks(p=>p.filter(t=>t.id!==id));setDeleteConfirm(null);if(activeTask?.id===id)setActiveTask(null);};
  const uncompleteTask=()=>{if(!activeTask)return;const dk=activeTaskDk;setTasks(prev=>prev.map(t=>{if(t.id!==activeTask.id)return t;if(!t.recurring)return{...t,done:false,completedDate:null};return{...t,doneOn:(t.doneOn??[]).filter(d=>d!==dateForDK(dk))};}));goBack();};
  const deleteActiveTask=()=>{if(!activeTask)return;setTasks(p=>p.filter(t=>t.id!==activeTask.id));goBack();};
  const saveEditTask=()=>{
    const txt=editTaskText.trim();if(!txt)return;
    setTasks(p=>p.map(t=>t.id===activeTask.id?{
      ...t,text:txt,
      startDate:editTaskStartDate||t.startDate,
      dueDate:editTaskDueDate!==undefined?editTaskDueDate:t.dueDate,
    }:t));
    setShowEditTask(false);
  };

  const addManualTime=()=>{
    const h=parseInt(manualHrs)||0,m=parseInt(manualMins)||0;
    const totalSecs=h*3600+m*60;
    if(!totalSecs||!activeTask)return;
    setTasks(p=>p.map(t=>{
      if(t.id!==activeTask.id)return t;
      const log={...(t.timeLog??{})};
      log[manualDate]=(log[manualDate]??0)+totalSecs;
      return{...t,timeLog:log,timerSeconds:(t.timerSeconds??0)+totalSecs};
    }));
    setManualHrs("");setManualMins("");setShowManualTime(false);
  };

  const saveEditTime=()=>{
    const parts=editTimeVal.split(":").map(Number);
    let secs=0;
    if(parts.length===3)secs=parts[0]*3600+parts[1]*60+parts[2];
    else if(parts.length===2)secs=parts[0]*3600+parts[1]*60;
    if(!activeTask)return;
    const dk=activeTaskDk||todayKey();
    const date=dateForDK?.(dk)||dStr();
    setTasks(p=>p.map(t=>{
      if(t.id!==activeTask.id)return t;
      const log={...(t.timeLog??{})};
      log[date]=secs;
      const totalLogged=Object.values(log).reduce((s,v)=>s+v,0);
      return{...t,timeLog:log,timerSeconds:totalLogged};
    }));
    setShowEditTime(false);
  };

  const completeTask=(remindDays=null)=>{
    if(!activeTask)return;
    const dk=activeTaskDk;const now=Date.now();playCheck();
    setTasks(prev=>{
      let next=prev.map(t=>{
        if(t.id!==activeTask.id)return t;
        let ts=t.timerSeconds??0;const log={...(t.timeLog??{})};
        if(t.timerRunning&&t.timerStartedAt){const el=Math.floor((now-t.timerStartedAt)/1000);const date=dStr(new Date(t.timerStartedAt));log[date]=(log[date]??0)+el;ts+=el;}
        if(!t.recurring)return{...t,done:true,completedDate:dStr(),timerRunning:false,timerStartedAt:null,timerSeconds:ts,timeLog:log};
        return{...t,doneOn:[...(t.doneOn??[]),dateForDK(dk)],timerRunning:false,timerStartedAt:null,timerSeconds:ts,timeLog:log};
      });
      if(remindDays){const f=new Date();f.setDate(f.getDate()+remindDays);f.setHours(0,0,0,0);next=[...next,{id:Date.now(),text:activeTask.text,folderId:activeTask.folderId,recurring:false,day:DAY_KEYS[(f.getDay()+6)%7],startDate:dStr(f),done:false,timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{},isReminder:true}];}
      const dayT=next.filter(t=>(!t.recurring&&(t.day===dk||t.startDate===dateForDK(dk)))||(t.recurring&&t.recurringDays?.includes(dk)));
      const allDone=dayT.length>0&&dayT.every(t=>!t.recurring?t.done:(t.doneOn??[]).includes(dateForDK(dk)));
      if(allDone){
        setTimeout(()=>{playWin();setConfetti(true);},100);
        if(dk===todayKey()){
          const newDates=complDates.includes(dStr())?complDates:[...complDates,dStr()];
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

  const createFolder=()=>{const n=nfName.trim();if(!n)return;setFolders(p=>[...p,{id:Date.now(),name:n,color:nfColor,icon:nfIcon,monthlyValue:parseFloat(nfValue)||0,payments:[],subCollected:{},prospect:nfProspect,archived:false,paused:false,createdDate:dStr()}]);setNfName("");setNfColor(COLORS[0]);setNfIcon(ICON_OPTIONS[0]);setNfValue("");setNfProspect(false);setShowFolderModal(false);};
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
  const deleteFolder=fid=>{
    const f=folders.find(x=>x.id===fid);
    setDeleteConfirm({type:"folder",id:fid,name:f?.name||"this client",taskCount:tasks.filter(t=>t.folderId===fid).length});
  };
  const confirmDeleteFolder=fid=>{setFolders(p=>p.filter(f=>f.id!==fid));setTasks(p=>p.filter(t=>t.folderId!==fid));setDeleteConfirm(null);goHome();};
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
    // If truly no activity yet — base it on how long the client has existed,
    // not a hardcoded "always neglected" value. New clients get a fair grace period.
    if(!latest){
      const folder=folders.find(fo=>fo.id===fid);
      if(folder?.createdDate)return Math.floor((new Date()-new Date(folder.createdDate+'T00:00:00'))/86400000);
      return 999;
    }
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
  const streak=calcStreak(complDates,dayHours);

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
    const [,bump]=useState(0);useEffect(()=>{if(!task.timerRunning)return;const iv=setInterval(()=>bump(x=>x+1),1000);return()=>clearInterval(iv);},[task.timerRunning]);
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
    const [,bump]=useState(0);useEffect(()=>{if(!tasks.some(t=>t.timerRunning))return;const iv=setInterval(()=>bump(x=>x+1),1000);return()=>clearInterval(iv);},[tasks]);
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


  const TimeHeroCard=({dk})=>{
    const [,bump]=useState(0);useEffect(()=>{if(!tasks.some(t=>t.timerRunning))return;const iv=setInterval(()=>bump(x=>x+1),1000);return()=>clearInterval(iv);},[tasks]);
    const st=secsTracked(dk),pct=hoursPct(dk);
    const isRunning=tasks.some(t=>t.timerRunning);
    const r=36,circ=2*Math.PI*r,offset=circ*(1-Math.min(pct,100)/100);
    return(
      <div className={`time-hero-card${isRunning?" running":""}`}>
        <div className="time-hero-content">
          <div className="time-hero-label">Time Tracked Today</div>
          <div className="time-hero-timer" style={{color:isRunning?"var(--ac)":"var(--tx)"}}>{fmtTimer(st)}</div>
          <div className="time-hero-sub">of {hoursFor(dk)} hr goal · <span style={{color:pct>=75?"var(--ac)":pct>=50?"#fb923c":"#ef4444"}}>{pct}%</span></div>
          <div className="time-hero-bar"><div className="time-hero-bar-fill" style={{width:`${pct}%`,minWidth:st>0?"4px":"0"}}/></div>
          {isRunning&&<div className="time-hero-running"><div className="running-dot"/><span>Timer running</span></div>}
        </div>
        <div className="time-hero-arc" onClick={()=>{setPendingWeekGoal(weeklyGoal);setShowWeekGoalModal(true);}}>
          <svg width="90" height="90" style={{transform:"rotate(-90deg)",display:"block",flexShrink:0}}>
            <circle cx="45" cy="45" r={r} fill="none" stroke="#1c1c1c" strokeWidth="8"/>
            <circle cx="45" cy="45" r={r} fill="none" stroke={isRunning?"#c8ff57":"#2a2a2a"} strokeWidth="8" strokeLinecap="round" strokeDasharray={circ.toFixed(1)} strokeDashoffset={offset.toFixed(1)} style={{transition:"stroke-dashoffset .8s cubic-bezier(.34,1.56,.64,1)"}}/>
          </svg>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:".88rem",color:isRunning?"var(--ac)":"var(--tx2)"}}>{pct}%</div>
        </div>
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
    const [,bump]=useState(0);useEffect(()=>{if(!tasks.some(t=>t.timerRunning))return;const iv=setInterval(()=>bump(x=>x+1),1000);return()=>clearInterval(iv);},[tasks]);
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


  const DesktopSidebar=()=>{
    const activeFolders=folders.filter(f=>!f.archived&&!f.paused&&!f.prospect)
      .sort((a,b)=>lastActivityDays(a.id)-lastActivityDays(b.id))
      .slice(0,5);
    const isActive=v=>(v==="today"&&(view==="home"||view==="today"))||(v==="tasks"&&(view==="all"))||(v==="clients"&&(view==="clients"||(view==="folder")))||(v==="money"&&view==="money")||(v==="insights"&&view==="reports");
    return(
      <div className="desktop-sidebar">
        <div className="ds-top">
          <div className="logo" style={{fontSize:"1rem",padding:"18px 16px 14px",borderBottom:"1px solid var(--b)",display:"block"}}>effingFocus<em>.</em></div>
        </div>
        <nav className="ds-nav">
          {[["today","⏱","Today"],["tasks","📋","Tasks"],["clients","👥","Clients"],["money","💰","Money"],["insights","📈","Insights"]].map(([v,ic,lbl])=>(
            <div key={v} className={`ds-nav-item${isActive(v)?" active":""}`} onClick={()=>{if(v==="today")goHome();else if(v==="tasks")setView("all");else if(v==="insights")setView("reports");else setView(v);}}>
              <span className="ds-nav-icon">{ic}</span><span>{lbl}</span>
              {isActive(v)&&<div className="ds-nav-dot"/>}
            </div>
          ))}
        </nav>
        <div className="ds-section-lbl">Recent Clients</div>
        <div className="ds-client-list">
          {activeFolders.map(f=>(
            <div key={f.id} className={`ds-client-item${activeFolder===f.id&&view==="folder"?" active":""}`} onClick={()=>goFolder(f.id)}>
              <div className="ds-cdot" style={{background:f.color}}/>
              <span className="ds-cname">{f.name}</span>
              {(f.monthlyValue||0)>0&&<span className="ds-cmrr">${f.monthlyValue.toLocaleString()}</span>}
            </div>
          ))}
          <div className="ds-client-item ds-add-client" onClick={()=>setShowFolderModal(true)}>
            <div style={{width:7,height:7,borderRadius:"50%",border:"1px dashed #333",flexShrink:0}}/>
            <span style={{color:"var(--mu)"}}>New client</span>
          </div>
          <div className="ds-client-item" onClick={()=>setView("clients")} style={{marginTop:4,borderTop:"1px solid #1a1a1a",paddingTop:10}}>
            <span style={{color:"#6366f1",fontSize:".8rem",fontWeight:700}}>View all clients →</span>
          </div>
        </div>
        {/* Profile button at bottom of sidebar */}
        <div style={{marginTop:"auto",borderTop:"1px solid #1a1a1a",padding:"12px 12px"}}>
          <div onClick={()=>setShowProfile(true)} style={{
            display:"flex",alignItems:"center",gap:10,cursor:"pointer",
            padding:"8px 10px",borderRadius:10,
            transition:"background .15s",
          }}
          onMouseEnter={e=>e.currentTarget.style.background="#1a1a1a"}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}
          >
            {user?.photoURL
              ?<img src={user.photoURL} style={{width:30,height:30,borderRadius:"50%",border:"1.5px solid #2a2a2a",flexShrink:0}} alt=""/>
              :<div style={{width:30,height:30,borderRadius:"50%",background:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".85rem",flexShrink:0}}>👤</div>
            }
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:".78rem",fontWeight:700,color:"var(--tx)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.displayName?.split(" ")[0]||"Profile"}</div>
              <div style={{fontSize:".65rem",color:"var(--mu)"}}>Settings & billing</div>
            </div>
            <span style={{fontSize:".7rem",color:"var(--mu)"}}>⚙️</span>
          </div>
        </div>
        <div className="ds-bottom">
          {user?.photoURL&&<img src={user.photoURL} className="avatar" alt=""/>}
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:".82rem",fontWeight:700,color:"var(--tx2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.displayName?.split(" ")[0]}</div><div style={{fontSize:".7rem",color:"var(--mu)"}}>Pro</div></div>
          <button className="signout-btn" onClick={async()=>{const running=tasks.find(t=>t.timerRunning);if(running){pauseTimer(running.id);await new Promise(r=>setTimeout(r,400));}signOut(auth);}}>Out</button>
        </div>
      </div>
    );
  };


  const calcBossScore=()=>{
    try{
    const todayStr=dStr();
    const activeClientIds=new Set(folders.filter(f=>!f.archived&&!f.paused&&!f.prospect).map(f=>f.id));
    const allCalls=[...(calls.client??[]),...(calls.outreach??[])];

    // ── Deductions — current state, applied equally to both windows ─────────
    const overdueTasks=tasks.filter(t=>!t.done&&!t.recurring&&t.dueDate&&t.dueDate<todayStr&&activeClientIds.has(t.folderId));
    const neglected=[...activeClientIds].map(id=>folders.find(f=>f.id===id)).filter(f=>f&&lastActivityDays(f.id)>=7);
    const mk=monthKey();
    const pendingPay=[...activeClientIds].map(id=>folders.find(f=>f.id===id)).filter(f=>f&&(f.monthlyValue||0)>0&&!(f.subCollected??{})[mk]);
    const deductions=Math.min(24,overdueTasks.length*12)+Math.min(16,neglected.length*8)+Math.min(10,pendingPay.length*5);

    // ── Rolling 7-day window — offset 0 = today...6 days ago, offset 1 = yesterday...7 days ago ─
    const computeWindow=startOffset=>{
      let hoursProgressTotal=0,bonusHrsTotal=0,taskCount=0,callCount=0,activeDaysCount=0;
      for(let i=startOffset;i<startOffset+7;i++){
        const d=new Date(Date.now()-i*86400000);
        const dateStr=dStr(d);
        const dayKey=DAY_KEYS[(d.getDay()+6)%7];
        const goalHrs=dayHours[dayKey]??8;
        const actualSecs=tasks.reduce((s,t)=>s+(t.timeLog?.[dateStr]??0),0);
        const actualHrs=actualSecs/3600;

        if(goalHrs>0){
          hoursProgressTotal+=Math.min(1,actualHrs/goalHrs);
          if(actualHrs>goalHrs)bonusHrsTotal+=(actualHrs-goalHrs);
        }else if(actualHrs>0){
          bonusHrsTotal+=actualHrs; // worked on a rest day — pure bonus
        }

        if(actualHrs>0)activeDaysCount++;

        const doneRec=tasks.filter(t=>t.recurring&&(t.doneOn??[]).includes(dateStr)&&activeClientIds.has(t.folderId)).length;
        const doneNR=tasks.filter(t=>!t.recurring&&t.completedDate===dateStr&&activeClientIds.has(t.folderId)).length;
        taskCount+=doneRec+doneNR;

        callCount+=allCalls.filter(c=>c.date===dateStr).length;
      }

      let s=15; // base
      s+=Math.round((hoursProgressTotal/7)*40); // up to +40 — hours vs goal, averaged over the week
      s+=Math.min(10,Math.round(bonusHrsTotal)); // +1 per hour of overtime/rest-day work, max +10
      s+=Math.min(15,taskCount*3); // up to +15
      s+=Math.min(10,callCount*2); // up to +10
      s+=Math.min(10,activeDaysCount*2); // up to +10
      s-=deductions;
      return Math.max(0,Math.min(100,Math.round(s)));
    };

    const score=computeWindow(0);
    const yesterdayScore=computeWindow(1);
    const delta=score-yesterdayScore;

    // ── Tips — based on today specifically, then deductions ─────────────────
    const tips=[];
    const todayKeyDk=DAY_KEYS[(new Date().getDay()+6)%7];
    const todayGoalHrs=dayHours[todayKeyDk]??8;
    const todaySecs=tasks.reduce((s,t)=>s+(t.timeLog?.[todayStr]??0),0);
    const todayHrs=todaySecs/3600;
    if(todayGoalHrs>0){
      if(todayHrs===0)tips.push("No time tracked today. Start the timer.");
      else if(todayHrs<todayGoalHrs*0.5)tips.push(`${Math.round((todayHrs/todayGoalHrs)*100)}% of today's goal done. Keep pushing.`);
      else if(todayHrs>todayGoalHrs)tips.push("You're putting in extra hours today. That counts.");
    }else if(todayHrs>0){
      tips.push("Working on your day off? That's bonus points.");
    }

    if(overdueTasks.length>0)tips.push(`${overdueTasks.length} overdue task${overdueTasks.length>1?"s":""} pulling your score down.`);
    if(neglected.length>0&&!tips.length)tips.push(`${neglected.length} client${neglected.length>1?"s haven't":"hasn't"} heard from you in 7+ days.`);
    if(pendingPay.length>0&&!tips.length)tips.push(`${pendingPay.length} payment${pendingPay.length>1?"s":""} pending this month.`);

    if(!tips.length){
      if(delta>0)tips.push(`Trending up — your score is +${delta} from yesterday.`);
      else if(delta<0)tips.push(`Trending down — your score is ${delta} from yesterday.`);
    }

    let band,color,emoji;
    if(score>=85){band="Excellent";color="#34d399";emoji="🟢";}
    else if(score>=65){band="Good";color="#a3e635";emoji="🟡";}
    else if(score>=45){band="Fair";color="#fbbf24";emoji="🟡";}
    else if(score>=25){band="At Risk";color="#fb923c";emoji="🟠";}
    else{band="Critical";color="#ef4444";emoji="🔴";}
    const tip=tips.length>0?tips[0]:"Your boss is impressed. Keep it up.";
    return{score,band,color,emoji,tip,delta};
    }catch(e){console.error("Boss score error:",e);return{score:50,band:"Fair",color:"#fbbf24",emoji:"🟡",tip:"Tracking your progress...",delta:0};}
  };

  const DesktopRightPanel=()=>{
    const dk=todayKey(),st=secsTracked(dk),pct=hoursPct(dk);
    const running=tasks.find(t=>t.timerRunning);
    const doneTasks=tasksForDay(dk).filter(t=>isDone(t,dk)).length;
    const totalTasks=tasksForDay(dk).length;
    const mk=monthKey(),today=dStr();
    const topFocus=folders.filter(f=>!f.archived&&!f.paused&&!f.prospect&&!isSnoozed(f.id)).map(f=>{
      const ft=tasks.filter(t=>t.folderId===f.id);
      const days=lastActivityDays(f.id);
      const hasOverdue=ft.some(t=>!t.done&&!t.recurring&&t.dueDate&&t.dueDate<today);
      const subPending=(f.monthlyValue||0)>0&&!(f.subCollected??{})[mk];
      let priority=0,reason="";
      if(hasOverdue){priority=4;reason="Overdue tasks";}
      else if(subPending&&days>=3){priority=3;reason="Payment pending";}
      else if(days>=5){priority=1;reason=`${days===999?"No activity":days+"d"} no activity`;}
      return{f,priority,reason};
    }).filter(p=>p.priority>0).sort((a,b)=>b.priority-a.priority)[0];
    return(
      <div className="desktop-right">
        <div className="dr-section">
          {(()=>{
            let score=50,band="Fair",color="#fbbf24",tip="Tracking your progress...",delta=0;
            try{const r=calcBossScore();score=r.score;band=r.band;color=r.color;tip=r.tip;delta=r.delta??0;}catch(e){}
            return(
              <>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                  <div className="dr-label" style={{marginBottom:0}}>Boss Score</div>
                  {delta!==0&&(
                    <div style={{display:"flex",alignItems:"center",gap:3,background:`${delta>0?"#34d399":"#ef4444"}15`,borderRadius:99,padding:"3px 9px"}}>
                      <span style={{fontSize:".68rem",fontWeight:800,color:delta>0?"#34d399":"#ef4444"}}>{delta>0?"▲":"▼"} {Math.abs(delta)}</span>
                    </div>
                  )}
                </div>
                <div style={{textAlign:"center",marginBottom:10}}>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:"3.8rem",fontWeight:700,color:color,letterSpacing:"-3px",lineHeight:1,marginBottom:8}}>{score}</div>
                  <div style={{display:"inline-flex",alignItems:"center",gap:6,background:`${color}15`,border:`1px solid ${color}30`,borderRadius:99,padding:"4px 14px",marginBottom:8}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:color}}/>
                    <span style={{fontSize:".75rem",fontWeight:700,color:color}}>{band}</span>
                  </div>
                  <div style={{fontSize:".66rem",color:"var(--mu)",lineHeight:1.5}}>Builds over your last 7 days —<br/>today's effort shows up more each day after.</div>
                </div>
                <div style={{height:4,background:"var(--b2)",borderRadius:99,marginBottom:12,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${score}%`,background:`linear-gradient(90deg,${score<45?"#ef4444":score<65?"#fbbf24":color},${color})`,borderRadius:99,transition:"width .6s ease"}}/>
                </div>
                <div style={{background:`${color}08`,border:`1px solid ${color}20`,borderRadius:10,padding:"10px 12px",fontSize:".75rem",color:"var(--tx2)",lineHeight:1.6,fontStyle:"italic"}}>"{tip}"</div>
              </>
            );
          })()}
        </div>
        {topFocus&&(
          <div className="dr-section">
            <div className="dr-label">🎯 Focus Now</div>
            <div className="dr-focus-card" onClick={()=>goFolder(topFocus.f.id)}>
              <span style={{fontSize:"1.1rem",flexShrink:0}}>{topFocus.f.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:".85rem",fontWeight:700,color:"#fb923c",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{topFocus.f.name}</div>
                <div style={{fontSize:".7rem",color:"var(--mu)",marginTop:2}}>{topFocus.reason}</div>
              </div>
            </div>
          </div>
        )}
        <div className="dr-section">
          <div className="dr-label">Today</div>
          {[["Tasks done",`${doneTasks}/${totalTasks}`,"var(--ac)"],["Time tracked",fmtHrs(st/3600),"#fb923c"],["Progress",`${pct}%`,pct>=75?"var(--ac)":pct>=50?"#fb923c":"#ef4444"]].map(([k,v,c])=>(
            <div key={k} className="dr-stat-row"><span className="dr-stat-k">{k}</span><span className="dr-stat-v" style={{color:c}}>{v}</span></div>
          ))}
        </div>
        <div className="dr-section">
          <div className="dr-label">This Week</div>
          {(()=>{
            const curSecs=weekSecsTotal(),curHrs=curSecs/3600;
            const prevHrs=lastCalendarWeekSecs()/3600;
            const delta=curHrs-prevHrs;
            return(
              <>
                {[["Hours worked",fmtHrs(curHrs),"#a78bfa"],["Goal",`${weeklyGoal} hrs`,"var(--mu)"],["Progress",`${Math.round(Math.min(100,curHrs/weeklyGoal*100))}%`,"#a78bfa"]].map(([k,v,c])=>(
                  <div key={k} className="dr-stat-row"><span className="dr-stat-k">{k}</span><span className="dr-stat-v" style={{color:c}}>{v}</span></div>
                ))}
                <div className="dr-stat-row" style={{borderTop:"1px solid var(--b)",paddingTop:8,marginTop:4}}>
                  <span className="dr-stat-k">vs last week</span>
                  <span className="dr-stat-v" style={{color:delta>=0?"#34d399":"#ef4444",display:"flex",alignItems:"center",gap:3}}>
                    {prevHrs===0&&curHrs===0?"—":<>{delta>=0?"▲":"▼"} {fmtHrs(Math.abs(delta))}</>}
                  </span>
                </div>
                <div style={{fontSize:".68rem",color:"var(--mu)",marginTop:4}}>Last week: {fmtHrs(prevHrs)}</div>
              </>
            );
          })()}
        </div>
      </div>
    );
  };


  const ClientsView=()=>{
    const [search,setSearch]=useState("");
    const [filter,setFilter]=useState("all");
    const [sort,setSort]=useState("activity");
    const mk=monthKey();
    const totalMRR=folders.filter(f=>!f.archived&&!f.prospect&&!f.paused).reduce((s,f)=>s+(f.monthlyValue||0),0);

    const counts={
      all:folders.length,
      active:folders.filter(f=>!f.archived&&!f.paused&&!f.prospect).length,
      pending:folders.filter(f=>(f.monthlyValue||0)>0&&!(f.subCollected??{})[mk]&&!f.archived&&!f.prospect&&!f.paused).length,
      paused:folders.filter(f=>f.paused).length,
      archived:folders.filter(f=>f.archived).length,
      prospect:folders.filter(f=>f.prospect).length,
    };

    const filtered=[...folders]
      .filter(f=>{
        if(search&&!f.name.toLowerCase().includes(search.toLowerCase()))return false;
        if(filter==="active")return !f.archived&&!f.paused&&!f.prospect;
        if(filter==="paused")return f.paused;
        if(filter==="archived")return f.archived;
        if(filter==="prospect")return f.prospect;
        if(filter==="pending")return (f.monthlyValue||0)>0&&!(f.subCollected??{})[mk]&&!f.archived&&!f.prospect&&!f.paused;
        return true;
      })
      .sort((a,b)=>{
        if(sort==="name")return a.name.localeCompare(b.name);
        if(sort==="mrr")return (b.monthlyValue||0)-(a.monthlyValue||0);
        return lastActivityDays(a.id)-lastActivityDays(b.id);
      });

    const dk=todayKey();
    return(
      <div className="page">
        <div style={{marginBottom:20}}>
          <div className="view-title">Clients</div>
          <div style={{display:"flex",alignItems:"baseline",gap:8,marginTop:4}}>
            <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.6rem",color:"var(--ac)",letterSpacing:"-1px"}}>${totalMRR.toLocaleString()}</span>
            <span style={{fontSize:".82rem",color:"var(--mu)"}}>/ month</span>
          </div>
        </div>

        {/* Search */}
        <div style={{position:"relative",marginBottom:14}}>
          <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:"1rem",opacity:.4}}>🔍</span>
          <input
            className="clients-search"
            placeholder="Search clients..."
            value={search}
            onChange={e=>setSearch(e.target.value)}
            style={{width:"100%",background:"var(--s)",border:"1px solid var(--b2)",borderRadius:12,padding:"13px 16px 13px 40px",color:"var(--tx)",fontSize:16,outline:"none",fontFamily:"'Inter',sans-serif"}}
          />
          {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"var(--mu)",cursor:"pointer",fontSize:"1.1rem"}}>×</button>}
        </div>

        {/* Filter chips */}
        <div style={{display:"flex",gap:7,marginBottom:10,flexWrap:"wrap"}}>
          {[["all","All"],["active","Active"],["pending","Pending"],["paused","Paused"],["archived","Archived"],["prospect","Pipeline"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFilter(v)} style={{
              background:filter===v?"rgba(99,102,241,0.12)":"var(--s)",
              border:`1px solid ${filter===v?"rgba(99,102,241,0.4)":"var(--b2)"}`,
              color:filter===v?"#6366f1":"var(--tx2)",
              borderRadius:99,padding:"7px 14px",cursor:"pointer",
              fontSize:".78rem",fontWeight:700,fontFamily:"'Inter',sans-serif",
              display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap",
            }}>
              {l}
              <span style={{background:filter===v?"rgba(99,102,241,0.2)":"var(--b2)",borderRadius:99,padding:"1px 7px",fontSize:".68rem",color:filter===v?"#6366f1":"var(--mu)"}}>{counts[v]||0}</span>
            </button>
          ))}
        </div>

        {/* Sort */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20}}>
          <span style={{fontSize:".72rem",color:"var(--mu)",fontWeight:600}}>Sort:</span>
          {[["activity","Recent"],["mrr","MRR"],["name","A–Z"]].map(([v,l])=>(
            <button key={v} onClick={()=>setSort(v)} style={{
              background:sort===v?"var(--b2)":"none",
              border:"none",color:sort===v?"var(--tx)":"var(--mu)",
              borderRadius:7,padding:"5px 10px",cursor:"pointer",
              fontSize:".78rem",fontWeight:600,fontFamily:"'Inter',sans-serif",
            }}>{l}</button>
          ))}
          <button className="ghost-btn" style={{marginLeft:"auto",padding:"7px 14px",fontSize:".82rem"}} onClick={()=>setShowFolderModal(true)}>+ New Client</button>
        </div>

        {/* Client list */}
        {filtered.length===0&&<div className="empty">No clients found</div>}
        {filtered.map(f=>{
          const ft=folderTasks(f.id);
          const tdTasks=tasksForDay(dk).filter(t=>t.folderId===f.id);
          const doneTd=tdTasks.filter(t=>isDone(t,dk)).length;
          const totalSecs=ft.reduce((s,t)=>s+Object.values(t.timeLog??{}).reduce((a,b)=>a+b,0),0);
          const days=lastActivityDays(f.id);
          const isPending=(f.monthlyValue||0)>0&&!(f.subCollected??{})[mk];
          const statusColor=f.archived?"#444":f.paused?"#a78bfa":f.prospect?"#60a5fa":isPending?"#fbbf24":"#34d399";
          const statusLabel=f.archived?"Archived":f.paused?"Paused":f.prospect?"Pipeline":isPending?"Pending":"Active";
          return(
            <div key={f.id} onClick={()=>goFolder(f.id)} style={{
              background:"var(--s)",border:"1px solid var(--b)",
              borderLeft:`3px solid ${f.color}`,
              borderRadius:"var(--r2)",padding:"16px 16px",
              marginBottom:10,cursor:"pointer",
              display:"flex",alignItems:"center",gap:14,
              opacity:f.archived?.6:1,
            }}>
              <div style={{fontSize:"1.4rem",flexShrink:0}}>{f.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:".95rem",color:"var(--tx)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
                  <span style={{fontSize:".62rem",fontWeight:700,background:`${statusColor}18`,color:statusColor,border:`1px solid ${statusColor}30`,borderRadius:99,padding:"1px 8px",flexShrink:0}}>{statusLabel}</span>
                </div>
                <div style={{display:"flex",gap:14,alignItems:"center"}}>
                  <span style={{fontSize:".75rem",color:"var(--mu)"}}>
                    {days===999?"No activity":days===0?"Active today":`${days}d ago`}
                  </span>
                  {tdTasks.length>0&&<span style={{fontSize:".75rem",color:"var(--mu)"}}>{doneTd}/{tdTasks.length} today</span>}
                  {totalSecs>0&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:".72rem",color:"var(--mu)"}}>{fmtTimer(totalSecs)}</span>}
                </div>
              </div>
              {(f.monthlyValue||0)>0&&(
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".95rem",color:"#34d399"}}>${(f.monthlyValue||0).toLocaleString()}</div>
                  <div style={{fontSize:".65rem",color:"var(--mu)"}}>/ mo</div>
                </div>
              )}
              <span style={{color:"var(--mu)",opacity:.3,fontSize:".9rem",flexShrink:0}}>›</span>
            </div>
          );
        })}
      </div>
    );
  };


  const clientHealth=f=>{
    const days=lastActivityDays(f.id);
    const ft=tasks.filter(t=>t.folderId===f.id);
    const today=dStr(),mk=monthKey();
    const hasOverdue=ft.some(t=>!t.done&&!t.recurring&&t.dueDate&&t.dueDate<today);
    const isPending=(f.monthlyValue||0)>0&&!(f.subCollected??{})[mk];
    if(hasOverdue||days>=21)return"#ef4444";
    if(days>=10||(isPending&&days>=5))return"#fb923c";
    if(days>=5||isPending)return"#fbbf24";
    if(days>=2)return"#a3e635";
    return"#34d399";
  };

  const ClientTile=({f})=>{
    const health=clientHealth(f);
    const dk=todayKey();
    const tdTasks=tasksForDay(dk).filter(t=>t.folderId===f.id);
    const done=tdTasks.filter(t=>isDone(t,dk)).length;
    const days=lastActivityDays(f.id);
    const mk=monthKey();
    const isPending=(f.monthlyValue||0)>0&&!(f.subCollected??{})[mk];
    const shortName=f.name.length>10?f.name.substring(0,9)+"…":f.name;
    return(
      <div onClick={()=>goFolder(f.id)} title={f.name} style={{
        background:`${health}08`,
        border:`1px solid ${health}22`,
        borderTop:`3px solid ${health}`,
        borderRadius:10,padding:"10px 6px 8px",
        cursor:"pointer",textAlign:"center",
        minHeight:90,display:"flex",flexDirection:"column",
        alignItems:"center",justifyContent:"space-between",
        transition:"transform .15s,background .15s",
        position:"relative",
      }}>
        {isPending&&<div style={{position:"absolute",top:6,right:6,width:6,height:6,borderRadius:"50%",background:"#fbbf24"}}/>}
        <div style={{fontSize:"1.3rem",lineHeight:1}}>{f.icon}</div>
        <div style={{
          fontSize:".65rem",fontWeight:700,color:"var(--tx)",
          width:"100%",overflow:"hidden",textOverflow:"ellipsis",
          whiteSpace:"nowrap",padding:"0 2px",lineHeight:1.3,
        }}>{shortName}</div>
        <div style={{fontFamily:"'DM Mono',monospace",fontSize:".6rem",fontWeight:700,color:health}}>
          {tdTasks.length>0?`${done}/${tdTasks.length}`:(f.monthlyValue||0)>0?`$${f.monthlyValue.toLocaleString()}`:days===999?"new":days===0?"today":`${days}d`}
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
    const h=new Date().getHours();
    const greeting=h<12?"Good morning":h<17?"Good afternoon":"Good evening";
    const firstName=user?.displayName?.split(" ")[0]||"there";
    const dateStr=new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
    return(
      <div className="home-layout">
        <div className="home-main">
          <div className="today-greeting">
            <div className="today-date">{dateStr}</div>
            <div className="today-title">{greeting}, {firstName}.</div>
          </div>
          <RunningTimerBanner/>
          {streak>0&&<div className="streak"><span style={{fontSize:"1.4rem"}}>🔥</span><div><div className="streak-num">{streak} day streak</div><div className="streak-lbl">Keep going</div></div>{bestStreak>streak&&<span style={{marginLeft:"auto",fontSize:".75rem",color:"var(--mu)"}}>Best: {bestStreak}</span>}</div>}
          {/* Time Hero + Boss Score side by side */}
          {(()=>{
            let score=50,band="Fair",color="#fbbf24",tip="Tracking your progress...",delta=0;
            try{const r=calcBossScore();score=r.score;band=r.band;color=r.color;tip=r.tip;delta=r.delta??0;}catch(e){}
            return(
              <>
                <div style={{display:"flex",gap:10,marginBottom:10}}>
                  <div style={{flex:"0 0 57%"}}>
                    <TimeHeroCard dk={dk}/>
                  </div>
                  <div style={{
                    flex:1,minHeight:140,
                    background:`linear-gradient(135deg,${color}28,${color}14)`,
                    border:`1px solid ${color}40`,
                    borderRadius:"var(--r2)",padding:"16px 12px",position:"relative",
                    display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",textAlign:"center",gap:8,
                  }}>
                    {delta!==0&&(
                      <div style={{position:"absolute",top:10,right:10,display:"flex",alignItems:"center",gap:2,background:"rgba(0,0,0,.3)",borderRadius:99,padding:"2px 8px"}}>
                        <span style={{fontSize:".62rem",fontWeight:800,color:delta>0?"#34d399":"#ef4444"}}>{delta>0?"▲":"▼"} {Math.abs(delta)}</span>
                      </div>
                    )}
                    <div style={{fontSize:".58rem",fontWeight:700,color:`${color}cc`,textTransform:"uppercase",letterSpacing:".14em"}}>Boss Score</div>
                    <div style={{fontFamily:"'DM Mono',monospace",fontSize:"2.6rem",fontWeight:700,color:"#fff",letterSpacing:"-2px",lineHeight:1}}>{score}</div>
                    <div style={{display:"inline-flex",alignItems:"center",gap:5,background:"rgba(0,0,0,.25)",borderRadius:99,padding:"4px 11px"}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:color,flexShrink:0}}/>
                      <span style={{fontSize:".68rem",fontWeight:700,color:"#fff"}}>{band}</span>
                    </div>
                  </div>
                </div>
                <div style={{borderLeft:`3px solid ${color}`,background:`${color}08`,borderRadius:"0 var(--r) var(--r) 0",padding:"10px 14px",marginBottom:20}}>
                  <div style={{fontSize:".78rem",color:"var(--tx2)",lineHeight:1.6,fontStyle:"italic"}}>"{tip}"</div>
                  <div style={{fontSize:".66rem",color:"var(--mu)",marginTop:6,opacity:.8}}>Builds over your last 7 days — today's effort shows up more each day after.</div>
                </div>
              </>
            );
          })()}
          <div className="week-section-hdr">
            <div className="week-title">My Week</div>
            <div className="week-sub">Tap a day to manage tasks</div>
          </div>
          <div className="day-grid">
            {DAY_KEYS.map((d,i)=>{const dt=tasksForDay(d),pct=donePct(dt,d),isT=i===todayIdx();return(
              <div key={d} className={`day-card${isT?" today":""}`} onClick={()=>goDay(d)}>
                <div className="day-lbl">{DAYS[i]}</div>
                <div className="day-bar"><div className="day-bar-f" style={{width:`${pct}%`,background:isT?"#c8ff57":pct===100?"#34d399":"#2a2a2a"}}/></div>
                <div className="day-cnt">{dt.filter(t=>isDone(t,d)).length}/{dt.length}</div>
              </div>
            );})}
          </div>
          <UrgentSection/>
          <ChaseThese/>
          <div className="sec-hdr" style={{marginTop:8}}>
            <span className="sec-title">Clients</span>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button className="ghost-btn" style={{fontSize:".75rem",padding:"6px 12px"}} onClick={()=>setView("clients")}>View all</button>
              <button className="ghost-btn" style={{fontSize:".75rem",padding:"6px 12px"}} onClick={()=>setShowFolderModal(true)}>+ New</button>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
            {[["#34d399","Healthy"],["#a3e635","Good"],["#fbbf24","Watch"],["#fb923c","At risk"],["#ef4444","Critical"]].map(([c,l])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                <div style={{width:8,height:8,borderRadius:2,background:c,flexShrink:0}}/>
                <span style={{fontSize:".62rem",color:"var(--mu)",fontWeight:600}}>{l}</span>
              </div>
            ))}
          </div>
          {folders.length===0
            ?<div className="empty">No clients yet</div>
            :<div className="client-grid">
              {[...folders]
                .filter(f=>!f.archived&&!f.paused&&!f.prospect)
                .sort((a,b)=>{
                  const order=["#ef4444","#fb923c","#fbbf24","#a3e635","#34d399"];
                  return order.indexOf(clientHealth(a))-order.indexOf(clientHealth(b));
                })
                .map(f=><ClientTile key={f.id} f={f}/>)}
            </div>
          }
          {folders.some(f=>f.paused)&&<div style={{marginTop:12}}>
            <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:600,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>Paused</div>
            <div className="client-grid" style={{opacity:.45}}>
              {folders.filter(f=>f.paused).map(f=><ClientTile key={f.id} f={f}/>)}
            </div>
          </div>}
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
    const todayI=todayIdx();
    const byDay=DAY_KEYS.map((d,i)=>({d,lbl:DAYS[i],ts:ft.filter(t=>(!t.recurring&&(t.day===d||t.startDate===dateForDK(d)))||(t.recurring&&t.recurringDays?.includes(d)))}))
      .filter(g=>g.ts.length)
      .sort((a,b)=>{
        const da=(DAY_KEYS.indexOf(a.d)-todayI+7)%7;
        const db=(DAY_KEYS.indexOf(b.d)-todayI+7)%7;
        return da-db;
      });
    const mk=monthKey();
    const subCollected=(folder.subCollected??{})[mk]||false;
    const monthPayments=(folder.payments??[]).filter(p=>p.month===mk);
    const taskSecs=ft.reduce((s,t)=>s+Object.values(t.timeLog??{}).reduce((a,b)=>a+b,0),0);
    const clientCallSecs=(calls.client??[]).filter(c=>c.folderId===folder.id).reduce((s,c)=>s+c.duration*60,0);
    const monthSecs=taskSecs+clientCallSecs;
    const monthHrs=fmtHrs(monthSecs/3600);
    const totalCollected=(folder.monthlyValue&&subCollected?folder.monthlyValue:0)+(monthPayments.filter(p=>p.status==="collected").reduce((s,p)=>s+(p.amount||0),0));
    const totalPending=(folder.monthlyValue&&!subCollected?folder.monthlyValue:0)+(monthPayments.filter(p=>p.status!=="collected").reduce((s,p)=>s+(p.amount||0),0));
    const statusColor=folder.archived?"#666":folder.paused?"#a78bfa":folder.prospect?"#60a5fa":"#34d399";
    const statusLabel=folder.archived?"Archived":folder.paused?"Paused":folder.prospect?"Pipeline":"Active";

    return(
      <div className="page">

        {/* ── Compact header ── */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:`${folder.color}20`,border:`2px solid ${folder.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.2rem",flexShrink:0}}>{folder.icon}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:"1.25rem",color:"var(--tx)",letterSpacing:"-.3px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{folder.name}</div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:statusColor,flexShrink:0}}/>
              <span style={{fontSize:".72rem",color:statusColor,fontWeight:600}}>{statusLabel}</span>
              <span style={{fontSize:".72rem",color:"var(--mu)"}}>·</span>
              <span style={{fontSize:".72rem",color:"var(--mu)"}}>{ft.length} task{ft.length!==1?"s":""}</span>
            </div>
          </div>
          <button onClick={()=>{setEditFolderTarget(folder);setShowEditFolder(true);}} style={{background:"none",border:"1px solid var(--b2)",borderRadius:9,padding:"7px 12px",cursor:"pointer",color:"var(--mu)",fontSize:".8rem",fontWeight:600}}>Edit</button>
        </div>

        {/* ── Stats row ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:16}}>
          {/* Tasks today */}
          <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r)",padding:"12px 12px",textAlign:"center"}}>
            <div style={{fontSize:".6rem",fontWeight:700,color:"var(--mu)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>Today</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.1rem",color:pct===100?"#34d399":folder.color,letterSpacing:"-1px"}}>{done}/{ft.length}</div>
            <div style={{height:3,background:"var(--b2)",borderRadius:99,marginTop:6,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:pct===100?"#34d399":folder.color,borderRadius:99}}/></div>
          </div>
          {/* Hours this month */}
          <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r)",padding:"12px 12px",textAlign:"center"}}>
            <div style={{fontSize:".6rem",fontWeight:700,color:"var(--mu)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>Hrs/Month</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.1rem",color:"#fb923c",letterSpacing:"-1px"}}>{monthHrs}</div>
          </div>
          {/* Collected */}
          <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r)",padding:"12px 12px",textAlign:"center"}}>
            <div style={{fontSize:".6rem",fontWeight:700,color:"var(--mu)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>Collected</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.1rem",color:"#34d399",letterSpacing:"-1px"}}>${totalCollected.toLocaleString()}</div>
          </div>
          {/* Pending */}
          <div style={{background:"var(--s)",border:`1px solid ${totalPending>0?"rgba(251,191,36,.2)":"var(--b)"}`,borderRadius:"var(--r)",padding:"12px 12px",textAlign:"center",cursor:totalPending>0?"pointer":"default"}}
            onClick={()=>{if((folder.monthlyValue||0)>0&&!subCollected)toggleSubCollected(folder.id);}}>
            <div style={{fontSize:".6rem",fontWeight:700,color:"var(--mu)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>Pending</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.1rem",color:totalPending>0?"#fbbf24":"var(--mu)",letterSpacing:"-1px"}}>{totalPending>0?`$${totalPending.toLocaleString()}`:"—"}</div>
          </div>
        </div>

        {/* ── Retainer collected button — only if has retainer ── */}
        {(folder.monthlyValue||0)>0&&(
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r)",padding:"12px 16px",marginBottom:14}}>
            <div>
              <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:2}}>Monthly Retainer</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1rem",color:"#34d399"}}>${folder.monthlyValue.toLocaleString()}<span style={{fontSize:".72rem",color:"var(--mu)",fontWeight:500}}>/mo</span></div>
            </div>
            <button onClick={()=>toggleSubCollected(folder.id)} style={{background:subCollected?"#34d39918":"var(--bg)",border:`1px solid ${subCollected?"#34d39940":"var(--b2)"}`,color:subCollected?"#34d399":"var(--mu)",borderRadius:99,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:".8rem",transition:"all .2s"}}>{subCollected?"Collected ✓":"Mark Collected"}</button>
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
        {byDay.map(({d,lbl,ts})=>{
          const notDone=sortByAlert(ts.filter(t=>!isDone(t,d)));
          const done=ts.filter(t=>isDone(t,d));
          const ordered=[...notDone,...done];
          return(<div className="task-grp" key={d}><div className="grp-hdr"><span className="grp-lbl" style={{color:DAY_KEYS.indexOf(d)===todayIdx()?folder.color:"var(--mu)"}}>{lbl}{DAY_KEYS.indexOf(d)===todayIdx()?" · Today":""}</span></div>{ordered.map(t=><TaskRow key={t.id} task={t} dk={d} color={folder.color} from="folder"/>)}</div>);
        })}
        {ft.length===0&&<div className="empty">No tasks yet — add one below</div>}

        {/* Workflow Templates */}
        <div style={{display:"flex",gap:8,marginTop:16,marginBottom:8,flexWrap:"wrap"}}>
          <button className="ghost-btn" style={{fontSize:".78rem",padding:"8px 14px"}} onClick={()=>setShowApplyTemplate(true)}>📋 Add from Template</button>
        </div>

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
    const [,bump]=useState(0);
    useEffect(()=>{
      if(!activeTask)return;
      const t=tasks.find(x=>x.id===activeTask.id);
      if(!t||!t.timerRunning)return;
      const iv=setInterval(()=>bump(x=>x+1),1000);
      return()=>clearInterval(iv);
    },[activeTask,tasks]);
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
            <div className="t-stat" style={{cursor:"pointer"}} onClick={()=>{setEditTimeVal(fmtTimer(getLiveSecs(task)));setShowEditTime(true);}}>
              <div className="t-stat-val" style={{color:"var(--ac)"}}>{fmtTimer(task.timerSeconds??0)}</div>
              <div className="t-stat-lbl">This task ✏️</div>
            </div>
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


  // ── Trial days remaining ──────────────────────────────────────────────────
  const trialDaysLeft=trialStartDate
    ?Math.max(0,7-Math.floor((Date.now()-new Date(trialStartDate).getTime())/(1000*60*60*24)))
    :7;
  const trialExpired=trialStartDate&&trialDaysLeft===0;

  // ── Request notifications ─────────────────────────────────────────────────
  const requestNotifications=async()=>{
    if(typeof Notification==="undefined")return;
    const perm=await Notification.requestPermission();
    setNotifPermission(perm);
    if(perm==="granted"){
      scheduleNotifications();
    }
  };

  const scheduleNotifications=()=>{
    if(typeof Notification==="undefined"||Notification.permission!=="granted")return;
    // Focus Now notification — fire after 2 minutes if app is open
    const focusClients=folders
      .filter(f=>!f.archived&&!f.paused&&!f.prospect)
      .sort((a,b)=>lastActivityDays(a.id)-lastActivityDays(b.id))
      .slice(0,3);
    if(focusClients.length>0){
      const top=focusClients[0];
      const days=lastActivityDays(top.id);
      if(days>=3){
        setTimeout(()=>{
          try{
            new Notification("effingFocus — Focus Now",{
              body:`${top.name} hasn\'t heard from you in ${days} day${days!==1?"s":""}. Time to check in.`,
              icon:"/icon-192.png",
              badge:"/icon-192.png",
            });
          }catch(e){}
        },120000);
      }
    }
  };


  const openBillingPortal=async()=>{
    setCheckoutLoading(true);
    try{
      const{getFunctions,httpsCallable}=await import("firebase/functions");
      const fns=getFunctions();
      const createPortal=httpsCallable(fns,"createPortalSession");
      const result=await createPortal({});
      window.open(result.data.url,"_blank");
    }catch(e){
      console.error("Portal error:",e);
      alert("Something went wrong. Please try again.");
    }
    setCheckoutLoading(false);
  };

  const startCheckout=async(plan)=>{
    setCheckoutLoading(true);
    try{
      const{getFunctions,httpsCallable}=await import("firebase/functions");
      const fns=getFunctions();
      const createCheckout=httpsCallable(fns,"createCheckout");
      const result=await createCheckout({plan});
      window.open(result.data.url,"_blank");
    }catch(e){
      console.error("Checkout error:",e);
      alert("Something went wrong. Please try again.");
    }
    setCheckoutLoading(false);
  };

  const PaywallView=()=>(
    <div style={{position:"fixed",inset:0,background:"var(--bg)",zIndex:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px",overflowY:"auto"}}>
      <div style={{maxWidth:420,width:"100%",textAlign:"center"}}>
        <div style={{fontSize:"3rem",marginBottom:16}}>🔒</div>
        <h1 style={{fontFamily:"Georgia,serif",fontWeight:700,fontSize:"1.8rem",color:"var(--tx)",letterSpacing:"-.5px",marginBottom:8,lineHeight:1.2}}>Your free trial has ended.</h1>
        <p style={{fontSize:".95rem",color:"var(--mu)",lineHeight:1.7,marginBottom:32}}>Your data is safe. Upgrade to keep your clients, time tracking, Boss Score, and everything you built during your trial.</p>

        {/* Monthly plan */}
        <div onClick={()=>setSelectedPlan("monthly")} style={{
          background:selectedPlan==="monthly"?"var(--s)":"transparent",
          border:`2px solid ${selectedPlan==="monthly"?"#6366f1":"var(--b2)"}`,borderRadius:16,
          padding:"20px 24px",marginBottom:12,cursor:"pointer",
          transition:"all .15s",
        }}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontWeight:700,fontSize:"1rem",color:"var(--tx)"}}>Monthly</span>
            <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.4rem",color:"#6366f1"}}>$12<span style={{fontSize:".8rem",color:"var(--mu)",fontWeight:400}}>/mo</span></span>
          </div>
          <div style={{fontSize:".8rem",color:"var(--mu)",textAlign:"left"}}>Cancel anytime. No contracts.</div>
        </div>

        {/* Yearly plan */}
        <div onClick={()=>setSelectedPlan("yearly")} style={{
          background:selectedPlan==="yearly"?"rgba(99,102,241,.12)":"transparent",
          border:`2px solid ${selectedPlan==="yearly"?"#6366f1":"var(--b2)"}`,borderRadius:16,
          padding:"20px 24px",marginBottom:24,cursor:"pointer",position:"relative",overflow:"hidden",
          transition:"all .15s",
        }}>
          <div style={{position:"absolute",top:10,right:10,background:"#6366f1",color:"#fff",fontSize:".65rem",fontWeight:700,borderRadius:99,padding:"3px 10px"}}>SAVE 31%</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontWeight:700,fontSize:"1rem",color:"var(--tx)"}}>Annual</span>
            <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.4rem",color:"#6366f1"}}>$99<span style={{fontSize:".8rem",color:"var(--mu)",fontWeight:400}}>/yr</span></span>
          </div>
          <div style={{fontSize:".8rem",color:"var(--mu)",textAlign:"left"}}>$8.25/month — best value.</div>
        </div>

        <button onClick={()=>startCheckout(selectedPlan)} disabled={checkoutLoading} style={{
          width:"100%",background:"#6366f1",color:"#fff",border:"none",
          borderRadius:12,padding:"16px",cursor:"pointer",
          fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:"1rem",
          marginBottom:12,opacity:checkoutLoading?.7:1,
        }}>{checkoutLoading?"Opening payment page...":`Upgrade — ${selectedPlan==="yearly"?"$99/yr":"$12/mo"} →`}</button>

        <p style={{fontSize:".75rem",color:"var(--mu)"}}>Secure payment via Stripe · Your data is never deleted</p>
      </div>
    </div>
  );


  // ── Workflow Templates ────────────────────────────────────────────────────
  const createTemplate=(name,taskTexts)=>{
    const nm=name.trim();if(!nm)return;
    const validTasks=taskTexts.map(t=>t.trim()).filter(Boolean);
    if(validTasks.length===0)return;
    const newTemplate={id:Date.now(),name:nm,icon:"📋",tasks:validTasks.map(text=>({text,recurring:false}))};
    setTemplates(p=>[...p,newTemplate]);
  };

  const deleteTemplate=id=>{
    setTemplates(p=>p.filter(t=>t.id!==id));
  };

  const applyTemplate=(folderId,templateId)=>{
    const tpl=templates.find(t=>t.id===templateId);
    if(!tpl)return;
    const today=dStr();
    const newTasks=tpl.tasks.map((tt,i)=>({
      id:Date.now()+i,
      text:tt.text,
      folderId,
      timerSeconds:0,timerRunning:false,timerStartedAt:null,timeLog:{},
      ...(tt.recurring
        ?{recurring:true,recurringDays:tt.recurringDays?.length?tt.recurringDays:[todayKey()],doneOn:[]}
        :{recurring:false,done:false,startDate:today,dueDate:null}
      ),
    }));
    setTasks(p=>[...p,...newTasks]);
    setShowApplyTemplate(false);
  };

  const ProfileView=()=>{
    const [pendingHrsDay,setPendingHrsDay]=useState(hoursFor(todayKey()));
    const [pendingWeekHrs,setPendingWeekHrs]=useState(weeklyGoal);
    const [pendingThreshold,setPendingThreshold]=useState(chaseThreshold);
    const [pendingClientGoal2,setPendingClientGoal2]=useState(calls.clientGoal??5);
    const [pendingOutreachGoal2,setPendingOutreachGoal2]=useState(calls.outreachGoal??20);
    const [saved,setSaved]=useState(false);
    const memberSince=user?.metadata?.creationTime?new Date(user.metadata.creationTime).toLocaleDateString("en-US",{month:"long",year:"numeric"}):"—";

    const savePrefs=()=>{
      setDayHours(p=>({...p,[todayKey()]:pendingHrsDay}));
      setWeeklyGoal(pendingWeekHrs);
      setChaseThreshold(pendingThreshold);
      setCalls(p=>({...p,clientGoal:pendingClientGoal2,outreachGoal:pendingOutreachGoal2}));
      setSaved(true);
      setTimeout(()=>setSaved(false),2000);
    };

    const Section=({title,children})=>(
      <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r2)",padding:"20px 20px",marginBottom:12}}>
        <div style={{fontSize:".65rem",fontWeight:700,color:"var(--mu)",textTransform:"uppercase",letterSpacing:".12em",marginBottom:16}}>{title}</div>
        {children}
      </div>
    );

    const Row=({label,sub,children})=>(
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid var(--b)"}}>
        <div>
          <div style={{fontSize:".88rem",fontWeight:600,color:"var(--tx)"}}>{label}</div>
          {sub&&<div style={{fontSize:".72rem",color:"var(--mu)",marginTop:2}}>{sub}</div>}
        </div>
        <div style={{flexShrink:0,marginLeft:16}}>{children}</div>
      </div>
    );

    const Chips=({options,value,onChange})=>(
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {options.map(o=>(
          <button key={o} onClick={()=>onChange(o)} style={{
            background:value===o?"#6366f1":"var(--bg)",
            border:`1px solid ${value===o?"#6366f1":"var(--b2)"}`,
            color:value===o?"#fff":"var(--tx2)",
            borderRadius:8,padding:"6px 12px",cursor:"pointer",
            fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:".8rem",
            transition:"all .15s",
          }}>{o}</button>
        ))}
      </div>
    );

    return(
      <div style={{position:"fixed",inset:0,background:"var(--bg)",zIndex:200,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        {/* Header */}
        <div style={{
          position:"sticky",top:0,zIndex:10,
          background:"rgba(20,20,20,.95)",backdropFilter:"blur(20px)",
          borderBottom:"1px solid var(--b)",
          padding:"calc(var(--safe-top) + 14px) 18px 14px",
          display:"flex",alignItems:"center",justifyContent:"space-between",
        }}>
          <button onClick={()=>setShowProfile(false)} style={{background:"none",border:"none",color:"#6366f1",cursor:"pointer",fontSize:".9rem",fontWeight:700,fontFamily:"'Inter',sans-serif",padding:0}}>‹ Back</button>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:".95rem",color:"var(--tx)"}}>Profile & Settings</div>
          <button onClick={savePrefs} style={{
            background:saved?"rgba(52,211,153,.15)":"rgba(99,102,241,.15)",
            border:`1px solid ${saved?"rgba(52,211,153,.3)":"rgba(99,102,241,.3)"}`,
            color:saved?"#34d399":"#6366f1",
            borderRadius:99,padding:"7px 16px",cursor:"pointer",
            fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".82rem",
            transition:"all .2s",
          }}>{saved?"Saved ✓":"Save"}</button>
        </div>

        <div style={{padding:"20px 16px calc(40px + var(--safe-bottom))"}}>

          {/* Account card */}
          <div style={{background:"var(--s)",border:"1px solid var(--b)",borderRadius:"var(--r2)",padding:"24px 20px",marginBottom:12,display:"flex",alignItems:"center",gap:16}}>
            {user?.photoURL
              ?<img src={user.photoURL} style={{width:60,height:60,borderRadius:"50%",border:"2px solid var(--b2)",flexShrink:0}} alt=""/>
              :<div style={{width:60,height:60,borderRadius:"50%",background:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.4rem",flexShrink:0}}>👤</div>
            }
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:"1.1rem",color:"var(--tx)",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.displayName||"User"}</div>
              <div style={{fontSize:".8rem",color:"var(--mu)",marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.email}</div>
              <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(99,102,241,.1)",border:"1px solid rgba(99,102,241,.2)",borderRadius:99,padding:"3px 10px"}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:"#6366f1"}}/>
                <span style={{fontSize:".68rem",fontWeight:700,color:"#6366f1"}}>Free Trial</span>
              </div>
            </div>
          </div>

          {/* Work preferences */}
          <Section title="Work Preferences">
            <Row label="Daily hour goal" sub="How many hours you aim to work each day">
              <Chips options={[4,6,7,8,9,10]} value={pendingHrsDay} onChange={setPendingHrsDay}/>
            </Row>
            <Row label="Weekly hour goal" sub="Your target hours for the week">
              <Chips options={[20,25,30,35,40,45,50]} value={pendingWeekHrs} onChange={setPendingWeekHrs}/>
            </Row>
            <div style={{padding:"10px 0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <div style={{fontSize:".88rem",fontWeight:600,color:"var(--tx)"}}>Focus Now threshold</div>
                  <div style={{fontSize:".72rem",color:"var(--mu)",marginTop:2}}>Days before a client shows as needing attention</div>
                </div>
              </div>
              <Chips options={[3,5,7,10,14]} value={pendingThreshold} onChange={setPendingThreshold}/>
            </div>
          </Section>

          {/* Calls */}
          <Section title="Daily Call Goals">
            <Row label="Client calls" sub="Calls with existing clients per day">
              <Chips options={[3,5,8,10,15,20]} value={pendingClientGoal2} onChange={setPendingClientGoal2}/>
            </Row>
            <div style={{padding:"10px 0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <div style={{fontSize:".88rem",fontWeight:600,color:"var(--tx)"}}>Outreach calls</div>
                  <div style={{fontSize:".72rem",color:"var(--mu)",marginTop:2}}>Cold outreach calls per day</div>
                </div>
              </div>
              <Chips options={[5,10,15,20,25,30]} value={pendingOutreachGoal2} onChange={setPendingOutreachGoal2}/>
            </div>
          </Section>

          {/* Notifications */}
          <Section title="Notifications">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid var(--b)"}}>
              <div>
                <div style={{fontSize:".88rem",fontWeight:600,color:"var(--tx)"}}>Focus Now reminders</div>
                <div style={{fontSize:".72rem",color:"var(--mu)",marginTop:2}}>Get notified when a client needs attention</div>
              </div>
              {notifPermission==="granted"
                ?<span style={{background:"rgba(52,211,153,.1)",border:"1px solid rgba(52,211,153,.2)",color:"#34d399",borderRadius:99,padding:"4px 12px",fontSize:".75rem",fontWeight:700}}>On ✓</span>
                :notifPermission==="denied"
                  ?<span style={{fontSize:".75rem",color:"var(--mu)"}}>Blocked in browser</span>
                  :<button onClick={requestNotifications} style={{background:"#6366f1",border:"none",borderRadius:10,color:"#fff",padding:"8px 16px",cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:".82rem"}}>Enable</button>
              }
            </div>
            <div style={{padding:"10px 0"}}>
              <div style={{fontSize:".88rem",fontWeight:600,color:"var(--tx)"}}>Trial status</div>
              <div style={{fontSize:".82rem",color:trialDaysLeft<=2?"#ef4444":"var(--mu)",marginTop:4,fontWeight:600}}>
                {trialExpired?"Trial expired":trialDaysLeft+" day"+(trialDaysLeft!==1?"s":"")+" remaining"}
              </div>
            </div>
          </Section>

          {/* Billing placeholder */}
          <Section title="Billing">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid var(--b)"}}>
              <div>
                <div style={{fontSize:".88rem",fontWeight:600,color:"var(--tx)"}}>Current plan</div>
                <div style={{fontSize:".72rem",color:"var(--mu)",marginTop:2}}>{subscribed?"Pro":"Free Trial"}</div>
              </div>
              <span style={{background:subscribed?"rgba(52,211,153,.1)":"rgba(99,102,241,.1)",border:`1px solid ${subscribed?"rgba(52,211,153,.2)":"rgba(99,102,241,.2)"}`,color:subscribed?"#34d399":"#6366f1",borderRadius:99,padding:"4px 12px",fontSize:".75rem",fontWeight:700}}>{subscribed?"Pro ✓":"Trial"}</span>
            </div>
            {!subscribed&&(
              <div style={{padding:"10px 0"}}>
                <button onClick={()=>{setShowProfile(false);startCheckout("monthly");}} style={{width:"100%",background:"#6366f1",color:"#fff",border:"none",borderRadius:10,padding:"12px",cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:".9rem"}}>Upgrade to Pro →</button>
              </div>
            )}
            {subscribed&&(
              <div style={{padding:"10px 0"}}>
                <button onClick={openBillingPortal} disabled={checkoutLoading} style={{width:"100%",background:"none",border:"1px solid var(--b2)",borderRadius:10,padding:"12px",cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:".9rem",color:"var(--tx2)",opacity:checkoutLoading?.6:1}}>
                  {checkoutLoading?"Opening...":"Manage billing / Cancel →"}
                </button>
                <div style={{fontSize:".7rem",color:"var(--mu)",textAlign:"center",marginTop:6}}>Cancel anytime via Stripe</div>
              </div>
            )}
          </Section>

          {/* Account */}
          <Section title="Account">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid var(--b)"}}>
              <div style={{fontSize:".88rem",color:"var(--tx)"}}>Member since</div>
              <div style={{fontSize:".85rem",color:"var(--mu)",fontWeight:600}}>{memberSince}</div>
            </div>
            <div style={{padding:"16px 0 4px"}}>
              <button onClick={async()=>{
                const running=tasks.find(t=>t.timerRunning);
                if(running){pauseTimer(running.id);await new Promise(r=>setTimeout(r,400));}
                signOut(auth);
              }} style={{
                width:"100%",background:"rgba(239,68,68,.08)",
                border:"1px solid rgba(239,68,68,.2)",color:"#ef4444",
                borderRadius:12,padding:"14px",cursor:"pointer",
                fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,
                fontSize:".95rem",minHeight:50,
              }}>Sign out</button>
            </div>
          </Section>

        </div>
      </div>
    );
  };


  // Boss Score computed directly at render time — no state needed

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
    if(obStep===1)return(<div className="ob-overlay"><Dots/><div className="ob-emoji">👋</div><div className="ob-title">The app that acts like your boss<span style={{color:"var(--ac)"}}>.</span></div><div className="ob-sub">No one tells you what to focus on when you work for yourself. effingFocus does. Let's get you set up in 2 minutes.</div><button className="ob-primary" onClick={()=>setObStep(2)}>Let's go</button><button className="ob-skip" onClick={skipOnboarding}>Skip setup</button></div>);
    if(obStep===2)return(<div className="ob-overlay"><Dots/><div className="ob-emoji">📁</div><div className="ob-title">Create your first client folder</div><div className="ob-sub">One folder per client. Tasks, time, and money — all in one place.</div><div className="ob-card"><div className="ob-card-label">Client or project name</div><input className="ob-input" value={obFolderName} autoFocus onChange={e=>setObFolderName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&completeObFolder()} placeholder="e.g. Ajay Sharma, Nike, Personal..."/><div className="ob-card-label">Colour</div><div className="ob-color-row" style={{marginBottom:14}}>{COLORS.map(c=><div key={c} className={`ob-color${obFolderColor===c?" sel":""}`} style={{background:c}} onClick={()=>setObFolderColor(c)}/>)}</div><div className="ob-card-label">Icon</div><div className="ob-icon-row">{["💼","🏠","👤","🎯","📊","🤝","⭐","💡","🌿","❤️"].map(ic=><div key={ic} className={`ob-icon${obFolderIcon===ic?" sel":""}`} onClick={()=>setObFolderIcon(ic)}>{ic}</div>)}</div></div><button className="ob-primary" onClick={completeObFolder} disabled={!obFolderName.trim()}>Create folder</button><button className="ob-skip" onClick={skipOnboarding}>Skip setup</button></div>);
    if(obStep===3)return(<div className="ob-overlay"><Dots/><div className="ob-emoji">✅</div><div className="ob-title">Add your first task</div><div className="ob-sub">What's the one thing you need to get done for this client today?</div><div className="ob-card"><div className="ob-card-label">Task</div><input className="ob-input" value={obTaskText} autoFocus onChange={e=>setObTaskText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&completeObTask()} placeholder="e.g. Send proposal, Review brief..."/></div><button className="ob-primary" onClick={completeObTask} disabled={!obTaskText.trim()}>Add task</button><button className="ob-skip" onClick={skipOnboarding}>Skip setup</button></div>);
    if(obStep===4)return(<div className="ob-overlay"><Dots/><div className="ob-emoji">⏱</div><div className="ob-title">Start the timer when you work</div><div className="ob-sub">Tap a task → hit Start Working. That's how effingFocus knows where your time actually went.</div><div className="ob-card"><div className="ob-card-label">Your task</div><div className="ob-task-row"><div className="ob-chk"/><span className="ob-task-txt">{obTaskText||"Your task"}</span><span className="ob-badge">▶ Start</span></div><div style={{marginTop:14,fontSize:".85rem",color:"var(--mu)",lineHeight:1.7}}>At the end of the day you'll see exactly how many hours you worked and what your time is actually worth per hour.</div></div><button className="ob-primary" onClick={()=>setObStep(5)}>Got it</button><button className="ob-skip" onClick={skipOnboarding}>Skip</button></div>);
    if(obStep===5)return(<div className="ob-overlay"><Dots/><div className="ob-emoji">🚀</div><div className="ob-title">You're all set.</div><div className="ob-sub">Your boss is ready. Here's what to explore first.</div><div className="ob-card"><div className="ob-card-label">What's inside</div><div style={{display:"flex",flexDirection:"column",gap:12}}>{[["📁","Folders — one per client. Tasks, time, money in one place."],["⏱","Timer — tap Start Working on any task. Time is tracked automatically."],["🎯","Focus Now — the app tells you which clients need attention today."],["🔒","Lock In — commit to one task with a PIN. No distractions."],["💰","Money tab — see who's paid, who owes you, and your net profit."],["📈","Reports — your real effective hourly rate, always visible."]].map(([ic,txt])=>(<div key={txt} style={{display:"flex",alignItems:"flex-start",gap:10,fontSize:".85rem",color:"var(--tx2)",lineHeight:1.5}}><span style={{flexShrink:0,fontSize:"1rem"}}>{ic}</span><span>{txt}</span></div>))}</div></div><button className="ob-primary" onClick={()=>setObStep(6)}>Continue</button></div>);
    // ── Step 6 — Pricing / Trial confirmation ──────────────────────────
    if(obStep===6)return(<div className="ob-overlay">
      <Dots/>
      <div className="ob-emoji">🎉</div>
      <div className="ob-title">7 days free.<span style={{color:"var(--ac)"}}>No surprises.</span></div>
      <div className="ob-sub">Your trial starts today. Here's exactly what happens.</div>
      <div className="ob-card">
        <div className="ob-card-label">Your trial timeline</div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {[
            ["Today","Full access — everything unlocked","#34d399"],
            ["Day 5","We'll remind you your trial is ending","#fbbf24"],
            ["Day 7","Trial ends — upgrade to keep your data","#fb923c"],
          ].map(([day,desc,col])=>(
            <div key={day} style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:48,height:48,borderRadius:10,background:`${col}15`,border:`1px solid ${col}30`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{fontSize:".72rem",fontWeight:700,color:col}}>{day}</span>
              </div>
              <span style={{fontSize:".85rem",color:"var(--tx2)",lineHeight:1.4}}>{desc}</span>
            </div>
          ))}
        </div>
        <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid var(--b)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:".82rem",color:"var(--mu)"}}>After trial</span>
          <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"1.1rem",color:"var(--tx)"}}>$12<span style={{fontSize:".75rem",color:"var(--mu)",fontWeight:400}}>/month</span></span>
        </div>
      </div>
      <div style={{fontSize:".78rem",color:"var(--mu)",textAlign:"center",marginBottom:16}}>No credit card required now. Cancel anytime.</div>
      <button className="ob-primary" onClick={()=>isStandalone?finishOnboarding():setObStep(7)}>Continue</button>
    </div>);
    // ── Step 7 — PWA install prompt ──────────────────────────────────────
    if(obStep===7)return(<div className="ob-overlay">
      <Dots/>
      <div className="ob-emoji">📲</div>
      <div className="ob-title">Add it to your<span style={{color:"var(--ac)"}}>home screen.</span></div>
      <div className="ob-sub">One tap away beats a buried browser tab. Most people who do this use the app daily.</div>
      <div className="ob-card">
        {isIOS?(
          <>
            <div className="ob-card-label">On iPhone/iPad</div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {[
                ["1","Tap the Share button","at the bottom of Safari"],
                ["2","Scroll down and tap","\"Add to Home Screen\""],
                ["3","Tap \"Add\"","top right corner"],
              ].map(([num,desc,sub])=>(
                <div key={num} style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:"rgba(99,102,241,.12)",border:"1px solid rgba(99,102,241,.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{fontSize:".82rem",fontWeight:700,color:"#6366f1"}}>{num}</span>
                  </div>
                  <div>
                    <div style={{fontSize:".85rem",color:"var(--tx)",fontWeight:600}}>{desc}</div>
                    <div style={{fontSize:".74rem",color:"var(--mu)"}}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ):deferredInstallPrompt?(
          <>
            <div className="ob-card-label">One tap install</div>
            <p style={{fontSize:".85rem",color:"var(--tx2)",lineHeight:1.6,marginBottom:4}}>Tap below and confirm — effingFocus installs like a native app, no app store needed.</p>
          </>
        ):(
          <>
            <div className="ob-card-label">On this browser</div>
            <p style={{fontSize:".85rem",color:"var(--tx2)",lineHeight:1.6}}>Look for an <strong>install icon</strong> in your address bar, or open your browser menu and select <strong>"Install app"</strong> or <strong>"Add to Home Screen."</strong></p>
          </>
        )}
      </div>
      {deferredInstallPrompt&&!isIOS?(
        <button className="ob-primary" onClick={async()=>{await triggerInstall();finishOnboarding();}}>Install effingFocus →</button>
      ):(
        <button className="ob-primary" onClick={finishOnboarding}>Got it — start focusing →</button>
      )}
      <button onClick={finishOnboarding} style={{background:"none",border:"none",color:"var(--mu)",fontSize:".82rem",marginTop:14,cursor:"pointer",textAlign:"center",width:"100%"}}>Skip for now</button>
    </div>);
    return null;
  };

  return(
    <div className="app">
      <DesktopSidebar/>
      <div className="app-center">
      <div className="nav">
        <div className="logo">effingFocus<em>.</em></div>
        <div className="nav-right">
          {view==="task"&&<button className="back-btn" onClick={goBack}>Back</button>}
          {(view==="day"||view==="folder")&&<button className="back-btn" onClick={goHome}>Home</button>}
          <div onClick={()=>setShowProfile(true)} style={{cursor:'pointer',display:'flex',alignItems:'center',gap:8}}>{user.photoURL&&<img src={user.photoURL} className="avatar" alt="" style={{border:showProfile?'2px solid #6366f1':''}}/>}{!user.photoURL&&<div style={{width:32,height:32,borderRadius:'50%',background:'#6366f1',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.9rem',cursor:'pointer'}}>👤</div>}</div>
          <button className="signout-btn" onClick={async()=>{
            const running=tasks.find(t=>t.timerRunning);
            if(running){pauseTimer(running.id);await new Promise(r=>setTimeout(r,400));}
            signOut(auth);
          }}>Sign out</button>
        </div>
      </div>
      {(view==="home"||view==="today")&&<HomeView/>}
      {view==="day"&&<DayView/>}
      {view==="folder"&&<FolderView/>}
      {view==="task"&&<TaskDetailView/>}
      {view==="all"&&<AllTasksView/>}
      {view==="clients"&&<ClientsView/>}
      {view==="money"&&<MoneyView/>}
      {(view==="reports"||view==="insights")&&<ReportsView/>}
      {view!=="task"&&(
        <div className="tab-bar">
          <button className={`tab-btn${(view==="home"||view==="today"||view==="day"||view==="folder")?" active":""}`} onClick={goHome}><span className="tab-icon">⏱</span><span className="tab-lbl">Today</span><div className="tab-dot"/></button>
          <button className={`tab-btn${view==="all"?" active":""}`} onClick={()=>setView("all")}><span className="tab-icon">📋</span><span className="tab-lbl">Tasks</span><div className="tab-dot"/></button>
          <button className={`tab-btn${view==="clients"?" active":""}`} onClick={()=>setView("clients")}><span className="tab-icon">👥</span><span className="tab-lbl">Clients</span><div className="tab-dot"/></button>
          <button className={`tab-btn${view==="money"?" active":""}`} onClick={()=>setView("money")}><span className="tab-icon">💰</span><span className="tab-lbl">Money</span><div className="tab-dot"/></button>
          <button className={`tab-btn${(view==="reports"||view==="insights")?" active":""}`} onClick={()=>setView("reports")}><span className="tab-icon">📈</span><span className="tab-lbl">Insights</span><div className="tab-dot"/></button>
        </div>
      )}
      </div>
      <DesktopRightPanel/>
      {showProfile&&<ProfileView/>}
      {trialExpired&&!subscribed&&<PaywallView/>}


      {/* Apply Template modal */}
      {showApplyTemplate&&(
        <div className="overlay" onClick={()=>setShowApplyTemplate(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">📋 Add from Template</div>
            {templates.length===0?(
              <p style={{fontSize:".88rem",color:"var(--mu)",textAlign:"center",padding:"10px 0 20px",lineHeight:1.7}}>No templates yet. Create one with your repeatable task list — e.g. "Website Build" or "Meta Ads Setup".</p>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16,maxHeight:"45vh",overflowY:"auto"}}>
                {templates.map(tpl=>(
                  <div key={tpl.id} onClick={()=>applyTemplate(activeFolder,tpl.id)} style={{
                    background:"var(--s)",border:"1px solid var(--b)",borderRadius:12,
                    padding:"14px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,
                  }}>
                    <span style={{fontSize:"1.3rem"}}>{tpl.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:".92rem",color:"var(--tx)"}}>{tpl.name}</div>
                      <div style={{fontSize:".72rem",color:"var(--mu)"}}>{tpl.tasks.length} task{tpl.tasks.length!==1?"s":""}</div>
                    </div>
                    <button onClick={e=>{e.stopPropagation();deleteTemplate(tpl.id);}} style={{background:"none",border:"none",color:"var(--mu)",fontSize:"1rem",cursor:"pointer",padding:"4px 8px"}}>🗑</button>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-btns">
              <button className="btn-c" onClick={()=>setShowApplyTemplate(false)}>Close</button>
              <button className="btn-ok" onClick={()=>{setShowApplyTemplate(false);setTemplateTaskInputs([""]);setTemplateNameInput("");setShowSaveTemplate(true);}}>+ Create Template</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Template modal */}
      {showSaveTemplate&&(
        <div className="overlay" onClick={()=>setShowSaveTemplate(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">📋 Create Template</div>
            <p style={{fontSize:".85rem",color:"var(--mu)",marginBottom:16,lineHeight:1.6}}>
              Build a reusable task list. You can apply it to any client in one tap.
            </p>
            <div className="modal-lbl">Template name</div>
            <input className="modal-in" value={templateNameInput} autoFocus
              onChange={e=>setTemplateNameInput(e.target.value)}
              placeholder="e.g. Website Build, Meta Ads Setup"/>

            <div className="modal-lbl">Tasks</div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12,maxHeight:"32vh",overflowY:"auto"}}>
              {templateTaskInputs.map((val,i)=>(
                <div key={i} style={{display:"flex",gap:6,alignItems:"center"}}>
                  <span style={{fontSize:".78rem",color:"var(--mu)",width:18,flexShrink:0,textAlign:"right"}}>{i+1}.</span>
                  <input className="modal-in" style={{marginBottom:0,flex:1}} value={val}
                    placeholder={`Step ${i+1}`}
                    onChange={e=>{
                      const next=[...templateTaskInputs];next[i]=e.target.value;setTemplateTaskInputs(next);
                    }}
                    onKeyDown={e=>{
                      if(e.key==="Enter"){
                        e.preventDefault();
                        if(i===templateTaskInputs.length-1)setTemplateTaskInputs([...templateTaskInputs,""]);
                      }
                    }}
                  />
                  {templateTaskInputs.length>1&&(
                    <button onClick={()=>setTemplateTaskInputs(templateTaskInputs.filter((_,idx)=>idx!==i))} style={{background:"none",border:"none",color:"var(--mu)",fontSize:"1.1rem",cursor:"pointer",padding:"4px 6px",flexShrink:0}}>×</button>
                  )}
                </div>
              ))}
            </div>
            <button className="ghost-btn" style={{width:"100%",marginBottom:16,fontSize:".82rem"}} onClick={()=>setTemplateTaskInputs([...templateTaskInputs,""])}>+ Add step</button>

            <div className="modal-btns">
              <button className="btn-c" onClick={()=>setShowSaveTemplate(false)}>Cancel</button>
              <button className="btn-ok"
                onClick={()=>{
                  createTemplate(templateNameInput,templateTaskInputs);
                  setShowSaveTemplate(false);
                  setTemplateNameInput("");setTemplateTaskInputs([""]);
                  setShowApplyTemplate(true);
                }}
                disabled={!templateNameInput.trim()||templateTaskInputs.every(t=>!t.trim())}
              >Save Template</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm&&(
        <div className="overlay" onClick={()=>setDeleteConfirm(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:"2rem",textAlign:"center",marginBottom:12}}>{deleteConfirm.type==="folder"?"🗑️":"✕"}</div>
            <div className="modal-title">Delete {deleteConfirm.type==="folder"?"Client":"Task"}?</div>
            <p style={{fontSize:".9rem",color:"var(--mu)",textAlign:"center",lineHeight:1.7,marginBottom:20}}>
              {deleteConfirm.type==="folder"
                ?`Deleting "${deleteConfirm.name}" will permanently remove this client and all ${deleteConfirm.taskCount} task${deleteConfirm.taskCount!==1?"s":""} associated with it. This cannot be undone.`
                :`Are you sure you want to delete "${deleteConfirm.name}"? This cannot be undone.`
              }
            </p>
            <div className="modal-btns">
              <button className="btn-c" onClick={()=>setDeleteConfirm(null)}>Cancel</button>
              <button onClick={()=>deleteConfirm.type==="folder"?confirmDeleteFolder(deleteConfirm.id):confirmDeleteTask(deleteConfirm.id)} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:10,padding:"13px 24px",cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:".95rem",flex:1}}>
                Delete {deleteConfirm.type==="folder"?"Client":"Task"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Example data banner */}
      {isExampleData&&syncStatus==="success"&&(
        <div style={{position:"fixed",bottom:"calc(70px + var(--safe-bottom))",left:"50%",transform:"translateX(-50%)",
          background:"rgba(99,102,241,.95)",backdropFilter:"blur(10px)",
          border:"1px solid rgba(99,102,241,.4)",borderRadius:12,
          padding:"10px 18px",zIndex:150,display:"flex",alignItems:"center",gap:12,
          maxWidth:"90vw",boxShadow:"0 4px 24px rgba(0,0,0,.3)"
        }}>
          <span style={{fontSize:".82rem",color:"#fff",fontWeight:600}}>👋 This is example data — replace with your real clients</span>
          <button onClick={()=>{setFolders([]);setTasks([]);setIsExampleData(false);}} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:8,color:"#fff",padding:"5px 10px",cursor:"pointer",fontSize:".75rem",fontWeight:700,whiteSpace:"nowrap"}}>Clear it</button>
        </div>
      )}

      {/* Trial countdown — small subtle pill, last day only */}
      {trialStartDate&&!trialExpired&&trialDaysLeft<=1&&(
        <div onClick={()=>setShowProfile(true)} style={{
          position:"fixed",top:"calc(var(--safe-top) + 10px)",right:12,
          background:"rgba(239,68,68,.12)",border:"1px solid rgba(239,68,68,.3)",
          borderRadius:99,zIndex:180,cursor:"pointer",
          padding:"6px 12px",display:"flex",alignItems:"center",gap:6,
          backdropFilter:"blur(10px)",
        }}>
          <span style={{fontSize:".7rem",color:"#ef4444",fontWeight:700}}>
            {trialDaysLeft===0?"Trial ends today":"1 day left"}
          </span>
          <span style={{fontSize:".7rem",color:"#ef4444",opacity:.7}}>→</span>
        </div>
      )}

      {confetti&&<Confetti onDone={()=>setConfetti(false)}/>}
      {obStep>0&&<OnboardingFlow/>}
      {isLocked&&<LockScreen/>}
      {showLockModal&&!isLocked&&(<div className="overlay" onClick={()=>setShowLockModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title">🔒 Lock In</div><div style={{fontSize:".82rem",color:"var(--mu)",marginBottom:18,lineHeight:1.6}}>Lock yourself in on <strong style={{color:"var(--tx)"}}>{activeTask?.text}</strong>. You'll need your PIN to exit early.</div><div className="modal-lbl">How long?</div><div className="lock-dur-grid">{LOCK_DURS.map(d=><div key={d} className={`lock-dur-opt${lockDuration===d?" sel":""}`} onClick={()=>setLockDuration(d)}>{d}<span style={{fontSize:".6rem",display:"block",fontWeight:500,marginTop:2}}>min</span></div>)}</div><div className="modal-btns"><button className="btn-c" onClick={()=>setShowLockModal(false)}>Cancel</button><button className="btn-ok" onClick={activateLock}>Lock In</button></div></div></div>)}
      {showPinSetModal&&(<div className="overlay"><div className="modal" style={{maxWidth:320}}><div className="modal-title" style={{textAlign:"center"}}>{pinStep===1?"Set your PIN":"Confirm your PIN"}</div><div style={{fontSize:".8rem",color:"var(--mu)",textAlign:"center",marginBottom:20}}>{pinStep===1?"Choose a 4-digit PIN to unlock early.":"Enter the same PIN again."}</div><PinNumpad currentPin={pinStep===1?pinInput:pinConfirm}/><button className="btn-c" style={{width:"100%",marginTop:12,textAlign:"center"}} onClick={()=>{setShowPinSetModal(false);setPinInput("");setPinStep(1);}}>Cancel</button></div></div>)}
      {showEditTask&&(<div className="overlay" onClick={()=>setShowEditTask(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-title">Edit Task</div>
        <div className="modal-lbl">Task name</div>
        <input className="modal-in" value={editTaskText} autoFocus onChange={e=>setEditTaskText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveEditTask()} placeholder="Task name"/>
        <div className="modal-lbl">Start date</div>
        <input className="modal-in" type="date" value={editTaskStartDate||""} onChange={e=>setEditTaskStartDate(e.target.value||null)} style={{colorScheme:"dark"}}/>
        <div className="modal-lbl">Due date</div>
        <input className="modal-in" type="date" value={editTaskDueDate||""} onChange={e=>setEditTaskDueDate(e.target.value||null)} style={{colorScheme:"dark"}}/>
        <div className="modal-btns"><button className="btn-c" onClick={()=>setShowEditTask(false)}>Cancel</button><button className="btn-ok" onClick={saveEditTask}>Save</button></div>
      </div></div>)}

      {showManualTime&&(<div className="overlay" onClick={()=>setShowManualTime(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-title">⏱ Add Time Manually</div>
        <p style={{fontSize:".85rem",color:"var(--mu)",marginBottom:18,lineHeight:1.6}}>Add time on top of what's already tracked. Use this when you forgot to start the timer.</p>
        <div style={{display:"flex",gap:10,marginBottom:16}}>
          <div style={{flex:1}}>
            <div className="modal-lbl">Hours</div>
            <input className="modal-in" style={{marginBottom:0,textAlign:"center",fontSize:"1.4rem",fontFamily:"'DM Mono',monospace"}} value={manualHrs} onChange={e=>setManualHrs(e.target.value.replace(/[^0-9]/g,""))} placeholder="0" type="text" inputMode="numeric"/>
          </div>
          <div style={{display:"flex",alignItems:"center",paddingTop:28,fontSize:"1.4rem",color:"var(--mu)"}}>:</div>
          <div style={{flex:1}}>
            <div className="modal-lbl">Minutes</div>
            <input className="modal-in" style={{marginBottom:0,textAlign:"center",fontSize:"1.4rem",fontFamily:"'DM Mono',monospace"}} value={manualMins} onChange={e=>setManualMins(e.target.value.replace(/[^0-9]/g,""))} placeholder="0" type="text" inputMode="numeric"/>
          </div>
        </div>
        <div className="modal-lbl">Date</div>
        <input className="modal-in" type="date" value={manualDate} onChange={e=>setManualDate(e.target.value)} style={{colorScheme:"dark"}}/>
        {(parseInt(manualHrs)||0)+(parseInt(manualMins)||0)>0&&(
          <div style={{background:"rgba(99,102,241,.08)",border:"1px solid rgba(99,102,241,.2)",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:".85rem",color:"#6366f1",fontWeight:600}}>
            Adding {parseInt(manualHrs)||0}h {parseInt(manualMins)||0}m to {manualDate===dStr()?"today":manualDate}
          </div>
        )}
        <div className="modal-btns"><button className="btn-c" onClick={()=>setShowManualTime(false)}>Cancel</button><button className="btn-ok" onClick={addManualTime} disabled={!(parseInt(manualHrs)||parseInt(manualMins))}>Add Time</button></div>
      </div></div>)}

      {showEditTime&&(<div className="overlay" onClick={()=>setShowEditTime(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-title">✏️ Edit Tracked Time</div>
        <p style={{fontSize:".85rem",color:"var(--mu)",marginBottom:18,lineHeight:1.6}}>Correct the time if the timer ran too long or too short. Format: h:mm:ss or h:mm</p>
        <div className="modal-lbl">Time (h:mm:ss)</div>
        <input className="modal-in" value={editTimeVal} autoFocus onChange={e=>setEditTimeVal(e.target.value)} placeholder="1:30:00" style={{fontFamily:"'DM Mono',monospace",fontSize:"1.4rem",textAlign:"center"}}/>
        <div className="modal-btns"><button className="btn-c" onClick={()=>setShowEditTime(false)}>Cancel</button><button className="btn-ok" onClick={saveEditTime}>Save</button></div>
      </div></div>)}
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
