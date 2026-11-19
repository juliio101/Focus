import { useEffect, useId, useRef, useState } from "react";
import { localDateKey } from "./taskTimer.js";

export const taskCardKey = (task, date) => task.recurring ? `${task.id}-${date}` : String(task.id);
export const taskStepsForDate = (task, date) => (task.steps ?? []).filter(step => !step.occurrenceDate || step.occurrenceDate === date);

export function stepIsDone(task, step, date) {
  return task.recurring && !step.occurrenceDate ? (step.doneOn ?? []).includes(date) : Boolean(step.done);
}

export function setTaskStepDone(task, step, date, done = true) {
  if (!task.recurring || step.occurrenceDate) return { ...step, done };
  if (stepIsDone(task, step, date) === done) return step;
  const dates = step.doneOn ?? [];
  return { ...step, doneOn: done ? [...dates, date] : dates.filter(value => value !== date) };
}

export function scheduleTaskFollowUp(task, date, remindAt, id) {
  const occurrence = task.recurring ? { occurrenceDate: date } : {};
  const currentSteps = taskStepsForDate(task, date);
  const current = currentSteps.find(step => step.remindAt && !stepIsDone(task, step, date)) ??
    currentSteps.find(step => !stepIsDone(task, step, date));
  const steps = (task.steps ?? []).map(step => step === current ? setTaskStepDone(task, step, date) : step);
  if (!currentSteps.length) steps.push({ id: `${id}-initial`, text: "Initial work", done: true, ...occurrence });
  steps.push({ id, text: "Follow-up", done: false, remindAt, ...occurrence });
  return { ...task, steps };
}

function taskProgress(task, date, done) {
  const steps = taskStepsForDate(task, date);
  const total = steps.length;
  const completed = done ? total : steps.filter(step => stepIsDone(task, step, date)).length;
  return {
    percent: done ? 100 : total ? completed / total * 100 : 0,
    total,
    completed,
    label: done && !steps.some(step => step.remindAt) ? "Done" :
      total ? `${completed} of ${total} ${total === 1 ? "step" : "steps"}` : "To do",
  };
}

function ProgressBar({ value, label, total, completed }) {
  const segmented = total > 1;
  return (
    <span className={`task-progress-track${segmented ? " segmented" : ""}`}
      role={label ? "progressbar" : undefined} aria-label={label} aria-valuenow={label ? value : undefined}
      aria-valuemin={label ? 0 : undefined} aria-valuemax={label ? 100 : undefined} aria-hidden={label ? undefined : true}>
      {segmented ? Array.from({length:total}, (_, index) => <span key={index} className={index < completed ? "filled" : ""}/>) :
        <span className="task-progress-fill" style={{ width: `${value}%` }}/>}
    </span>
  );
}

function BoardMetric({ label, value, detail }) {
  return (
    <div className="task-board-metric">
      <div className="task-board-metric-label"><span>{label}</span><strong>{Number(value.toFixed(1))}%</strong></div>
      <ProgressBar value={value} label={label}/>
      <div className="task-board-metric-detail">{detail}</div>
    </div>
  );
}

