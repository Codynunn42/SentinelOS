export type Profiles = Record<string, Record<string, string | undefined>>;

// Load profiles from env or construct defaults from well-known env vars.
export function loadProfiles(): Profiles {
  if (process.env.REPORTING_PROFILES) {
    try {
      const parsed = JSON.parse(process.env.REPORTING_PROFILES);
      return parsed as Profiles;
    } catch (e) {
      // ignore parse errors and fall through to defaults
    }
  }

  return {
    ops: {
      slack: process.env.SLACK_OPS_WEBHOOK || process.env.SLACK_OPS,
      http: process.env.OPS_WEBHOOK_URL || process.env.OPS_HTTP_ENDPOINT,
    },
    exec: {
      slack: process.env.SLACK_EXEC_WEBHOOK || process.env.SLACK_EXEC,
      http: process.env.EXEC_WEBHOOK_URL || process.env.EXEC_HTTP_ENDPOINT,
    },
    engineering: {
      slack: process.env.SLACK_ENG_WEBHOOK || process.env.SLACK_ENGINEERING_WEBHOOK,
      http: process.env.ENG_WEBHOOK_URL || process.env.ENG_HTTP_ENDPOINT,
    },
  };
}

export function resolveIntentEndpoint(intent: { target?: string; endpoint?: string; profile?: string }, profiles: Profiles): string | undefined {
  if (intent.endpoint) return intent.endpoint;
  if (!intent.profile) return undefined;
  const p = profiles[intent.profile];
  if (!p) return undefined;
  // map 'slack' -> slack, everything else -> http
  const key = intent.target === 'slack' ? 'slack' : 'http';
  return p[key];
}
