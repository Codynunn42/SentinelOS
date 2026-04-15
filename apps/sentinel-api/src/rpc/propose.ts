import { Request, Response } from 'express';
import { evaluatePropose } from './evaluatePropose.js';
import { safeError, type ProposeActionRequest } from 'shared-libs';
/**
 * Generate a UUID with fallback for environments without crypto.randomUUID
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Express adapter for propose endpoint. Keeps `evaluatePropose` pure and testable.
 */
export async function handlePropose(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Validate request body
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({
        error: 'invalid_request',
        message: 'Request body must be a valid JSON object',
      });
      return;
    }

    const requestData = req.body as ProposeActionRequest;
    const decision = await evaluatePropose(requestData);
    res.status(200).json(decision);
  } catch (err) {
    safeError('Error in handlePropose:', err);

    const errorResponse = {
      decision_id: generateId(),
      decision: 'DENY' as const,
      reason_codes: ['ERROR_INTERNAL'],
      policy_version: 'unknown',
      evaluated_at: new Date().toISOString(),
      error: 'Internal server error occurred',
    };

    // Return 500 for internal errors, but still provide decision format
    res.status(500).json(errorResponse);
  }
}
