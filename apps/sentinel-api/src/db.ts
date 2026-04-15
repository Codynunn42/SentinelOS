import { Pool } from 'pg';

let sharedPool: Pool | null = null;

function getConnectionString(): string {
  const connectionString = process.env.BILLING_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL or BILLING_DATABASE_URL is required');
  }

  return connectionString;
}

export function getPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({
      connectionString: getConnectionString(),
    });
  }

  return sharedPool;
}
