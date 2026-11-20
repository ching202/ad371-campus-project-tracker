import { HttpError } from './errors.js';

export const MAX_TASKS = 100;
const statuses = new Set(['todo', 'in_progress', 'done']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = message => { throw new HttpError(400, 'INVALID_INPUT', message); };

function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad('Expected a JSON object.');
  for (const key of Object.keys(value)) if (!fields.includes(key)) bad(`Unsupported field: ${key}.`);
}

function text(value, label, limit, allowEmpty = false) {
  if (typeof value !== 'string' || !value.isWellFormed() || value.includes('\u0000')) {
    bad(`${label} must be a valid text string without null characters.`);
  }
  const cleaned = allowEmpty ? value : value.trim();
  if ((!allowEmpty && !cleaned) || [...cleaned].length > limit) {
    bad(`${label} must contain ${allowEmpty ? '0' : '1'}–${limit} characters.`);
  }
  return cleaned;
}

export function validateId(value) {
  if (typeof value !== 'string' || !uuid.test(value)) bad('ID must be a UUID.');
  return value.toLowerCase();
}

export function validateTask(value, patch = false) {
  object(value, ['title', 'status']);
  const result = {};
  if (!patch || Object.hasOwn(value, 'title')) result.title = text(value.title, 'Task title', 120);
  if (Object.hasOwn(value, 'status')) {
    if (!statuses.has(value.status)) bad('Status must be todo, in_progress, or done.');
    result.status = value.status;
  } else if (!patch) result.status = 'todo';
  if (patch && Object.keys(result).length === 0) bad('Provide a title or status to update.');
  return result;
}

export function validateProject(value, patch = false) {
  object(value, patch ? ['title', 'description'] : ['title', 'description', 'tasks']);
  const result = {};
  if (!patch || Object.hasOwn(value, 'title')) result.title = text(value.title, 'Project title', 120);
  if (Object.hasOwn(value, 'description')) result.description = text(value.description, 'Description', 2000, true);
  else if (!patch) result.description = '';
  if (!patch) {
    const tasks = Object.hasOwn(value, 'tasks') ? value.tasks : [];
    if (!Array.isArray(tasks) || tasks.length > MAX_TASKS) bad('Tasks must be an array of at most 100 items.');
    result.tasks = tasks.map(task => validateTask(task));
  }
  if (patch && Object.keys(result).length === 0) bad('Provide a title or description to update.');
  return result;
}

export function pagination(query) {
  object(query, ['limit', 'offset']);
  const number = (value, fallback, min, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) bad('Pagination values must be whole numbers.');
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < min || n > max) bad('Pagination value is outside the allowed range.');
    return n;
  };
  return { limit: number(query.limit, 50, 1, 100), offset: number(query.offset, 0, 0, 1000000) };
}
