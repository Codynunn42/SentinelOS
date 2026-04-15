export type EscalationStep = {
  after_attempts?: number; // trigger when attempts >= N
  after_ms?: number; // trigger when now - created_at >= ms
  profile: string; // which profile to notify
  targets?: Array<'slack' | 'http'>; // optional restrict channels
};

export type EscalationPolicy = {
  steps: EscalationStep[];
  max_attempts?: number;
};

// Recommended default policy (durable). Times in ms.
export const DEFAULT_ESCALATION_POLICY: EscalationPolicy = {
  steps: [
    { after_attempts: 1, profile: 'ops', targets: ['slack', 'http'] },
    { after_attempts: 3, after_ms: 10 * 60 * 1000, profile: 'ops', targets: ['slack', 'http'] },
    { after_attempts: 6, after_ms: 30 * 60 * 1000, profile: 'exec', targets: ['slack', 'http'] },
  ],
  max_attempts: 10,
};

// Given an envelope and optional now, return which steps are newly triggered
// (not yet fired) according to the policy. This function is pure and does
// not perform side effects; it returns indices and step descriptors so the
// caller can perform the actual enqueue operations and mark steps fired.
export function getTriggeredEscalationSteps(
  envelope: any,
  now = Date.now(),
): Array<{ index: number; step: EscalationStep; reason: string }> {
  const policy: EscalationPolicy | undefined = envelope.escalation_policy;
  if (!policy || !policy.steps || !policy.steps.length) return [];

  const fired: string[] = envelope.escalation_fired ?? [];
  const results: Array<{ index: number; step: EscalationStep; reason: string }> = [];

  for (let i = 0; i < policy.steps.length; i++) {
    const step = policy.steps[i];
    const stepId = `step:${i}`;
    if (fired.includes(stepId)) continue; // already fired

    const hasAttemptsThreshold = typeof step.after_attempts === 'number';
    const hasAgeThreshold = typeof step.after_ms === 'number';
    const attemptsTriggered =
      hasAttemptsThreshold && (envelope.attempts ?? 0) >= step.after_attempts!;
    const ageTriggered =
      hasAgeThreshold && (now - (envelope.created_at ?? 0)) >= step.after_ms!;

    let triggered = false;
    let reason = '';

    if (hasAttemptsThreshold && hasAgeThreshold) {
      triggered = attemptsTriggered && ageTriggered;
      reason = `attempts>=${step.after_attempts} and age_ms>=${step.after_ms}`;
    } else if (hasAttemptsThreshold) {
      triggered = attemptsTriggered;
      reason = `attempts>=${step.after_attempts}`;
    } else if (hasAgeThreshold) {
      triggered = ageTriggered;
      reason = `age_ms>=${step.after_ms}`;
    }

    if (triggered) {
      results.push({ index: i, step, reason });
    }
  }

  return results;
}
