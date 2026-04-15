import * as assert from 'node:assert/strict';
import { evaluatePropose } from '../rpc/evaluatePropose.js';

function buildRequest(requestId: string) {
  return {
    request_id: requestId,
    action_type: 'TRANSFER_OUTBOUND' as const,
    amount: 250000,
    currency: 'USD',
    actor_id: 'actor-test',
    account_id: 'acct-test',
    timestamp: new Date().toISOString(),
  };
}

export async function runEvaluateProposeLlmTest(): Promise<void> {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.SENTINEL_OPENAI_MODEL;

  try {
    delete process.env.OPENAI_API_KEY;
    delete process.env.SENTINEL_OPENAI_MODEL;

    const fallback = await evaluatePropose(buildRequest('test-no-llm'), { disableLlm: false });
    assert.equal(fallback.decision, 'DENY');
    assert.ok(fallback.reason_codes.includes('POLICY_DEFAULT_DENY'));

    process.env.OPENAI_API_KEY = 'test-key';
    process.env.SENTINEL_OPENAI_MODEL = 'gpt-test';

    const mockFetch: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            decision: 'STEP_UP',
            reason_codes: ['HIGH_AMOUNT', 'MANUAL_REVIEW_REQUIRED'],
            notes: 'Transfer exceeds configured comfort threshold.',
          }),
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )) as typeof fetch;

    const modelDecision = await evaluatePropose(buildRequest('test-with-llm'), {
      fetchImpl: mockFetch,
    });

    assert.equal(modelDecision.decision, 'STEP_UP');
    assert.ok(modelDecision.reason_codes.includes('HIGH_AMOUNT'));
    assert.equal(modelDecision.policy_version, 'v1-openai');

    console.log('Sentinel tests: OpenAI-backed propose path verified');
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }

    if (originalModel === undefined) {
      delete process.env.SENTINEL_OPENAI_MODEL;
    } else {
      process.env.SENTINEL_OPENAI_MODEL = originalModel;
    }
  }
}
