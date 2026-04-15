import * as assert from 'node:assert/strict';
import { respondWithOpenAI } from '../llm/openaiChatResponder.js';

export async function runOpenAIChatResponderTest() {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.SENTINEL_OPENAI_MODEL = 'gpt-4.1-mini';
  process.env.SENTINEL_POLICY_VERSION = 'v1-openai';
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        output_text:
          'Sentinel is ready to present pricing validation and governed workflow automation for a focused pilot.',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );

  const response = await respondWithOpenAI(
    {
      session_id: 'sess-chat-001',
      message: 'Summarize the pricing pilot posture for Trigent.',
      conversation: [{ role: 'user', content: 'We are preparing for a Trigent pilot.' }],
      context: { repo: 'SentinelOS', surface: 'pilot' },
    },
    { fetchImpl }
  );

  assert.equal(response.ok, true);
  assert.equal(response.session_id, 'sess-chat-001');
  assert.match(response.reply, /Sentinel is ready/i);
  assert.equal(response.meta.model, 'gpt-4.1-mini');
}
