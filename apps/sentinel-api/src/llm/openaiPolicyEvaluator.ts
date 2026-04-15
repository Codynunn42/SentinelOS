import { v4 as uuidv4 } from 'uuid';
import type { ProposeActionRequest, ProposeActionResponse } from 'shared-libs';

type OpenAIResponsePayload = {
  output_text?: string;
};

type FetchLike = typeof fetch;

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function getOpenAIConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY?.trim(),
    baseUrl: process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
    model: process.env.SENTINEL_OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
    policyVersion: process.env.SENTINEL_POLICY_VERSION?.trim() || 'v1-openai',
  };
}

function buildPrompt(req: ProposeActionRequest): string {
  return [
    'You are Sentinel, a governance and risk policy evaluator.',
    'Decide whether the requested action should be ALLOW, DENY, or STEP_UP.',
    'Be conservative. If you are uncertain, choose STEP_UP or DENY.',
    'Return ONLY valid JSON with this exact shape:',
    '{"decision":"ALLOW|DENY|STEP_UP","reason_codes":["..."],"notes":"optional short explanation"}',
    'Reason codes should be short uppercase snake case values.',
    'Evaluate this request:',
    JSON.stringify(req),
  ].join('\n');
}

function parseModelDecision(outputText: string, policyVersion: string): ProposeActionResponse {
  const parsed = JSON.parse(outputText) as {
    decision?: string;
    reason_codes?: unknown;
    notes?: unknown;
  };

  const decision =
    parsed.decision === 'ALLOW' || parsed.decision === 'DENY' || parsed.decision === 'STEP_UP'
      ? parsed.decision
      : 'DENY';

  const reasonCodes = Array.isArray(parsed.reason_codes)
    ? parsed.reason_codes.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];

  return {
    decision_id: uuidv4(),
    decision,
    reason_codes: reasonCodes.length > 0 ? reasonCodes : ['MODEL_DECISION_UNSPECIFIED'],
    policy_version: policyVersion,
    evaluated_at: new Date().toISOString(),
    notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
  };
}

export async function evaluateWithOpenAI(
  req: ProposeActionRequest,
  deps?: { fetchImpl?: FetchLike }
): Promise<ProposeActionResponse> {
  const { apiKey, baseUrl, model, policyVersion } = getOpenAIConfig();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const fetchImpl = deps?.fetchImpl ?? fetch;
  const response = await fetchImpl(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: buildPrompt(req),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI evaluation failed (${response.status}): ${errorBody || response.statusText}`);
  }

  const payload = (await response.json()) as OpenAIResponsePayload;
  if (!payload.output_text) {
    throw new Error('OpenAI response did not include output_text');
  }

  return parseModelDecision(payload.output_text, policyVersion);
}
