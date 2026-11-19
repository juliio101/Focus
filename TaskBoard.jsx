import { useEffect, useId, useRef, useState } from "react";

export const taskCardKey = (task, day) => task.recurring ? `${task.id}-${day}` : String(task.id);

export function stepIsDone(task, step, date) {
  return task.recurring ? (step.doneOn ?? []).includes(date) : Boolean(step.done);
}

function taskProgress(task, date, done) {
  const steps = task.steps ?? [];
  const total = steps.length;
  const completed = done ? total : steps.filter(step => stepIsDone(task, step, date)).length;
  return {
    percent: done ? 100 : total ? completed / total * 100 : 0,
    label: done ? "Done" : total ? `${completed} of ${total} ${total === 1 ? "step" : "steps"}` : "To do",
  };
}

function ProgressBar({ value, label }) {
  return (
    <div className="task-progress-track" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="task-progress-fill" style={{ width: `${value}%` }}/>
    </div>
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

function getBoardGroups({ tasks, folders, days, dateForDay, tasksForDay, isDone }, today, scope) {
  const todayDate = dateForDay(today);
  const items = new Map();
  const add = (task, day) => {
    items.set(taskCardKey(task, day), { task, day, date: dateForDay(day), done: Boolean(isDone(task, day)) });
  };

  for (const day of scope === "today" ? [today] : days) {
    for (const task of tasksForDay(day)) {
      if (!task.recurring && task.done && task.completedDate && scope === "today" && task.completedDate !== todayDate) continue;
      add(task, day);
    }
  }
  for (const task of tasks) {
    if (task.recurring || items.has(taskCardKey(task, today))) continue;
    const startDate = task.startDate || task.scheduledDate || (days.includes(task.day) ? dateForDay(task.day) : null);
    if ((!task.done && (!startDate || startDate <= todayDate)) || (task.done && task.completedDate === todayDate)) {
      add(task, today);
    }
  }

  const clients = new Map(folders.map(folder => [folder.id, { id: folder.id, name: folder.name, items: [] }]));
  const other = { id: null, name: "No client", items: [] };
  for (const item of items.values()) (clients.get(item.task.folderId) ?? other).items.push(item);
  return [...clients.values(), other].filter(group => group.items.length);
}

export default function TaskBoard({ model, selectedKey, onOpen, onClose, getDailyTime, running }) {
  const [scope, setScope] = useState("today");
  const [focusedClient, setFocusedClient] = useState(undefined);
  const [clientSearch, setClientSearch] = useState("");
  const allGroups = getBoardGroups(model, model.today(), scope);
  const groups = focusedClient === undefined ? allGroups : allGroups.filter(group => group.id === focusedClient);
  const searchTerm = clientSearch.trim().toLocaleLowerCase();
  const visibleGroups = searchTerm ? groups.filter(group => group.name.toLocaleLowerCase().includes(searchTerm)) : groups;
  const items = groups.flatMap(group => group.items);
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
    if (selectedKey && !group.items.some(({task, day}) => taskCardKey(task, day) === selectedKey)) onClose();
  };

  return (
    <main className="task-board">
      <header className="task-board-header">
        <div className="task-board-heading">
          <h1>Tasks</h1>
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
            <span>{group.items.filter(item => item.done).length} of {group.items.length} done</span>
          </div>
          <div className="task-card-grid">
            {group.items.map(({task, day, date, done}) => {
              const key = taskCardKey(task, day);
              const { percent, label } = taskProgress(task, date, done);
              const selected = selectedKey === key;
              return (
                <button type="button" className={`task-board-card${selected ? " selected" : ""}`} key={key}
                  aria-expanded={selected} onClick={() => onOpen(task, day)}>
                  <span className="task-board-card-top">
                    <strong title={task.text}>{task.text}</strong>
                    <span className={`task-board-check${done ? " done" : ""}`} aria-hidden="true">{done ? "✓" : ""}</span>
                  </span>
                  <span className="task-board-card-status">
                    {label}{scope === "week" && task.recurring && ` · ${day.toUpperCase()}`}
                  </span>
                  <span className="task-progress-track" aria-hidden="true"><span className="task-progress-fill" style={{ width: `${percent}%` }}/></span>
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
  const { percent, label } = taskProgress(task, date, done);
  const inputId = useId();
  const steps = task.steps ?? [];
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
          <ProgressBar value={percent} label="Checklist progress"/>
          <ul className="task-steps-list">
            {steps.map(step => (
              <li key={step.id}>
                <label><input type="checkbox" checked={done || stepIsDone(task, step, date)} disabled={done}
                  onChange={() => onToggle(step.id)}/><span>{step.text}</span></label>
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
