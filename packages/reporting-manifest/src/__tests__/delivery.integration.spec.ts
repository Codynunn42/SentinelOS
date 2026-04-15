import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { enqueueDelivery, processDeliveryQueueOnce } from '../delivery/queue.js';

describe('delivery queue integration', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-'));
    // do not change cwd (not supported in worker env); use env var override
    process.env.REPORTING_DATA_DIR = tmp;
  });

  afterEach(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
    // restore fetch if mocked
    vi.restoreAllMocks();
    delete process.env.REPORTING_DATA_DIR;
  });

  it('enqueues and processes a delivery (happy path)', async () => {
    const target = 'https://example.invalid/webhook';
    const payload = { hello: 'world' };
    const run_id = 'run-xyz-123';

    // Enqueue
    enqueueDelivery(target, payload, run_id, { max_attempts: 3 });

    const base = process.env.REPORTING_DATA_DIR ? path.resolve(process.env.REPORTING_DATA_DIR) : process.cwd();
    const queuePath = path.join(base, 'receipts', 'deliveries', 'queue.ndjson');
    const deliveredPath = path.join(base, 'receipts', 'deliveries', 'delivered.ndjson');
    const deadPath = path.join(base, 'receipts', 'deliveries', 'deadletter.ndjson');

    // Sanity: queue has our line
    expect(fs.existsSync(queuePath)).toBe(true);
    const qlines = fs.readFileSync(queuePath, 'utf8').split(/\r?\n/).filter(Boolean);
    expect(qlines.length).toBeGreaterThanOrEqual(1);

    // Stub global fetch to return 200 OK
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })) as any);

    // Process queue
    await processDeliveryQueueOnce();

    // Queue may contain future work; it must not contain routing artifacts
    if (fs.existsSync(queuePath)) {
      const remaining = fs.readFileSync(queuePath, 'utf8');
      expect(remaining.includes('"target":"routing"')).toBe(false);
    }

    // delivered.ndjson must exist and contain our envelope with status succeeded
    expect(fs.existsSync(deliveredPath)).toBe(true);
    const dlines = fs.readFileSync(deliveredPath, 'utf8').split(/\r?\n/).filter(Boolean);
    expect(dlines.length).toBeGreaterThanOrEqual(1);
    const last = JSON.parse(dlines[dlines.length - 1]);
    expect(last.run_id).toBe(run_id);
    expect(last.status).toBe('succeeded');
    expect(last.attempts).toBeGreaterThanOrEqual(1);

    // No dead-letter created
    expect(fs.existsSync(deadPath)).toBe(false);
  });

  it('enqueues and processes a slack delivery (happy path)', async () => {
    const target = 'slack';
    const endpoint = 'https://hooks.slack.test/webhook';
    const payload = { run_id: 'run-slack-1', counts: { attempted: 1, completed: 1 }, status: 'success' } as any;
    const run_id = 'run-slack-1';

    // Enqueue with explicit endpoint
    enqueueDelivery(target, payload, run_id, { max_attempts: 3, endpoint });

    const base = process.env.REPORTING_DATA_DIR ? path.resolve(process.env.REPORTING_DATA_DIR) : process.cwd();
    const deliveredPath = path.join(base, 'receipts', 'deliveries', 'delivered.ndjson');

    // Capture fetch calls and inspect body
    const fetchMock = vi.fn(async (url: string, opts: any) => {
      expect(url).toBe(endpoint);
      const body = JSON.parse(opts.body);
      // Slack body should have text and blocks
      expect(body.text).toContain('Completion Sweep Report');
      expect(Array.isArray(body.blocks)).toBe(true);
      return { ok: true, status: 200 } as any;
    });
    vi.stubGlobal('fetch', fetchMock as any);

    await processDeliveryQueueOnce();

    // delivered.ndjson must exist and contain our envelope with status succeeded
    expect(fs.existsSync(deliveredPath)).toBe(true);
    const dlines = fs.readFileSync(deliveredPath, 'utf8').split(/\r?\n/).filter(Boolean);
    expect(dlines.length).toBeGreaterThanOrEqual(1);
    const parsed = dlines.map((l) => JSON.parse(l));
    const matching = parsed.filter((d) => d.run_id === run_id);
    expect(matching.length).toBeGreaterThan(0);
    const last = matching[matching.length - 1];
    expect(last.status).toBe('succeeded');
    expect(last.attempts).toBeGreaterThanOrEqual(1);
    // Ensure at least one slack delivery was produced
    expect(parsed.some((d) => d.target === 'slack')).toBe(true);
  });

  it('routes via profile and delivers slack+http (routing+profiles)', async () => {
    process.env.REPORTING_ROUTING = '1';
    process.env.SLACK_OPS_WEBHOOK = 'https://hooks.slack.test/ops';
    process.env.OPS_WEBHOOK_URL = 'https://ops.example/webhook';

    const payload = { run_id: 'run-profile-1', counts: { attempted: 2, completed: 1 }, status: 'error' } as any;
    const run_id = 'run-profile-1';

    // Enqueue a parent envelope using legacy http target (routing will expand)
    enqueueDelivery('http', payload, run_id, { max_attempts: 3 });

    // Stub fetch to accept both slack and http
    const fetchMock = vi.fn(async (url: string, opts: any) => {
      return { ok: true, status: 200 } as any;
    });
    vi.stubGlobal('fetch', fetchMock as any);

    // First pass: process parent and enqueue child intents
    await processDeliveryQueueOnce();
    // Second pass: process enqueued child deliveries
    await processDeliveryQueueOnce();

    const base = process.env.REPORTING_DATA_DIR ? path.resolve(process.env.REPORTING_DATA_DIR) : process.cwd();
    const deliveredPath = path.join(base, 'receipts', 'deliveries', 'delivered.ndjson');
    expect(fs.existsSync(deliveredPath)).toBe(true);
    const dlines = fs.readFileSync(deliveredPath, 'utf8').split(/\r?\n/).filter(Boolean);
    // Should have at least two deliveries (slack + http)
    const entries = dlines.map((l) => JSON.parse(l));
    const found = entries.filter((e) => e.run_id === run_id && e.status === 'succeeded');
    expect(found.length).toBeGreaterThanOrEqual(2);

    // cleanup
    delete process.env.REPORTING_ROUTING;
    delete process.env.SLACK_OPS_WEBHOOK;
    delete process.env.OPS_WEBHOOK_URL;
  });
});
