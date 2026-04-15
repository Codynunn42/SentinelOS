import { createHash, createHmac } from 'crypto';
import { createRequire } from 'module';
import { Pool, PoolClient } from 'pg';
import * as secp from '@noble/secp256k1';

// Use createRequire for robust ESM/CJS interop with canonicalize (which uses export=)
const _require = createRequire(import.meta.url);
const canonicalize = _require('canonicalize') as (value: unknown) => string | undefined;

secp.etc.hmacSha256Sync = (key: Uint8Array, ...msgs: Uint8Array[]) => {
  const h = createHmac('sha256', Buffer.from(key));
  msgs.forEach((m: Uint8Array) => h.update(Buffer.from(m)));
  return new Uint8Array(h.digest());
};

type StopPayload = {
  execution_id: string;
  workspace_id: string;
  ledger_id: number;
  payment_id: number;
  amount_minor: number;
  currency: string;
  destination_ref: string;
  created_at: string;
  created_by: string;
  session_id: string;
  validation_hash: string;
};

type VerifyParams = {
  payload: StopPayload;
  signature: Uint8Array;
  publicKey: Uint8Array;
  signatureFormat: 'DER' | 'COMPACT64';
};

function sha256(data: Uint8Array | string): Buffer {
  return createHash('sha256').update(data).digest();
}

function enforceLowS(signature: Uint8Array): void {
  const sig = secp.Signature.fromCompact(signature);
  if (sig.hasHighS()) throw new Error('High-S signature rejected');
}

async function fetchExecutionKey(client: PoolClient, workspaceId: string, fingerprint: Buffer) {
  const res = await client.query(
    `
    SELECT public_key
    FROM execution_keys
    WHERE workspace_id = $1
      AND pubkey_fingerprint = $2
      AND role = 'EXECUTION_AUTHORITY'
      AND is_active = true
    LIMIT 1
    `,
    [workspaceId, fingerprint]
  );

  if (res.rowCount !== 1) throw new Error('Execution key not authorized');
  return res.rows[0].public_key as Buffer;
}

export async function verifyAndExecute(pool: Pool, params: VerifyParams) {
  const { payload, signature, publicKey, signatureFormat } = params;

  const canonical = canonicalize(payload);
  if (canonical === undefined)
    throw new Error('Canonicalization failed: payload could not be serialized');
  const canonicalBytes = Buffer.from(canonical, 'utf8');
  const computedHash = sha256(canonicalBytes);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const stopRes = await client.query(
      `
      SELECT id, stop_hash, consumed_at
      FROM stop_tokens
      WHERE workspace_id = $1
        AND execution_id = $2
      FOR UPDATE
      `,
      [payload.workspace_id, payload.execution_id]
    );

    if (stopRes.rowCount !== 1) throw new Error('STOP token not found');
    const stop = stopRes.rows[0];
    if (stop.consumed_at !== null) throw new Error('Replay detected');
    if (!Buffer.from(stop.stop_hash).equals(computedHash)) throw new Error('STOP hash mismatch');

    const fingerprint = sha256(publicKey);

    const storedPubKey = await fetchExecutionKey(client, payload.workspace_id, fingerprint);
    if (!Buffer.from(storedPubKey).equals(publicKey)) throw new Error('Public key mismatch');

    // Only COMPACT64 is supported; DER format is defined in the schema for future use
    // but requires a separate normalization path not yet implemented.
    if (signatureFormat !== 'COMPACT64') throw new Error('Unsupported signature format');
    const normalizedSig: Uint8Array = signature;

    enforceLowS(normalizedSig);

    const isValid = await secp.verify(normalizedSig, computedHash, publicKey);
    if (!isValid) throw new Error('Invalid signature');

    const burnRes = await client.query(
      `
      UPDATE stop_tokens
      SET
        consumed_at = now(),
        execution_signature = $1,
        execution_pubkey = $2,
        signature_format = $3,
        signature_verified_at = now()
      WHERE id = $4
        AND consumed_at IS NULL
      `,
      [Buffer.from(normalizedSig), Buffer.from(publicKey), signatureFormat, stop.id]
    );

    if (burnRes.rowCount !== 1) throw new Error('Atomic burn failed');

    await client.query(
      `
      INSERT INTO execution_receipts (
        workspace_id,
        stop_token_id,
        ledger_id,
        stop_hash,
        execution_signature,
        execution_pubkey,
        pubkey_fingerprint
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        payload.workspace_id,
        stop.id,
        payload.ledger_id,
        computedHash,
        Buffer.from(normalizedSig),
        Buffer.from(publicKey),
        fingerprint,
      ]
    );
    await client.query('COMMIT');

    // Best-effort seal-chain integration: insert into seal_queue after commit.
    // NOTE: This is fire-and-forget — failures are rate-limited logged but not retried.
    // If strict seal-queue guarantees are required, move this inside the transaction.
    setImmediate(async () => {
      try {
        await pool.query(
          'INSERT INTO seal_queue (ledger_id, stop_hash, created_at) VALUES ($1, $2, now())',
          [payload.ledger_id, computedHash]
        );
      } catch (e) {
        rateLimitedFailureLog(payload.workspace_id, String(e));
      }
    });

    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Simple rate-limited failure logger: allow up to 5 logs per 60s per workspace
const failureWindowMs = 60_000;
const failureLimit = 5;
const failureMap = new Map<string, { count: number; windowStart: number }>();

function rateLimitedFailureLog(workspaceId: string, msg: string) {
  try {
    const now = Date.now();
    const s = failureMap.get(workspaceId) || { count: 0, windowStart: now };
    if (now - s.windowStart > failureWindowMs) {
      s.count = 0;
      s.windowStart = now;
    }
    s.count += 1;
    failureMap.set(workspaceId, s);
    if (s.count <= failureLimit) {
      console.warn(`[seal-integration][${workspaceId}] ${msg}`);
    }
  } catch (_) {
    // no-op
  }
}
