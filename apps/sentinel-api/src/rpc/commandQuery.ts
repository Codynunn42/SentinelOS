import type { Request, Response } from 'express';
import { SENTINEL_COMM } from '../sentinelCommandTypes.js';
import { sentinelCommandStore } from '../sentinelCommandStore.js';

function hasCommandQueryAccess(identity: Express.SentinelIdentity | undefined): identity is Express.SentinelIdentity {
  if (!identity) {
    return false;
  }

  const roles = identity.roles ?? [];
  return roles.includes('billing.operator') || roles.includes('billing.admin');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function handleCommandQuery(req: Request, res: Response): Promise<void> {
  if (!hasCommandQueryAccess(req.sentinelIdentity)) {
    res.status(403).json({
      ok: false,
      comm: SENTINEL_COMM,
      status: 'denied',
      error: {
        code: 'SENTINEL_ROLE_REQUIRED',
        message: 'billing.operator or billing.admin required',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  const body = isRecord(req.body) ? req.body : {};
  const ack = typeof body.ack === 'string' && body.ack.length > 0 ? body.ack : null;
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit) ? Math.max(1, Math.trunc(body.limit)) : 25;

  if (ack) {
    const receipt = await sentinelCommandStore.getByAck(ack);
    if (!receipt) {
      res.status(404).json({
        ok: false,
        comm: SENTINEL_COMM,
        status: 'denied',
        error: {
          code: 'SENTINEL_RECEIPT_NOT_FOUND',
          message: `No command receipt found for ${ack}`,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    res.status(200).json({
      ok: true,
      comm: SENTINEL_COMM,
      status: 'accepted',
      data: {
        receipt,
      },
      meta: {
        timestamp: new Date().toISOString(),
        operator: req.sentinelIdentity.operator,
        tenantId: req.sentinelIdentity.tenantId,
        actorId: req.sentinelIdentity.actorId,
      },
    });
    return;
  }

  const receipts = await sentinelCommandStore.list(limit);
  res.status(200).json({
    ok: true,
    comm: SENTINEL_COMM,
    status: 'accepted',
    data: {
      receipts,
      count: receipts.length,
      limit,
    },
    meta: {
      timestamp: new Date().toISOString(),
      operator: req.sentinelIdentity.operator,
      tenantId: req.sentinelIdentity.tenantId,
      actorId: req.sentinelIdentity.actorId,
    },
  });
}
