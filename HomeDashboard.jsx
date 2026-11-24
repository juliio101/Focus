import { useEffect, useState } from "react";

const HEALTH_BANDS = [
  { label: "Healthy", color: "#a3ef64", statuses: ["#34d399", "#a3e635"] },
  { label: "Watch", color: "#fbbf24", statuses: ["#fbbf24"] },
  { label: "At risk", color: "#f87171", statuses: ["#fb923c", "#ef4444"] },
];

function Progress({ value, label }) {
  return (
    <div className="home-progress" role="progressbar" aria-label={label} aria-valuenow={value}>
      <span style={{ width: `${value}%` }}/>
    </div>
  );
}

function PortfolioHealth({ clients, attention, onClients, onAddClient }) {
  let offset = 0;
  const segments = HEALTH_BANDS.map(band => {
    const count = clients.filter(client => band.statuses.includes(client.health)).length;
    const start = offset;
    offset += clients.length ? count / clients.length * 100 : 0;
    return { ...band, count, start, end: offset };
  });
  const colors = segments.filter(segment => segment.count)
    .map(({ color, start, end }) => `${color} ${start}% ${end}%`).join(", ");

  return (
    <section className="home-dashboard-card home-portfolio" aria-labelledby="home-health-title">
      <div className="home-health-visual">
        <div className="home-health-ring" style={{ background: colors ? `conic-gradient(${colors})` : undefined }}>
          <div><strong>{clients.length}</strong><span>Active clients</span></div>
        </div>
      </div>
      <div className="home-health-details">
        <div className="home-panel-heading">
          <h2 id="home-health-title">Client portfolio health</h2>
          <button className="ghost-btn" onClick={onClients}>View all clients</button>
        </div>
        <ul className="home-health-legend">
          {segments.map(({ label, color, count }) => (
            <li key={label}><i style={{ background: color }}/><strong>{count}</strong> {label}</li>
          ))}
        </ul>
        {attention.length ? (
          <table className="home-attention-table">
            <thead><tr><th scope="col">Client</th><th scope="col">Needs attention</th><th scope="col">Next action</th></tr></thead>
            <tbody>{attention.slice(0, 3).map(({ client, reason, action, onAction, urgent }) => (
              <tr key={client.id}>
                <th scope="row"><span aria-hidden="true">{client.icon}</span> {client.name}</th>
                <td className={urgent ? "home-attention-urgent" : "home-attention-watch"}>{reason}</td>
                <td><button onClick={onAction} aria-label={`${action} for ${client.name}`}>{action}</button></td>
              </tr>
            ))}</tbody>
          </table>
        ) : (
          <p className="home-dashboard-empty">
            {clients.length ? "No clients need attention right now." : "No active clients yet."}
            {!clients.length && <button className="ghost-btn" onClick={onAddClient}>Add client</button>}
          </p>
        )}
      </div>
    </section>
  );
}

function TodayActivity({ entries, readSeconds, goal, running, onTasks }) {
  const [, refreshTime] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => refreshTime(tick => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const seconds = readSeconds();
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const tracked = hours ? `${hours}h ${minutes % 60}m` : minutes ? `${minutes}m` : `${Math.floor(seconds)}s`;
  const progress = goal > 0 ? Math.min(100, Math.round(seconds / (goal * 3600) * 100)) : 0;
  return (
    <section className="home-dashboard-card home-activity" aria-labelledby="home-activity-title">
      <div className="home-panel-heading">
        <h2 id="home-activity-title">Today’s activity</h2>
        <button className="ghost-btn" onClick={onTasks}>View tasks</button>
      </div>
      <div className="home-activity-time">
        <span>{running ? "Timer running" : "Time tracked"}</span>
        <strong>{tracked} <small>{goal > 0 ? `/ ${goal}h` : "· No goal"}</small></strong>
      </div>
      <Progress value={progress} label="Time goal progress"/>
      {entries.length ? (
        <ul className="home-activity-list">
          {entries.slice(0, 5).map(({ task, client, completedAt, onOpen }) => (
            <li key={task.id}>
              <span className="home-activity-check" aria-hidden="true">✓</span>
              <button onClick={onOpen}><strong>{task.text}</strong>{client && <small>{client}</small>}</button>
              {completedAt && <time dateTime={new Date(completedAt).toISOString()}>
                {new Date(completedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </time>}
            </li>
          ))}
        </ul>
      ) : <p className="home-dashboard-empty">No tasks completed today yet.</p>}
    </section>
  );
}

export default function HomeDashboard({
  greeting, dateLabel, boss, clients, attention, completed, total, week, entries, readSeconds, goal,
  running, onClients, onAddClient, onTasks, onInsights,
}) {
  const percent = total ? Math.round(completed / total * 100) : 0;
  const largest = Math.max(1, ...week.map(day => day.completed));
  return (
    <div className="home-dashboard">
      <header className="home-dashboard-header">
        <div><p>{dateLabel}</p><h1>{greeting}</h1></div>
        <button className="home-boss-summary" data-tour="boss-score" onClick={onInsights} title={boss.tip}>
          <span>Boss Score</span><strong style={{ color: boss.color }}>{boss.score}</strong>
          <span className="home-boss-band" style={{ color: boss.color }}>{boss.band}</span>
        </button>
      </header>
      <PortfolioHealth clients={clients} attention={attention} onClients={onClients} onAddClient={onAddClient}/>
      <div className="home-dashboard-bottom">
        <section className="home-dashboard-card home-completed" aria-labelledby="home-completed-title">
          <div className="home-panel-heading"><h2 id="home-completed-title">Work completed</h2><span>{percent}% today</span></div>
          <p className="home-completed-count"><strong>{completed}</strong><span> / {total}</span></p>
          <p className="home-completed-label">Tasks done today</p>
          <Progress value={percent} label="Today's task completion"/>
          <h3>My week</h3>
          <div className="home-week-chart" aria-label="Tasks completed by day this week">
            {week.map(day => (
              <button key={day.label} className={day.today ? "today" : undefined} onClick={day.onOpen}
                aria-current={day.today ? "date" : undefined}
                aria-label={`${day.label}: ${day.completed} of ${day.total} tasks completed`}>
                <span>{day.completed}/{day.total}</span>
                <span className="home-week-bar"><i style={{ height: `${day.completed / largest * 100}%` }}/></span>
                <strong>{day.label}</strong>
              </button>
            ))}
          </div>
        </section>
        <TodayActivity entries={entries} readSeconds={readSeconds} goal={goal} running={running} onTasks={onTasks}/>
      </div>
    </div>
  );
}
