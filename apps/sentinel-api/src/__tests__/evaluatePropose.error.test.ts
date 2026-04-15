import * as assert from 'node:assert/strict';
import { evaluatePropose } from '../rpc/evaluatePropose.js';

(async function run() {
  const res = await evaluatePropose(
    {
      request_id: 'test-1',
      action_type: 'TRANSFER_OUTBOUND',
      amount: 1000000,
      currency: 'USD',
      actor_id: 'actor-test',
      account_id: 'acct-test',
      timestamp: new Date().toISOString(),
    },
    { forceError: true }
  );

  assert.equal(res.decision, 'DENY');
  assert.ok(Array.isArray(res.reason_codes));
  assert.ok(res.reason_codes.includes('ERROR_INTERNAL'));

  console.log('✅ fail-closed behavior verified');
})();
