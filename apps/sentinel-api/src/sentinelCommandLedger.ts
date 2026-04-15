import { createHash, randomUUID } from 'node:crypto';
import type {
  SentinelCommandEnvelope,
  SentinelCommandReceipt,
  SentinelCommandStore,
  SentinelCommandStatus,
} from './sentinelCommandTypes.js';

const commandLedger = new Map<string, SentinelCommandReceipt>();

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createAck(): string {
  return `ack_${randomUUID()}`;
}

export function createReceiptId(): string {
  return `cmdrcpt_${randomUUID()}`;
}

export function hashPayload(payload: unknown): string {
  return sha256(JSON.stringify(payload ?? {}));
}

export function hashResult(result: unknown): string {
  return sha256(JSON.stringify(result ?? null));
}

export function buildCommandReceipt(args: {
  ack: string;
  envelope: SentinelCommandEnvelope;
  identity: Express.SentinelIdentity;
  status: SentinelCommandStatus;
  resultHash?: string | null;
  executedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}): SentinelCommandReceipt {
  const createdAt = new Date().toISOString();
  return {
    ack: args.ack,
    receiptId: createReceiptId(),
    session: args.envelope.session,
    lane: args.envelope.lane,
    op: args.envelope.op,
    action: args.envelope.action,
    actorId: args.identity.actorId,
    operator: args.identity.operator ?? 'unknown',
    tenantId: args.identity.tenantId,
    authSource: 'azure',
    payloadHash: hashPayload(args.envelope.payload),
    resultHash: args.resultHash ?? null,
    status: args.status,
    requiresOtp: Boolean(args.envelope.requires?.otp),
    otpVerified: Boolean(args.envelope.requires?.otp ? args.envelope.otp : true),
    errorCode: args.errorCode ?? null,
    errorMessage: args.errorMessage ?? null,
    createdAt,
    executedAt: args.executedAt ?? (args.status === 'denied' ? null : createdAt),
  };
}

export class InMemorySentinelCommandStore implements SentinelCommandStore {
  async insert(receipt: SentinelCommandReceipt): Promise<void> {
    commandLedger.set(receipt.ack, { ...receipt });
  }

  async getByAck(ack: string): Promise<SentinelCommandReceipt | null> {
    return commandLedger.get(ack) ?? null;
  }

  async list(limit: number): Promise<SentinelCommandReceipt[]> {
    return [...commandLedger.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(1, limit));
  }

  async updateStatus(args: {
    ack: string;
    status: SentinelCommandStatus;
    resultHash?: string | null;
    executedAt?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<void> {
    const existing = commandLedger.get(args.ack);
    if (!existing) {
      throw new Error(`Command receipt not found for ack=${args.ack}`);
    }

    commandLedger.set(args.ack, {
      ...existing,
      status: args.status,
      resultHash: args.resultHash ?? existing.resultHash ?? null,
      executedAt: args.executedAt ?? existing.executedAt ?? null,
      errorCode: args.errorCode ?? existing.errorCode ?? null,
      errorMessage: args.errorMessage ?? existing.errorMessage ?? null,
    });
  }
}

export const inMemorySentinelCommandStore = new InMemorySentinelCommandStore();

export function getInMemoryCommandReceipt(ack: string): SentinelCommandReceipt | null {
  return commandLedger.get(ack) ?? null;
}
