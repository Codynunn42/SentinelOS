export type DeliveryStatus = 'pending' | 'succeeded' | 'failed' | 'dead' | 'dry_run';

export type DeliveryEnvelope = {
  id: string;
  run_id: string;
  // `target` is either a delivery type (e.g. "http", "slack") or,
  // for backwards compatibility, a URL string. If `endpoint` is set,
  // `target` should be the delivery type and `endpoint` the URL.
  target: string;
  endpoint?: string; // optional webhook URL
  payload_hash: string; // hex
  payload: unknown;
  attempts: number;
  max_attempts: number;
  next_attempt_at: number; // epoch ms
  created_at: number;
  last_error?: string;
  status: DeliveryStatus;
  // Optional escalation policy attached to this envelope
  escalation_policy?: import('./escalation.js').EscalationPolicy;
  // Track fired escalation steps (ids like "step:0") to ensure idempotency
  escalation_fired?: string[];
};
