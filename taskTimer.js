export const CHECK_IN_MINUTES = 15;
const CHECK_IN_MS = CHECK_IN_MINUTES * 60_000;

export const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const timerDeadline = startedAt => startedAt + CHECK_IN_MS;

export function liveTaskSeconds(task, now = Date.now()) {
  if (!task.timerRunning || task.timerStartedAt == null) return 0;
  return Math.max(0, Math.min(now, timerDeadline(task.timerStartedAt)) - task.timerStartedAt) / 1000;
}

export function stopTaskTimer(task, now) {
  if (!task.timerRunning) return task;
  const startedAt = task.timerStartedAt;
  const paused = { ...task, timerRunning: false, timerStartedAt: null };
  if (startedAt == null) return paused;

  const deadline = timerDeadline(startedAt);
  const end = Math.min(now, deadline);
  const seconds = Math.floor(liveTaskSeconds(task, now));
  const secondsByDay = {};
  const timeLog = { ...task.timeLog };
  const legacyTimerSeconds = task.timeLog ? task.legacyTimerSeconds ?? 0 : task.timerSeconds ?? 0;
  for (let cursor = startedAt; cursor < end;) {
    const nextDay = new Date(cursor);
    nextDay.setHours(24, 0, 0, 0);
    const next = Math.min(nextDay.getTime(), end);
    const daySeconds = Math.floor((next - startedAt) / 1000) - Math.floor((cursor - startedAt) / 1000);
    if (daySeconds > 0) {
      const date = localDateKey(new Date(cursor));
      secondsByDay[date] = daySeconds;
      timeLog[date] = (timeLog[date] ?? 0) + daySeconds;
    }
    cursor = next;
  }
  return {
    ...paused,
    timeLog,
    ...(legacyTimerSeconds > 0 && { legacyTimerSeconds }),
    timerSeconds: (task.timerSeconds ?? legacyTimerSeconds) + seconds,
    timerCheckIn: now >= deadline ? { startedAt, secondsByDay } : null,
  };
}

export function resolveTimerCheckIn(task, startedAt, minutes, resumeAt = null) {
  const checkIn = task.timerCheckIn;
  if (!checkIn || checkIn.startedAt !== startedAt || task.timerRunning) return task;

  const timeLog = { ...task.timeLog };
  let remaining = Math.min(CHECK_IN_MINUTES, Math.max(0, Math.trunc(minutes) || 0)) * 60;
  let removed = 0;
  for (const date of Object.keys(checkIn.secondsByDay).sort().reverse()) {
    if (remaining === 0) break;
    const seconds = Math.min(remaining, checkIn.secondsByDay[date]);
    const available = Math.min(Math.max(0, timeLog[date] ?? 0), seconds);
    if (available > 0) timeLog[date] -= available;
    removed += available;
    remaining -= seconds;
  }
  return {
    ...task,
    timeLog,
    timerSeconds: Math.max(0, (task.timerSeconds ?? 0) - removed),
    timerCheckIn: null,
    timerRunning: resumeAt != null,
    timerStartedAt: resumeAt,
  };
}
