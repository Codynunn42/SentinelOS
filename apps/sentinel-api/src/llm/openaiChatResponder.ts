import { v4 as uuidv4 } from 'uuid';

export type SentinelChatTurn = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type SentinelChatRequest = {
  message: string;
  session_id?: string;
  conversation?: SentinelChatTurn[];
  context?: Record<string, unknown>;
  intent?: string;
};

export type SentinelChatResponse = {
  ok: true;
  session_id: string;
  reply: string;
  meta: {
    model: string;
    policy_version: string;
    generated_at: string;
  };
};

type OpenAIResponsePayload = {
  output_text?: string;
};

type FetchLike = typeof fetch;

export function isOpenAIChatConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function getOpenAIChatConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY?.trim(),
    baseUrl: process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
    model: process.env.SENTINEL_OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
    policyVersion: process.env.SENTINEL_POLICY_VERSION?.trim() || 'v1-openai',
  };
}

function sanitizeTurns(turns: SentinelChatTurn[] | undefined): SentinelChatTurn[] {
  if (!Array.isArray(turns)) {
    return [];
  }

  return turns.filter(
    (turn): turn is SentinelChatTurn =>
      Boolean(
        turn &&
          (turn.role === 'system' || turn.role === 'user' || turn.role === 'assistant') &&
          typeof turn.content === 'string' &&
          turn.content.trim().length > 0
      )
  );
}

function buildPrompt(request: SentinelChatRequest): string {
  const history = sanitizeTurns(request.conversation);
  const lines = [
    'You are SentinelOS, a governed operator assistant for compliance, workflow, and pricing intelligence.',
    'Respond in a clear, concise, operator-friendly tone.',
    'Do not claim to have completed actions you did not complete.',
    'If the user asks for risky or privileged operations, recommend governed next steps rather than inventing execution.',
    request.intent ? `Intent: ${request.intent}` : null,
    request.context ? `Context: ${JSON.stringify(request.context)}` : null,
    history.length > 0 ? 'Conversation history:' : null,
    ...history.map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`),
    `USER: ${request.message}`,
    'ASSISTANT:',
  ];

  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

export async function respondWithOpenAI(
  request: SentinelChatRequest,
  deps?: { fetchImpl?: FetchLike }
): Promise<SentinelChatResponse> {
  const { apiKey, baseUrl, model, policyVersion } = getOpenAIChatConfig();
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
      input: buildPrompt(request),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI chat failed (${response.status}): ${errorBody || response.statusText}`);
  }

  const payload = (await response.json()) as OpenAIResponsePayload;
  const reply = payload.output_text?.trim();
  if (!reply) {
    throw new Error('OpenAI chat response did not include output_text');
  }

  return {
    ok: true,
    session_id: request.session_id?.trim() || uuidv4(),
    reply,
    meta: {
      model,
      policy_version: policyVersion,
      generated_at: new Date().toISOString(),
    },
  };
}
