import { Redis } from 'ioredis';

// Create a mock Redis implementation for testing environments
class MockRedis {
  private data: Map<string, any> = new Map();

  async get(key: string) {
    return this.data.get(key);
  }

  async set(key: string, value: any) {
    this.data.set(key, value);
    return 'OK';
  }

  async del(key: string) {
    this.data.delete(key);
    return 1;
  }

  // Add other Redis methods as needed for your tests
}

const isTestEnv = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;

// Use real Redis in runtime, but keep tests on the in-memory mock.
export const ioRedis = process.env.REDIS_URL && !isTestEnv
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      connectTimeout: 10000,
    })
  : (new MockRedis() as unknown as Redis); // Type cast to Redis to maintain interface compatibility
