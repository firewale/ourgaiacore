import pg from 'pg';

const { Pool } = pg;

let pool: InstanceType<typeof Pool> | null = null;

export function getDbClient(): InstanceType<typeof Pool> {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? 'postgres://ourgaia:ourgaia@localhost:5432/ourgaia',
    });
    // Idle clients emit 'error' on unexpected disconnects — without a listener
    // that crashes the process (Node's default behavior for unhandled 'error' events).
    pool.on('error', (err: Error) => console.warn('Postgres pool error:', err.message));
  }
  return pool;
}
