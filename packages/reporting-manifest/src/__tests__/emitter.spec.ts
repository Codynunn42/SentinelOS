import { describe, it, expect, vi } from 'vitest';
import { initCounters } from '../completionSweep/counters.js';
import { emit_completion_sweep_report } from '../completionSweep/emitter.js';

describe('completion sweep emitter', () => {
  it('always returns a report for zero-work runs and logs', () => {
    const counters = initCounters();
    const runContext = {
      run_id: 'completion_sweep_report::2026-01-18::run-0002',
      run_date: '2026-01-18',
      run_timestamp_utc: new Date().toISOString(),
      sweep_scope: 'active' as const,
      environment: 'dev' as const,
      version: '0.0.1',
    };

    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const report = emit_completion_sweep_report(runContext, counters, []);
    expect(report).toBeDefined();
    expect(report.status).toBe('empty');
    expect(report.counts.attempted).toBe(0);
    expect(report.errors).toEqual([]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('derives error status when system error present', () => {
    const counters = initCounters();
    counters.active.attempted = 1;
    counters.active.completed = 0;

    const runContext = {
      run_id: 'completion_sweep_report::2026-01-18::run-0003',
      run_date: '2026-01-18',
      run_timestamp_utc: new Date().toISOString(),
      sweep_scope: 'active' as const,
      environment: 'dev' as const,
      version: '0.0.1',
    };

    const report = emit_completion_sweep_report(runContext, counters, [
      { code: 'X', message: 'system fail', scope: 'system' },
    ] as any);
    expect(report.status).toBe('error');
  });
});
