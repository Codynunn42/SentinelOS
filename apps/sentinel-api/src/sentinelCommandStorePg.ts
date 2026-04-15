import type {
  SentinelCommandReceipt,
  SentinelCommandStatus,
  SentinelCommandStore,
} from './sentinelCommandTypes.js';
import { getPool } from './db.js';

type SentinelCommandRow = {
  ack: string;
  receipt_id: string;
  session: string;
  lane: 'conversational' | 'command';
  op: SentinelCommandReceipt['op'];
  action: string;
  actor_id: string;
  operator: string;
  tenant_id: string;
  auth_source: 'azure';
  payload_hash: string;
  result_hash: string | null;
  status: SentinelCommandStatus;
  requires_otp: boolean;
  otp_verified: boolean;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  executed_at: string | null;
};

function mapRow(row: SentinelCommandRow): SentinelCommandReceipt {
  return {
    ack: row.ack,
    receiptId: row.receipt_id,
    session: row.session,
    lane: row.lane,
    op: row.op,
    action: row.action,
    actorId: row.actor_id,
    operator: row.operator,
    tenantId: row.tenant_id,
    authSource: row.auth_source,
    payloadHash: row.payload_hash,
    resultHash: row.result_hash,
    status: row.status,
    requiresOtp: row.requires_otp,
    otpVerified: row.otp_verified,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    executedAt: row.executed_at,
  };
}

export class PostgresSentinelCommandStore implements SentinelCommandStore {
  async insert(receipt: SentinelCommandReceipt): Promise<void> {
    await getPool().query(
      `
      insert into sentinel_commands (
        ack,
        receipt_id,
        session,
        lane,
        op,
        action,
        actor_id,
        operator,
        tenant_id,
        auth_source,
        payload_hash,
        result_hash,
        status,
        requires_otp,
        otp_verified,
        error_code,
        error_message,
        created_at,
        executed_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19
      )
      `,
      [
        receipt.ack,
        receipt.receiptId,
        receipt.session,
        receipt.lane,
        receipt.op,
        receipt.action,
        receipt.actorId,
        receipt.operator,
        receipt.tenantId,
        receipt.authSource,
        receipt.payloadHash,
        receipt.resultHash ?? null,
        receipt.status,
        receipt.requiresOtp,
        receipt.otpVerified,
        receipt.errorCode ?? null,
        receipt.errorMessage ?? null,
        receipt.createdAt,
        receipt.executedAt ?? null,
      ]
    );
  }

  async getByAck(ack: string): Promise<SentinelCommandReceipt | null> {
    const result = await getPool().query<SentinelCommandRow>(
      `
      select *
      from sentinel_commands
      where ack = $1
      limit 1
      `,
      [ack]
    );

    return result.rowCount ? mapRow(result.rows[0]) : null;
  }

  async list(limit: number): Promise<SentinelCommandReceipt[]> {
    const result = await getPool().query<SentinelCommandRow>(
      `
      select *
      from sentinel_commands
      order by created_at desc
      limit $1
      `,
      [Math.max(1, limit)]
    );

    return result.rows.map(mapRow);
  }

  async updateStatus(args: {
    ack: string;
    status: SentinelCommandStatus;
    resultHash?: string | null;
    executedAt?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<void> {
    await getPool().query(
      `
      update sentinel_commands
      set
        status = $2,
        result_hash = coalesce($3, result_hash),
        executed_at = coalesce($4, executed_at),
        error_code = coalesce($5, error_code),
        error_message = coalesce($6, error_message)
      where ack = $1
      `,
      [
        args.ack,
        args.status,
        args.resultHash ?? null,
        args.executedAt ?? null,
        args.errorCode ?? null,
        args.errorMessage ?? null,
      ]
    );
  }
}
