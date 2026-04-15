import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DeliveryEnvelope } from './envelope.js';
import { deliverSlack } from './slack.js';
import { routeDeliveries } from './routing.js';
import { loadProfiles, resolveIntentEndpoint } from './profiles.js';
import { getTriggeredEscalationSteps, DEFAULT_ESCALATION_POLICY } from './escalation.js';

function getBaseDir() {
  return process.env.REPORTING_DATA_DIR ? path.resolve(process.env.REPORTING_DATA_DIR) : process.cwd();
}

function getQueueDir() {
  return path.resolve(getBaseDir(), 'receipts', 'deliveries');
}

function getQueuePath() {
  return path.join(getQueueDir(), 'queue.ndjson');
}

function getSuccessPath() {
  return path.join(getQueueDir(), 'delivered.ndjson');
}

function getDeadPath() {
  return path.join(getQueueDir(), 'deadletter.ndjson');
}

function ensureDir() {
  const dir = getQueueDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeLine(filePath: string, line: string) {
  const fd = fs.openSync(filePath, 'a');
  try {
    fs.writeSync(fd, line + '\n', undefined, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function hashPayload(payload: unknown) {
  const h = createHash('sha256');
  h.update(JSON.stringify(payload));
  return h.digest('hex');
}

export function enqueueDelivery(target: string, payload: unknown, run_id: string, opts?: { max_attempts?: number; endpoint?: string; escalation_policy?: import('./escalation.js').EscalationPolicy }) {
  ensureDir();
  const now = Date.now();
  // Backwards-compatible: if caller passed a URL as `target`, treat it as http/https endpoint
  // Note: Both http:// and https:// URLs are normalized to target='http' for routing.
  // The actual protocol is preserved in the endpoint field.
  const isUrl = /^https?:\/\//i.test(target);
  const envelope: DeliveryEnvelope = {
    id: randomUUID(),
    run_id,
    target: isUrl ? 'http' : target,
    endpoint: isUrl ? target : opts?.endpoint,
    payload_hash: hashPayload(payload),
    payload,
    attempts: 0,
    max_attempts: opts?.max_attempts ?? 5,
    next_attempt_at: now,
    created_at: now,
    status: 'pending',
    escalation_policy: opts?.escalation_policy ?? DEFAULT_ESCALATION_POLICY,
    escalation_fired: [],
  };
  writeLine(getQueuePath(), JSON.stringify(envelope));
  // Log enqueue event for observability
  // eslint-disable-next-line no-console
  console.info(`[DELIVERY] run_id=${envelope.run_id} target=${envelope.target} status=pending attempts=${envelope.attempts}`);
  return envelope;
}

async function doPost(url: string, body: unknown) {
  // Use global fetch if available
  if (typeof (globalThis as any).fetch === 'function') {
    const res = await (globalThis as any).fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      // small timeout not implemented here; rely on host
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  }
  // Fallback: use node: https.request is more verbose; throw if unavailable
  throw new Error('fetch not available in runtime');
}

function backoffMs(attempt: number) {
  const base = 1000; // 1s
  const max = 60_000; // cap 60s
  const exp = Math.min(max, base * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 1000);
  return exp + jitter;
}

export async function processDeliveryQueueOnce(): Promise<void> {
  ensureDir();
  const qpath = getQueuePath();
  if (!fs.existsSync(qpath)) return;
  const data = fs.readFileSync(qpath, 'utf8');
  if (!data.trim()) return;
  const lines = data.split(/\r?\n/).filter(Boolean);
  // Truncate queue; retries that remain will be appended back
  fs.writeFileSync(qpath, '', 'utf8');

  for (const line of lines) {
    let env: DeliveryEnvelope;
    try {
      env = JSON.parse(line) as DeliveryEnvelope;
    } catch (e: any) {
      // corrupted line -> move to dead
      writeLine(getDeadPath(), JSON.stringify({ raw: line, err: String(e) }));
      continue;
    }

    const now = Date.now();
    if (env.status !== 'pending' && env.status !== 'failed') {
      // skip non-pending entries
      continue;
    }

    if (env.next_attempt_at > now) {
      // not yet time, re-enqueue
      writeLine(getQueuePath(), JSON.stringify(env));
      continue;
    }

    try {
      // Safety: routing is a logical step, never a real deliverable target
      if (env.target === 'routing') {
        throw new Error('routing is not a deliverable target');
      }
      // If routing is enabled and the payload looks like a CompletionSweepReport,
      // derive multiple delivery intents and process them.
      const routingEnabled = process.env.REPORTING_ROUTING === '1';
      const payload = env.payload as any;
      const looksLikeReport = payload && typeof payload.run_id === 'string' && payload.counts && payload.status;

      if (routingEnabled && looksLikeReport) {
        const intents = routeDeliveries(payload);
        const profiles = loadProfiles();
        // Log routing decision (intents may reference profiles)
        // eslint-disable-next-line no-console
        console.info(`[ROUTING] run_id=${env.run_id} status=${payload.status} intents=${intents
          .map((i) => (i.profile ? `profile=${i.profile}` : `target=${i.target}`))
          .join(',')}`);

        // For each intent, expand profiles into concrete deliveries or use explicit target
        for (const intent of intents) {
          if (intent.profile) {
            const p = profiles[intent.profile];
            if (!p) {
              // eslint-disable-next-line no-console
              console.warn(`[PROFILE] profile=${intent.profile} not found for run_id=${env.run_id} - skipping`);
              continue;
            }
            const resolved: string[] = [];
            if (p.slack) {
              enqueueDelivery('slack', payload, env.run_id, { max_attempts: env.max_attempts, endpoint: p.slack });
              resolved.push('slack');
            }
            if (p.http) {
              enqueueDelivery('http', payload, env.run_id, { max_attempts: env.max_attempts, endpoint: p.http });
              resolved.push('http');
            }
            // eslint-disable-next-line no-console
            console.info(`[PROFILE] profile=${intent.profile} resolved targets=${resolved.join(',')}`);
            continue;
          }
          // explicit target intent (legacy)
          const endpoint = intent.endpoint ?? resolveIntentEndpoint(intent, profiles) ?? env.endpoint ?? env.target;
          const target = intent.target ?? 'http';
          if (process.env.REPORTING_DRY_RUN === '1') {
            // Dry-run: record a dry_run delivered artifact instead of performing network IO
            const dry = { ...env, target, endpoint, status: 'dry_run' as any, attempts: env.attempts };
            writeLine(getSuccessPath(), JSON.stringify(dry));
            // eslint-disable-next-line no-console
            console.info(`[DRY-RUN][DELIVERY] run_id=${env.run_id} target=${target} endpoint=${endpoint} payload_bytes=${JSON.stringify(payload).length}`);
          } else {
            enqueueDelivery(target, payload, env.run_id, { max_attempts: env.max_attempts, endpoint });
          }
        }
        // Mark the parent envelope as succeeded so it doesn't get retried
        env.status = process.env.REPORTING_DRY_RUN === '1' ? 'dry_run' : 'succeeded';
        env.attempts = env.attempts + 1;
        writeLine(getSuccessPath(), JSON.stringify(env));
        // eslint-disable-next-line no-console
        console.info(`[DELIVERY] run_id=${env.run_id} target=routing status=success attempts=${env.attempts}`);
        continue;
      }

      // Route delivery based on envelope target/type.
      if (process.env.REPORTING_DRY_RUN === '1') {
        // Dry-run: log and write dry_run artifact without network IO
        // determine endpoint for logging
        const ep = env.endpoint ?? env.target;
        // eslint-disable-next-line no-console
        console.info(`[DRY-RUN][DELIVERY] run_id=${env.run_id} target=${env.target} endpoint=${ep} payload_bytes=${JSON.stringify(env.payload).length}`);
        env.status = 'dry_run';
        env.attempts = env.attempts + 1;
        writeLine(getSuccessPath(), JSON.stringify(env));
        // eslint-disable-next-line no-console
        console.info(`[DELIVERY] run_id=${env.run_id} target=${env.target} status=dry_run attempts=${env.attempts}`);
      } else {
        await routeDelivery(env);
        env.status = 'succeeded';
        env.attempts = env.attempts + 1;
        writeLine(getSuccessPath(), JSON.stringify(env));
        // eslint-disable-next-line no-console
        console.info(`[DELIVERY] run_id=${env.run_id} target=${env.target} status=success attempts=${env.attempts}`);
      }
    } catch (err: any) {
      env.attempts = env.attempts + 1;
      env.last_error = String(err?.message ?? err);

      // Evaluate escalation policy and enqueue any newly-triggered steps.
      try {
        const triggered = getTriggeredEscalationSteps(env, Date.now());
        if (triggered.length) {
          const profiles = loadProfiles();
          for (const t of triggered) {
            const stepId = `step:${t.index}`;
            // mark fired to ensure idempotency
            env.escalation_fired = env.escalation_fired ?? [];
            env.escalation_fired.push(stepId);
            // resolve profile and enqueue (or dry-run)
            const p = profiles[t.step.profile];
            if (!p) {
              // eslint-disable-next-line no-console
              console.warn(`[ESCALATION] run_id=${env.run_id} step=${t.index} profile=${t.step.profile} not found`);
              continue;
            }
            const targets = t.step.targets ?? ['slack', 'http'];
            for (const ch of targets) {
              if (process.env.REPORTING_DRY_RUN === '1') {
                // record a dry-run delivered artifact instead of network IO
                const endpoint = ch === 'slack' ? p.slack : p.http;
                const dry = { ...env, target: ch, endpoint, status: 'dry_run' as any, attempts: env.attempts };
                writeLine(getSuccessPath(), JSON.stringify(dry));
                // eslint-disable-next-line no-console
                console.info(`[DRY-RUN][DELIVERY] run_id=${env.run_id} target=${ch} endpoint=${endpoint} payload_bytes=${JSON.stringify(env.payload).length}`);
              } else {
                if (ch === 'slack' && p.slack) {
                  enqueueDelivery('slack', env.payload, env.run_id, { max_attempts: env.max_attempts, endpoint: p.slack });
                }
                if (ch === 'http' && p.http) {
                  enqueueDelivery('http', env.payload, env.run_id, { max_attempts: env.max_attempts, endpoint: p.http });
                }
              }
            }
            // eslint-disable-next-line no-console
            console.info(`[ESCALATION] run_id=${env.run_id} fired step=${t.index} profile=${t.step.profile} reason=${t.reason}`);
          }
        }
      } catch (e) {
        // do not allow escalation failures to stop core retry logic
        // eslint-disable-next-line no-console
        console.error(`[ESCALATION] error evaluating steps for run_id=${env.run_id} err=${String(e)}`);
      }

      if (env.attempts >= (env.max_attempts ?? 5)) {
        env.status = 'dead';
        writeLine(getDeadPath(), JSON.stringify(env));
        // eslint-disable-next-line no-console
        console.error(`[DELIVERY] run_id=${env.run_id} target=${env.target} status=dead attempts=${env.attempts} error=${env.last_error}`);
      } else {
        env.status = 'failed';
        env.next_attempt_at = Date.now() + backoffMs(env.attempts);
        writeLine(getQueuePath(), JSON.stringify(env));
        // eslint-disable-next-line no-console
        console.warn(`[DELIVERY] run_id=${env.run_id} target=${env.target} status=retry attempts=${env.attempts} next_at=${env.next_attempt_at} error=${env.last_error}`);
      }
    }
  }
}

async function routeDelivery(env: DeliveryEnvelope) {
  // If endpoint exists use it; otherwise fall back to target-as-URL (legacy)
  const endpoint = env.endpoint ?? env.target;
  switch (env.target) {
    case 'slack':
      if (!endpoint) throw new Error('missing endpoint for slack delivery');
      // deliverSlack returns a Response-like object; we only need success check
      const res = await deliverSlack(endpoint, env.payload as any);
      if ((res as any)?.ok === false) throw new Error(`Slack ${ (res as any)?.status ?? 'error' }`);
      return res;
    case 'http':
    default:
      if (!endpoint) throw new Error('missing endpoint for http delivery');
      return doPost(endpoint, { run_id: env.run_id, payload: env.payload, payload_hash: env.payload_hash });
  }
}
