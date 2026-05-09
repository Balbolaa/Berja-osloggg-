import type { Tables } from '@/integrations/supabase/types';

type TaskRow = Pick<Tables<'tasks'>, 'duration_minutes' | 'preferred_date' | 'preferred_time'>;

const formatPart = (value: number) => value.toString().padStart(2, '0');

export const getDurationParts = (durationMinutes: number) => ({
  hours: Math.floor(durationMinutes / 60),
  minutes: durationMinutes % 60,
});

export const formatTaskDuration = (durationMinutes: number) => {
  const { hours, minutes } = getDurationParts(durationMinutes);
  const parts = [];

  if (hours > 0) {
    parts.push(`${hours} ч`);
  }

  if (minutes > 0) {
    parts.push(`${minutes} мин`);
  }

  return parts.join(' ') || '0 мин';
};

export const getTaskStartDate = (task: TaskRow) => {
  if (!task.preferred_date || !task.preferred_time) return null;

  const parsed = new Date(`${task.preferred_date}T${task.preferred_time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getTaskEndDate = (task: TaskRow) => {
  const start = getTaskStartDate(task);
  if (!start) return null;

  return new Date(start.getTime() + task.duration_minutes * 60 * 1000);
};

export const isTaskActiveNow = (task: TaskRow, now = new Date()) => {
  const start = getTaskStartDate(task);
  const end = getTaskEndDate(task);

  if (!start || !end) return false;

  return now >= start && now < end;
};

export const formatTaskWindow = (task: TaskRow) => {
  const start = getTaskStartDate(task);
  const end = getTaskEndDate(task);
  if (!start || !end) return null;

  return `${formatPart(start.getHours())}:${formatPart(start.getMinutes())} - ${formatPart(end.getHours())}:${formatPart(end.getMinutes())}`;
};

export const formatTaskDayAndWindow = (task: TaskRow) => {
  const start = getTaskStartDate(task);
  const window = formatTaskWindow(task);
  if (!start || !window) return null;

  const day = start.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return `${day}, ${window}`;
};

export const findActiveTask = <T extends TaskRow>(tasks: T[], now = new Date()) =>
  tasks.find((task) => isTaskActiveNow(task, now)) ?? null;

export const doTasksOverlap = (firstTask: TaskRow, secondTask: TaskRow) => {
  const firstStart = getTaskStartDate(firstTask);
  const firstEnd = getTaskEndDate(firstTask);
  const secondStart = getTaskStartDate(secondTask);
  const secondEnd = getTaskEndDate(secondTask);

  if (!firstStart || !firstEnd || !secondStart || !secondEnd) {
    return false;
  }

  return firstStart < secondEnd && secondStart < firstEnd;
};

export const findOverlappingTask = <T extends TaskRow>(tasks: T[], candidateTask: TaskRow) =>
  tasks.find((task) => doTasksOverlap(task, candidateTask)) ?? null;
