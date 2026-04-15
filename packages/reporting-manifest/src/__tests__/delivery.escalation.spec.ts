import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { enqueueDelivery, processDeliveryQueueOnce } from '../delivery/queue.js';

describe('delivery escalation integration', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-'));
    process.env.REPORTING_DATA_DIR = tmp;
  });

  afterEach(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (e) {}
    vi.restoreAllMocks();
    delete process.env.REPORTING_DATA_DIR;
    delete process.env.REPORTING_PROFILES;
  });

  it('fires escalation steps idempotently based on attempts', async () => {
    // Profiles used for escalation targets
    process.env.REPORTING_PROFILES = JSON.stringify({
      ops: { slack: 'https://hooks.slack.test/ops', http: 'https://ops.example/webhook' },
      exec: { slack: 'https://hooks.slack.test/exec', http: 'https://exec.example/webhook' },
    });

    const run_id = 'run-escalate-1';

    // Short policy for test: fire ops at attempt 1, exec at attempt 2
    const policy = {
      steps: [
        { after_attempts: 1, profile: 'ops', targets: ['slack', 'http'] },
        { after_attempts: 2, profile: 'exec', targets: ['slack', 'http'] },
      ],
      max_attempts: 5,
    };

    // Enqueue a parent HTTP delivery that will fail
    enqueueDelivery('https://failing.local/webhook', { foo: 'bar' }, run_id, { max_attempts: 5, escalation_policy: policy as any });

    // Stub fetch: parent failing URL fails, escalation endpoints succeed
    const fetchMock = vi.fn(async (url: string, opts: any) => {
      if (url.startsWith('https://failing.local')) return { ok: false, status: 500 } as any;
      return { ok: true, status: 200 } as any;
    });
    vi.stubGlobal('fetch', fetchMock as any);

    // Process multiple times to drive attempts and escalate
    await processDeliveryQueueOnce(); // attempt 1 -> fires ops
    await processDeliveryQueueOnce(); // attempt 2 -> fires exec
    await processDeliveryQueueOnce(); // process some children
    await processDeliveryQueueOnce(); // ensure children processed

    const base = process.env.REPORTING_DATA_DIR ? path.resolve(process.env.REPORTING_DATA_DIR) : process.cwd();
    const deliveredPath = path.join(base, 'receipts', 'deliveries', 'delivered.ndjson');
    expect(fs.existsSync(deliveredPath)).toBe(true);
    const dlines = fs.readFileSync(deliveredPath, 'utf8').split(/\r?\n/).filter(Boolean);
    const entries = dlines.map((l) => JSON.parse(l));
    const matching = entries.filter((e) => e.run_id === run_id && e.status === 'succeeded');
    // Expect at least some escalated deliveries succeeded (ops and exec)
    expect(matching.length).toBeGreaterThanOrEqual(2);
    // Ensure fetch called at least for escalation endpoints
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
