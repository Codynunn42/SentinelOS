import * as crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type { ProposeActionRequest, ProposeActionResponse } from 'shared-libs';
import { evaluateWithOpenAI, isOpenAIConfigured } from '../llm/openaiPolicyEvaluator.js';

// In-memory idempotency DB for prototype
const IDEMPOTENCY_DB = new Map<
  string,
  { payloadHash: string; response: ProposeActionResponse }
>();

export async function evaluatePropose(
  req: ProposeActionRequest,
  deps?: { forceError?: boolean; disableLlm?: boolean; fetchImpl?: typeof fetch }
): Promise<ProposeActionResponse> {
  if (deps?.forceError) {
    return {
      decision_id: uuidv4(),
      decision: 'DENY',
      reason_codes: ['ERROR_INTERNAL'],
      policy_version: 'v1',
      evaluated_at: new Date().toISOString(),
    };
  }

  // canonical payload hash
  const payloadHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(req))
    .digest('hex');

  const existing = IDEMPOTENCY_DB.get(req.request_id);
  if (existing) {
    if (existing.payloadHash !== payloadHash) {
      return {
        decision_id: uuidv4(),
        decision: 'DENY',
        reason_codes: ['IDMP_PAYLOAD_MISMATCH'],
        policy_version: 'v1',
        evaluated_at: new Date().toISOString(),
      };
    }
    return existing.response;
  }

  let response: ProposeActionResponse;
  if (!deps?.disableLlm && isOpenAIConfigured()) {
    try {
      response = await evaluateWithOpenAI(req, { fetchImpl: deps?.fetchImpl });
    } catch {
      response = {
        decision_id: uuidv4(),
        decision: 'DENY',
        reason_codes: ['ERROR_LLM_UNAVAILABLE'],
        policy_version: 'v1-openai-fallback',
        evaluated_at: new Date().toISOString(),
        notes: 'LLM evaluation was unavailable; Sentinel failed closed.',
      };
    }
  } else {
    response = {
      decision_id: uuidv4(),
      decision: 'DENY', // fail-closed default
      reason_codes: ['POLICY_DEFAULT_DENY'],
      policy_version: 'v1',
      evaluated_at: new Date().toISOString(),
      notes: 'No LLM configured; Sentinel used the default deny path.',
    };
  }

  IDEMPOTENCY_DB.set(req.request_id, { payloadHash, response });
  return response;
}
