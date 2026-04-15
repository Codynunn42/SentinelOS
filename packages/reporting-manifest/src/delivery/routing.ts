import { CompletionSweepReport } from '../completionSweep/types.js';

export type DeliveryIntent = { target?: string; endpoint?: string; profile?: string };

export function routeDeliveries(report: CompletionSweepReport, _context?: { environment?: string; version?: string }): DeliveryIntent[] {
  const intents: DeliveryIntent[] = [];

  // Rule: manual override -> Slack only (explicit)
  if ((report as any).manual === true) {
    intents.push({ profile: 'ops' });
    return intents;
  }

  // Rule: errors -> notify ops profile (profile expands to slack+http)
  if (report.status === 'error') {
    intents.push({ profile: 'ops' });
    return intents;
  }

  // Default: success -> http (legacy)
  if (report.status === 'success') {
    intents.push({ target: 'http' });
    return intents;
  }

  // Fallback: send HTTP
  intents.push({ target: 'http' });
  return intents;
}