function DailyProgress({ getDailyTime, running }) {
  const [,refresh] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => refresh(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const { seconds, goal } = getDailyTime();
  const minutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const worked = hours ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`;
  const percent = goal > 0 ? Math.max(0, Math.min(100, seconds / (goal * 3600) * 100)) : 0;
  return <BoardMetric label="Daily progress" value={percent} detail={`${worked} worked / ${goal}h goal`}/>;
}

const dayForDate = (days, date) => days[(new Date(`${date}T12:00:00`).getDay() + 6) % 7];
const pendingFollowUps = task => (task.steps ?? []).filter(step => step.remindAt && !stepIsDone(task, step, step.occurrenceDate));

function BoardReminders({ model, onOpen }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const clock = setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(clock);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const today = localDateKey(new Date(now));
  const reminders = new Map();
  for (const task of model.tasks) {
    const day = dayForDate(model.days, today);
    if (!model.isDone(task, day, today) && (task.dueDate === today || (task.isReminder && task.startDate === today))) {
      reminders.set(taskCardKey(task, today), { task, date: today, remindAt: null });
    }
    for (const step of pendingFollowUps(task)) {
      if (localDateKey(new Date(step.remindAt)) !== today) continue;
      const date = step.occurrenceDate ?? today;
      const key = taskCardKey(task, date);
      const earlier = reminders.get(key)?.remindAt;
      if (model.isDone(task, dayForDate(model.days, date), date) || (earlier && earlier <= step.remindAt)) continue;
      reminders.set(key, { task, date, remindAt: step.remindAt });
    }
  }
  const sorted = [...reminders].sort(([, a], [, b]) => (a.remindAt ?? 0) - (b.remindAt ?? 0));

  return (
    <section className="task-board-reminders" aria-label="Today's reminders">
      {sorted.length ? sorted.map(([key, {task, date, remindAt}]) => {
        const due = remindAt === null || now >= remindAt;
        const status = remindAt === null ? "Due today" : due ? "Due now" :
          new Date(remindAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        return <button type="button" key={key} className={`task-board-reminder${due ? " due" : ""}`}
          onClick={() => onOpen(task, dayForDate(model.days, date), date)} title={`${task.text} · ${status}`}>
          <span className="task-board-reminder-name">{task.text}</span><strong>{status}</strong>
        </button>;
      }) : <span className="task-board-reminders-empty">No reminders today</span>}
    </section>
  );
}

function getBoardGroups({ tasks, folders, days, dateForDay, tasksForDay, isDone }, today, scope) {
  const todayDate = dateForDay(today);
  const items = new Map();
  const add = (task, day, date = dateForDay(day)) => {
    items.set(taskCardKey(task, date), { task, day, date, done: Boolean(isDone(task, day, date)) });
  };

  for (const day of scope === "today" ? [today] : days) {
    for (const task of tasksForDay(day)) {
      if (!task.recurring && task.done && task.completedDate && scope === "today" && task.completedDate !== todayDate) continue;
      add(task, day);
    }
  }
  for (const task of tasks) {
    if (task.recurring) {
      const through = scope === "today" ? todayDate : dateForDay(days[days.length - 1]);
      for (const {occurrenceDate, remindAt} of pendingFollowUps(task)) {
        if (!occurrenceDate || items.has(taskCardKey(task, occurrenceDate)) || localDateKey(new Date(remindAt)) > through) continue;
        const day = dayForDate(days, occurrenceDate);
        if (!isDone(task, day, occurrenceDate)) add(task, day, occurrenceDate);
      }
      continue;
    }
    if (items.has(taskCardKey(task, todayDate))) continue;
    const startDate = task.startDate || task.scheduledDate || (days.includes(task.day) ? dateForDay(task.day) : null);
    if ((!task.done && (!startDate || startDate <= todayDate)) || (task.done && task.completedDate === todayDate)) {
      add(task, today);
    }
  }

  const clients = new Map(folders.map(folder => [folder.id, { id: folder.id, name: folder.name, items: [] }]));
  const other = { id: null, name: "No client", items: [] };
  for (const item of items.values()) (clients.get(item.task.folderId) ?? other).items.push(item);
  return other.items.length ? [...clients.values(), other] : [...clients.values()];
}

function AddClientTask({ client, onAdd, onCancel }) {
  const [title, setTitle] = useState("");
  return (
    <form className="task-board-add-form" onSubmit={event => {
      event.preventDefault();
      const text = title.trim();
      if (text) onAdd(text);
    }} onKeyDown={event => { if (event.key === "Escape") onCancel(); }}>
      <input autoFocus required aria-label={`Task name for ${client}`} placeholder="Task name" value={title}
        onChange={event => setTitle(event.target.value)}/>
      <button type="submit" className="task-board-add-submit" disabled={!title.trim()}>Add task</button>
      <button type="button" className="task-board-all-clients" onClick={onCancel}>Cancel</button>
    </form>
  );
}

export default function TaskBoard({ model, selectedKey, onOpen, onClose, onAddTask, getDailyTime, running }) {
  const [scope, setScope] = useState("today");
  const [focusedClient, setFocusedClient] = useState(undefined);
  const [clientSearch, setClientSearch] = useState("");
  const [addingFor, setAddingFor] = useState(null);
  const addTrigger = useRef(null);
  const allGroups = getBoardGroups(model, model.today(), scope);
  const groups = focusedClient === undefined ? allGroups : allGroups.filter(group => group.id === focusedClient);
  const searchTerm = clientSearch.trim().toLocaleLowerCase();
  const items = groups.flatMap(group => group.items);
  const visibleGroups = groups.filter(group => searchTerm ? group.name.toLocaleLowerCase().includes(searchTerm) :
    group.items.length || focusedClient !== undefined || !items.length || group.id === addingFor);
  const completed = items.filter(item => item.done).length;
  const taskPercent = items.length ? completed / items.length * 100 : 0;
  const searchClients = value => {
    setClientSearch(value);
    if (value.trim()) setFocusedClient(undefined);
  };
  const toggleClient = group => {
    setClientSearch("");
    if (focusedClient === group.id) {
      setFocusedClient(undefined);
      return;
    }
    setFocusedClient(group.id);
    if (selectedKey && !group.items.some(({task, date}) => taskCardKey(task, date) === selectedKey)) onClose();
  };
  const closeAddTask = () => {
    setAddingFor(null);
    addTrigger.current?.focus();
  };

  return (
    <main className="task-board">
      <header className="task-board-header">
        <div className="task-board-heading">
          <h1>Tasks</h1>
          <BoardReminders model={model} onOpen={(task, day, date) => {
            setClientSearch("");
            if (focusedClient !== undefined && focusedClient !== (task.folderId ?? null)) setFocusedClient(undefined);
            onOpen(task, day, date);
          }}/>
          <select aria-label="Task date range" value={scope} onChange={event => setScope(event.target.value)}>
            <option value="today">Today</option>
            <option value="week">This week</option>
          </select>
          <input type="search" className="task-board-search" aria-label="Search clients" placeholder="Search clients…"
            value={clientSearch} onChange={event => searchClients(event.target.value)}/>
          {focusedClient !== undefined && <button type="button" className="task-board-all-clients" onClick={() => setFocusedClient(undefined)}>All clients</button>}
        </div>
        <div className="task-board-metrics">
          <DailyProgress getDailyTime={getDailyTime} running={running}/>
          <BoardMetric label="Task progress" value={taskPercent} detail={`${completed} of ${items.length} ${items.length === 1 ? "task" : "tasks"} done`}/>
        </div>
      </header>
      {!visibleGroups.length && <p className="task-board-empty" role="status">{searchTerm ? "No clients match your search." :
        `No tasks${focusedClient !== undefined ? " for the selected client" : ""} ${scope === "today" ? "today" : "this week"}.`}</p>}
      {visibleGroups.map(group => (
        <section className="task-board-client" key={group.id ?? "no-client"}>
          <div className="task-board-client-heading">
            <h2><button type="button" className="task-board-client-name" aria-pressed={focusedClient === group.id}
              onClick={() => toggleClient(group)}>{group.name}</button></h2>
            {group.id !== null && <button type="button" className="task-board-add-trigger" aria-label={`Add task for ${group.name}`}
              aria-expanded={addingFor === group.id} onClick={event => {
                addTrigger.current = event.currentTarget;
                setAddingFor(current => current === group.id ? null : group.id);
              }}>+</button>}
            <span>{group.items.filter(item => item.done).length} of {group.items.length} done</span>
          </div>
          {group.id !== null && addingFor === group.id && <AddClientTask client={group.name} onCancel={closeAddTask} onAdd={text => {
            onAddTask(group.id, text);
            closeAddTask();
          }}/>}
          <div className="task-card-grid">
            {group.items.map(({task, day, date, done}) => {
              const key = taskCardKey(task, date);
              const { percent, label, total, completed } = taskProgress(task, date, done);
              const selected = selectedKey === key;
              return (
                <button type="button" className={`task-board-card${selected ? " selected" : ""}`} key={key}
                  aria-expanded={selected} onClick={() => onOpen(task, day, date)}>
                  <span className="task-board-card-top">
                    <strong title={task.text}>{task.text}</strong>
                    <span className={`task-board-check${done ? " done" : ""}`} aria-hidden="true">{done ? "✓" : ""}</span>
                  </span>
                  <span className="task-board-card-status">
                    {label}{scope === "week" && task.recurring && ` · ${day.toUpperCase()}`}
                  </span>
                  <ProgressBar value={percent} total={total} completed={completed}/>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}

export function TaskSteps({ task, date, done, onAdd, onToggle, onRemove }) {
  const [text, setText] = useState("");
  const { percent, label, total, completed } = taskProgress(task, date, done);
  const inputId = useId();
  const steps = taskStepsForDate(task, date);
  const submit = event => {
    event.preventDefault();
    const name = text.trim();
    if (!name) return;
    onAdd(name);
    setText("");
  };

  return (
    <section className="task-steps" aria-label="Task checklist">
      {steps.length > 0 && (
        <>
          <div className="task-steps-count">{done ? "All steps complete" : `${label} done`}</div>
          <ProgressBar value={percent} label="Checklist progress" total={total} completed={completed}/>
          <ul className="task-steps-list">
            {steps.map(step => (
              <li key={step.id}>
                <label><input type="checkbox" checked={done || stepIsDone(task, step, date)} disabled={done}
                  onChange={() => onToggle(step.id)}/><span>{step.text}{step.remindAt &&
                    <small className="task-step-reminder-time"> · {new Date(step.remindAt).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</small>}</span></label>
                {!done && <button type="button" className="task-step-remove" aria-label={`Remove step: ${step.text}`} onClick={() => onRemove(step.id)}>×</button>}
              </li>
            ))}
          </ul>
        </>
      )}
      {!done && (
        <form className="task-step-form" onSubmit={submit}>
          <label className="task-visually-hidden" htmlFor={inputId}>New checklist step</label>
          <input id={inputId} value={text} onChange={event => setText(event.target.value)} placeholder="Add a step" maxLength={200}/>
          <button type="submit" disabled={!text.trim()}>Add</button>
        </form>
      )}
    </section>
  );
}

export function TaskDrawer({ title, client, onClose, children }) {
  const close = useRef(null);
  useEffect(() => {
    const trigger = document.activeElement;
    close.current.focus();
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  return (
    <>
      <div className="task-drawer-scrim" aria-hidden="true" onClick={onClose}/>
      <aside className="task-drawer" aria-label="Task details" onKeyDown={event => {
        if (event.key === "Escape") onClose();
      }}>
        <div className="task-drawer-header">
          <div><div className="task-drawer-client">{client}</div><h2>{title}</h2></div>
          <button type="button" ref={close} className="task-drawer-close" aria-label="Close task details" onClick={onClose}>×</button>
        </div>
        {children}
      </aside>
    </>
  );
}
