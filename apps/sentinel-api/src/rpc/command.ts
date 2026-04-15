import type { Request, Response } from 'express';
import { buildCommandReceipt, createAck, hashResult } from '../sentinelCommandLedger.js';
import { getCommandHandler, hydrateEnvelopeRequirements } from '../sentinelCommandRegistry.js';
import { validateCommandOtp } from '../sentinelOtp.js';
import { sentinelCommandStore } from '../sentinelCommandStore.js';
import {
  SENTINEL_COMM,
  type SentinelCommandEnvelope,
  type SentinelCommandResponse,
  type SentinelLane,
  type SentinelOperation,
} from '../sentinelCommandTypes.js';

const VALID_LANES: SentinelLane[] = ['conversational', 'command'];
const VALID_OPERATIONS: SentinelOperation[] = [
  'billing.finalize_usage',
  'billing.reports.query',
  'billing.reports.retry',
  'billing.reports.reconcile',
  'pricing.validate',
  'pricing.outliers.detect',
  'workflow.step.record',
  'workflow.bottleneck.analyze',
  'report.generate',
  'repo.optimize',
  'ci.runs.query',
  'ci.runs.rerun_failed',
  'ci.pr.status',
  'ci.pr.summarize_failures',
  'ci.pr.comment',
  'ci.runs.cancel_stale',
  'vault.write',
  'dns.update',
  'payroll.run',
  'docs.generate',
  'governance.approve',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEnvelope(body: unknown): SentinelCommandEnvelope | null {
  if (!isRecord(body)) {
    return null;
  }

  const comm = body.comm;
  const session = body.session;
  const lane = body.lane;
  const op = body.op;
  const action = body.action;
  const payload = body.payload;

  if (
    comm !== SENTINEL_COMM ||
    typeof session !== 'string' ||
    session.length === 0 ||
    typeof lane !== 'string' ||
    !VALID_LANES.includes(lane as SentinelLane) ||
    typeof op !== 'string' ||
    !VALID_OPERATIONS.includes(op as SentinelOperation) ||
    typeof action !== 'string' ||
    action.length === 0 ||
    !isRecord(payload)
  ) {
    return null;
  }

  return {
    comm: SENTINEL_COMM,
    session,
    kid: typeof body.kid === 'string' ? body.kid : undefined,
    lane: lane as SentinelLane,
    op: op as SentinelOperation,
    action,
    requires: isRecord(body.requires)
      ? {
          auth: body.requires.auth === true,
          role: Array.isArray(body.requires.role)
            ? body.requires.role.filter((role): role is string => typeof role === 'string')
            : undefined,
          otp: body.requires.otp === true,
          ack: body.requires.ack === true,
        }
      : undefined,
    otp: typeof body.otp === 'string' ? body.otp : undefined,
    payload,
  };
}

function hasRequiredRole(identity: Express.SentinelIdentity, requiredRoles: string[]): boolean {
  if (requiredRoles.length === 0) {
    return true;
  }

  const userRoles = identity.roles ?? [];
  return requiredRoles.some((role) => userRoles.includes(role));
}

async function deniedResponse(args: {
  ack: string;
  envelope: SentinelCommandEnvelope;
  identity?: Express.SentinelIdentity;
  code: string;
  message: string;
  status?: 'denied' | 'failed';
}): Promise<SentinelCommandResponse> {
  const receipt = args.identity
    ? buildCommandReceipt({
        ack: args.ack,
        envelope: args.envelope,
        identity: args.identity,
        status: args.status ?? 'denied',
        errorCode: args.code,
        errorMessage: args.message,
      })
    : null;

  if (receipt) {
    await sentinelCommandStore.insert(receipt);
  }

  return {
    ok: false,
    comm: SENTINEL_COMM,
    op: args.envelope.op,
    status: args.status ?? 'denied',
    ack: args.ack,
    error: {
      code: args.code,
      message: args.message,
    },
    meta: {
      timestamp: new Date().toISOString(),
      operator: args.identity?.operator,
      tenantId: args.identity?.tenantId,
      actorId: args.identity?.actorId,
      lane: args.envelope.lane,
      receiptId: receipt?.receiptId ?? `cmdrcpt_pending_${args.ack}`,
      roles: args.identity?.roles ?? [],
    },
  };
}

export async function handleCommand(req: Request, res: Response): Promise<void> {
  const parsed = parseEnvelope(req.body);
  if (!parsed) {
    res.status(400).json({
      ok: false,
      comm: SENTINEL_COMM,
      op: 'docs.generate',
      status: 'denied',
      ack: createAck(),
      error: {
        code: 'SENTINEL_INVALID_ENVELOPE',
        message: 'Command envelope is invalid',
      },
      meta: {
        timestamp: new Date().toISOString(),
        lane: 'command',
        receiptId: 'cmdrcpt_invalid',
      },
    });
    return;
  }

  const envelope = hydrateEnvelopeRequirements(parsed);
  const ack = createAck();
  const identity = req.sentinelIdentity;

  if (!identity) {
    res.status(401).json(
      await deniedResponse({
        ack,
        envelope,
        code: 'SENTINEL_AUTH_REQUIRED',
        message: 'Azure identity required',
      })
    );
    return;
  }

  if (envelope.lane !== 'command') {
    res.status(400).json(
      await deniedResponse({
        ack,
        envelope,
        identity,
        code: 'SENTINEL_LANE_UNSUPPORTED',
        message: 'Only the command lane is enabled for this route',
      })
    );
    return;
  }

  const otpValidation = validateCommandOtp(envelope);
  if (!otpValidation.ok) {
    res.status(403).json(
      await deniedResponse({
        ack,
        envelope,
        identity,
        code: otpValidation.code ?? 'SENTINEL_OTP_REQUIRED',
        message: otpValidation.message ?? 'OTP is required for this command',
      })
    );
    return;
  }

  const requiredRoles = envelope.requires?.role ?? [];
  if (!hasRequiredRole(identity, requiredRoles)) {
    res.status(403).json(
      await deniedResponse({
        ack,
        envelope,
        identity,
        code: 'SENTINEL_ROLE_REQUIRED',
        message:
          requiredRoles.length > 0
            ? `${requiredRoles.join(' or ')} required`
            : 'Required role missing',
      })
    );
    return;
  }

  const handler = getCommandHandler(envelope.op);
  if (!handler) {
    res.status(501).json(
      await deniedResponse({
        ack,
        envelope,
        identity,
        code: 'SENTINEL_OPERATION_UNIMPLEMENTED',
        message: `No command handler is registered for ${envelope.op}`,
        status: 'failed',
      })
    );
    return;
  }

  try {
    const receipt = buildCommandReceipt({
      ack,
      envelope,
      identity,
      status: 'accepted',
    });
    await sentinelCommandStore.insert(receipt);

    const result = await handler({ envelope, identity, ack });
    const resultHash = hashResult(result.data);
    await sentinelCommandStore.updateStatus({
      ack,
      status: result.status,
      resultHash,
      executedAt: new Date().toISOString(),
    });

    res.status(200).json({
      ok: true,
      comm: SENTINEL_COMM,
      op: envelope.op,
      status: result.status,
      ack,
      data: result.data,
      meta: {
        timestamp: new Date().toISOString(),
        operator: identity.operator,
        tenantId: identity.tenantId,
        actorId: identity.actorId,
        lane: envelope.lane,
        receiptId: receipt.receiptId,
        roles: identity.roles ?? [],
      },
    } satisfies SentinelCommandResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command execution failed';
    await sentinelCommandStore.updateStatus({
      ack,
      status: 'failed',
      executedAt: new Date().toISOString(),
      errorCode: 'SENTINEL_COMMAND_FAILED',
      errorMessage: message,
    });
    const receipt = await sentinelCommandStore.getByAck(ack);
    res.status(500).json({
      ok: false,
      comm: SENTINEL_COMM,
      op: envelope.op,
      status: 'failed',
      ack,
      error: {
        code: 'SENTINEL_COMMAND_FAILED',
        message,
      },
      meta: {
        timestamp: new Date().toISOString(),
        operator: identity.operator,
        tenantId: identity.tenantId,
        actorId: identity.actorId,
        lane: envelope.lane,
        receiptId: receipt?.receiptId ?? `cmdrcpt_pending_${ack}`,
        roles: identity.roles ?? [],
      },
    } satisfies SentinelCommandResponse);
  }
}
