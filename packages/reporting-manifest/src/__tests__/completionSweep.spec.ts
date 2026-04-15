import { describe, it, expect } from 'vitest';
import { validateCompletionSweepReport } from '../completionSweep/validate.js';

describe('completion sweep report contract', () => {
  it('accepts a minimal zero-work report', () => {
    const report = {
      report_type: 'completion_sweep_report',
      run_id: 'completion_sweep_report::2026-01-18::run-0001',
      run_date: '2026-01-18',
      run_timestamp_utc: new Date().toISOString(),
      sweep_scope: 'active',
      counts: { attempted: 0, completed: 0, failed: 0, skipped: 0 },
      by_scope: {
        active: { attempted: 0, completed: 0, failed: 0, skipped: 0 },
        hibernated: { attempted: 0, completed: 0, failed: 0, skipped: 0 }
      },
      status: 'empty',
      errors: [],
      metadata: { system: 'Sentinel', environment: 'dev', version: '0.0.0' }
    };

    const { valid, errors } = validateCompletionSweepReport(report);
    expect(valid).toBe(true);
    expect(errors).toBeUndefined();
  });

  it('rejects missing required fields', () => {
    const bad = { report_type: 'completion_sweep_report' };
    const res = validateCompletionSweepReport(bad);
    expect(res.valid).toBe(false);
    expect(res.errors && res.errors.length > 0).toBe(true);
  });
});
