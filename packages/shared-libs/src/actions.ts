export type ActionType = 'TRANSFER_OUTBOUND';

// Amount is represented in minor units (integer). Example: USD cents.
export interface ProposeActionRequest {
  action_type: ActionType;
  amount: number; // integer, minor units (MUST NOT be fractional)
  currency: string; // ISO 4217, e.g. "USD"
  actor_id: string;
  account_id: string;
  request_id: string; // UUID for idempotency / audit
  timestamp: string; // ISO 8601 UTC
  context?: Record<string, unknown>;
}

export type Decision = 'ALLOW' | 'DENY' | 'STEP_UP';

export interface ProposeActionResponse {
  decision: Decision;
  reason_codes: string[];
  policy_version: string;
  decision_id: string; // UUID
  evaluated_at: string; // ISO 8601 UTC
  notes?: string;
}

// Idempotency mismatch response shape
export interface IdempotencyMismatch {
  status: 409;
  reason_code: 'IDMP_PAYLOAD_MISMATCH';
  message: string;
}
