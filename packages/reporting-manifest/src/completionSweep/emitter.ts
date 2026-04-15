import { CompletionSweepReport, SweepErrorsItem } from './types.js';
import { aggregateCounts } from './counters.js';

export type RunContext = {
  run_id: string;
  run_date: string; // YYYY-MM-DD
  run_timestamp_utc: string; // ISO-8601
  sweep_scope: 'active' | 'hibernated' | 'unified';
  environment: 'prod' | 'staging' | 'dev';
  version: string;
};

export function deriveStatus(systemErrorPresent: boolean, totalAttempted: number, totalCompleted: number) {
  if (systemErrorPresent) return 'error';
  if (totalAttempted === 0) return 'empty';
  if (totalCompleted === totalAttempted) return 'success';
  return 'partial';
}

export function emit_completion_sweep_report(
  run_context: RunContext,
  counters: { active: any; hibernated: any },
  errors?: SweepErrorsItem[]
): CompletionSweepReport {
  // Zero-safe normalization
  const normalized = {
    active: {
      attempted: Number(counters?.active?.attempted ?? 0),
      completed: Number(counters?.active?.completed ?? 0),
      failed: Number(counters?.active?.failed ?? 0),
      skipped: Number(counters?.active?.skipped ?? 0),
    },
    hibernated: {
      attempted: Number(counters?.hibernated?.attempted ?? 0),
      completed: Number(counters?.hibernated?.completed ?? 0),
      failed: Number(counters?.hibernated?.failed ?? 0),
      skipped: Number(counters?.hibernated?.skipped ?? 0),
    },
  };

  const errs = Array.isArray(errors) ? errors : [];

  const totals = aggregateCounts(normalized);
  const totalAttempted = totals.attempted;
  const totalCompleted = totals.completed;

  const systemErrorPresent = errs.some((e) => e.scope === 'system');
  const status = deriveStatus(systemErrorPresent, totalAttempted, totalCompleted);

  const report: CompletionSweepReport = {
    report_type: 'completion_sweep_report',
    run_id: run_context.run_id,
    run_date: run_context.run_date,
    run_timestamp_utc: run_context.run_timestamp_utc,
    sweep_scope: run_context.sweep_scope,
    counts: totals,
    by_scope: normalized,
    status,
    errors: errs,
    metadata: {
      system: 'Sentinel',
      environment: run_context.environment,
      version: run_context.version,
    },
  };

  // Proof of execution: log a concise signal
  // eslint-disable-next-line no-console
  console.info(`[REPORT] Completion Sweep Report emitted | run_id=${report.run_id} | status=${report.status} | attempted=${report.counts.attempted} completed=${report.counts.completed}`);

  return report;
}
