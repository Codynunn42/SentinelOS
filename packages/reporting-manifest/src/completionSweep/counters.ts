import { Counts } from './types.js';

export function initCounters(): { active: Counts; hibernated: Counts } {
  const zero: Counts = { attempted: 0, completed: 0, failed: 0, skipped: 0 };
  return { active: { ...zero }, hibernated: { ...zero } };
}

export function aggregateCounts(scopes: { active: Counts; hibernated: Counts }): Counts {
  return {
    attempted: scopes.active.attempted + scopes.hibernated.attempted,
    completed: scopes.active.completed + scopes.hibernated.completed,
    failed: scopes.active.failed + scopes.hibernated.failed,
    skipped: scopes.active.skipped + scopes.hibernated.skipped,
  };
}
