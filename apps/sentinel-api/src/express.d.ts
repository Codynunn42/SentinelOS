export {};

declare global {
  namespace Express {
    interface SentinelIdentity {
      tenantId: string;
      actorId: string;
      operator: string | null;
      roles?: string[];
      raw?: unknown;
    }

    interface Request {
      sentinelIdentity?: SentinelIdentity;
    }
  }
}
