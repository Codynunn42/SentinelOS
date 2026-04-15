import type { SentinelCommandStore } from './sentinelCommandTypes.js';
import { inMemorySentinelCommandStore } from './sentinelCommandLedger.js';
import { PostgresSentinelCommandStore } from './sentinelCommandStorePg.js';

function shouldUsePostgres(): boolean {
  return Boolean(process.env.BILLING_DATABASE_URL || process.env.DATABASE_URL);
}

export const sentinelCommandStore: SentinelCommandStore = shouldUsePostgres()
  ? new PostgresSentinelCommandStore()
  : inMemorySentinelCommandStore;
