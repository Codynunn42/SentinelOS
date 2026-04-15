import type { Request, Response } from 'express';
import { isOpenAIChatConfigured, respondWithOpenAI } from '../llm/openaiChatResponder.js';

function validateChatBody(body: unknown): body is {
  message: string;
  session_id?: string;
  conversation?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  context?: Record<string, unknown>;
  intent?: string;
} {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as { message?: unknown };
  return typeof candidate.message === 'string' && candidate.message.trim().length > 0;
}

export async function handleChat(req: Request, res: Response): Promise<void> {
  if (!validateChatBody(req.body)) {
    res.status(400).json({
      ok: false,
      error: 'invalid_request',
      message: 'Request body must include a non-empty message string',
    });
    return;
  }

  if (!isOpenAIChatConfigured()) {
    res.status(503).json({
      ok: false,
      error: 'llm_unavailable',
      message: 'OPENAI_API_KEY is not configured for Sentinel chat',
    });
    return;
  }

  try {
    const response = await respondWithOpenAI({
      message: req.body.message,
      session_id: req.body.session_id,
      conversation: req.body.conversation,
      context: {
        ...(req.body.context ?? {}),
        sentinel_identity: {
          tenantId: req.sentinelIdentity?.tenantId ?? null,
          actorId: req.sentinelIdentity?.actorId ?? null,
          roles: req.sentinelIdentity?.roles ?? [],
        },
      },
      intent: req.body.intent,
    });

    res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sentinel chat failed';
    res.status(503).json({
      ok: false,
      error: 'llm_unavailable',
      message,
    });
  }
}
