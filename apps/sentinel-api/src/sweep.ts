import { initCounters, emit_completion_sweep_report, persistReport, enqueueDelivery } from '@nunncorp/reporting-manifest';

async function runDemoSweep(shouldThrow = false) {
  const runContext = {
    run_id: `completion_sweep_report::${new Date().toISOString().slice(0, 10)}::run-${Math.floor(Math.random() * 10000)}`,
    run_date: new Date().toISOString().slice(0, 10),
    run_timestamp_utc: new Date().toISOString(),
    sweep_scope: 'active' as const,
    environment: (process.env.NODE_ENV === 'production' ? 'prod' : 'dev') as 'prod' | 'staging' | 'dev',
    version: process.env.SENTINEL_VERSION ?? 'dev',
  };

  const counters = initCounters();
  const errors: Array<{ code: string; message: string; scope: 'active' | 'hibernated' | 'system' }> = [];

  try {
    // Example processing: pick up 2 items, succeed one, fail one (or throw)
    counters.active.attempted += 1;
    counters.active.completed += 1;

    counters.active.attempted += 1;
    if (shouldThrow) {
      throw new Error('simulated crash during processing');
    }
    counters.active.completed += 1;
  } catch (err: any) {
    // Capture system-level error and ensure we surface it to the emitter.
    errors.push({ code: 'SWEEP_ERR', message: err?.message ?? String(err), scope: 'system' });
    // do not swallow — rethrow after emission
    throw err;
  } finally {
    // Non-skippable emission: always invoked, even on error
    const report = emit_completion_sweep_report(runContext, counters as any, errors as any);
    // Persist the report durably (NDJSON + counts CSV). This is synchronous and fsynced.
    try {
      persistReport(report);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to persist sweep report:', e);
    }
    // Enqueue delivery if a webhook target is configured. Do not block emission.
    try {
      const target = process.env.REPORTING_WEBHOOK_URL;
      if (target) {
        enqueueDelivery(target, report, report.run_id);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to enqueue delivery:', e);
    }
    // Minimal observable proof (emitter also logs). Keep a short console summary here.
    // eslint-disable-next-line no-console
    console.log(`[SWEEP] Emitted report run_id=${report.run_id} status=${report.status}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Allow opt-in simulation of error via env var
  const shouldThrow = process.env.SWEEP_THROW === '1';
  runDemoSweep(shouldThrow).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Sweep runner failed:', err?.message ?? err);
    process.exit(1);
  });
}

export { runDemoSweep };
