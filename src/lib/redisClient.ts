import Redis from 'ioredis';

let client: Redis | null = null;
let ready = false;
let everConnected = false;

export function getRedisClient(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    client.on('ready', () => { ready = true; everConnected = true; console.log('Redis connected'); });
    client.on('error', (err: Error) => { if (ready || !everConnected) { console.warn('Redis unavailable:', err.message); everConnected = true; } ready = false; });
    client.on('close', () => { if (ready) console.warn('Redis connection closed'); ready = false; });
  }
  return client;
}

export function isRedisReady(): boolean { return ready; }
